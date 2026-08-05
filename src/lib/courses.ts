import { parseCsv, type Row } from './csv';
import { escape, inline } from './markup';

/**
 * A course is two files: a CSV of class meetings and a JSON of metadata.
 *
 * Course pages differ a lot in shape — a calculus page is a topic and a couple
 * of demo links per day, a graduate topology page is reading + notes +
 * recording + homework, an intro proofs course adds worksheets, solutions, and
 * two separate homework columns. Rather than force one schema on all of them,
 * each course declares in its JSON how to turn its own CSV columns into the
 * lines of a meeting. Adding a column to a course is a JSON edit, not a code
 * change.
 */

export type Kind = 'md' | 'text' | 'pdf' | 'url' | 'panopto';

export interface RenderRule {
  col: string;            // CSV column this rule reads
  label?: string;         // mono label; omit for an unlabelled line
  kind?: Kind;            // how to interpret the cell (default 'md')
  text?: string;          // link text for pdf/url/panopto kinds
  note?: string;          // dim suffix, e.g. "before class"
  pages?: string;         // column holding a page range -> dim "pp. 14–18"
  due?: string;           // column holding an ISO date -> dim "due March 4"
  by?: string;            // column holding a time -> dim "by 10pm"
  also?: { col: string; text?: string; kind?: Kind }[];  // extra links after ❦
}

export interface CourseMeta {
  slug: string;            // becomes the URL: /113/
  number: string;          // "math 113"
  title: string;           // "discrete structures"
  term: string;            // "spring 2026"
  schedule: string;        // csv filename
  filesBase: string;       // "/files/113spring26/"
  panoptoBase?: string;
  blurb?: string;
  preamble?: string;       // markdown shown above the schedule
  current?: boolean;       // show in the "currently teaching" list
  institution?: string;    // 'reed' (default), 'uw', 'elsewhere'
  /**
   * Set when the course site is published elsewhere — a PreTeXt book, say.
   * Every link to the course then points there, and no local page is built,
   * so there is no half-filled duplicate to drift out of date.
   */
  href?: string;
  facts: { label: string; value: string }[];
  render?: RenderRule[];
}

export interface Item { label: string; html: string; }
export interface Meeting { date: string; display?: string; type: string; items: Item[]; }
export interface Week { label: string; subtitle?: string; meetings: Meeting[]; }

