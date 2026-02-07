import { describe, expect, it, vi } from 'vitest';

import type {
  ArticlePublisherPort,
  ArticleStructure,
  UserProjectConfigPort,
} from '@casys/core/src/domain';
import { ArticlePublicationService } from '../article-publication.service';

function makeArticle(): ArticleStructure {
  return {
    article: {
      id: 'a-1',
      title: 'Titre',
      description: '',
      language: 'fr',
      createdAt: new Date().toISOString(),
      keywords: [],
      sources: [],
      agents: [],
      tenantId: 't1',
      projectId: 'p1',
      content: 'Hello',
    },
    sections: [],
    componentUsages: [],
    textFragments: [],
  } as any;
}

function configReaderWith(cfg: any): UserProjectConfigPort {
  return {
    async getUserConfig() {
      throw new Error('not used');
    },
    async getProjectConfig() {
      return cfg;
    },
    async saveUserConfig() {
      throw new Error('not implemented');
    },
    async saveProjectConfig() {
      throw new Error('not implemented');
    },
    async listUsers() {
      return [];
    },
    async listUserProjects() {
      return [];
    },
  } as UserProjectConfigPort;
}

describe('ArticlePublicationService - orchestration', () => {
  it('publie sur FS only lorsque activé', async () => {
    const fsPublisher: ArticlePublisherPort = {
      publishArticle: vi.fn(async () => ({
        url: 'file:///tmp/a.md',
        path: '/tmp/a.md',
        success: true,
      })),
    };
    const cfg = { publication: { file_system: { enabled: true }, github: { enabled: false } } };
    const svc = new ArticlePublicationService(configReaderWith(cfg), fsPublisher, undefined);

    const res = await svc.publishToConfiguredTargets(makeArticle(), 't1', 'p1');

    expect(res).toHaveLength(1);
    expect(res[0].target).toBe('file_system');
    expect(fsPublisher.publishArticle).toHaveBeenCalled();
  });

  it('publie sur GitHub only lorsque activé', async () => {
    const ghPublisher: ArticlePublisherPort = {
      publishArticle: vi.fn(async () => ({
        url: 'https://github/owner/repo/file',
        path: 'content/a.mdx',
        success: true,
        commitSha: 'abc',
      })),
    };
    const cfg = { publication: { file_system: { enabled: false }, github: { enabled: true } } };
    const svc = new ArticlePublicationService(configReaderWith(cfg), undefined, ghPublisher);

    const res = await svc.publishToConfiguredTargets(makeArticle(), 't1', 'p1');

    expect(res).toHaveLength(1);
    expect(res[0].target).toBe('github');
    expect(ghPublisher.publishArticle).toHaveBeenCalled();
  });

  it('publie sur FS + GitHub lorsque les deux sont activés', async () => {
    const fsPublisher: ArticlePublisherPort = {
      publishArticle: vi.fn(async () => ({
        url: 'file:///tmp/a.md',
        path: '/tmp/a.md',
        success: true,
      })),
    };
    const ghPublisher: ArticlePublisherPort = {
      publishArticle: vi.fn(async () => ({
        url: 'https://github/owner/repo/file',
        path: 'content/a.mdx',
        success: true,
        commitSha: 'abc',
      })),
    };
    const cfg = { publication: { file_system: { enabled: true }, github: { enabled: true } } };
    const svc = new ArticlePublicationService(configReaderWith(cfg), fsPublisher, ghPublisher);

    const res = await svc.publishToConfiguredTargets(makeArticle(), 't1', 'p1');

    expect(res.map(r => r.target).sort()).toEqual(['file_system', 'github']);
    expect(fsPublisher.publishArticle).toHaveBeenCalled();
    expect(ghPublisher.publishArticle).toHaveBeenCalled();
  });

  it('throw si aucune cible activée', async () => {
    const cfg = { publication: { file_system: { enabled: false }, github: { enabled: false } } };
    const svc = new ArticlePublicationService(configReaderWith(cfg), undefined, undefined);

    await expect(svc.publishToConfiguredTargets(makeArticle(), 't1', 'p1')).rejects.toThrow(
      /Aucune cible/
    );
  });

  it('throw si FS activé mais pas de fsPublisher', async () => {
    const cfg = { publication: { file_system: { enabled: true }, github: { enabled: false } } };
    const svc = new ArticlePublicationService(configReaderWith(cfg), undefined, undefined);

    await expect(svc.publishToConfiguredTargets(makeArticle(), 't1', 'p1')).rejects.toThrow(
      /fsPublisher injecté/
    );
  });

  it('throw si GitHub activé mais pas de githubPublisher', async () => {
    const cfg = { publication: { file_system: { enabled: false }, github: { enabled: true } } };
    const svc = new ArticlePublicationService(configReaderWith(cfg), undefined, undefined);

    await expect(svc.publishToConfiguredTargets(makeArticle(), 't1', 'p1')).rejects.toThrow(
      /githubPublisher injecté/
    );
  });

  it('fail-fast sur tenantId / projectId manquants', async () => {
    const cfg = { publication: { file_system: { enabled: true } } };
    const fsPublisher: ArticlePublisherPort = {
      publishArticle: vi.fn(async () => ({ url: 'x', path: 'x', success: true })),
    };
    const svc = new ArticlePublicationService(configReaderWith(cfg), fsPublisher, undefined);

    await expect(svc.publishToConfiguredTargets(makeArticle(), '', 'p1')).rejects.toThrow(
      /tenantId requis/
    );
    await expect(svc.publishToConfiguredTargets(makeArticle(), 't1', '   ')).rejects.toThrow(
      /projectId requis/
    );
  });
});
