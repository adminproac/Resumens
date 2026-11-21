import { useState } from 'react';
import { useResume } from '../context/ResumeContext.jsx';
import { chrome } from '../lib/chrome.js';
import { localized } from '../lib/model.js';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export function GithubConnect() {
  const { lang, connected, unsynced, saving, connect, disconnect, publish } = useResume();
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

  function closeForm() {
    setToken('');
    setError('');
    setOpen(false);
  }

  if (connected) {
    return (
      <section className="connect-bar" aria-label={localized(chrome.connected, lang)}>
        <p>
          <strong>{localized(chrome.connected, lang)}</strong>
          <span>adminproac/Resumens · cv-data.json</span>
        </p>
        <div className="row-actions">
          {unsynced ? (
            <button type="button" className="btn small" onClick={publish} disabled={saving}>
              {saving ? localized(chrome.saving, lang) : localized(chrome.publish, lang)}
            </button>
          ) : null}
          <button type="button" className="btn small ghost" onClick={disconnect}>
            {localized(chrome.disconnect, lang)}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="connect-bar" aria-label={localized(chrome.connect, lang)}>
      <div className="connect-copy">
        <p>
          <strong>{localized(chrome.connect, lang)}</strong>
        </p>
        <p>{localized(chrome.connectHelp, lang)}</p>
      </div>
      {open ? (
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
