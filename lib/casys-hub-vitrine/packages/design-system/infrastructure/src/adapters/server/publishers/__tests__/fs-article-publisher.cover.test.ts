import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectConfig } from '@casys/shared';
import type { ArticleStructure } from '@casys/core';
import type { ImageFetcherPort, UserProjectConfigPort } from '@casys/application';

import { FsArticlePublisherAdapter } from '../fs-article-publisher.adapter';

async function mkTmp(prefix: string) {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeArticle(overrides?: Partial<ArticleStructure['article']>): ArticleStructure {
  return {
    article: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Élévation: L’IA & les-agents!!!',
      description: 'desc',
      language: 'fr',
      createdAt: new Date().toISOString(),
      keywords: [],
      sources: [],
      agents: [],
      tenantId: 'john-doe',
      projectId: 'blog-perso',
      cover: { src: 'https://example.com/cover.webp', alt: 'alt' },
      ...overrides,
    },
    sections: [],
    componentUsages: [],
    textFragments: [],
  } as ArticleStructure;
}

function makeConfigReader(
  contentPath: string,
  assetsPath: string,
  assetsUrlBase: string
): UserProjectConfigPort {
  const cfg: ProjectConfig = {
    name: 'Test Project',
    type: 'astro' as any,
    description: 'test',
    generation: { keywords: [], tone: 'neutral', length: 'short' } as any,
    publication: {
      canonicalBaseUrl: 'https://example.com',
      frontmatter: { profile: 'astrowind' } as any,
      images: { cover: { format: 'webp' } } as any,
      file_system: {
        enabled: true,
        content_path: contentPath,
        assets_path: assetsPath,
        assets_url_base: assetsUrlBase,
        format: 'mdx',
      } as any,
    },
    schedule: { cron: '* * * * *', timezone: 'UTC', enabled: false },
    security: { credentials_source: 'environment', env_prefix: 'TEST_' } as any,
    sources: { rss: [], apis: [], scraping: [] } as any,
  } as unknown as ProjectConfig;
  return {
    async getProjectConfig() {
      return cfg;
    },
    async getUserConfig() {
      return { id: 'test-user' } as any;
    },
    async saveUserConfig() {
      return;
    },
    async saveProjectConfig() {
      return;
    },
    async listUsers() {
      return ['test-user'];
    },
    async listUserProjects() {
      return ['test-project'];
    },
  } as UserProjectConfigPort;
}

const prevEnv = { ...process.env };

// Stub ImageFetcher
const imageFetcher: ImageFetcherPort = {
  async fetch(_url: string): Promise<{ data: Uint8Array; mimeType?: string | undefined }> {
    return { data: new Uint8Array([1, 2, 3, 4]), mimeType: 'image/webp' };
  },
};

// Spy FrontmatterService minimal pour capturer l'article mis à jour
const fmSpy = {
  calls: [] as any[],
  generateForProject: vi.fn(async (article: ArticleStructure) => {
    fmSpy.calls.push(article);
    const slug = 'elevation-l-ia-les-agents-123e4567';
    const fileName = `${slug}.mdx`;
    return { content: '---\n---\n', fileName, format: 'mdx', meta: { slug } } as any;
  }),
} as any;

function expectHasWebpIn(dir: string, slugPrefix: string) {
  return fs
    .readdir(dir)
    .then(files => files.some(f => f.startsWith(slugPrefix) && f.endsWith('.webp')));
}

describe('FsArticlePublisherAdapter - cover assets', () => {
  beforeEach(() => {
    fmSpy.calls = [];
  });
  afterEach(async () => {
    process.env = { ...prevEnv };
  });

  it("crée le sous-dossier <slug> sous assets_path, écrit l'image, et met à jour cover.src route-absolute", async () => {
    const projectRoot = await mkTmp('casys-fs-cover-');
    process.env.CASYS_PROJECT_ROOT = projectRoot;

    const relContent = 'content/articles';
    const relAssets = 'public/images/articles';
    const assetsUrlBase = '/images/articles';

    const configReader = makeConfigReader(relContent, relAssets, assetsUrlBase);
    const adapter = new FsArticlePublisherAdapter(configReader, fmSpy, imageFetcher);

    const article = makeArticle();
    const res = await adapter.publishArticle(article, 'john-doe', 'blog-perso');

    expect(res.success).toBe(true);

    const slug = 'elevation-l-ia-les-agents-123e4567';
    const assetsAbs = path.resolve(projectRoot, relAssets, slug);
    // Le sous-dossier de l'article doit exister et contenir un .webp
    const exists = await fs
      .stat(assetsAbs)
      .then(s => s.isDirectory())
      .catch(() => false);
    expect(exists).toBe(true);
    expect(await expectHasWebpIn(assetsAbs, slug)).toBe(true);

    // FrontmatterService doit avoir reçu un article avec cover.src mis à jour
    expect(fmSpy.generateForProject).toHaveBeenCalled();
    const updated = fmSpy.calls[0] as ArticleStructure;
    expect(updated.article.cover?.src).toMatch(
      new RegExp(`^${assetsUrlBase}/${slug}/elevation-l-ia-les-agents-123e4567-[a-f0-9]{8}\\.webp$`)
    );
  });
});
