import { useEffect, useRef, useState } from 'react';
import { AdminView } from './components/AdminView.jsx';
import { ConfirmDialog } from './components/ConfirmDialog.jsx';
import { GithubConnect } from './components/GithubConnect.jsx';
import { ResumeContents, ResumeView } from './components/ResumeView.jsx';
import { useResume } from './context/ResumeContext.jsx';
import { chrome } from './lib/chrome.js';
import { localized } from './lib/model.js';
import { downloadJson } from './lib/storage.js';

function viewFromLocation() {
  return new URLSearchParams(window.location.search).get('vista') === 'editar' ? 'edit' : 'read';
}

export function App() {
  const {
    data,
    lang,
    setLang,
    unsynced,
    offline,
    seedMismatch,
    dismissSeedMismatch,
    notice,
    notify,
    replaceData,
    resetData,
  } = useResume();
  const [view, setView] = useState(viewFromLocation);
  const [query, setQuery] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef(null);
  const ui = data.ui || {};
  const languages = data.meta?.supportedLanguages?.length ? data.meta.supportedLanguages : ['es', 'en'];

  useEffect(() => {
    const onPop = () => setView(viewFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function navigate(next) {
    const url = new URL(window.location.href);
    if (next === 'edit') url.searchParams.set('vista', 'editar');
    else url.searchParams.delete('vista');
    url.hash = '';
    window.history.pushState({}, '', url);
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function onImport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        replaceData(JSON.parse(String(reader.result || '')));
      } catch {
        notify(localized(chrome.importError, lang));
      }
    };
    reader.readAsText(file);
  }

  function exportData() {
    downloadJson(data);
    notify(localized(chrome.exported, lang));
  }

  return (
    <>
      <a className="skip" href="#contenido">
        {localized(chrome.contents, lang)}
      </a>
      <header className="topbar">
        <button type="button" className="brand" onClick={() => navigate('read')}>
          <span className="mark" aria-hidden="true">
            MR
          </span>
          <span>{data.profile?.fullName}</span>
        </button>
        <div className="top-actions">
          <div className="lang" role="group" aria-label={localized(ui.languageSwitch, lang)}>
            {languages.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={lang === code}
                onClick={() => setLang(code)}
              >
                {localized(ui.languageNames?.[code]?.label, lang) || code.toUpperCase()}
              </button>
            ))}
          </div>
          {view === 'edit' ? (
            <>
              <button type="button" className="btn small ghost" onClick={exportData}>
                {localized(chrome.exportJson, lang)}
              </button>
              <button type="button" className="btn small ghost" onClick={() => fileRef.current?.click()}>
                {localized(chrome.importJson, lang)}
              </button>
              <button type="button" className="btn small ghost" onClick={() => setConfirmReset(true)}>
                {localized(chrome.reset, lang)}
              </button>
              <button type="button" className="btn small" onClick={() => navigate('read')}>
                {localized(chrome.viewResume, lang)}
              </button>
            </>
          ) : (
            <button type="button" className="btn small" onClick={() => navigate('edit')}>
              {localized(ui.edit, lang)}
            </button>
          )}
          {unsynced ? <span className="pill">{localized(chrome.localChanges, lang)}</span> : null}
        </div>
      </header>

      {offline && view === 'edit' ? (
        <div className="banner" role="status">
          <p>{localized(chrome.offline, lang)}</p>
        </div>
      ) : null}

      {seedMismatch && view === 'edit' ? (
        <div className="banner" role="status">
          <p>{localized(chrome.seedMismatch, lang)}</p>
          <button type="button" className="btn tiny ghost" onClick={dismissSeedMismatch}>
            {localized(chrome.dismiss, lang)}
          </button>
        </div>
      ) : null}

      {notice ? (
        <p className={notice.tone === 'err' ? 'toast error' : 'toast'} role={notice.tone === 'err' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      ) : null}

      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={onImport}
      />

      <main id="contenido">
        {view === 'edit' ? (
          <>
            <GithubConnect />
            <AdminView />
          </>
        ) : (
          <div className="read-layout">
            <div className="read-tools">
              <ResumeContents data={data} lang={lang} />
              <label className="search">
                <span className="sr-only">{localized(ui.search, lang)}</span>
                <input
                  type="search"
                  value={query}
                  placeholder={localized(chrome.searchResume, lang)}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            <ResumeView data={data} lang={lang} query={query} />
          </div>
        )}
      </main>

      {confirmReset ? (
        <ConfirmDialog
          title={localized(chrome.confirmTitle, lang)}
          message={localized(chrome.confirmReset, lang)}
          confirmLabel={localized(chrome.reset, lang)}
          cancelLabel={localized(ui.cancel, lang)}
          onConfirm={() => {
            resetData();
            setConfirmReset(false);
          }}
          onCancel={() => setConfirmReset(false)}
        />
      ) : null}
    </>
  );
}
