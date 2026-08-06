/**
 * Measure text contrast across the built site, in both colour schemes.
 *
 *   npm run build && npm run check:contrast
 *
 * The subtlety this exists for is `opacity`. A colour can pass on its own and
 * fail in place, because opacity on an ancestor composites it toward the
 * background — `--muted` at 7:1 becomes 2.98:1 under `opacity: 0.72`. Reading
 * the computed `color` alone would call that fine. So every ancestor's opacity
 * is folded in and the result composited against the page background before
 * the ratio is taken, which is what actually reaches the eye.
 *
 * Thresholds are WCAG AA: 4.5:1 for normal text, 3:1 for large (>=24px, or
 * >=18.66px bold).
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = 'dist', PORT = 4346;
const PAGES = ['/', '/113/', '/teaching/', '/research/', '/viz/', '/writing/',
               '/writing/aha/', '/544/'];
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

const audit = () => {
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m[3] ?? 1]; };

  const bg = parse(getComputedStyle(document.body).backgroundColor).slice(0, 3);
  const seen = new Map();
  for (const el of document.querySelectorAll('body *')) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim()).join(' ');
    if (!text) continue;

    const cs = getComputedStyle(el);
    const [r, g, b, alpha] = parse(cs.color);
    let o = alpha, n = el;
    while (n && n !== document.body) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
    const eff = [r, g, b].map((c, i) => Math.round(c * o + bg[i] * (1 - o)));

    const px = parseFloat(cs.fontSize);
    const large = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight) >= 700);
    const key = `${el.className || el.tagName}|${cs.color}|${o.toFixed(2)}|${px}`;
    if (!seen.has(key)) {
      seen.set(key, {
        cls: String(el.className || el.tagName.toLowerCase()).slice(0, 30),
        cr: +ratio(eff, bg).toFixed(2), need: large ? 3 : 4.5,
        px, op: +o.toFixed(2), sample: text.slice(0, 28),
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.cr - b.cr);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const failures = [];
let worst = { cr: Infinity };

// Dark is reached by the switch, not by the OS — the palette deliberately
// ignores prefers-color-scheme, so setting it on the context would silently
// audit light twice.
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  for (const path of PAGES) {
    await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'networkidle' });
    await page.evaluate((s) => {
      if (s === 'dark') document.documentElement.dataset.theme = 'dark';
      else delete document.documentElement.dataset.theme;
    }, scheme);
    // Links animate colour over 0.18s. Reading now would catch every <a>
    // part-way between the old ink and the new, against the already-switched
    // background — which reports as a contrast failure that does not exist.
    await page.waitForTimeout(400);
    for (const row of await page.evaluate(audit)) {
      if (row.cr < worst.cr) worst = { ...row, scheme, path };
      if (row.cr < row.need) failures.push({ ...row, scheme, path });
    }
  }
  await ctx.close();
}
await browser.close();
server.close();

for (const f of failures) {
  console.error(`  ✗ ${String(f.cr).padStart(5)}:1 (need ${f.need})  ${f.scheme} ${f.path}` +
                `  ${f.px}px op=${f.op} .${f.cls}  "${f.sample}"`);
}
console.log(failures.length
  ? `${failures.length} contrast failure(s)`
  : `contrast: all text passes AA (worst ${worst.cr}:1, ${worst.scheme} ${worst.path} .${worst.cls})`);
process.exit(failures.length ? 1 : 0);
