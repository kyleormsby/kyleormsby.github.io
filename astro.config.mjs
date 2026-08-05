import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
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
