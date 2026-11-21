import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { chrome } from '../lib/chrome.js';
import {
  clearToken,
  commitDocument,
  explainFailure,
  fetchContents,
  fetchRawDocument,
  GitHubError,
  probeConnection,
  readLastCommit,
  readLogin,
  readToken,
  writeLastCommit,
  writeLogin,
  writeToken,
} from '../lib/github.js';
import { chooseDocument, cloneData, documentsMatch, isResumeDocument, localized, shouldPublish } from '../lib/model.js';
import { readCache, readLanguage, seedData, writeCache, writeLanguage } from '../lib/storage.js';

const ResumeContext = createContext(null);

function errorText(error, lang) {
  const code = error instanceof GitHubError ? error.code : 'network';
  const summary = localized(chrome.githubErrors[code] || chrome.githubErrors.network, lang);
  const exact = explainFailure(error);
  return exact ? `${summary} — ${exact}` : summary;
}

export function ResumeProvider({ children }) {
  const cached = readCache();
  const initialData = cached?.data || seedData();
  const [data, setData] = useState(initialData);
  const [lang, setLangState] = useState(() => readLanguage(initialData?.meta?.defaultLanguage));
  const [notice, setNotice] = useState(null);
  const [bannerHidden, setBannerHidden] = useState(false);
  const [revision, setRevision] = useState(0);
  const [connected, setConnected] = useState(() => Boolean(readToken()));
  const [login, setLogin] = useState(() => readLogin());
  const [lastCommit, setLastCommit] = useState(() => readLastCommit());
  const [connectionError, setConnectionError] = useState('');
  const [unsynced, setUnsynced] = useState(() => Boolean(cached) && cached.synced !== true);
  const [offline, setOffline] = useState(false);
  const [saving, setSaving] = useState(false);
  const dataRef = useRef(initialData);
  const shaRef = useRef(cached?.sha || null);
  const savingRef = useRef(false);
  const langRef = useRef(lang);
  const unsyncedRef = useRef(Boolean(cached) && cached.synced !== true);
  const generation = useRef(0);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
    writeLanguage(lang);
    const name = data?.profile?.fullName || 'Resume';
    const title = lang === 'es' ? 'Hoja de vida' : 'Resume';
    document.title = `${name} — ${title}`;
  }, [lang, data?.profile?.fullName]);

  useEffect(() => {
    if (!notice || notice.tone === 'err') return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const notify = useCallback((text, tone = 'ok') => {
    setNotice({ id: Date.now(), text, tone });
  }, []);

  const applyRemote = useCallback((remote) => {
    const choice = chooseDocument(remote.data, dataRef.current);
    if (remote.sha) shaRef.current = remote.sha;
    if (choice.source === 'cache-newer') {
      unsyncedRef.current = true;
      setUnsynced(true);
      writeCache(dataRef.current, shaRef.current, false);
      return choice;
    }
    const next = cloneData(choice.data);
    dataRef.current = next;
    setData(next);
    unsyncedRef.current = false;
    setUnsynced(false);
    setOffline(false);
    writeCache(next, remote.sha || shaRef.current, true);
    return choice;
  }, []);

  useEffect(() => {
    const gen = generation.current;
    let cancelled = false;
    (async () => {
      const token = readToken();
      try {
        const remote = token ? await fetchContents(token) : await fetchRawDocument();
        if (cancelled || gen !== generation.current) return;
        applyRemote(remote);
        setConnected(Boolean(token));
        setOffline(false);
        setConnectionError('');
      } catch (error) {
        if (cancelled || gen !== generation.current) return;
        setOffline(true);
        setConnected(Boolean(readToken()));
        setConnectionError(errorText(error, langRef.current));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyRemote]);

  const commit = useCallback(
    async (recipe, message, options = {}) => {
      const language = langRef.current;
      if (savingRef.current) {
        notify(localized(chrome.busy, language), 'err');
        return false;
      }
      const next = recipe(cloneData(dataRef.current));
      if (!isResumeDocument(next)) {
        notify(localized(chrome.importError, language), 'err');
        return false;
      }
      const same = documentsMatch(next, dataRef.current);
      if (!shouldPublish(same, { force: options.force, unsynced: unsyncedRef.current })) {
        notify(localized(chrome.nothingNew, language));
        return true;
      }
      next.meta = { ...(next.meta || {}), lastUpdated: new Date().toISOString() };
      generation.current += 1;
      dataRef.current = next;
      setData(next);

      const token = readToken();
      if (!token) {
        unsyncedRef.current = true;
        setUnsynced(true);
        setBannerHidden(false);
        writeCache(next, shaRef.current, false);
        setConnectionError(localized(chrome.notConnected, language));
        notify(localized(chrome.notConnected, language), 'err');
        return false;
      }

      savingRef.current = true;
      setSaving(true);
      try {
        const result = await commitDocument(token, next, message || 'Update résumé');
        shaRef.current = result.sha;
        const record = {
          sha: result.commitSha || result.sha,
          url: result.commitUrl,
          at: new Date().toISOString(),
          message: message || 'Update résumé',
        };
        writeLastCommit(record);
        setLastCommit(record);
        unsyncedRef.current = false;
        setUnsynced(false);
        setOffline(false);
        setConnectionError('');
        writeCache(next, result.sha, true);
        notify(localized(chrome.saved, language));
        return true;
      } catch (error) {
        unsyncedRef.current = true;
        setUnsynced(true);
        setBannerHidden(false);
        writeCache(next, shaRef.current, false);
        const text = errorText(error, language);
        setConnectionError(text);
        notify(text, 'err');
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [notify],
  );

  const replaceData = useCallback(
    async (next) => {
      if (!isResumeDocument(next)) {
        notify(localized(chrome.importError, langRef.current), 'err');
        return false;
      }
      const ok = await commit(() => cloneData(next), 'Import résumé JSON');
      setRevision((value) => value + 1);
      return ok;
    },
    [commit, notify],
  );

  const resetData = useCallback(async () => {
    const language = langRef.current;
    const token = readToken();
    try {
      const remote = token ? await fetchContents(token) : await fetchRawDocument();
      const next = cloneData(remote.data);
      generation.current += 1;
      dataRef.current = next;
      shaRef.current = remote.sha;
      setData(next);
      unsyncedRef.current = false;
      setUnsynced(false);
      setOffline(false);
      setConnectionError('');
      setBannerHidden(false);
      writeCache(next, remote.sha, true);
      setRevision((value) => value + 1);
      notify(localized(chrome.resetOk, language));
    } catch (error) {
      const text = errorText(error, language);
      setConnectionError(text);
      notify(text, 'err');
    }
  }, [notify]);

  const connect = useCallback(
    async (token) => {
      const language = langRef.current;
      const trimmed = String(token || '').trim();
      if (!trimmed) return { ok: false, message: localized(chrome.githubErrors.unauthorized, language) };
      try {
        const probe = await probeConnection(trimmed);
        writeToken(trimmed);
        writeLogin(probe.login);
        setLogin(probe.login);
        setConnected(true);
        setConnectionError('');
        generation.current += 1;
        const choice = applyRemote({ data: probe.data, sha: probe.sha });
        setRevision((value) => value + 1);
        const who = probe.login ? `${localized(chrome.connectedAs, language)} ${probe.login}` : localized(chrome.connectOk, language);
        notify(`${who} — ${probe.access.summary}`);
        return { ok: true, unpublished: choice.source === 'cache-newer', login: probe.login, access: probe.access };
      } catch (error) {
        return { ok: false, message: errorText(error, language) };
      }
    },
    [applyRemote, notify],
  );

  const testConnection = useCallback(
    async (token) => {
      const language = langRef.current;
      const trimmed = String(token || readToken() || '').trim();
      if (!trimmed) {
        const message = localized(chrome.notConnectedLabel, language);
        setConnectionError(message);
        return { ok: false, message };
      }
      try {
        const probe = await probeConnection(trimmed);
        if (readToken() && readToken() === trimmed) {
          writeLogin(probe.login);
          setLogin(probe.login);
          setConnected(true);
        }
        const message = `${localized(chrome.probeOk, language)} ${probe.login ? `(${probe.login}) ` : ''}${probe.access.summary}`;
        setConnectionError('');
        notify(message);
        return { ok: true, message, login: probe.login, access: probe.access };
      } catch (error) {
        const message = errorText(error, language);
        setConnectionError(message);
        notify(message, 'err');
        return { ok: false, message };
      }
    },
    [notify],
  );

  const disconnect = useCallback(() => {
    clearToken();
    setConnected(false);
    setLogin('');
    setConnectionError('');
    notify(localized(chrome.disconnectOk, langRef.current));
  }, [notify]);

  const publish = useCallback(
    () => commit((current) => current, 'Publish résumé edits from this browser', { force: true }),
    [commit],
  );

  const setLang = useCallback((next) => {
    if (next === 'en' || next === 'es') setLangState(next);
  }, []);

  const value = useMemo(
    () => ({
      data,
      lang,
      setLang,
      connected,
      login,
      lastCommit,
      connectionError,
      clearConnectionError: () => setConnectionError(''),
      unsynced,
      offline,
      saving,
      revision,
      seedMismatch: unsynced && !bannerHidden,
      dismissSeedMismatch: () => setBannerHidden(true),
      notice,
      dismissNotice: () => setNotice(null),
      notify,
      commit,
      replaceData,
      resetData,
      connect,
      testConnection,
      disconnect,
      publish,
    }),
    [
      data,
      lang,
      setLang,
      connected,
      login,
      lastCommit,
      connectionError,
      unsynced,
      offline,
      saving,
      revision,
      bannerHidden,
      testConnection,
      notice,
      notify,
      commit,
      replaceData,
      resetData,
      connect,
      disconnect,
      publish,
    ],
  );

  return <ResumeContext.Provider value={value}>{children}</ResumeContext.Provider>;
}

export function useResume() {
  const context = useContext(ResumeContext);
  if (!context) throw new Error('useResume must be used within ResumeProvider');
  return context;
}
