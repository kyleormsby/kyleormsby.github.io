import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const viz = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/viz' }),
  schema: z.object({
    title: z.string(),
    href: z.string(),
    year: z.number(),
    thumb: z.string(),        // required: a missing one renders a blank card
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
  }),
});

const writing = defineCollection({
  // files beginning with "_" are staging (e.g. the imported About page)
  loader: glob({ pattern: '**/[!_]*.md', base: './src/content/writing' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    updated: z.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    source: z.string().url().optional(),
  }),
});

export const collections = { viz, writing };
