/**
 * Assert that the colour-scheme toggle behaves, against the built site.
 *
 *   npm run build && npm run check:theme
 *
 * The failure this exists to catch is the quiet one: the switch keeps working
 * while the *pre-paint* script stops, and every page load flashes light for a
 * frame before going dark. That is invisible in a screenshot taken after load, so
 * it is checked here by reading the attribute at navigation commit — before
 * the first paint — rather than after everything has settled.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = 'dist', PORT = 4344;
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

const LIGHT = 'rgb(252, 251, 248)';
const DARK = 'rgb(18, 18, 19)';
const failures = [];
const check = (name, got, want) => {
  if (got !== want) failures.push(`${name}: expected ${want}, got ${got}`);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const state = (pg) => pg.evaluate(() => ({
  checked: document.querySelector('[data-theme-toggle]')?.getAttribute('aria-checked'),
  bg: getComputedStyle(document.body).backgroundColor,
}));

// Light is the default whatever the OS says, and the switch is a plain toggle.
for (const os of ['dark', 'light']) {
  const ctx = await browser.newContext({ colorScheme: os });
  const pg = await ctx.newPage();
  await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  let s = await state(pg);
  check(`os ${os}: defaults to light regardless of the OS`, s.bg, LIGHT);
  check(`os ${os}: switch starts off`, s.checked, 'false');

  await pg.click('[data-theme-toggle]');
  await pg.waitForTimeout(50);
  s = await state(pg);
  check(`os ${os}: background after switching on`, s.bg, DARK);
  check(`os ${os}: switch reads on`, s.checked, 'true');

  await pg.click('[data-theme-toggle]');
  await pg.waitForTimeout(50);
  s = await state(pg);
  check(`os ${os}: background after switching back`, s.bg, LIGHT);
  check(`os ${os}: switch reads off`, s.checked, 'false');
  await ctx.close();
}

// The choice survives navigation, and is applied before the first paint.
{
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const pg = await ctx.newPage();
  await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await pg.click('[data-theme-toggle]');                       // light -> dark
  await pg.goto(`http://localhost:${PORT}/writing/`, { waitUntil: 'commit' });
  const early = await pg.evaluate(() => document.documentElement.dataset.theme || '(none)');
  check('choice applied pre-paint on the next page', early, 'dark');
  await pg.waitForLoadState('networkidle');
  check('choice survives navigation', (await state(pg)).bg, DARK);
  await ctx.close();
}

await browser.close();
server.close();

for (const f of failures) console.error('  ✗', f);
console.log(failures.length ? `${failures.length} theme check(s) failed` : 'theme toggle: all checks passed');
process.exit(failures.length ? 1 : 0);
