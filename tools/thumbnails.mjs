/**
 * Render each standalone visualization in a headless browser and save a
 * screenshot to public/thumbs/<slug>.png.
 *
 *   npm run thumbs            # all
 *   npm run thumbs -- nets    # just one
 *
 * Re-run whenever a visualization changes; commit the PNGs so the site
 * builds without a browser in CI.
 */
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');
const OUT = join(PUBLIC, 'thumbs');
const PORT = 4319;

const WAIT = 3000;          // let three.js / canvas settle
const VIEW = { width: 800, height: 600 };
const SCALE = 1.5;

// Visualizations load three.js from a CDN. In a sandbox (and in CI) that
// request may not resolve, so serve the pinned local copy instead.
const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const LOCAL_THREE = join(ROOT, 'node_modules', 'three', 'build', 'three.min.js');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(PUBLIC, p);
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const TWEAKS = JSON.parse(
  await readFile(join(import.meta.dirname, 'thumbnails.config.json'), 'utf8').catch(() => '{}'),
);

// --no-stub disables the local CDN substitutions, so a run doubles as a check
// that the visualizations are genuinely self-contained.
const noStub = process.argv.includes('--no-stub');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dirs = (await readdir(PUBLIC, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && !['thumbs', 'images', 'files'].includes(d.name))
  .map((d) => d.name)
  .filter((d) => existsSync(join(PUBLIC, d, 'index.html')))
  .filter((d) => only.length === 0 || only.includes(d))
  .sort();

await mkdir(OUT, { recursive: true });
await new Promise((r) => server.listen(PORT, r));

// Allow an explicit browser binary (useful when a preinstalled Chromium does
// not match the Playwright build this project pins).
const exe = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: SCALE,
  colorScheme: 'light',
  reducedMotion: 'no-preference',
});

if (!noStub && existsSync(LOCAL_THREE)) {
  const js = await readFile(LOCAL_THREE, 'utf8');
  await ctx.route(CDN, (route) => route.fulfill({ contentType: 'text/javascript', body: js }));
} else if (!noStub) {
  console.warn('! node_modules/three (r128 UMD build) missing; those scenes may render empty');
}

// Several visualizations use an importmap pointing at unpkg for three 0.160
// (module build + examples/jsm addons). Serve the vendored copy instead.
const UNPKG_THREE = join(ROOT, 'vendor', 'three-0.160.0');
if (!noStub && existsSync(UNPKG_THREE)) {
  await ctx.route('https://unpkg.com/three@0.160.0/**', async (route) => {
    const path = new URL(route.request().url()).pathname
      .replace('/three@0.160.0/', '/');
    try {
      const body = await readFile(join(UNPKG_THREE, path), 'utf8');
      await route.fulfill({ contentType: 'text/javascript', body });
    } catch {
      await route.abort();
    }
  });
} else if (!noStub) {
  console.warn('! vendor/three-0.160.0 missing; importmap scenes may render empty');
}

let ok = 0;
for (const slug of dirs) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const tweak = TWEAKS[slug] ?? {};
  try {
    if (noStub) {
      page.on('requestfailed', (req) => {
        const u = req.url();
        if (!u.startsWith(`http://127.0.0.1:${PORT}`)) errors.push(`offsite: ${u}`);
      });
    }
    await page.goto(`http://127.0.0.1:${PORT}/${slug}/`, { waitUntil: 'load', timeout: 30000 });
    if (tweak.click) {
      await page.click(tweak.click, { timeout: 5000 }).catch(() => {});
    }
    if (tweak.scrollTo) {
      await page.locator(tweak.scrollTo).first()
        .scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(tweak.wait ?? WAIT);
    await page.screenshot({ path: join(OUT, `${slug}.png`), type: 'png' });
    ok++;
    console.log(`  ${slug}${errors.length ? `  (${errors.length} page errors)` : ''}`);
  } catch (e) {
    console.error(`  ${slug}  FAILED: ${e.message.split('\n')[0]}`);
  }
  await page.close();
}

await browser.close();
server.close();
console.log(`\n${ok}/${dirs.length} thumbnails written to public/thumbs/`);
