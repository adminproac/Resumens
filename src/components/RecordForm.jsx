import { useState } from 'react';
import { chrome } from '../lib/chrome.js';
import { blankFromFields, localized, moveRecord } from '../lib/model.js';

function errorText(code, lang) {
  return localized(chrome.errors[code] || chrome.errors.pattern, lang);
}

function languageLabel(ui, code, lang) {
  return localized(ui?.languageNames?.[code]?.label, lang) || code.toUpperCase();
}

function inputType(field) {
  if (field.ui === 'email' || field.type === 'email') return 'email';
  if (field.ui === 'tel' || field.type === 'phone') return 'tel';
  if (field.ui === 'number' || field.type === 'integer') return 'number';
  if (field.type === 'dateMonth') return 'month';
  return 'text';
}

function autoComplete(field) {
  if (field.type === 'email' || field.ui === 'email') return 'email';
  if (field.type === 'phone' || field.ui === 'tel') return 'tel';
  if (field.key === 'fullName') return 'name';
  return 'off';
}

function Counter({ value, max, lang }) {
  if (!max) return null;
  return (
    <span className="counter">
      {String(value || '').length}/{max} {localized(chrome.characters, lang)}
    </span>
  );
}

function ScalarControl({ field, value, onChange, lang, invalid }) {
  const common = {
    id: undefined,
    value: value ?? '',
    maxLength: field.maxLength || undefined,
    autoComplete: autoComplete(field),
    'aria-invalid': invalid || undefined,
    onChange: (event) => onChange(event.target.value),
  };
  if (field.ui === 'textarea') {
    return <textarea {...common} rows={field.maxLength && field.maxLength > 400 ? 5 : 3} />;
  }
  return <input {...common} type={inputType(field)} />;
}

