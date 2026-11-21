import { useState } from 'react';
import { useResume } from '../context/ResumeContext.jsx';
import { chrome } from '../lib/chrome.js';
import { formatStamp, localized } from '../lib/model.js';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export function GithubConnect() {
  const {
    lang,
    connected,
    login,
    lastCommit,
    connectionError,
    clearConnectionError,
    unsynced,
    saving,
    connect,
    testConnection,
    disconnect,
    publish,
  } = useResume();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const steps = chrome.connectSteps[lang] || chrome.connectSteps.es;

  async function onConnect(event) {
    event.preventDefault();
    setChecking(true);
    setError('');
    const result = await connect(token);
    setChecking(false);
    if (result.ok) {
      setToken('');
      setOpen(false);
      return;
    }
    setError(result.message);
  }

  async function onTest() {
    setChecking(true);
    setError('');
    const result = await testConnection(token);
    setChecking(false);
    if (!result.ok) setError(result.message);
  }

  function closeForm() {
    setToken('');
    setError('');
    setOpen(false);
  }

  const status = connected
    ? `${localized(chrome.connectedAs, lang)} ${login || '…'}`
    : localized(chrome.notConnectedLabel, lang);

  return (
    <section className="connect-bar" aria-label={localized(chrome.connect, lang)}>
      <div className="connect-copy">
        <p>
          <strong>{status}</strong>
          <span>adminproac/Resumens · cv-data.json</span>
        </p>
        {lastCommit?.url ? (
          <p>
            {localized(chrome.lastCommit, lang)}:{' '}
            <a href={lastCommit.url} target="_blank" rel="noreferrer">
              {formatStamp(lastCommit.at, lang) || lastCommit.sha}
            </a>
          </p>
        ) : null}
        {connectionError ? (
          <p className="error" role="alert">
            {connectionError}{' '}
            <button type="button" className="btn tiny ghost" onClick={clearConnectionError}>
              {localized(chrome.dismiss, lang)}
            </button>
          </p>
        ) : null}
        {!connected ? <p>{localized(chrome.connectHelp, lang)}</p> : null}
      </div>

      {connected ? (
        <div className="row-actions">
          <button type="button" className="btn small ghost" onClick={onTest} disabled={checking || saving}>
            {checking ? localized(chrome.saving, lang) : localized(chrome.testConnection, lang)}
          </button>
          {unsynced ? (
            <button type="button" className="btn small" onClick={publish} disabled={saving}>
              {saving ? localized(chrome.saving, lang) : localized(chrome.publish, lang)}
            </button>
          ) : null}
          <button type="button" className="btn small ghost" onClick={disconnect}>
            {localized(chrome.disconnect, lang)}
          </button>
        </div>
      ) : open ? (
        <form className="connect-form" onSubmit={onConnect}>
          <ol>
            {steps.map((step, index) => (
              <li key={step}>
                {index === 0 ? (
                  <a href={TOKEN_URL} target="_blank" rel="noreferrer">
                    {localized(chrome.tokenLink, lang)}
                  </a>
                ) : null}
                {index === 0 ? ' — ' : null}
                {step}
              </li>
            ))}
          </ol>
          <label>
            <span className="mini-label">{localized(chrome.tokenLabel, lang)}</span>
            <input
              type="password"
              name="github-token"
              value={token}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              placeholder={localized(chrome.tokenPlaceholder, lang)}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="row-actions">
            <button type="submit" className="btn small" disabled={checking || !token.trim()}>
              {checking ? localized(chrome.saving, lang) : localized(chrome.connect, lang)}
            </button>
            <button type="button" className="btn small ghost" onClick={onTest} disabled={checking || !token.trim()}>
              {localized(chrome.testConnection, lang)}
            </button>
            <button type="button" className="btn small ghost" onClick={closeForm}>
              {localized({ en: 'Cancel', es: 'Cancelar' }, lang)}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn small" onClick={() => setOpen(true)}>
          {localized(chrome.connect, lang)}
        </button>
      )}
    </section>
  );
}
