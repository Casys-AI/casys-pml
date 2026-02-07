import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ProjectConfig } from '@casys/shared';
import { FrontmatterService } from '@casys/application';
import type { ImageFetcherPort, UserProjectConfigPort } from '@casys/application';

import { makeTestArticle } from '../../../test/factories/article';
import { AstroFrontmatterAdapter } from '../../frontmatter/astro-frontmatter.adapter';
import { FsArticlePublisherAdapter } from '../fs-article-publisher.adapter';

async function mkTmp(prefix: string) {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function rimraf(p: string) {
  try {
    await fs.rm(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// Stub minimal d'ImageFetcher (non utilisé dans ces tests car pas de cover distante)
const dummyFetcher: ImageFetcherPort = {
  async fetch(_src: string) {
    return { data: new Uint8Array(), mimeType: 'image/png' };
  },
};

// Articles de test via factory (garantit tags par défaut)

function makeConfigReader(contentPath: string): UserProjectConfigPort {
  const cfg: ProjectConfig = {
    name: 'Test Project',
    type: 'astro' as any,
    description: 'test',
    generation: { keywords: [], tone: 'neutral', length: 'short' } as any,
    publication: {
      canonicalBaseUrl: 'https://example.com',
      frontmatter: { profile: 'astrowind' } as any,
      file_system: {
        enabled: true,
        content_path: contentPath,
        format: 'mdx',
      } as any,
    } as any,
    schedule: { cron: '* * * * *', timezone: 'UTC', enabled: false } as any,
    security: { credentials_source: 'environment', env_prefix: 'TEST_' } as any,
    sources: { rss: [], apis: [], scraping: [] } as any,
  } as unknown as ProjectConfig;
  return {
    async getProjectConfig(_tenantId: string, _projectId: string) {
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

describe('FsArticlePublisherAdapter - flat writing', () => {
  afterEach(async () => {
    process.env = { ...prevEnv };
  });

  it('écrit en flat dans un content_path absolu', async () => {
    const baseAbs = await mkTmp('casys-fs-abs-');
    const configReader = makeConfigReader(baseAbs);
    const fmService = new FrontmatterService(
      new Map([['astro', new AstroFrontmatterAdapter()]]) as any
    );
    const adapter = new FsArticlePublisherAdapter(configReader, fmService, dummyFetcher);

    const article = makeTestArticle({ article: { tenantId: 'john-doe', projectId: 'blog-perso' } });
    // Frontmatter validation requires keywords
    article.article.keywords = ['test'];
    const {
      path: returnedPath,
      url,
      success,
    } = await adapter.publishArticle(article, 'john-doe', 'blog-perso');

    expect(success).toBe(true);

    const expectedFilename = 'elevation-l-ia-les-agents-123e4567.mdx';
    const expectedFilePath = path.join(baseAbs, expectedFilename);
    const stat = await fs.stat(expectedFilePath);
    expect(stat.isFile()).toBe(true);

    // Le path retourné est basé sur content_path + filename
    expect(returnedPath).toBe(path.join(baseAbs, expectedFilename).split(path.sep).join('/'));
    expect(url.startsWith('file://')).toBe(true);

    await rimraf(baseAbs);
  });

  it.skip('écrit en flat dans un content_path relatif résolu via CASYS_PROJECT_ROOT', async () => {
    const projectRoot = await mkTmp('casys-fs-rel-root-');
    process.env.CASYS_PROJECT_ROOT = projectRoot;
    const relContent = 'content/articles';
    const baseAbs = path.resolve(projectRoot, relContent);

    const configReader = makeConfigReader(relContent);
    const fmService = new FrontmatterService(
      new Map([['astro', new AstroFrontmatterAdapter()]]) as any
    );
    const adapter = new FsArticlePublisherAdapter(configReader, fmService, dummyFetcher);

    const article = makeTestArticle({ article: { tenantId: 'john-doe', projectId: 'blog-perso' } });
    article.article.keywords = ['test'];
    const { path: returnedPath, success } = await adapter.publishArticle(
      article,
      'john-doe',
      'blog-perso'
    );

    expect(success).toBe(true);

    const expectedFilename = 'elevation-l-ia-les-agents-123e4567.mdx';
    const expectedFilePath = path.join(baseAbs, expectedFilename);
    const stat = await fs.stat(expectedFilePath);
    expect(stat.isFile()).toBe(true);

    // Le path retourné doit être relatif (identique à content_path + filename)
    expect(returnedPath).toBe(path.join(relContent, expectedFilename).split(path.sep).join('/'));

    await rimraf(projectRoot);
  });
});