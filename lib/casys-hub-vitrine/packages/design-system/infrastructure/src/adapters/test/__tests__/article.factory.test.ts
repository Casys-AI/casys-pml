import { describe, expect, it } from 'vitest';

import type { ProjectConfig } from '@casys/shared';
import { FrontmatterService } from '@casys/application';

import { AstroFrontmatterAdapter } from '../../server/frontmatter/astro-frontmatter.adapter';
import { makeTestArticle } from '../factories/article';

/**
 * Test de la factory makeTestArticle
 * - Vérifie que les tags sont présents et que la génération de frontmatter ne jette pas d'erreur
 */
describe('makeTestArticle factory', () => {
  it('fournit un ArticleStructure valide pour la génération de frontmatter', async () => {
    const article = makeTestArticle();

    const fmService = new FrontmatterService(
      new Map([['astro', new AstroFrontmatterAdapter()]]) as any
    );

    const projectConfig: ProjectConfig = {
      name: 'Test Project',
      type: 'astro',
      description: 'test',
      generation: { keywords: [], tone: 'neutral', length: 'short' } as any,
      publication: {
        canonicalBaseUrl: 'https://example.com',
        frontmatter: { profile: 'astrowind' },
        file_system: { enabled: true, content_path: '/tmp', format: 'mdx' },
      } as any,
      schedule: { cron: '* * * * *', timezone: 'UTC', enabled: false },
      security: { credentials_source: 'environment', env_prefix: 'TEST_' },
      sources: { rss: [], apis: [], scraping: [] },
    } as unknown as ProjectConfig;

    // Doit contenir des tags par défaut
    expect(article.article.tags && article.article.tags.length > 0).toBe(true);

    // La génération de frontmatter ne doit pas jeter (tags requis satisfaits)
    const generated = await fmService.generateForProject(article, projectConfig);
    expect(generated.content).toBeTypeOf('string');
    expect(generated.content.length).toBeGreaterThan(0);
  });
});
