const MONTHS = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const PRESENT = { en: 'Present', es: 'Actualidad' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function languagesOf(data) {
  const list = data?.meta?.supportedLanguages;
  return Array.isArray(list) && list.length ? list : ['es', 'en'];
}

export function localized(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value !== 'object') return '';
  const primary = value[lang];
  if (primary != null && String(primary).trim()) return String(primary);
  const fallback = lang === 'es' ? value.en : value.es;
  return fallback != null ? String(fallback) : '';
}

export function sectionList(schema) {
  return Object.values(schema || {});
}

export function sortByOrder(list) {
  return [...(list || [])].sort(
    (a, b) => (a?.order ?? 0) - (b?.order ?? 0) || String(a?.id || '').localeCompare(String(b?.id || '')),
  );
}

export function createId(prefix) {
  const rand =
    globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 8) ||
    Math.random().toString(16).slice(2, 10);
  const safe =
    String(prefix || 'item')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'item';
  return `${safe}-${rand}`;
}

export function layoutFor(fields) {
  const keys = new Set((fields || []).map((field) => field.key));
  if (keys.has('company')) return 'role';
  if (keys.has('institution')) return 'education';
  if (keys.has('category') && keys.has('items')) return 'skills';
  if (keys.has('name') && keys.has('level')) return 'language';
  const content = (fields || []).filter((field) => !field.system && field.ui !== 'hidden');
  if (content.length === 1 && content[0].key === 'text') {
    return content[0].maxLength && content[0].maxLength <= 400 ? 'bullets' : 'prose';
  }
  return 'generic';
}

export function formatMonth(value, lang) {
  if (!value || typeof value !== 'string') return '';
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const monthIndex = Number(match[2]) - 1;
  const names = MONTHS[lang] || MONTHS.en;
  const name = names[monthIndex];
  if (!name) return value;
  return `${name} ${match[1]}`;
}

export function formatPeriod(record, lang) {
  const label = localized(record?.dateLabel, lang);
  if (label) return label;
  const start = formatMonth(record?.startDate, lang);
  const end = record?.isCurrent ? PRESENT[lang] || PRESENT.en : formatMonth(record?.endDate, lang);
  if (start && end) return `${start} — ${end}`;
  return start || end || '';
}

export function formatStamp(iso, lang) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-CO' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

const SKIP_SEARCH_KEYS = new Set(['id', 'createdAt', 'updatedAt', 'order']);

export function collectText(value, key = '') {
  if (SKIP_SEARCH_KEYS.has(key)) return '';
  if (value == null || value === false) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((item) => collectText(item)).join(' ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([childKey, child]) => collectText(child, childKey))
      .join(' ');
  }
  return '';
}

export function matchesQuery(record, query) {
  const needle = fold(query).trim();
  if (!needle) return true;
  return fold(collectText(record)).includes(needle);
}

function matchesPattern(pattern, value) {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return true;
  }
}

export function validateRecord(fields, record, path = '') {
  const errors = {};
  for (const field of fields || []) {
    if (field.ui === 'hidden') continue;
    const fieldPath = path ? `${path}.${field.key}` : field.key;
    const value = record?.[field.key];

    if (field.ui === 'collection') {
      const items = Array.isArray(value) ? value : [];
      if (field.required && items.length === 0) errors[fieldPath] = 'required';
      items.forEach((item, index) => {
        Object.assign(errors, validateRecord(field.itemFields, item, `${fieldPath}.${index}`));
      });
      continue;
    }

    if (field.localized) {
      const en = value && typeof value === 'object' ? String(value.en ?? '') : '';
      const es = value && typeof value === 'object' ? String(value.es ?? '') : '';
      const enEmpty = en.trim() === '';
      const esEmpty = es.trim() === '';
      if (enEmpty && esEmpty) {
        if (field.required) errors[fieldPath] = 'required';
        continue;
      }
      if (field.required && enEmpty) errors[`${fieldPath}.en`] = 'required';
      if (field.required && esEmpty) errors[`${fieldPath}.es`] = 'required';
      if (field.maxLength && en.length > field.maxLength) errors[`${fieldPath}.en`] = 'maxLength';
      if (field.maxLength && es.length > field.maxLength) errors[`${fieldPath}.es`] = 'maxLength';
      continue;
    }

    if (field.type === 'boolean') {
      if (field.required && typeof value !== 'boolean') errors[fieldPath] = 'required';
      continue;
    }

    if (field.type === 'integer' || field.ui === 'number') {
      if (value === '' || value == null) {
        if (field.required) errors[fieldPath] = 'required';
        continue;
      }
      const number = Number(value);
      if (!Number.isInteger(number)) errors[fieldPath] = 'pattern';
      continue;
    }

    const str = value == null ? '' : String(value).trim();
    if (!str) {
      if (field.required) errors[fieldPath] = 'required';
      continue;
    }
    if (field.maxLength && str.length > field.maxLength) errors[fieldPath] = 'maxLength';
    if ((field.type === 'email' || field.ui === 'email') && !EMAIL_RE.test(str)) errors[fieldPath] = 'email';
    if ((field.type === 'phone' || field.ui === 'tel') && str.replace(/\D/g, '').length < 7) {
      errors[fieldPath] = 'pattern';
    }
    if (field.pattern && !matchesPattern(field.pattern, str)) errors[fieldPath] = 'pattern';
  }
  return errors;
}

