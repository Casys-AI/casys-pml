import type { ArticleStructure } from '@casys/core';

import type { ArticleReadPort, ArticleStructureRepositoryPort } from '../../ports/out';
import { extractSlugFromPath, slugify } from '../../usecases/article-analysis/helpers';

export class ArticleReaderService {
  private readonly projectArticlesCache = new Map<
    string,
    { source: 'github' | 'store'; articles: ArticleStructure[] }
  >();

  constructor(
    private readonly articleReader: ArticleReadPort,
    private readonly githubRepository?: ArticleStructureRepositoryPort
  ) {}

  async execute(params: {
    articleId: string;
    tenantId: string;
    projectId: string;
    skipGithubRead?: boolean;
  }): Promise<ArticleStructure> {
    const { articleId, tenantId, projectId, skipGithubRead } = params;

    let article: ArticleStructure | null = null;
    if (this.githubRepository && !skipGithubRead) {
      try {
        // Utiliser le cache projet pour éviter de re-lister GitHub à chaque appel
        const { articles } = await this.getProjectArticles({
          tenantId,
          projectId,
          skipGithubRead: false,
        });
        article =
          articles.find(a => a.article.id === articleId) ??
          articles.find(a => {
            try {
              const slug = slugify(a.article.title ?? a.article.id);
              return slug === extractSlugFromPath(articleId);
            } catch {
              return false;
            }
          }) ??
          null;
      } catch {
        // fallback store
      }
    }

    article ??= await this.articleReader.findById(articleId);
    if (!article) throw new Error(`[ReadArticleUseCase] Article not found: id=${articleId}`);
    return article;
  }

  async getProjectArticles(params: {
    tenantId: string;
    projectId: string;
    skipGithubRead?: boolean;
  }): Promise<{ articles: ArticleStructure[]; source: 'github' | 'store'; cached: boolean }> {
    const { tenantId, projectId, skipGithubRead } = params;
    const cacheKey = `${tenantId}:${projectId}`;
    const cached = this.projectArticlesCache.get(cacheKey);
    if (cached) return { articles: cached.articles, source: cached.source, cached: true };

    let articles: ArticleStructure[] = [];
    let source: 'github' | 'store' = 'store';

    if (!skipGithubRead && this.githubRepository) {
      try {
        articles = await this.githubRepository.findByProject(tenantId, projectId);
        source = 'github';
      } catch {
        articles = [];
      }
    }
    if (!articles || articles.length === 0) {
      articles = await this.articleReader.findByProject(tenantId, projectId);
      source = 'store';
    }

    this.projectArticlesCache.set(cacheKey, { source, articles });
    return { articles, source, cached: false };
  }
}
