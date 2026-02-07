import type { ArticleStructure } from '@casys/core';

export interface MakeArticleOptions {
  article?: Partial<ArticleStructure['article']>;
  sections?: ArticleStructure['sections'];
  componentUsages?: ArticleStructure['componentUsages'];
  textFragments?: ArticleStructure['textFragments'];
}

/**
 * Factory de test: construit un ArticleStructure valide par défaut
 * - Inclut `tags: ['test']` pour satisfaire la validation frontmatter
 * - Id/Titre par défaut alignés avec les tests existants (slug attendu)
 */
export function makeTestArticle(options: MakeArticleOptions = {}): ArticleStructure {
  const now = new Date().toISOString();
  const baseArticle: ArticleStructure['article'] = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    title: 'Élévation: L’IA & les-agents!!!',
    description: 'desc',
    language: 'fr',
    createdAt: now,
    keywords: ['test'],
    sources: [],
    agents: [],
    tags: ['test'],
    tenantId: 'tenant-test',
    projectId: 'project-test',
  };

  return {
    article: { ...baseArticle, ...(options.article ?? {}) },
    sections: options.sections ?? [],
    componentUsages: options.componentUsages ?? [],
    textFragments: options.textFragments ?? [],
  };
}
