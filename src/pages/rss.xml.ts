/**
 * The feed every page has been advertising in its <head> since the site was
 * built. Nothing generated it, so `/rss.xml` was a 404 on every page — the
 * kind of thing no visitor notices and every feed reader does.
 *
 * Hand-rolled rather than pulling in @astrojs/rss: it is thirty lines, and the
 * only genuinely fiddly part is escaping, which is handled below.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ site }) => {
  const base = site?.href.replace(/\/$/, '') ?? 'https://e-infinity.space';

  const posts = (await getCollection('writing'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => +b.data.date - +a.data.date);

  const items = posts.map((p) => `    <item>
      <title>${escape(p.data.title)}</title>
      <link>${base}/writing/${p.id}/</link>
      <guid isPermaLink="true">${base}/writing/${p.id}/</guid>
      <pubDate>${p.data.date.toUTCString()}</pubDate>
    </item>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Kyle Ormsby</title>
    <link>${base}/</link>
    <description>Homotopy theory, combinatorics, and mathematical visualization.</description>
    <language>en</language>
    <atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
