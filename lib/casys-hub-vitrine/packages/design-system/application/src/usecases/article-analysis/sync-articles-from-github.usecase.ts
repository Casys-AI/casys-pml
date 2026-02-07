import { createHash } from 'crypto';

import type { ArticleStructureRepositoryPort } from '../../ports/out';
import { createLogger } from '../../utils/logger';
import type { IndexArticlesUseCase } from '../index-articles.usecase';

const logger = createLogger('SyncArticlesFromGithubUseCase');

/**
 * Résultat de la synchronisation depuis GitHub
 */
export interface SyncArticlesFromGithubResult {
  success: boolean;
  indexed: number; // Nouveaux articles indexés
  updated: number; // Articles mis à jour
  skipped: number; // Articles inchangés
  errors: Error[];
  indexedArticleIds: string[];
  updatedArticleIds: string[];
  skippedArticleIds: string[];
  message: string;
}

/**
 * Use case pour synchroniser intelligemment les articles depuis GitHub vers Kuzu
 * - Vérifie l'existence des articles dans Kuzu
 * - Compare les versions via hash du contenu
 * - Indexe uniquement ce qui a changé (nouveaux + modifiés)
 * - Skip les articles identiques
 */
export class SyncArticlesFromGithubUseCase {
  constructor(
    private readonly githubRepository: ArticleStructureRepositoryPort,
    private readonly kuzuRepository: ArticleStructureRepositoryPort,
    private readonly indexArticlesUseCase: IndexArticlesUseCase
  ) {}

  /**
   * Synchronise les articles d'un projet GitHub vers Kuzu
   */
  async execute(tenantId: string, projectId: string): Promise<SyncArticlesFromGithubResult> {
    // Fail-fast
    if (!tenantId?.trim()) {
      throw new Error('[SyncArticlesFromGithubUseCase] tenantId requis');
    }
    if (!projectId?.trim()) {
      throw new Error('[SyncArticlesFromGithubUseCase] projectId requis');
    }

    logger.log(`🔄 Synchronisation GitHub → Kuzu pour ${tenantId}/${projectId}`);

    try {
      // 1. Scanner les articles depuis GitHub
      logger.log('📦 Scanning articles from GitHub...');
      const githubArticles = await this.githubRepository.findByProject(tenantId, projectId);

      if (githubArticles.length === 0) {
        logger.log('ℹ️ Aucun article trouvé dans GitHub');
        return {
          success: true,
          indexed: 0,
          updated: 0,
          skipped: 0,
          errors: [],
          indexedArticleIds: [],
          updatedArticleIds: [],
          skippedArticleIds: [],
          message: 'Aucun article trouvé dans GitHub',
        };
      }

      logger.log(`✅ ${githubArticles.length} articles trouvés dans GitHub`);

      // 2. Classifier les articles (nouveaux / modifiés / identiques)
      const toIndex: typeof githubArticles = [];
      const toUpdate: typeof githubArticles = [];
      const toSkip: string[] = [];

      for (const article of githubArticles) {
        const articleId = article.article.id;

        try {
          // Vérifier si l'article existe déjà dans Kuzu via le repository
          const existingStructure = await this.kuzuRepository.findById(articleId);

          if (!existingStructure) {
            // Nouvel article
            toIndex.push(article);
            logger.debug(`🆕 Nouvel article: ${articleId}`);
          } else {
            // Article existant, vérifier s'il a changé
            const existingContent = existingStructure.article.content ?? '';
            const newContent = article.article.content ?? '';
            if (this.hasContentChanged(newContent, existingContent)) {
              toUpdate.push(article);
              logger.debug(`♻️ Article modifié: ${articleId}`);
            } else {
              toSkip.push(articleId);
              logger.debug(`⏭️ Article inchangé: ${articleId}`);
            }
          }
        } catch (error) {
          // Si erreur lors de la vérification, on indexe par sécurité
          logger.warn(
            `⚠️ Erreur vérification ${articleId}, will index: ${(error as Error).message}`
          );
          toIndex.push(article);
        }
      }

      logger.log(
        `📊 Classification: ${toIndex.length} nouveaux, ${toUpdate.length} modifiés, ${toSkip.length} inchangés`
      );

      // 3. Indexer les nouveaux et modifiés
      const articlesToIndex = [...toIndex, ...toUpdate];
      let indexResult;

      if (articlesToIndex.length > 0) {
        logger.log(`💾 Indexation de ${articlesToIndex.length} articles...`);
        indexResult = await this.indexArticlesUseCase.execute({
          articles: articlesToIndex,
          tenantId,
          projectId,
        });
      } else {
        logger.log('✨ Aucun article à indexer (tous à jour)');
        indexResult = {
          success: true,
          indexedCount: 0,
          failedCount: 0,
          errors: [],
          indexedArticleIds: [],
          message: 'Aucun article à indexer',
        };
      }

      // 4. Construire le résultat détaillé
      const result: SyncArticlesFromGithubResult = {
        success: indexResult.success && indexResult.failedCount === 0,
        indexed: toIndex.length,
        updated: toUpdate.length,
        skipped: toSkip.length,
        errors: indexResult.errors,
        indexedArticleIds: toIndex.map(
          (a: Awaited<ReturnType<typeof this.githubRepository.findByProject>>[number]) =>
            a.article.id
        ),
        updatedArticleIds: toUpdate.map(
          (a: Awaited<ReturnType<typeof this.githubRepository.findByProject>>[number]) =>
            a.article.id
        ),
        skippedArticleIds: toSkip,
        message: this.buildSummaryMessage(
          toIndex.length,
          toUpdate.length,
          toSkip.length,
          indexResult.failedCount
        ),
      };

      logger.log(`✅ Synchronisation terminée: ${result.message}`);
      return result;
    } catch (error) {
      logger.error('❌ Erreur lors de la synchronisation GitHub', error);
      throw error;
    }
  }

  /**
   * Vérifie si le contenu d'un article a changé en comparant les hash MD5
   */
  private hasContentChanged(newContent: string, existingContent: string): boolean {
    const newHash = createHash('md5').update(newContent).digest('hex');
    const existingHash = createHash('md5').update(existingContent).digest('hex');
    return newHash !== existingHash;
  }

  /**
   * Construit le message de résumé
   */
  private buildSummaryMessage(
    indexed: number,
    updated: number,
    skipped: number,
    failed: number
  ): string {
    const parts: string[] = [];

    if (indexed > 0) parts.push(`${indexed} nouveaux`);
    if (updated > 0) parts.push(`${updated} mis à jour`);
    if (skipped > 0) parts.push(`${skipped} inchangés`);
    if (failed > 0) parts.push(`${failed} échecs`);

    return parts.length > 0 ? parts.join(', ') : 'Aucun changement';
  }
}
