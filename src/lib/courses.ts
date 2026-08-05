import { parseCsv, type Row } from './csv';

export interface CourseMeta {
  slug: string;            // becomes the URL: /113/
  number: string;          // "math 113"
  title: string;           // "discrete structures"
  term: string;            // "spring 2026"
  schedule: string;        // csv filename
  filesBase: string;       // "/files/113spring26/"
  panoptoBase?: string;
  blurb?: string;
  facts: { label: string; value: string }[];
}

export interface Item { label: string; html: string; }
export interface Meeting { date: string; type: string; items: Item[]; }
export interface Week { label: string; meetings: Meeting[]; }

const csvFiles = import.meta.glob('../data/courses/*.csv', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const metaFiles = import.meta.glob('../data/courses/*.json', {
  import: 'default', eager: true,
}) as Record<string, CourseMeta>;

/** Minimal inline markdown: [text](url), *em*, **strong**, `code`. */
export function inline(src: string): string {
  if (!src) return '';
  const esc = src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/ ❦ /g, '<span class="sep">❦</span>')
    .replace(/\n/g, '<br>');
}

const pdf = (meta: CourseMeta, s: string) =>
  /^(https?:)?\//.test(s) ? s : `${meta.filesBase}${s}.pdf`;

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric',
  });

function itemsFor(r: Row, meta: CourseMeta): Item[] {
  const items: Item[] = [];
  const push = (label: string, html: string) => html && items.push({ label, html });

  if (r.reading) {
    const pages = r.pages ? ` <span class="dim">pp. ${r.pages}</span>` : '';
    push('reading', inline(r.reading) + pages);
  }
  if (r.lecture) {
    const href = /^https?:/.test(r.lecture)
      ? r.lecture
      : `${meta.panoptoBase ?? ''}${r.lecture}`;
    push('lecture', `<a href="${href}">lecture and quiz</a> <span class="dim">before class</span>`);
  }
  if (r.worksheet) {
    let html = `<a href="${pdf(meta, r.worksheet)}">worksheet</a>`;
    if (r.solutions) html += `<span class="sep">❦</span><a href="${pdf(meta, r.solutions)}">solutions</a>`;
    push('in class', html);
  }
  if (r.hw) {
    const due = r.hw_due ? ` <span class="dim">due ${longDate(r.hw_due)}</span>` : '';
    push('assigned', `<a href="${pdf(meta, r.hw)}">homework</a>${due}`);
  }
  if (r.submit) {
    const by = r.submit_by ? ` <span class="dim">by ${r.submit_by}</span>` : '';
    push('due', `<a href="${pdf(meta, r.submit)}">homework</a>${by}`);
  }
  if (r.note) push('note', inline(r.note));
  return items;
}

export function allCourses(): CourseMeta[] {
  return Object.values(metaFiles);
}

export function loadCourse(slug: string): { meta: CourseMeta; weeks: Week[] } {
  const meta = allCourses().find((c) => c.slug === slug);
  if (!meta) throw new Error(`no course metadata for "${slug}"`);

  const key = Object.keys(csvFiles).find((k) => k.endsWith(`/${meta.schedule}`));
  if (!key) throw new Error(`no schedule file "${meta.schedule}" for ${slug}`);

  const weeks: Week[] = [];
  for (const r of parseCsv(csvFiles[key])) {
    if (!r.date) continue;
    const label = r.week?.match(/^\d+$/) ? `week ${r.week}` : (r.week || '');
    let w = weeks.find((x) => x.label === label);
    if (!w) { w = { label, meetings: [] }; weeks.push(w); }
    w.meetings.push({ date: r.date, type: r.type || 'class', items: itemsFor(r, meta) });
  }
  return { meta, weeks };
}
