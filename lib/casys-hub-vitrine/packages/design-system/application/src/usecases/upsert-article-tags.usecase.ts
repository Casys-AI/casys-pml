import { type TagRepositoryPort, type UpsertArticleTagsParams } from '../ports/out';
import { TagLinkingService } from '../services/article/tag-linking.service';

/**
 * Use case: Upsert des tags d'article
 * - Orchestration minimaliste (YAGNI): valide l'input et délègue au port
 * - Fail fast: params essentiels requis
 */
export interface UpsertArticleTagsOptions {
  strict?: boolean;
}

export interface UpsertArticleTagsReport {
  matched: string[]; // slugs des tags qui matchent un KeywordPlan
  unmatched: string[]; // slugs qui ne matchent aucun KeywordPlan
}

export class UpsertArticleTagsUseCase {
  constructor(private readonly repo: TagRepositoryPort) {}

  async execute(
    params: UpsertArticleTagsParams,
    options: UpsertArticleTagsOptions = {}
  ): Promise<UpsertArticleTagsReport> {
    // Fail-fast validations (métier minimal)
    if (!params?.articleId) throw new Error('articleId requis');
    if (!params?.projectId) throw new Error('projectId requis');
    if (!params?.tenantId) throw new Error('tenantId requis');
    if (!Array.isArray(params.tags)) throw new Error('tags requis');
    if (params.tags.length === 0) throw new Error('tags ne doit pas être vide');

    // Validation via les tags du projet (KeywordTag)
    const projectTags = await this.repo.getProjectTags({
      tenantId: params.tenantId,
      projectId: params.projectId,
    });
    const normalizedSet = new Set(
      (projectTags ?? [])
        .map(t => t.slug)
        .filter(Boolean)
    );
    const tagSlugs = params.tags.map(t => t.slug ?? '');
    const matched = tagSlugs.filter(s => s && normalizedSet.has(s));
    const unmatched = tagSlugs.filter(s => s && !normalizedSet.has(s));

    if (options.strict && unmatched.length > 0) {
      throw new Error(`Tags non couverts par le keyword plan: ${unmatched.join(', ')}`);
    }

    // Déléguer la persistance au service centralisé (linkToKeywordPlan: true)
    const tagLinking = new TagLinkingService(this.repo);
    await tagLinking.upsertAndLinkKeywordTags({
      tenantId: params.tenantId,
      projectId: params.projectId,
      articleId: params.articleId,
      tags: params.tags,
    });
    return { matched, unmatched };
  }
}