export function toFormValue(fields, record) {
  const draft = {};
  for (const field of fields || []) {
    const value = record?.[field.key];
    if (field.ui === 'collection') {
      const items = Array.isArray(value) ? value : [];
      draft[field.key] = sortByOrder(items).map((item) => toFormValue(field.itemFields, item));
    } else if (field.localized) {
      draft[field.key] = {
        en: value && typeof value === 'object' && value.en != null ? String(value.en) : '',
        es: value && typeof value === 'object' && value.es != null ? String(value.es) : '',
      };
    } else if (field.type === 'boolean') {
      draft[field.key] = Boolean(value);
    } else if (value == null) {
      draft[field.key] = field.type === 'integer' || field.ui === 'number' ? '' : '';
    } else {
      draft[field.key] = value;
    }
  }
  return draft;
}

export function blankFromFields(fields, idPrefix) {
  const now = new Date().toISOString();
  const draft = {};
  for (const field of fields || []) {
    if (field.key === 'id') draft.id = createId(idPrefix);
    else if (field.key === 'createdAt' || field.key === 'updatedAt') draft[field.key] = now;
    else if (field.type === 'integer' || field.ui === 'number') draft[field.key] = field.default ?? 1;
    else if (field.type === 'boolean') draft[field.key] = Boolean(field.default);
    else if (field.ui === 'collection') draft[field.key] = Array.isArray(field.default) ? [] : [];
    else if (field.localized) draft[field.key] = { en: '', es: '' };
    else draft[field.key] = '';
  }
  return draft;
}

export function fromFormValue(fields, draft, previous) {
  const now = new Date().toISOString();
  const next = {};
  let changed = !previous;

  for (const field of fields || []) {
    if (field.key === 'id') {
      next.id = previous?.id || draft?.id || createId('item');
      continue;
    }
    if (field.key === 'createdAt') {
      next.createdAt = previous?.createdAt || draft?.createdAt || now;
      continue;
    }
    if (field.key === 'updatedAt') continue;

    if (field.ui === 'collection') {
      const prevItems = Array.isArray(previous?.[field.key]) ? previous[field.key] : [];
      const items = Array.isArray(draft?.[field.key]) ? draft[field.key] : [];
      next[field.key] = items.map((item) => {
        const prev = prevItems.find((entry) => entry.id === item.id);
        const child = fromFormValue(field.itemFields, item, prev);
        if (!prev || child.updatedAt !== prev.updatedAt) changed = true;
        return child;
      });
      if (items.length !== prevItems.length) changed = true;
      if (prevItems.some((entry) => !items.find((item) => item.id === entry.id))) changed = true;
      continue;
    }

    let value;
    if (field.localized) {
      const en = String(draft?.[field.key]?.en ?? '').trim();
      const es = String(draft?.[field.key]?.es ?? '').trim();
      value = !en && !es && field.nullable ? null : { en, es };
    } else if (field.type === 'boolean') {
      value = Boolean(draft?.[field.key]);
    } else if (field.type === 'integer' || field.ui === 'number') {
      value = draft?.[field.key] === '' || draft?.[field.key] == null ? null : Number(draft[field.key]);
    } else {
      const str = String(draft?.[field.key] ?? '').trim();
      value = str === '' && field.nullable ? null : str;
    }
    next[field.key] = value;
    if (previous && JSON.stringify(previous[field.key] ?? null) !== JSON.stringify(value)) changed = true;
  }

  next.updatedAt = changed ? now : previous?.updatedAt || draft?.updatedAt || now;
  return next;
}

export function moveRecord(list, id, direction) {
  const sorted = sortByOrder(list);
  const index = sorted.findIndex((record) => record.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sorted.length) return list;
  const reordered = [...sorted];
  const [item] = reordered.splice(index, 1);
  reordered.splice(target, 0, item);
  const now = new Date().toISOString();
  const orderById = new Map(reordered.map((record, position) => [record.id, position + 1]));
  return list.map((record) => {
    const order = orderById.get(record.id) ?? record.order;
    if (order === record.order) return record;
    return { ...record, order, updatedAt: now };
  });
}

export function recordHeading(fields, record, lang) {
  const field = (fields || []).find(
    (entry) => !entry.system && entry.ui !== 'hidden' && entry.ui !== 'collection' && entry.type !== 'boolean',
  );
  if (!field) return record?.id || '';
  if (field.localized) return localized(record?.[field.key], lang) || record?.id || '';
  const value = record?.[field.key];
  if (value == null || value === '') return record?.id || '';
  return String(value);
}

export function truncate(value, max = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

export function isResumeDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!value.meta || typeof value.meta !== 'object') return false;
  if (!value.profile || typeof value.profile !== 'object') return false;
  if (!value.schema || typeof value.schema !== 'object') return false;
  if (!value.ui || typeof value.ui !== 'object') return false;
  return Object.keys(value.schema).every((key) => key in value);
}

export function cloneData(data) {
  return structuredClone(data);
}
