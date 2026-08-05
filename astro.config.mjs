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
 * 2. The PDFs, notes, and recordings live in the old repo's files/ directory —
 *    2 GB of them, too much to commit here. Point FILES_DIR at that folder and
 *    /files/* resolves locally without the repo carrying the weight.
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

        if (path.startsWith('/files/')) {
          const file = join(FILES_DIR, path.slice('/files/'.length));
          if (file.startsWith(FILES_DIR) && existsSync(file) && statSync(file).isFile()) {
            return send(res, file);
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
      rehypePlugins: [[rehypeKatex, { output: 'html', throwOnError: false, strict: false }]],
      smartypants: true,
    }),
  },
  build: { format: 'directory' },
});
