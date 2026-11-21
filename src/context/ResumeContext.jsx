import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { chrome } from '../lib/chrome.js';
import {
  clearToken,
  commitDocument,
  fetchContents,
  fetchRawDocument,
  GitHubError,
  readToken,
  verifyToken,
  writeToken,
} from '../lib/github.js';
import { chooseDocument, cloneData, documentsMatch, isResumeDocument, localized } from '../lib/model.js';
import { readCache, readLanguage, seedData, writeCache, writeLanguage } from '../lib/storage.js';

const ResumeContext = createContext(null);

function errorText(error, lang) {
  const code = error instanceof GitHubError ? error.code : 'network';
  return localized(chrome.githubErrors[code] || chrome.githubErrors.network, lang);
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
  const [unsynced, setUnsynced] = useState(() => Boolean(cached) && cached.synced !== true);
  const [offline, setOffline] = useState(false);
  const [saving, setSaving] = useState(false);
  const dataRef = useRef(initialData);
  const shaRef = useRef(cached?.sha || null);
  const savingRef = useRef(false);
  const langRef = useRef(lang);

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
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), notice.tone === 'err' ? 9000 : 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const notify = useCallback((text, tone = 'ok') => {
    setNotice({ id: Date.now(), text, tone });
  }, []);

  const applyRemote = useCallback((remote) => {
    const choice = chooseDocument(remote.data, dataRef.current);
    if (remote.sha) shaRef.current = remote.sha;
    if (choice.source === 'cache-newer') {
      setUnsynced(true);
      writeCache(dataRef.current, shaRef.current, false);
      return choice;
    }
    const next = cloneData(choice.data);
    dataRef.current = next;
    setData(next);
    setUnsynced(false);
    setOffline(false);
    writeCache(next, remote.sha || shaRef.current, true);
    return choice;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = readToken();
      try {
        const remote = token ? await fetchContents(token) : await fetchRawDocument();
        if (cancelled) return;
        applyRemote(remote);
        setConnected(Boolean(token));
        setOffline(false);
      } catch {
        if (cancelled) return;
        setOffline(true);
        setConnected(Boolean(readToken()));
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
      if (!options.force && documentsMatch(next, dataRef.current)) {
        notify(localized(chrome.nothingNew, language));
        return true;
      }
      next.meta = { ...(next.meta || {}), lastUpdated: new Date().toISOString() };
      dataRef.current = next;
      setData(next);

      const token = readToken();
      if (!token) {
        setUnsynced(true);
        setBannerHidden(false);
        writeCache(next, shaRef.current, false);
        notify(localized(chrome.notConnected, language), 'err');
        return false;
      }

      savingRef.current = true;
      setSaving(true);
      try {
        const sha = await commitDocument(token, next, message || 'Update résumé');
        shaRef.current = sha;
        setUnsynced(false);
        setOffline(false);
        writeCache(next, sha, true);
        notify(localized(chrome.saved, language));
        return true;
      } catch (error) {
        setUnsynced(true);
        setBannerHidden(false);
        writeCache(next, shaRef.current, false);
        notify(errorText(error, language), 'err');
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
      dataRef.current = next;
      shaRef.current = remote.sha;
      setData(next);
      setUnsynced(false);
      setOffline(false);
      setBannerHidden(false);
      writeCache(next, remote.sha, true);
      setRevision((value) => value + 1);
      notify(localized(chrome.resetOk, language));
    } catch (error) {
      notify(errorText(error, language), 'err');
    }
  }, [notify]);

  const connect = useCallback(
    async (token) => {
      const language = langRef.current;
      const trimmed = String(token || '').trim();
      if (!trimmed) return { ok: false, message: localized(chrome.githubErrors.unauthorized, language) };
      try {
        await verifyToken(trimmed);
        const remote = await fetchContents(trimmed);
        writeToken(trimmed);
        setConnected(true);
        const choice = applyRemote(remote);
        setRevision((value) => value + 1);
        notify(localized(chrome.connectOk, language));
        return { ok: true, unpublished: choice.source === 'cache-newer' };
      } catch (error) {
        clearToken();
        setConnected(false);
        return { ok: false, message: errorText(error, language) };
      }
    },
    [applyRemote, notify],
  );

  const disconnect = useCallback(() => {
    clearToken();
    setConnected(false);
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
      unsynced,
      offline,
      saving,
      revision,
      seedMismatch: unsynced && !bannerHidden,
      dismissSeedMismatch: () => setBannerHidden(true),
      notice,
      notify,
      commit,
      replaceData,
      resetData,
      connect,
      disconnect,
      publish,
    }),
    [
      data,
      lang,
      setLang,
      connected,
      unsynced,
      offline,
      saving,
      revision,
      bannerHidden,
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