function FieldControl({ field, value, onChange, errors, path, lang, ui }) {
  if (field.ui === 'hidden') return null;
  const label = localized(field.label, lang);
  const fieldError = errors[path];
  const note = field.note ? localized(field.note, lang) : '';

  if (field.ui === 'collection') {
    return (
      <CollectionEditor
        field={field}
        items={Array.isArray(value) ? value : []}
        onChange={onChange}
        errors={errors}
        path={path}
        lang={lang}
        ui={ui}
      />
    );
  }

  if (field.type === 'boolean' || field.ui === 'checkbox') {
    return (
      <div className="field check-field">
        <label>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{label}</span>
        </label>
        {note ? <p className="note">{note}</p> : null}
      </div>
    );
  }

  if (field.localized) {
    const current = value && typeof value === 'object' ? value : { en: '', es: '' };
    const codes = lang === 'en' ? ['en', 'es'] : ['es', 'en'];
    return (
      <fieldset className={`field ${fieldError ? 'invalid' : ''}`}>
        <legend>
          {label}
          {field.required ? <span className="req"> *</span> : null}
        </legend>
        <div className="bilingual">
          {codes.map((code) => {
            const langError = errors[`${path}.${code}`];
            return (
              <label key={code} className={langError ? 'invalid' : undefined}>
                <span className="mini-label">{languageLabel(ui, code, lang)}</span>
                <ScalarControl
                  field={field}
                  value={current[code] ?? ''}
                  invalid={Boolean(langError || fieldError)}
                  lang={lang}
                  onChange={(next) => onChange({ ...current, [code]: next })}
                />
                <span className="field-meta">
                  <Counter value={current[code]} max={field.maxLength} lang={lang} />
                  {langError ? <span className="error">{errorText(langError, lang)}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
        {note ? <p className="note">{note}</p> : null}
        {fieldError ? <p className="error">{errorText(fieldError, lang)}</p> : null}
      </fieldset>
    );
  }

  return (
    <div className={`field ${fieldError ? 'invalid' : ''}`}>
      <label>
        <span className="mini-label">
          {label}
          {field.required ? <span className="req"> *</span> : null}
        </span>
        <ScalarControl
          field={field}
          value={value}
          invalid={Boolean(fieldError)}
          lang={lang}
          onChange={onChange}
        />
      </label>
      <span className="field-meta">
        <Counter value={value} max={field.maxLength} lang={lang} />
        {fieldError ? <span className="error">{errorText(fieldError, lang)}</span> : null}
      </span>
      {note ? <p className="note">{note}</p> : null}
    </div>
  );
}

function CollectionEditor({ field, items, onChange, errors, path, lang, ui }) {
  const [pending, setPending] = useState(null);
  const label = localized(field.label, lang);
  const fieldError = errors[path];

  function updateAt(index, next) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? next : item)));
  }

  function addItem() {
    const blank = blankFromFields(field.itemFields, `${field.key}-item`);
    blank.order = items.length + 1;
    onChange([...items, blank]);
    setPending(null);
  }

  function removeAt(index) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, order: itemIndex + 1 })));
    setPending(null);
  }

  return (
    <fieldset className={`collection ${fieldError ? 'invalid' : ''}`}>
      <div className="collection-head">
        <legend>
          {label}
          {field.required ? <span className="req"> *</span> : null}
        </legend>
        <button type="button" className="btn small" onClick={addItem}>
          {localized(ui.add, lang)}
        </button>
      </div>
      {fieldError ? <p className="error">{errorText(fieldError, lang)}</p> : null}
      {items.length === 0 ? <p className="muted">{localized(chrome.emptySection, lang)}</p> : null}
      <div className="collection-list">
        {items.map((item, index) => (
          <article key={item.id || index} className="collection-item">
            <header>
              <span className="index">{index + 1}</span>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn tiny ghost"
                  aria-label={localized(chrome.moveUp, lang)}
                  disabled={index === 0}
                  onClick={() => onChange(moveRecord(items, item.id, -1).sort((a, b) => a.order - b.order))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn tiny ghost"
                  aria-label={localized(chrome.moveDown, lang)}
                  disabled={index === items.length - 1}
                  onClick={() => onChange(moveRecord(items, item.id, 1).sort((a, b) => a.order - b.order))}
                >
                  ↓
                </button>
                {pending === index ? (
                  <span className="inline-confirm">
                    <span>{localized(chrome.confirmRemoveItem, lang)}</span>
                    <button type="button" className="btn tiny danger" onClick={() => removeAt(index)}>
                      {localized(chrome.yes, lang)}
                    </button>
                    <button type="button" className="btn tiny ghost" onClick={() => setPending(null)}>
                      {localized(chrome.no, lang)}
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn tiny ghost" onClick={() => setPending(index)}>
                    {localized(ui.delete, lang)}
                  </button>
                )}
              </div>
            </header>
            <FieldList
              fields={field.itemFields}
              draft={item}
              onChange={(next) => updateAt(index, next)}
              errors={errors}
              path={`${path}.${index}`}
              lang={lang}
              ui={ui}
            />
          </article>
        ))}
      </div>
    </fieldset>
  );
}

export function FieldList({ fields, draft, onChange, errors, path = '', lang, ui }) {
  return (
    <div className="field-list">
      {(fields || []).map((field) => (
        <FieldControl
          key={field.key}
          field={field}
          value={draft?.[field.key]}
          errors={errors}
          path={path ? `${path}.${field.key}` : field.key}
          lang={lang}
          ui={ui}
          onChange={(value) => {
            const next = { ...draft, [field.key]: value };
            if (field.key === 'isCurrent' && value === true && 'endDate' in next) next.endDate = '';
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

export function RecordForm({ fields, draft, errors, lang, ui, onChange, onSubmit, onCancel, submitLabel, cancelLabel, disabled }) {
  return (
    <form
      className="record-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onSubmit();
      }}
    >
      <FieldList fields={fields} draft={draft} onChange={onChange} errors={errors} lang={lang} ui={ui} />
      <div className="form-actions">
        <button type="submit" className="btn" disabled={disabled}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn ghost" onClick={onCancel} disabled={disabled}>
            {cancelLabel}
          </button>
        ) : null}
      </div>
    </form>
  );
}
