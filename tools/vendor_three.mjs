/**
 * Vendor three.js into public/vendor/ and repoint the visualizations at it.
 *
 * Eight of the visualizations loaded three.js from a CDN — six pull the r128
 * UMD build from cdnjs, two use an importmap pointing at unpkg for 0.160 plus
 * addons. That makes a decade of mathematical exhibits dependent on two hosts
 * continuing to serve exact versions. This copies both builds into the repo,
 * walks the addon import graph so only reachable modules are included, and
 * rewrites the script tags and importmaps to local paths.
 *
 *   node tools/vendor_three.mjs            # vendor + rewrite
 *   node tools/vendor_three.mjs --check    # report remaining CDN references
 *
 * Safe to re-run: rewriting is idempotent.
 */
import { readFile, writeFile, mkdir, readdir, stat, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, posix, resolve } from 'node:path';

const run = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');
const OUT = join(PUBLIC, 'vendor', 'three');

const LEGACY = { version: '0.128.0', tag: 'r128' };   // UMD global build
const MODERN = { version: '0.160.0', tag: '0.160' };  // ES modules + addons

// The same library is pulled from three different CDNs, in two versions, as
// both UMD and ESM. Enumerate every form rather than trusting one spelling —
// the first pass of this script missed seven references by matching only the
// cdnjs r128 minified URL.
const HOST_160_BUILD =
  String.raw`https?:\/\/(?:cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/build`
  + String.raw`|unpkg\.com\/three@0\.160\.0\/build`
  + String.raw`|cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/0\.160\.0)`;
const HOST_160_JSM =
  String.raw`https?:\/\/(?:cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/examples\/jsm`
  + String.raw`|unpkg\.com\/three@0\.160\.0\/examples\/jsm`
  + String.raw`|cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/0\.160\.0\/examples\/jsm)\/`;
const HOST_R128 = String.raw`https?:\/\/(?:cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128`
  + String.raw`|unpkg\.com\/three@0\.128\.0\/build`
  + String.raw`|cdn\.jsdelivr\.net\/npm\/three@0\.128\.0\/build)`;

const REWRITES = [
  [new RegExp(HOST_160_JSM, 'g'), `/vendor/three/${MODERN.tag}/addons/`],
  [new RegExp(`${HOST_160_BUILD}\\/three\\.module(?:\\.min)?\\.js`, 'g'),
   `/vendor/three/${MODERN.tag}/three.module.js`],
  [new RegExp(`${HOST_R128}\\/three\\.module\\.js`, 'g'),
   `/vendor/three/${LEGACY.tag}/three.module.js`],
  [new RegExp(`${HOST_R128}\\/three\\.min\\.js`, 'g'),
   `/vendor/three/${LEGACY.tag}/three.min.js`],
];

/** Every .html and .js file under public/, excluding what we vendor. */
async function sources(dir = PUBLIC, acc = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'vendor' || e.name === 'thumbs') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await sources(p, acc);
    else if (/\.(html|js)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Download a package tarball from the npm registry into vendor/. */
async function fetchPackage(version) {
  const dest = join(ROOT, 'vendor', `three-${version}`);
  if (existsSync(join(dest, 'package.json'))) return dest;
  const tmp = join(ROOT, 'vendor');
  await mkdir(tmp, { recursive: true });
  console.log(`  fetching three@${version} from the npm registry`);
  await run('npm', ['pack', `three@${version}`, '--silent'], { cwd: tmp });
  await mkdir(dest, { recursive: true });
  await run('tar', ['xzf', `three-${version}.tgz`, '-C', dest, '--strip-components=1'], { cwd: tmp });
  return dest;
}

/** Follow relative imports out from the entry addons; copy only what is reachable. */
async function copyAddonGraph(pkgDir, entries) {
  const jsm = join(pkgDir, 'examples', 'jsm');
  const seen = new Set();
  const queue = [...entries];

  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);

    const src = join(jsm, rel);
    if (!existsSync(src)) {
      console.warn(`  ! addon not found in package: ${rel}`);
      continue;
    }
    const code = await readFile(src, 'utf8');
    const dest = join(OUT, MODERN.tag, 'addons', rel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, code);

    for (const m of code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      queue.push(posix.normalize(posix.join(posix.dirname(rel), m[1])));
    }
  }
  return seen;
}

const files = await sources();

if (process.argv.includes('--check')) {
  let hits = 0;
  for (const f of files) {
    const code = await readFile(f, 'utf8');
    for (const m of code.matchAll(/https?:\/\/[^"'\s)]+/g)) {
      if (/cdnjs|unpkg|jsdelivr|esm\.sh|skypack/.test(m[0])) {
        console.log(`${f.replace(PUBLIC + '/', '')}: ${m[0]}`);
        hits++;
      }
    }
  }
  console.log(hits ? `\n${hits} CDN reference(s) remain` : '\nno CDN script references remain');
  process.exit(hits ? 1 : 0);
}

// ---- 1. entry addons actually referenced by the visualizations -------------
const entries = new Set();
for (const f of files) {
  const code = await readFile(f, 'utf8');
  for (const m of code.matchAll(/three\/addons\/([A-Za-z0-9/._-]+\.js)/g)) entries.add(m[1]);
}
console.log(`entry addons referenced: ${entries.size}`);

// ---- 2. copy the builds ---------------------------------------------------
await mkdir(join(OUT, LEGACY.tag), { recursive: true });
await mkdir(join(OUT, MODERN.tag), { recursive: true });

const legacyDir = existsSync(join(ROOT, 'node_modules', 'three', 'build', 'three.min.js'))
  ? join(ROOT, 'node_modules', 'three')
  : await fetchPackage(LEGACY.version);
for (const f of ['three.min.js', 'three.module.js']) {
  await cp(join(legacyDir, 'build', f), join(OUT, LEGACY.tag, f));
}

const modernDir = await fetchPackage(MODERN.version);
await cp(join(modernDir, 'build', 'three.module.min.js'), join(OUT, MODERN.tag, 'three.module.js'));

const copied = await copyAddonGraph(modernDir, [...entries]);
console.log(`addon modules copied (including transitive imports): ${copied.size}`);

// ---- 3. rewrite the visualizations ---------------------------------------
let touched = 0;
for (const f of files) {
  const before = await readFile(f, 'utf8');
  let after = before;
  for (const [re, local] of REWRITES) after = after.replace(re, local);
  if (after !== before) {
    await writeFile(f, after);
    console.log(`  rewrote ${f.replace(PUBLIC + '/', '')}`);
    touched++;
  }
}

const size = async (p) => Math.round((await stat(p)).size / 1024);
console.log(`\n${touched} file(s) rewritten`);
for (const [tag, file] of [[LEGACY.tag, 'three.min.js'], [LEGACY.tag, 'three.module.js'],
                           [MODERN.tag, 'three.module.js']]) {
  console.log(`  /vendor/three/${tag}/${file}  (${await size(join(OUT, tag, file))} KB)`);
}
