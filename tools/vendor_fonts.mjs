/**
 * Vendor Google Fonts into public/vendor/fonts/ and repoint the pages at them.
 *
 * Two visualizations load Cormorant Garamond and EB Garamond from
 * fonts.googleapis.com. That is the same fragility as the CDN copies of
 * three.js, plus a privacy cost: every reader's IP address is disclosed to a
 * third party to render a page of mathematics. The fonts are on npm via
 * @fontsource, so they can simply live in the repo.
 *
 *   node tools/vendor_fonts.mjs           # vendor + rewrite
 *   node tools/vendor_fonts.mjs --check   # report remaining remote font links
 *
 * Latin subsets only; re-run with --subsets if a page ever needs more.
 */
import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, extname, resolve } from 'node:path';

const run = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');
const OUT = join(PUBLIC, 'vendor', 'fonts');

const GF_LINK = /<link[^>]+href=["']https:\/\/fonts\.googleapis\.com\/css2\?([^"']+)["'][^>]*>/g;
const PRECONNECT = /\s*<link[^>]+href=["']https:\/\/fonts\.(?:gstatic|googleapis)\.com["'][^>]*>/g;

const subsetArg = process.argv.find((a) => a.startsWith('--subsets='));
const SUBSETS = (subsetArg ? subsetArg.split('=')[1] : 'latin,latin-ext').split(',');

async function sources(dir = PUBLIC, acc = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'vendor' || e.name === 'thumbs') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await sources(p, acc);
    else if (extname(e.name) === '.html') acc.push(p);
  }
  return acc;
}

/** "family=EB+Garamond:ital,wght@0,400;0,500;1,400" -> {slug, faces:[{style,weight}]} */
function parseFamily(spec) {
  const [name, axes] = spec.split(':');
  const family = decodeURIComponent(name.replace(/\+/g, ' '));
  const slug = family.toLowerCase().replace(/\s+/g, '-');
  const faces = [];
  if (!axes) {
    faces.push({ style: 'normal', weight: 400 });
  } else {
    const [keys, values] = axes.split('@');
    const axisNames = keys.split(',');
    for (const tuple of (values ?? '400').split(';')) {
      const parts = tuple.split(',');
      const rec = Object.fromEntries(axisNames.map((k, i) => [k, parts[i]]));
      faces.push({
        style: rec.ital === '1' ? 'italic' : 'normal',
        weight: Number(rec.wght ?? 400),
      });
    }
  }
  return { family, slug, faces };
}

async function fetchFontsource(slug) {
  const dest = join(ROOT, 'vendor', `fontsource-${slug}`);
  if (existsSync(join(dest, 'package.json'))) return dest;
  const tmp = join(ROOT, 'vendor');
  await mkdir(tmp, { recursive: true });
  console.log(`  fetching @fontsource/${slug}`);
  const { stdout } = await run('npm', ['pack', `@fontsource/${slug}`, '--silent'], { cwd: tmp });
  const tgz = stdout.trim().split('\n').pop();
  await mkdir(dest, { recursive: true });
  await run('tar', ['xzf', tgz, '-C', dest, '--strip-components=1'], { cwd: tmp });
  return dest;
}

const files = await sources();

if (process.argv.includes('--check')) {
  let hits = 0;
  for (const f of files) {
    const html = await readFile(f, 'utf8');
    for (const m of html.matchAll(/https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*/g)) {
      console.log(`${f.replace(PUBLIC + '/', '')}: ${m[0].slice(0, 90)}`);
      hits++;
    }
  }
  console.log(hits ? `\n${hits} remote font reference(s) remain` : '\nno remote font references remain');
  process.exit(hits ? 1 : 0);
}

// ---- 1. collect every family/weight actually requested --------------------
const wanted = new Map();   // slug -> {family, faces:Set<"style weight">}
for (const f of files) {
  const html = await readFile(f, 'utf8');
  for (const m of html.matchAll(GF_LINK)) {
    for (const param of m[1].split('&')) {
      if (!param.startsWith('family=')) continue;
      const { family, slug, faces } = parseFamily(param.slice('family='.length));
      const rec = wanted.get(slug) ?? { family, faces: new Set() };
      faces.forEach((x) => rec.faces.add(`${x.style} ${x.weight}`));
      wanted.set(slug, rec);
    }
  }
}
if (wanted.size === 0) {
  console.log('no Google Fonts links found');
  process.exit(0);
}

// ---- 2. copy the woff2 files and write a local stylesheet -----------------
await mkdir(join(OUT, 'files'), { recursive: true });
let css = '/* Vendored from @fontsource. Regenerate with tools/vendor_fonts.mjs. */\n';
let copied = 0;

for (const [slug, { family, faces }] of wanted) {
  const pkg = await fetchFontsource(slug);
  for (const face of faces) {
    const [style, weight] = face.split(' ');
    for (const subset of SUBSETS) {
      const name = `${slug}-${subset}-${weight}-${style}.woff2`;
      const src = join(pkg, 'files', name);
      if (!existsSync(src)) continue;
      await cp(src, join(OUT, 'files', name));
      copied++;
      css += `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};`
           + `font-display:swap;src:url('./files/${name}') format('woff2');}\n`;
    }
  }
  console.log(`  ${family}: ${faces.size} face(s)`);
}

await writeFile(join(OUT, 'fonts.css'), css);
console.log(`${copied} woff2 file(s) -> public/vendor/fonts/`);

// ---- 3. rewrite the pages -------------------------------------------------
let touched = 0;
for (const f of files) {
  const before = await readFile(f, 'utf8');
  if (!GF_LINK.test(before)) { GF_LINK.lastIndex = 0; continue; }
  GF_LINK.lastIndex = 0;
  let seen = false;
  const after = before
    .replace(GF_LINK, () => {
      if (seen) return '';
      seen = true;
      return '<link rel="stylesheet" href="/vendor/fonts/fonts.css">';
    })
    .replace(PRECONNECT, '');
  if (after !== before) {
    await writeFile(f, after);
    console.log(`  rewrote ${f.replace(PUBLIC + '/', '')}`);
    touched++;
  }
}
console.log(`\n${touched} file(s) rewritten`);
