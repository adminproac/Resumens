import { chrome } from '../lib/chrome.js';
import { formatPeriod, layoutFor, localized, matchesQuery, sectionList, sortByOrder } from '../lib/model.js';

function contacts(profile, fields) {
  return (fields || []).filter((field) => field.type === 'email' || field.type === 'phone' || field.ui === 'email' || field.ui === 'tel');
}

function Period({ record, lang }) {
  const period = formatPeriod(record, lang);
  if (!period) return null;
  return <p className="dates">{period}</p>;
}

function Highlights({ items, lang }) {
  const list = sortByOrder(items).filter((item) => localized(item.text, lang));
  if (!list.length) return null;
  return (
    <ul className="bullets">
      {list.map((item) => (
        <li key={item.id}>{localized(item.text, lang)}</li>
      ))}
    </ul>
  );
}

function RoleBlock({ record, lang }) {
  return (
    <article className="role">
      <div className="role-top">
        <h3>{localized(record.company, lang)}</h3>
        <Period record={record} lang={lang} />
      </div>
      {localized(record.title, lang) ? <p className="role-title">{localized(record.title, lang)}</p> : null}
      {localized(record.location, lang) ? <p className="role-meta">{localized(record.location, lang)}</p> : null}
      <Highlights items={record.highlights} lang={lang} />
    </article>
  );
}

function EducationBlock({ record, lang }) {
  return (
    <article className="role">
      <div className="role-top">
        <h3>{localized(record.institution, lang)}</h3>
        <Period record={record} lang={lang} />
      </div>
      {localized(record.credential, lang) ? <p className="role-title">{localized(record.credential, lang)}</p> : null}
      {localized(record.location, lang) ? <p className="role-meta">{localized(record.location, lang)}</p> : null}
    </article>
  );
}

function SkillsBlock({ record, lang }) {
  const items = sortByOrder(record.items).filter((item) => localized(item.name, lang));
  return (
    <div className="skill-group">
      <h3>{localized(record.category, lang)}</h3>
      <ul className="pills">
        {items.map((item) => (
          <li key={item.id}>{localized(item.name, lang)}</li>
        ))}
      </ul>
    </div>
  );
}

function GenericBlock({ record, fields, lang }) {
  const visible = (fields || []).filter((field) => !field.system && field.ui !== 'hidden' && field.ui !== 'collection');
  return (
    <article className="generic">
      {visible.map((field) => {
        const value = field.localized ? localized(record[field.key], lang) : record[field.key];
        if (value == null || value === '' || value === false) return null;
        return (
          <p key={field.key}>
            <span>{localized(field.label, lang)}: </span>
            {String(value)}
          </p>
        );
      })}
    </article>
  );
}

function SectionBody({ section, records, lang }) {
  const layout = layoutFor(section.fields);
  if (layout === 'prose') {
    return (
      <div className="prose">
        {records.map((record) => (
          <p key={record.id}>{localized(record.text, lang)}</p>
        ))}
      </div>
    );
  }
  if (layout === 'bullets') {
    return (
      <ul className="bullets plain">
        {records.map((record) => (
          <li key={record.id}>{localized(record.text, lang)}</li>
        ))}
      </ul>
    );
  }
  if (layout === 'role') return records.map((record) => <RoleBlock key={record.id} record={record} lang={lang} />);
  if (layout === 'education') return records.map((record) => <EducationBlock key={record.id} record={record} lang={lang} />);
  if (layout === 'skills') {
    return (
      <div className="skill-grid">
        {records.map((record) => (
          <SkillsBlock key={record.id} record={record} lang={lang} />
        ))}
      </div>
    );
  }
  if (layout === 'language') {
    return (
      <ul className="lang-list">
        {records.map((record) => {
          const level = localized(record.level, lang);
          return (
            <li key={record.id}>
              <strong>{localized(record.name, lang)}</strong>
              {level ? <span>{level}</span> : null}
            </li>
          );
        })}
      </ul>
    );
  }
  return records.map((record) => <GenericBlock key={record.id} record={record} fields={section.fields} lang={lang} />);
}

export function ResumeView({ data, lang, query }) {
  const sections = sectionList(data.schema).filter((section) => section.key !== 'profile');
  const visible = sections
    .map((section) => {
      const source = section.isArray ? sortByOrder(data[section.key]) : data[section.key] ? [data[section.key]] : [];
      const records = source.filter((record) => matchesQuery(record, query));
      return { section, records };
    })
    .filter((entry) => entry.records.length > 0);

  const profileFields = data.schema.profile?.fields || [];
  const profile = data.profile || {};
  const contactFields = contacts(profile, profileFields);

  return (
    <article className="sheet">
      <header className="identity">
        <h1>{profile.fullName}</h1>
        <p className="contacts">
          {contactFields.map((field) => {
            const value = profile[field.key];
            if (!value) return null;
            const href = field.type === 'email' || field.ui === 'email' ? `mailto:${value}` : `tel:${value}`;
            return (
              <a key={field.key} href={href}>
                {value}
              </a>
            );
          })}
        </p>
      </header>

      {query && visible.length === 0 ? <p className="muted center">{localized(chrome.noResults, lang)}</p> : null}

      {visible.map(({ section, records }) => (
        <section key={section.key} id={`sec-${section.key}`} className="section">
          <h2>{localized(section.label, lang)}</h2>
          <SectionBody section={section} records={records} lang={lang} />
        </section>
      ))}
    </article>
  );
}

export function ResumeContents({ data, lang }) {
  const sections = sectionList(data.schema).filter((section) => section.key !== 'profile');
  return (
    <nav className="contents" aria-label={localized(chrome.contents, lang)}>
      {sections.map((section) => (
        <a key={section.key} href={`#sec-${section.key}`}>
          {localized(section.label, lang)}
        </a>
      ))}
    </nav>
  );
}
