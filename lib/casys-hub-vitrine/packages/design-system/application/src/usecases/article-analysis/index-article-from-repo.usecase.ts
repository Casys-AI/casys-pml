import {
  type ArticleStructure,
  type IndexArticleFromRepoCommand,
  type IndexArticleFromRepoPort,
  type IndexArticleFromRepoResult,
} from '@casys/core';

import type {
  ArticleIndexingUpsertPort,
  ArticleParserPort,
} from '../../ports/out';
import { ArticleIndexingService } from '../../services/article/article-indexing.service';
import { applicationLogger as logger } from '../../utils/logger';

/**
 * Ingestion SRP unifiée (GitHub/FS):
 * - kind 'parsed': indexe un ArticleStructure déjà lu/parsé
 * - kind 'fs': parse un fichier local, puis indexe
 * Crée/maj (Article, Sections) et les Tags de l'article, puis renvoie l'ID.
 */
export class IndexArticleFromRepoUseCase implements IndexArticleFromRepoPort {
  constructor(
    private readonly indexing: ArticleIndexingUpsertPort,
    private readonly parser?: ArticleParserPort
  ) {}

  async execute(cmd: IndexArticleFromRepoCommand): Promise<IndexArticleFromRepoResult> {
    const { tenantId, projectId } = cmd;
    const dryRun = cmd.dryRun ?? false;

    if (!tenantId?.trim() || !projectId?.trim()) {
      throw new Error('[IndexArticleFromRepoUseCase] tenantId et projectId sont requis');
    }

    // 1) Obtenir l'ArticleStructure (mode parsed ou fs)
    let structure: ArticleStructure;
    if (cmd.kind === 'fs') {
      const filePath = cmd.filePath;
      if (!filePath?.trim()) {
        throw new Error("[IndexArticleFromRepoUseCase] filePath requis en mode kind='fs'");
      }
      if (!this.parser) {
        throw new Error("[IndexArticleFromRepoUseCase] ArticleParserPort manquant pour kind='fs'");
      }
      structure = await this.parser.parseArticleStructure(filePath, tenantId, projectId);
    } else {
      // kind === 'parsed'
      if (!cmd.article?.article?.id?.trim()) {
        throw new Error(
          "[IndexArticleFromRepoUseCase] ArticleStructure.article.id manquant en mode kind='parsed'"
        );
      }
      structure = cmd.article;
    }

    const articleNode = structure.article;
    if (!articleNode?.id) {
      throw new Error(
        '[IndexArticleFromRepoUseCase] ArticleStructure.article.id manquant après parsing'
      );
    }

    // 2) Upsert (Article)+(Sections) via service dédié
    if (!dryRun) {
      const indexingSvc = new ArticleIndexingService(this.indexing);
      await indexingSvc.execute({ article: structure, tenantId });
    }

    logger.log('[IndexArticleFromRepoUseCase] Ingestion terminée', {
      articleId: articleNode.id,
      sections: structure.sections?.length ?? 0,
    });

    return {
      success: true,
      articleId: articleNode.id,
      sectionsUpserted: structure.sections?.length ?? 0,
      tagsUpserted: 0,
    };
  }
}
