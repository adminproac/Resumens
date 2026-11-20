import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { chrome } from '../lib/chrome.js';
import { cloneData, isResumeDocument, localized } from '../lib/model.js';
import {
  clearStored,
  readLanguage,
  readStored,
  seedData,
  writeLanguage,
  writeStored,
} from '../lib/storage.js';

const ResumeContext = createContext(null);

export function ResumeProvider({ children }) {
  const initial = readStored();
  const [data, setData] = useState(initial.data);
  const [customized, setCustomized] = useState(initial.customized);
  const [seedMismatch, setSeedMismatch] = useState(initial.seedMismatch);
  const [lang, setLangState] = useState(() => readLanguage(initial.data?.meta?.defaultLanguage));
  const [notice, setNotice] = useState(null);
  const [bannerHidden, setBannerHidden] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    document.documentElement.lang = lang;
    writeLanguage(lang);
    const name = data?.profile?.fullName || 'Resume';
    const title = lang === 'es' ? 'Hoja de vida' : 'Resume';
    document.title = `${name} — ${title}`;
  }, [lang, data?.profile?.fullName]);

  useEffect(() => {
    if (customized) writeStored(data);
  }, [data, customized]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const notify = useCallback((text) => {
    setNotice({ id: Date.now(), text });
  }, []);

  const commit = useCallback((recipe) => {
    setData((prev) => {
      const next = recipe(cloneData(prev));
      next.meta = { ...(next.meta || {}), lastUpdated: new Date().toISOString() };
      return next;
    });
    setCustomized(true);
  }, []);

  const replaceData = useCallback(
    (next) => {
      if (!isResumeDocument(next)) {
        notify(localized(chrome.importError, lang));
        return false;
      }
      const copy = cloneData(next);
      copy.meta = { ...(copy.meta || {}), lastUpdated: new Date().toISOString() };
      setData(copy);
      setCustomized(true);
      setRevision((value) => value + 1);
      notify(localized(chrome.importOk, lang));
      return true;
    },
    [lang, notify],
  );

  const resetData = useCallback(() => {
    clearStored();
    setData(seedData());
    setCustomized(false);
    setSeedMismatch(false);
    setBannerHidden(false);
    setRevision((value) => value + 1);
    notify(localized(chrome.resetOk, lang));
  }, [lang, notify]);

  const setLang = useCallback((next) => {
    if (next === 'en' || next === 'es') setLangState(next);
  }, []);

  const value = useMemo(
    () => ({
      data,
      lang,
      setLang,
      customized,
      revision,
      seedMismatch: seedMismatch && !bannerHidden,
      dismissSeedMismatch: () => setBannerHidden(true),
      notice,
      notify,
      commit,
      replaceData,
      resetData,
    }),
    [
      data,
      lang,
      setLang,
      customized,
      revision,
      seedMismatch,
      bannerHidden,
      notice,
      notify,
      commit,
      replaceData,
      resetData,
    ],
  );

  return <ResumeContext.Provider value={value}>{children}</ResumeContext.Provider>;
}

export function useResume() {
  const context = useContext(ResumeContext);
  if (!context) throw new Error('useResume must be used within ResumeProvider');
  return context;
}