const csvFiles = import.meta.glob('../data/courses/*.csv', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const metaFiles = import.meta.glob('../data/courses/*.json', {
  import: 'default', eager: true,
}) as Record<string, CourseMeta>;

const longDate = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : iso;

/** Resolve one cell to a URL according to its kind. */
function href(value: string, kind: Kind, meta: CourseMeta): string {
  if (/^(https?:)?\/\//.test(value) || value.startsWith('/')) return value;
  if (kind === 'panopto') return `${meta.panoptoBase ?? ''}${value}`;
  if (kind === 'pdf') return `${meta.filesBase}${value}.pdf`;
  return value;
}

const link = (value: string, text: string, kind: Kind, meta: CourseMeta) =>
  `<a href="${href(value, kind, meta)}">${escape(text)}</a>`;

/** The default spec, used when a course JSON does not declare its own. */
const DEFAULT_RENDER: RenderRule[] = [
  { col: 'topic', kind: 'md' },
  { col: 'reading', kind: 'text', label: 'reading', pages: 'pages' },
  { col: 'note', kind: 'md', label: 'note' },
];

function itemsFor(r: Row, meta: CourseMeta): Item[] {
  const items: Item[] = [];

  for (const rule of meta.render ?? DEFAULT_RENDER) {
    const cell = (r[rule.col] ?? '').trim();
    const pages = rule.pages ? (r[rule.pages] ?? '').trim() : '';
    if (!cell && !pages) continue;

    const kind = rule.kind ?? 'md';
    let html: string;

    // A page range with no prose ("reading: pp. 19–37") becomes the line
    // itself rather than a dim suffix on nothing.
    if (!cell) html = escape(`pp. ${pages}`);
    else if (kind === 'md') html = inline(cell);
    else if (kind === 'text') html = escape(cell);
    else html = link(cell, rule.text ?? rule.col, kind, meta);

    for (const extra of rule.also ?? []) {
      const v = (r[extra.col] ?? '').trim();
      if (!v) continue;
      html += `<span class="sep">❦</span>${link(v, extra.text ?? extra.col, extra.kind ?? kind, meta)}`;
    }

    const dim = (s: string) => ` <span class="dim">${escape(s)}</span>`;
    if (cell && pages) html += dim(`pp. ${pages}`);
    if (rule.due && r[rule.due]) html += dim(`due ${longDate(r[rule.due])}`);
    if (rule.by && r[rule.by]) html += dim(`by ${r[rule.by]}`);
    if (rule.note) html += dim(rule.note);

    items.push({ label: rule.label ?? '', html });
  }
  return items;
}

const SEASON: Record<string, number> = { winter: 0, spring: 1, summer: 2, fall: 3 };

/** "fall 2022" -> 20223, for chronological sorting of terms. */
export function termKey(term: string): number {
  const m = /(winter|spring|summer|fall)\s+(\d{4})/i.exec(term ?? '');
  if (!m) return 0;
  return Number(m[2]) * 10 + SEASON[m[1].toLowerCase()];
}

/** Newest term first; within a term, by course number. */
export function allCourses(): CourseMeta[] {
  return Object.values(metaFiles).sort(
    (a, b) => termKey(b.term) - termKey(a.term) || a.slug.localeCompare(b.slug),
  );
}

/** Where a link to this course should go. */
export const courseHref = (c: CourseMeta) => c.href ?? `/${c.slug}/`;

/** Courses whose page this site actually builds. */
export const localCourses = () => allCourses().filter((c) => !c.href);

export function currentCourses(): CourseMeta[] {
  return allCourses().filter((c) => c.current);
}

/**
 * Courses taught before this site existed. Their pages still live where they
 * always did — Reed's people.reed.edu, or the old Jekyll site — so the record
 * stays complete by linking out rather than by pretending they are gone. An
 * entry with no `href` is one whose host has since disappeared (MIT Stellar
 * was decommissioned; math.lsa.umich.edu no longer resolves), and is listed
 * without a link rather than as one that 404s.
 */
export interface ArchiveEntry {
  institution: string;
  number: string;
  title: string;
  term: string;
  href?: string;
  note?: string;
}

export interface TeachingRow {
  number: string;
  title: string;
  term: string;
  href?: string;
  note?: string;
  blurb?: string;
}

const INSTITUTIONS = [
  { key: 'reed', label: 'at reed' },
  { key: 'uw', label: 'at uw' },
  { key: 'elsewhere', label: 'elsewhere' },
];

/**
 * Everything taught, grouped by institution and newest first, merging the
 * courses this site builds with the archived ones it only links to.
 * `skipCurrent` keeps the current term from appearing twice on the page.
 */
export function teachingSections(archive: ArchiveEntry[], skipCurrent = true) {
  const rows: (TeachingRow & { institution: string })[] = allCourses()
    .filter((c) => !(skipCurrent && c.current))
    .map((c) => ({
      number: c.number,
      title: c.title,
      term: c.term,
      href: courseHref(c),
      blurb: c.blurb,
      institution: c.institution ?? 'reed',
    }));

  for (const e of archive) rows.push({ ...e });

  return INSTITUTIONS
    .map(({ key, label }) => ({
      label,
      rows: rows
        .filter((r) => r.institution === key)
        .sort((a, b) => termKey(b.term) - termKey(a.term)),
    }))
    .filter((s) => s.rows.length > 0);
}

export { inline };

export function loadCourse(slug: string): { meta: CourseMeta; weeks: Week[] } {
  const meta = allCourses().find((c) => c.slug === slug);
  if (!meta) throw new Error(`no course metadata for "${slug}"`);

  const key = Object.keys(csvFiles).find((k) => k.endsWith(`/${meta.schedule}`));
  if (!key) throw new Error(`no schedule file "${meta.schedule}" for ${slug}`);

  const weeks: Week[] = [];
  for (const r of parseCsv(csvFiles[key])) {
    const items = itemsFor(r, meta);
    // keep undated rows that still carry content (a week's free-text note)
    if (!r.date && !r.display && items.length === 0) continue;
    const label = /^\d+$/.test(r.week ?? '') ? `week ${r.week}` : (r.week || '');

    let w = weeks.find((x) => x.label === label);
    if (!w) { w = { label, meetings: [] }; weeks.push(w); }
    if (!w.subtitle && r.week_dates) w.subtitle = r.week_dates;

    w.meetings.push({
      date: r.date,
      display: r.display || undefined,
      type: r.type || 'class',
      items,
    });
  }
  return { meta, weeks };
}
