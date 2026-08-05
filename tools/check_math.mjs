/**
 * Parse every math span in the blog posts with KaTeX in strict mode.
 *
 *   npm run check:math
 *
 * The build runs KaTeX with `strict: false`, which turns malformed input into
 * a console warning and renders something approximate. That is the right
 * setting for a build — one bad formula should not fail a deploy — but it
 * means errors scroll past unnoticed. This fails loudly instead, so imported
 * or hand-edited math gets checked deliberately rather than by accident.
 */
import katex from 'katex';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DIRS = ['src/content/writing'];
const ROOT = resolve(import.meta.dirname, '..');

// Must match the macros in astro.config.mjs.
const MACROS = { '\\boxslash': '{\\square\\mkern-11mu\\diagup}' };

let spans = 0;
const failures = [];

for (const dir of DIRS) {
  const abs = join(ROOT, dir);
  for (const f of (await readdir(abs)).filter((f) => f.endsWith('.md'))) {
    const raw = await readFile(join(abs, f), 'utf8');
    const body = raw.split(/^---$/m).slice(2).join('---');   // skip frontmatter
    for (const m of body.matchAll(/\$\$([^$]+)\$\$|\$([^$\n]+)\$/g)) {
      spans++;
      const tex = m[1] ?? m[2];
      try {
        katex.renderToString(tex, {
          displayMode: Boolean(m[1]),
          throwOnError: true,
          strict: 'error',
          macros: { ...MACROS },
        });
      } catch (e) {
        failures.push({ file: f, tex, why: e.message.split('\n')[0] });
      }
    }
  }
}

for (const { file, tex, why } of failures) {
  console.error(`${file}\n   ${tex}\n   -> ${why}\n`);
}
console.log(`${spans} math spans checked, ${failures.length} rejected`);
process.exit(failures.length ? 1 : 0);
