import { afterEach, describe, expect, it } from 'vitest';

import {
  FrontmatterService,
  type ImageFetcherPort,
  type UserProjectConfigPort,
} from '@casys/application';
import type { ProjectConfig } from '@casys/shared';

import { AstroFrontmatterAdapter } from '../../frontmatter/astro-frontmatter.adapter';
import { FsArticlePublisherAdapter } from '../fs-article-publisher.adapter';

function makeConfigReader(cfg: Partial<ProjectConfig>): UserProjectConfigPort {
  const project = cfg as ProjectConfig;
  return {
    async getProjectConfig() {
      return project;
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
  } as unknown as UserProjectConfigPort;
}

const prevEnv = { ...process.env };

describe('FsArticlePublisherAdapter - erreurs/fail-fast', () => {
  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('throw si file_system.disabled', async () => {
    const fmService = new FrontmatterService(
      new Map([['astro', new AstroFrontmatterAdapter()]]) as any
    );
    const imageFetcher: ImageFetcherPort = {
      async fetch(_url: string) {
        return { data: new Uint8Array([1, 2, 3]), mimeType: 'image/webp' };
      },
    };
    const adapter = new FsArticlePublisherAdapter(
      makeConfigReader({
        publication: { file_system: { enabled: false, content_path: 'x' } },
      } as any),
      fmService,
      imageFetcher
    );
    await expect(async () => adapter.publishArticle({} as any, 't', 'p')).rejects.toThrow(
      /file_system absent ou disabled/
    );
  });

  it('throw si content_path manquant/vide', async () => {
    const fmService = new FrontmatterService(
      new Map([['astro', new AstroFrontmatterAdapter()]]) as any
    );
    const imageFetcher: ImageFetcherPort = {
      async fetch(_url: string) {
        return { data: new Uint8Array([1, 2, 3]), mimeType: 'image/webp' };
      },
    };
    const adapter = new FsArticlePublisherAdapter(
      makeConfigReader({
        publication: { file_system: { enabled: true, content_path: '   ' } },
      } as any),
      fmService,
      imageFetcher
    );
    await expect(async () => adapter.publishArticle({} as any, 't', 'p')).rejects.toThrow(
      /content_path requis/
    );
  });

  it('throw si content_path relatif sans CASYS_PROJECT_ROOT', async () => {
    delete process.env.CASYS_PROJECT_ROOT;
    const fmService = new FrontmatterService(
      new Map([['astro', new AstroFrontmatterAdapter()]]) as any
    );
    const imageFetcher: ImageFetcherPort = {
      async fetch(_url: string) {
        return { data: new Uint8Array([1, 2, 3]), mimeType: 'image/webp' };
      },
    };
    const adapter = new FsArticlePublisherAdapter(
      makeConfigReader({
        publication: { file_system: { enabled: true, content_path: 'rel/path' } },
      } as any),
      fmService,
      imageFetcher
    );
    await expect(async () => adapter.publishArticle({} as any, 't', 'p')).rejects.toThrow(
      /CASYS_PROJECT_ROOT requis/
    );
  });

  it('throw si tenantId/projectId invalides', async () => {
    const fmService = new FrontmatterService(
      new Map([['astro', new AstroFrontmatterAdapter()]]) as any
    );
    const imageFetcher: ImageFetcherPort = {
      async fetch(_url: string) {
        return { data: new Uint8Array([1, 2, 3]), mimeType: 'image/webp' };
      },
    };
    const adapter = new FsArticlePublisherAdapter(
      makeConfigReader({
        publication: { file_system: { enabled: true, content_path: '/abs' } },
      } as any),
      fmService,
      imageFetcher
    );
    await expect(async () => adapter.publishArticle({} as any, '', 'p')).rejects.toThrow(
      /tenantId requis/
    );
    await expect(async () => adapter.publishArticle({} as any, 't', '  ')).rejects.toThrow(
      /projectId requis/
    );
  });
});
