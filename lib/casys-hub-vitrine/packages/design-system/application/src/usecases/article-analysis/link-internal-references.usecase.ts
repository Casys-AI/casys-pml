import type {
  ArticleStructure,
  LinkInternalReferencesCommand,
  LinkInternalReferencesResult,
  LinkInternalReferencesPort,
} from '@casys/core';

import type { ArticleIndexingUpsertPort, ArticleReadPort } from '../../ports/out';
import { applicationLogger as logger } from '../../utils/logger';
import { extractInternalLinks, extractSlugFromPath, slugify } from './helpers';

/**
 * Use case atomique: Recréation des liens internes (Section)-[:REFERENCES]->(Article)
 *
 * Responsabilité unique:
 * - Extraire les liens markdown relatifs depuis les sections
 * - Résoudre les slugs vers les articles du projet
 * - Créer les relations (Section)-[:REFERENCES]->(Article)
 *
 * Logique métier:
 * - Extraction regex des liens markdown [text](href)
 * - Exclusion des liens externes (http/https)
 * - Matching par slug (normalize + compare)
 * - Fail-soft: continue en cas d'erreur partielle
 *
 * Pas de side-effects si dryRun=true
 */
export class LinkInternalReferencesUseCase implements LinkInternalReferencesPort {
  constructor(
    private readonly articleReader: ArticleReadPort,
    private readonly articleStore: ArticleIndexingUpsertPort
  ) {}

  async execute(command: LinkInternalReferencesCommand): Promise<LinkInternalReferencesResult> {
    const { articleId, tenantId, projectId, sections, dryRun = false } = command;

    // Validation
    if (!articleId?.trim() || !tenantId?.trim() || !projectId?.trim()) {
      throw new Error('[LinkInternalReferencesUseCase] articleId, tenantId et projectId requis');
    }
    if (!Array.isArray(sections) || sections.length === 0) {
      return { linksCreated: 0 };
    }

    logger.debug?.('[LinkInternalReferencesUseCase] Analyse liens internes', {
      articleId,
      sectionsCount: sections.length,
    });

    let linksCreated = 0;

    try {
      // 1. Récupérer tous les articles du projet pour slug matching
      const projectArticles: ArticleStructure[] = await this.articleReader.findByProject(
        tenantId,
        projectId
      );

      if (projectArticles.length === 0) {
        logger.warn?.('[LinkInternalReferencesUseCase] Aucun article dans le projet');
        return { linksCreated: 0 };
      }

      // 2. Construire l'index slug→articleId
      const slugToId = new Map<string, string>();
      for (const article of projectArticles) {
        const title = article.article?.title ?? article.article?.id ?? '';
        const slug = slugify(title);
        if (slug && !slugToId.has(slug)) {
          slugToId.set(slug, article.article.id);
        }
      }

      logger.debug?.('[LinkInternalReferencesUseCase] Index slugs créé', {
        uniqueSlugs: slugToId.size,
      });

      // 3. Traiter chaque section
      for (const section of sections) {
        const content = section.content ?? '';
        if (!content.trim()) continue;

        // Extraire les liens markdown du contenu
        const internalLinks = extractInternalLinks(content);
        if (internalLinks.length === 0) continue;

        // Résoudre chaque lien
        for (const href of internalLinks) {
          const slug = extractSlugFromPath(href);
          if (!slug) continue;

          const targetArticleId = slugToId.get(slug);
          if (!targetArticleId) {
            logger.debug?.('[LinkInternalReferencesUseCase] Slug non résolu', { slug, href });
            continue;
          }

          // Créer la relation (Section)-[:REFERENCES]->(Article)
          if (!dryRun) {
            await this.articleStore.linkSectionToArticle({
              sectionId: section.id,
              articleId: targetArticleId,
              tenantId,
              projectId,
            });
          }

          linksCreated++;
          logger.debug?.('[LinkInternalReferencesUseCase] Lien créé', {
            sectionId: section.id,
            targetArticleId,
            slug,
          });
        }
      }
    } catch (error) {
      // Fail-soft: log mais ne bloque pas
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn?.('[LinkInternalReferencesUseCase] Erreur partielle lors du linking', {
        error: msg,
        linksCreatedBeforeError: linksCreated,
      });
    }

    logger.debug?.('[LinkInternalReferencesUseCase] Liens internes créés', {
      count: linksCreated,
    });

    return { linksCreated };
  }
}
