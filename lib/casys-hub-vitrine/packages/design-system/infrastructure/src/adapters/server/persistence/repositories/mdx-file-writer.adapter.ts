import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ArticleStructure, FrontmatterService } from '@casys/core';
import type { UserProjectConfigPort } from '@casys/application';

import {
  ensureExtension,
  generateFileNameFromArticleWithFormat,
  resolveContentFormat,
} from '../../../../utils/content-format';
import { createLogger } from '../../../../utils/logger';

/**
 * Adaptateur pour l'écriture de fichiers MDX avec frontmatter Astro
 *
 * @internal Utilisation interne par `FsArticlePublisherAdapter` uniquement.
 * Ne pas importer directement en dehors du publisher FS. Les use cases doivent
 * utiliser `ArticlePublisherPort`.
 */
export class MdxFileWriterAdapter {
  private readonly articlesDir: string;
  private readonly logger = createLogger('MdxFileWriterAdapter');
  private readonly fmService: FrontmatterService;
  private readonly configReader: UserProjectConfigPort;

  constructor(
    baseDirOverride: string | undefined,
    fmService: FrontmatterService,
    configReader: UserProjectConfigPort
  ) {
    // Réutilise la logique de projects.ts pour déterminer le répertoire
    const hasVitest = (process.env.VITEST ?? '') !== '';
    const isTestMode =
      process.env.NODE_ENV === 'test' ||
      hasVitest ||
      'describe' in (globalThis as unknown as Record<string, unknown>);

    // Si un répertoire de base est fourni, il a la priorité (fail-fast si vide)
    if (baseDirOverride && baseDirOverride.trim().length > 0) {
      this.articlesDir = path.resolve(baseDirOverride);
    } else {
      this.articlesDir = isTestMode
        ? path.join(tmpdir(), 'casys-test-articles')
        : path.resolve(process.cwd(), '../../apps/astro-web/src/content/articles');
    }

    // Dépendances requises (fail-fast)
    if (!fmService) {
      throw new Error('[MdxFileWriterAdapter] FrontmatterService requis');
    }
    if (!configReader) {
      throw new Error('[MdxFileWriterAdapter] UserProjectConfigPort requis');
    }
    this.fmService = fmService;
    this.configReader = configReader;
  }

  async writeArticleFile(
    article: ArticleStructure,
    tenantId: string,
    projectId: string
  ): Promise<{ filePath: string; success: boolean }> {
    try {
      // Création du répertoire cible (flat): on écrit directement dans articlesDir
      this.logger.debug('Preparing target directory (flat mode)', { dir: this.articlesDir });
      await fs.mkdir(this.articlesDir, { recursive: true });

      // Récupérer la configuration projet (fail-fast via adapter)
      const projectConfig = await this.configReader.getProjectConfig(tenantId, projectId);

      // Déléguer la génération au FrontmatterService (multi-cibles, fail-fast)
      const generated = await this.fmService.generateForProject(article, projectConfig);

      // Chemin de fichier basé sur la recommandation du générateur + extension résolue
      const format = resolveContentFormat(projectConfig);
      const recommendedName = generated.fileName
        ? ensureExtension(generated.fileName, format)
        : generateFileNameFromArticleWithFormat(article.article, format);
      const filePath = path.join(this.articlesDir, recommendedName);
      this.logger.debug('Resolved target path (flat)', { fileName: recommendedName, filePath });

      // Écriture du fichier (écrase si existe)
      this.logger.debug('Writing MDX file...', { filePath });
      await fs.writeFile(filePath, generated.content, 'utf-8');
      this.logger.log('MDX file written successfully', { filePath });

      return { filePath, success: true };
    } catch (error) {
      this.logger.error('Error while writing MDX file', error);
      throw new Error(
        `Erreur lors de l'écriture du fichier MDX: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    }
  }
}
