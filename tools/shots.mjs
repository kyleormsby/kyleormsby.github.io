import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'shots');
const PORT = 4320;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    let f = join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if ((await stat(f).catch(() => null))?.isDirectory()) f = join(f, 'index.html');
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end('nope');
  }
});

const targets = [
  ['home',      '/',                                   1440, 'full'],
  ['gallery',   '/viz/',                               1440, 'full'],
  ['course',    '/113/',                               1440, 2100],
  ['post',      '/writing/homotopical-combinatorics/', 1440, 1500],
  ['home-dark', '/',                                   1440, 1400],
  ['course-mobile', '/113/',                            420, 1400],
];

await mkdir(OUT, { recursive: true });
await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

for (const [name, path, width, mode] of targets) {
  const ctx = await browser.newContext({
    viewport: { width, height: typeof mode === 'number' ? mode : 1000 },
    deviceScaleFactor: 2,
    colorScheme: name.endsWith('dark') ? 'dark' : 'light',
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'load' });
  // Walk the page so lazy-loaded images decode before a full-page capture.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: mode === 'full' });
  console.log(' ', name);
  await ctx.close();
}

await browser.close();
server.close();
