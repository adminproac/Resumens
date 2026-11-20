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

export function readStored() {
  const original = seedData();
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return { data: original, customized: false, seedMismatch: false };
    const parsed = JSON.parse(raw);
    if (!parsed || !isResumeDocument(parsed.data)) {
      return { data: original, customized: false, seedMismatch: false };
    }
    return {
      data: parsed.data,
      customized: true,
      seedMismatch: parsed.seedLastUpdated !== original.meta?.lastUpdated,
    };
  } catch {
    return { data: original, customized: false, seedMismatch: false };
  }
}

export function writeStored(data) {
  const payload = {
    seedLastUpdated: seedData().meta?.lastUpdated || null,
    savedAt: new Date().toISOString(),
    data,
  };
  localStorage.setItem(DATA_KEY, JSON.stringify(payload));
}

export function clearStored() {
  localStorage.removeItem(DATA_KEY);
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
