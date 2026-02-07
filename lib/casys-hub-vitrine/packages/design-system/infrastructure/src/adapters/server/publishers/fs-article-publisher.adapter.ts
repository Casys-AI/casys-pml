import fs from 'node:fs/promises';
import path from 'node:path';

import type { ProjectConfig } from '@casys/shared';
import { type ArticleStructure } from '@casys/core';
import type {
  ArticlePublisherPort,
  FrontmatterService,
  ImageFetcherPort,
  UserProjectConfigPort,
} from '@casys/application';

import {
  assertImageMatchesFormat,
  buildArticleAssetsSubdir,
  buildCoverFileName,
  ensureDirPath,
  isDataUrl,
  isHttpUrl,
  parseDataUrl,
} from '../../../utils/image-utils';
import { createLogger } from '../../../utils/logger';
import { MdxFileWriterAdapter } from '../persistence/repositories/mdx-file-writer.adapter';

export class FsArticlePublisherAdapter implements ArticlePublisherPort {
  private readonly logger = createLogger('FsArticlePublisherAdapter');

  constructor(
    private readonly configReader: UserProjectConfigPort,
    private readonly fmService: FrontmatterService,
    private readonly imageFetcher: ImageFetcherPort
  ) {}

  async publishArticle(
    article: ArticleStructure,
    tenantId: string,
    projectId: string
  ): Promise<{ url: string; path: string; success: boolean; commitSha?: string }> {
    // Validation fail-fast
    if (!tenantId?.trim()) {
      throw new Error('[FsPublisher] tenantId requis');
    }
    if (!projectId?.trim()) {
      throw new Error('[FsPublisher] projectId requis');
    }

    const projectConfig: ProjectConfig = await this.configReader.getProjectConfig(
      tenantId,
      projectId
    );

    const fsConfig = projectConfig.publication?.file_system;
    if (!fsConfig?.enabled) {
      throw new Error(
        '[FsPublisher] publication.file_system absent ou disabled dans la config projet'
      );
    }
    if (!fsConfig.content_path?.trim()) {
      throw new Error('[FsPublisher] publication.file_system.content_path requis');
    }

    // Résolution du répertoire cible
    const baseRoot = process.env.CASYS_PROJECT_ROOT;
    let baseDirAbs: string;

    if (path.isAbsolute(fsConfig.content_path)) {
      baseDirAbs = fsConfig.content_path;
    } else {
      if (!baseRoot?.trim()) {
        throw new Error(
          '[FsPublisher] CASYS_PROJECT_ROOT requis pour résoudre content_path relatif'
        );
      }
      baseDirAbs = path.resolve(baseRoot, fsConfig.content_path);
    }

    // S'assurer que le répertoire articles existe
    await fs.mkdir(baseDirAbs, { recursive: true });

    //  -> Gestion image de couverture: téléchargement en mémoire et écriture locale selon assets_path
    let updated: ArticleStructure = article;
    const cover = article.article?.cover;
    if (cover?.src && (isHttpUrl(cover.src) || isDataUrl(cover.src))) {
      const imgCfg = projectConfig.publication?.images;
      const coverCfg = imgCfg?.cover;
      if (!coverCfg?.format) {
        throw new Error('[FsPublisher] images.cover.format requis lorsque cover.src est distante');
      }
      const assetsRel = fsConfig.assets_path;
      if (!assetsRel?.trim()) {
        throw new Error(
          '[FsPublisher] publication.file_system.assets_path requis pour publier la cover'
        );
      }
      const assetsUrlBase = fsConfig.assets_url_base;
      if (!assetsUrlBase?.trim()) {
        throw new Error(
          '[FsPublisher] publication.file_system.assets_url_base requis pour référencer la cover'
        );
      }

      // Résoudre le répertoire assets absolu
      let assetsDirAbs: string;
      if (path.isAbsolute(assetsRel)) {
        assetsDirAbs = assetsRel;
      } else {
        const baseRoot = process.env.CASYS_PROJECT_ROOT;
        if (!baseRoot?.trim()) {
          throw new Error(
            '[FsPublisher] CASYS_PROJECT_ROOT requis pour résoudre assets_path relatif'
          );
        }
        assetsDirAbs = path.resolve(baseRoot, assetsRel);
      }

      await fs.mkdir(assetsDirAbs, { recursive: true });

      // Récupérer l'image en mémoire (HTTP ou Data URL)
      let data: Uint8Array;
      let mimeType: string;
      if (isHttpUrl(cover.src)) {
        this.logger.debug('Cover(FS): fetch', { src: cover.src });
        const fetched = await this.imageFetcher.fetch(cover.src);
        data = fetched.data;
        if (!fetched.mimeType || fetched.mimeType.trim().length === 0) {
          throw new Error(
            '[FsPublisher] fetch cover: mimeType manquant depuis ImageFetcher (HTTP)'
          );
        }
        mimeType = fetched.mimeType;
      } else {
        this.logger.debug('Cover(FS): parse data URL');
        const parsed = parseDataUrl(cover.src);
        data = parsed.data;
        mimeType = parsed.mimeType;
      }
      assertImageMatchesFormat(mimeType, coverCfg.format);
      this.logger.debug('Cover(FS): MIME OK', { mimeType });
      const fileName = buildCoverFileName(
        article.article.title,
        article.article.id,
        coverCfg.format,
        article.article.slug // Utilise le slug généré par OutlineWriter AI
      );
      // Créer un sous-dossier par article (slug stable)
      const subdir = buildArticleAssetsSubdir(
        article.article.title,
        article.article.id,
        article.article.slug // Utilise le slug généré par OutlineWriter AI
      );
      const assetsDirAbsArticle = path.join(assetsDirAbs, subdir);
      await fs.mkdir(assetsDirAbsArticle, { recursive: true });
      const fileAbs = path.join(assetsDirAbsArticle, fileName);
      this.logger.debug('Cover(FS): écriture fichier', { file: fileAbs });
      await fs.writeFile(fileAbs, Buffer.from(data));

      // Construire l'URL à référencer dans le frontmatter à partir de assets_url_base (sans heuristique)
      const base = assetsUrlBase.replace(/\/+$/g, '');
      const webPath = ensureDirPath(`${base}/${subdir}/${fileName}`);
      this.logger.log('Cover(FS): webPath assigné', { webPath });
      updated = {
        ...article,
        article: {
          ...article.article,
          cover: { src: webPath, ...(cover.alt ? { alt: cover.alt } : {}) },
        },
      };
    }

    // Écriture du fichier MDX via l'adaptateur existant
    const writer = new MdxFileWriterAdapter(baseDirAbs, this.fmService, this.configReader);
    const { filePath, success } = await writer.writeArticleFile(updated, tenantId, projectId);

    // Construire les sorties (path relatif à content_path + url file://)
    const relWithinContent = path.relative(baseDirAbs, filePath);
    const targetPath = path.join(fsConfig.content_path, relWithinContent).split(path.sep).join('/');
    const url = `file://${filePath}`;

    this.logger.log('Article publié sur FS', { filePath, targetPath });

    return {
      url,
      path: targetPath,
      success,
    };
  }
}
