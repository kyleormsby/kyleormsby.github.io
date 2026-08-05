import { existsSync, statSync, createReadStream } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/**
 * Two dev-server gaps this closes.
 *
 * 1. Astro's dev server serves files out of public/ but does not resolve a
 *    directory to its index.html, so /lattice-flow/ 404s in dev even though it
 *    works in the built site. Every visualization is a directory like that.
 *
 * 2. Most of files/ is committed under public/files, but the 54x lecture notes
 *    and the two videos were pruned to fit under the GitHub Pages 1 GB limit.
 *    Point FILES_DIR at the old repo and those still resolve in dev.
 */
const FILES_DIR = resolve(process.env.FILES_DIR ?? '../kyleormsby.github.io/files');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.json': 'application/json', '.tex': 'text/plain; charset=utf-8',
};

const send = (res, file) => {
  res.setHeader('content-type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('content-length', statSync(file).size);
  createReadStream(file).pipe(res);
};

function devStatics() {
  return {
    name: 'dev-statics',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '/').split('?')[0]);

        // Most of files/ is committed under public/. Let Vite serve those so
        // dev matches production exactly; only fall back to FILES_DIR for the
        // material that was pruned (the 54x lecture notes, the videos).
        if (path.startsWith('/files/')) {
          const committed = join(process.cwd(), 'public', path);
          if (!existsSync(committed)) {
            const file = join(FILES_DIR, path.slice('/files/'.length));
            if (file.startsWith(FILES_DIR) && existsSync(file) && statSync(file).isFile()) {
              return send(res, file);
            }
          }
        }

        if (path.endsWith('/')) {
          const index = join(process.cwd(), 'public', path, 'index.html');
          if (existsSync(index)) return send(res, index);
        }

        next();
      });
    },
  };
}

export default defineConfig({
  vite: { plugins: [devStatics()] },
  site: 'https://configuration.space',
  trailingSlash: 'always',
  markdown: {
    // Math is rendered to HTML at build time, so pages ship no math engine.
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [[rehypeKatex, {
        output: 'html',
        throwOnError: false,
        strict: false,
        // KaTeX has no \boxslash. The lifting-property operator in the
        // homotopical combinatorics post needs one, so build it from pieces.
        // No \mathbin: it is used in superscript position ({}^\boxslash R).
        macros: { '\\boxslash': '{\\square\\mkern-11mu\\diagup}' },
      }]],
      smartypants: true,
    }),
  },
  // The Jekyll site published posts at /posts/YYYY/MM/slug/. Those URLs are in
  // the wild, so keep them resolving.
  redirects: {
    '/posts/2021/11/aha/': '/writing/aha/',
    '/posts/2021/09/homotopical-combinatorics/': '/writing/homotopical-combinatorics/',
    '/posts/2021/06/farewell-bright-obvious/': '/writing/farewell-bright-obvious/',
  },
  build: { format: 'directory' },
});
