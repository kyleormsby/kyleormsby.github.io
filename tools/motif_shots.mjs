/**
 * Capture the landing-page motif in every mode it has to survive:
 * light, dark, narrow, and prefers-reduced-motion.
 *
 *   npm run build && node tools/motif_shots.mjs
 *
 * Writes shots/motif-*.png. The animation is time-based, so each capture
 * waits a few seconds to catch it mid-braid rather than at rest.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = 'dist', PORT = 4333;
const TYPES = { '.html':'text/html','.css':'text/css','.js':'text/javascript',
  '.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif','.woff2':'font/woff2' };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const buf = await readFile(join(DIST, p));
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const VARIANTS = [
  ['motif-light',  { width: 1440, height: 900 }, {},                        4200],
  ['motif-dark',   { width: 1440, height: 900 }, { colorScheme: 'dark' },   4200],
  ['motif-mobile', { width: 420,  height: 860 }, {},                        4200],
  ['motif-still',  { width: 1440, height: 900 }, { reducedMotion: 'reduce' }, 900],
];
for (const [name, viewport, opts, wait] of VARIANTS) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, ...opts });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  const fig = page.locator('.motif');
  await fig.scrollIntoViewIfNeeded();
  await page.waitForTimeout(wait);
  await fig.screenshot({ path: `shots/${name}.png` });
  console.log(' ', name);
  await page.close();
}
await browser.close();
server.close();
