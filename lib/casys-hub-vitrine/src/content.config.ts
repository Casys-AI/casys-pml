import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    slug: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    author: z.string().optional(),
    authors: z.array(z.string()).optional(),
    date: z.date(),
    publishedAt: z.date().optional(),
    updatedAt: z.date().optional(),
    tags: z.array(z.string()).default([]),
    category: z.string().optional(),
    language: z.enum(['en', 'fr', 'zh']).default('en'),
    snippet: z.string().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

const docs = defineCollection({
  loader: docsLoader(),
  schema: docsSchema(),
});

export const collections = {
  blog,
  docs,
};
