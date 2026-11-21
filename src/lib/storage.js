import seed from '../../cv-data.json';
import { cloneData, isResumeDocument } from './model.js';

export const DATA_KEY = 'resumens.cv.v1';
export const LANG_KEY = 'resumens.lang';

export function seedData() {
  return cloneData(seed);
}

export function readLanguage(fallback) {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'en' || stored === 'es') return stored;
  } catch {
    /* private mode */
  }
  return fallback === 'en' || fallback === 'es' ? fallback : 'es';
}

export function writeLanguage(lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore quota */
  }
}

export function readCache() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !isResumeDocument(parsed.data)) return null;
    return {
      data: parsed.data,
      sha: typeof parsed.sha === 'string' ? parsed.sha : null,
      synced: Boolean(parsed.synced),
      savedAt: parsed.savedAt || null,
    };
  } catch {
    return null;
  }
}

export function writeCache(data, sha, synced) {
  const payload = {
    savedAt: new Date().toISOString(),
    sha: sha || null,
    synced: Boolean(synced),
    data,
  };
  localStorage.setItem(DATA_KEY, JSON.stringify(payload));
}

export function clearCache() {
  try {
    localStorage.removeItem(DATA_KEY);
  } catch {
    /* ignore */
  }
}

export function downloadJson(data) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cv-data.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
