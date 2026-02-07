import { describe, it, expect } from 'vitest';

import type { UserProjectConfigPort } from '@casys/application';

import { MdxParserService } from '../../../parsers/mdx-parser.adapter';
import { GithubArticleStructureRepository } from '../github-article-structure.repository';

// Test d'intégration réseau conditionnel: nécessite une intention explicite + un GITHUB_TOKEN valide
const hasToken =
  process.env.RUN_NETWORK_TESTS === '1' &&
  typeof process.env.GITHUB_TOKEN === 'string' &&
  process.env.GITHUB_TOKEN.trim() !== '';

// Stub minimal de config reader: renvoie la config projet Kelly Assist
const configReader: UserProjectConfigPort = {
  async getProjectConfig() {
    return {
      name: 'Kelly Assist Blog',
      type: 'astro',
      description: 'Integration test config',
      generation: { keywords: [], tone: 'neutral', length: 'short' } as any,
      publication: {
        github: {
          enabled: true,
          connection: 'direct',
          repo: 'superWorldSavior/kellyassist',
          branch: 'main',
          content_path: 'src/data/post',
        },
      } as any,
    } as any;
  },
  // Méthodes non utilisées par ce repository dans ce test
  async getUserConfig() {
    throw new Error('not used');
  },
  async saveUserConfig() {
    /* noop */
  },
  async saveProjectConfig() {
    /* noop */
  },
  async listUsers() {
    return [];
  },
  async listUserProjects() {
    return [];
  },
};

(hasToken ? describe : describe.skip)('GithubArticleStructureRepository - réseau', () => {
  it(
    'retourne un nombre d’articles > 0 dans le repo kellyassist (content_path mdx)',
    async () => {
      const parser = new MdxParserService();
      const repo = new GithubArticleStructureRepository(configReader, parser as any);

      const tenantId = 'kelly-assist';
      const projectId = 'blog-pro';

      const articles = await repo.findByProject(tenantId, projectId);

      expect(Array.isArray(articles)).toBe(true);
      expect(articles.length).toBeGreaterThan(0);

      const sample = articles.slice(0, 5).map(a => ({ id: a.article.id, title: a.article.title }));
      // eslint-disable-next-line no-console
      console.log('[NetworkTest] Articles count:', articles.length, 'sample:', sample);
    },
    30000
  );
});
