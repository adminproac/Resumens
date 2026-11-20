import assert from 'node:assert/strict';
import test from 'node:test';
import seed from '../cv-data.json' with { type: 'json' };
import {
  blankFromFields,
  collectText,
  formatPeriod,
  fromFormValue,
  isResumeDocument,
  localized,
  matchesQuery,
  moveRecord,
  toFormValue,
  validateRecord,
} from '../src/lib/model.js';

test('seed records satisfy their schema', () => {
  assert.equal(isResumeDocument(seed), true);
  for (const [key, section] of Object.entries(seed.schema)) {
    const records = section.isArray ? seed[key] : [seed[key]];
    for (const record of records) {
      const errors = validateRecord(section.fields, record);
      assert.deepEqual(errors, {}, `${key}/${record.id} ${JSON.stringify(errors)}`);
    }
  }
});

test('form round-trip keeps seed records unchanged', () => {
  for (const [key, section] of Object.entries(seed.schema)) {
    const records = section.isArray ? seed[key] : [seed[key]];
    for (const record of records) {
      const form = toFormValue(section.fields, record);
      const back = fromFormValue(section.fields, form, record);
      assert.equal(back.updatedAt, record.updatedAt, `${key}/${record.id} stamp`);
      assert.deepEqual(back, record, `${key}/${record.id}`);
    }
  }
});

test('validation rejects an empty required summary and a bad email', () => {
  const summary = seed.schema.summary.fields;
  const empty = blankFromFields(summary, 'summary');
  const errors = validateRecord(summary, empty);
  assert.equal(errors.text, 'required');

  const profile = structuredClone(seed.profile);
  profile.email = 'not-an-email';
  const profileErrors = validateRecord(seed.schema.profile.fields, profile);
  assert.equal(profileErrors.email, 'email');
});

test('nullable localized fields become null when both languages are blank', () => {
  const fields = seed.schema.experience.fields;
  const record = structuredClone(seed.experience[0]);
  const form = toFormValue(fields, record);
  form.title = { en: '   ', es: '' };
  const next = fromFormValue(fields, form, record);
  assert.equal(next.title, null);
  assert.notEqual(next.updatedAt, record.updatedAt);
});

test('search ignores accents and matches nested highlights', () => {
  const role = seed.experience.find((item) => item.id === 'exp-002');
  assert.equal(matchesQuery(role, 'medimas'), true);
  assert.equal(matchesQuery(role, 'autorizaciones'), true);
  assert.equal(matchesQuery(role, 'does-not-exist'), false);
  assert.match(collectText(role), /MIPRES/);
});

test('moveRecord reorders and bumps only records whose order changed', () => {
  const list = seed.summary.map((item) => ({ ...item }));
  const moved = moveRecord(list, 'sum-003', -1);
  const byId = Object.fromEntries(moved.map((item) => [item.id, item]));
  assert.equal(byId['sum-003'].order, 2);
  assert.equal(byId['sum-002'].order, 3);
  assert.equal(byId['sum-001'].order, 1);
  assert.equal(byId['sum-001'].updatedAt, seed.summary[0].updatedAt);
  assert.notEqual(byId['sum-003'].updatedAt, seed.summary[2].updatedAt);
});

test('period uses the date label, otherwise months, otherwise the present marker', () => {
  assert.equal(formatPeriod(seed.otherExperience[1], 'es'), '2003');
  assert.match(formatPeriod(seed.experience[0], 'es'), /ago 2022 — ago 2024/);
  assert.match(formatPeriod(seed.experience[0], 'en'), /Aug 2022 — Aug 2024/);
  assert.equal(formatPeriod({ isCurrent: true, startDate: '2024-01', dateLabel: null }, 'es'), 'ene 2024 — Actualidad');
});

test('localized reads the active language', () => {
  assert.match(localized(seed.summary[0].text, 'es'), /Ingeniero de Software/);
  assert.match(localized(seed.summary[0].text, 'en'), /Senior Software Engineer/);
});
