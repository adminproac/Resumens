import { useEffect, useMemo, useState } from 'react';
import { chrome } from '../lib/chrome.js';
import {
  blankFromFields,
  formatStamp,
  fromFormValue,
  localized,
  matchesQuery,
  moveRecord,
  recordHeading,
  sectionList,
  sortByOrder,
  toFormValue,
  truncate,
  validateRecord,
} from '../lib/model.js';
import { useResume } from '../context/ResumeContext.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { RecordForm } from './RecordForm.jsx';

export function AdminView() {
  const { data, lang, commit, notify, revision } = useResume();
  const sections = sectionList(data.schema);
  const [sectionKey, setSectionKey] = useState(sections[0]?.key || 'profile');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null);
  const [mode, setMode] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  const section = data.schema[sectionKey] || sections[0];
  const records = section?.isArray ? sortByOrder(data[section.key] || []) : [];
  const filtered = useMemo(() => records.filter((record) => matchesQuery(record, query)), [records, query]);
  const singletonStamp = section && !section.isArray ? data[section.key]?.updatedAt || '' : '';

  useEffect(() => {
    setQuery('');
    setErrors({});
    setFormError('');
    setPendingDelete(null);
    if (!section) return;
    if (!section.isArray) {
      setMode('edit');
      setDraft(toFormValue(section.fields, data[section.key]));
    } else {
      setMode(null);
      setDraft(null);
    }
    // Reseed when the section, the singleton stamp, or an import/reset changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, singletonStamp, revision]);

  if (!section) return null;

  function openCreate() {
    const blank = blankFromFields(section.fields, section.key);
    const max = records.reduce((highest, record) => Math.max(highest, Number(record.order) || 0), 0);
    blank.order = max + 1;
    setDraft(blank);
    setMode('create');
    setErrors({});
    setFormError('');
  }

  function openEdit(record) {
    setDraft(toFormValue(section.fields, record));
    setMode('edit');
    setErrors({});
    setFormError('');
  }

  function closeForm() {
    if (!section.isArray) return;
    setDraft(null);
    setMode(null);
    setErrors({});
    setFormError('');
  }

  function save() {
    const nextErrors = validateRecord(section.fields, draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setFormError(localized(chrome.fixFields, lang));
      return;
    }
    setFormError('');
    const previous = section.isArray
      ? records.find((record) => record.id === draft.id) || null
      : data[section.key];
    const normalized = fromFormValue(section.fields, draft, mode === 'create' ? null : previous);
    commit((current) => {
      if (section.isArray) {
        const list = Array.isArray(current[section.key]) ? current[section.key] : [];
        current[section.key] =
          mode === 'create' || !list.some((record) => record.id === normalized.id)
            ? [...list, normalized]
            : list.map((record) => (record.id === normalized.id ? normalized : record));
      } else {
        current[section.key] = normalized;
      }
      return current;
    });
    notify(localized(chrome.saved, lang));
    if (section.isArray) closeForm();
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    commit((current) => {
      current[section.key] = (current[section.key] || []).filter((record) => record.id !== id);
      return current;
    });
    if (draft?.id === id) closeForm();
    setPendingDelete(null);
  }

  function move(id, direction) {
    commit((current) => {
      current[section.key] = moveRecord(current[section.key] || [], id, direction);
      return current;
    });
  }

  const ui = data.ui;
  const showForm = Boolean(draft) && (section.allowUpdate || mode === 'create');

  return (
    <div className="admin">
      <aside className="admin-nav">
        <div className="nav-scroll">
          {sections.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === section.key ? 'nav-item active' : 'nav-item'}
              onClick={() => setSectionKey(item.key)}
            >
              {localized(item.label, lang)}
            </button>
          ))}
        </div>
        <p className="nav-meta">
          {localized(chrome.updated, lang)}: {formatStamp(data.meta?.lastUpdated, lang)}
        </p>
      </aside>

      <div className="admin-main">
        <header className="admin-head">
          <div>
            <h2>{localized(section.label, lang)}</h2>
            <p className="muted">{localized(chrome.savedLocal, lang)}</p>
          </div>
          {section.isArray && section.allowCreate ? (
            <button type="button" className="btn" onClick={openCreate}>
              {localized(ui.add, lang)}
            </button>
          ) : null}
        </header>

        {section.isArray ? (
          <div className="search-row">
            <label className="search">
              <span className="sr-only">{localized(ui.search, lang)}</span>
              <input
                type="search"
                value={query}
                placeholder={localized(chrome.searchPlaceholder, lang)}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <p className="muted" aria-live="polite">
              {filtered.length} / {records.length} {localized(chrome.results, lang)}
            </p>
          </div>
        ) : null}

        {showForm ? (
          <section className="editor">
            <h3>{mode === 'create' ? localized(chrome.newRecord, lang) : localized(chrome.editing, lang)}</h3>
            {formError ? (
              <p className="error" role="alert">
                {formError}
              </p>
            ) : null}
            <RecordForm
              fields={section.fields}
              draft={draft}
              errors={errors}
              lang={lang}
              ui={ui}
              onChange={setDraft}
              onSubmit={save}
              onCancel={section.isArray ? closeForm : null}
              submitLabel={mode === 'create' ? localized(ui.save, lang) : localized(ui.update, lang)}
              cancelLabel={localized(ui.cancel, lang)}
            />
          </section>
        ) : null}

        {section.isArray ? (
          <div className="record-list">
            {filtered.length === 0 ? (
              <p className="muted">{query ? localized(chrome.noResults, lang) : localized(chrome.emptySection, lang)}</p>
            ) : null}
            {filtered.map((record, index) => {
              const heading = truncate(recordHeading(section.fields, record, lang), 180);
              const globalIndex = records.findIndex((item) => item.id === record.id);
              return (
                <article key={record.id} className="record-card">
                  <div>
                    <p className="card-kicker">
                      {record.order}
                      {record.isCurrent ? ` · ${localized(chrome.present, lang)}` : ''}
                    </p>
                    <h3>{heading}</h3>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn tiny ghost"
                      aria-label={localized(chrome.moveUp, lang)}
                      disabled={globalIndex <= 0}
                      onClick={() => move(record.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn tiny ghost"
                      aria-label={localized(chrome.moveDown, lang)}
                      disabled={globalIndex < 0 || globalIndex >= records.length - 1}
                      onClick={() => move(record.id, 1)}
                    >
                      ↓
                    </button>
                    {section.allowUpdate ? (
                      <button type="button" className="btn tiny" onClick={() => openEdit(record)}>
                        {localized(ui.edit, lang)}
                      </button>
                    ) : null}
                    {section.allowDelete ? (
                      <button type="button" className="btn tiny danger" onClick={() => setPendingDelete(record)}>
                        {localized(ui.delete, lang)}
                      </button>
                    ) : null}
                  </div>
                  <span className="sr-only">{index}</span>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>

      {pendingDelete ? (
        <ConfirmDialog
          title={localized(chrome.confirmTitle, lang)}
          message={localized(ui.confirmDelete, lang)}
          confirmLabel={localized(ui.delete, lang)}
          cancelLabel={localized(ui.cancel, lang)}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}
