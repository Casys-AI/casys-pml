import type {
  GenerateCoverImageCommandDTO,
  GeneratedCoverImageDTO,
  PublicationConfig,
} from '@casys/shared';

import { mapCommandToCoverPromptDTO } from '../mappers/cover-image.mapper';
import {
  type CoverImageGenerateForArticlePort,
  type ImageGeneratorPort,
  type PromptTemplatePort,
  type UserProjectConfigPort,
} from '../ports/out';
import { buildCoverPoml } from '../prompts/cover-prompt';
import { ImageGeneratorService } from '../services/image-generator.service';
import { applicationLogger as logger } from '../utils/logger';

export class GenerateCoverImageUseCase implements CoverImageGenerateForArticlePort {
  constructor(
    private readonly configReader: UserProjectConfigPort,
    private readonly promptTemplate: PromptTemplatePort,
    private readonly imageGenerator: ImageGeneratorPort
  ) {}

  async execute(input: GenerateCoverImageCommandDTO): Promise<GeneratedCoverImageDTO | null> {
    const { outlineTitle, outlineSummary, tenantId, projectId, articleId } = input;

    if (!tenantId?.trim() || !projectId?.trim()) {
      logger.debug('Génération cover: contexte insuffisant, skip', { articleId });
      return null; // Contexte insuffisant pour lire la config projet
    }

    const projectConfig = await this.configReader.getProjectConfig(tenantId, projectId);
    const imagesCfg: PublicationConfig['images'] | undefined = projectConfig.publication?.images;
    if (!imagesCfg?.generate) {
      logger.debug('Génération cover désactivée (images.generate=false), skip', { articleId });
      return null; // génération désactivée
    }

    const coverCfg = imagesCfg.cover;
    if (!coverCfg?.template?.trim()) {
      throw new Error(
        '[GenerateCoverImageUseCase] publication.images.cover.template requis lorsque images.generate=true'
      );
    }
    // Le format est validé plus bas via formatToMime (fail-fast si non supporté)

    // Fail-fast: si aucune source d'alt disponible côté input, on ne tente pas la génération (conforme mémoire XP)
    if (!outlineSummary?.trim() && !outlineTitle?.trim()) {
      throw new Error(
        '[GenerateCoverImageUseCase] Alt de cover introuvable et aucune description disponible'
      );
    }

    const slug = this.buildSlug(outlineTitle, articleId);
    logger.debug('Génération cover: start', { articleId, slug, template: coverCfg.template });

    const promptParams = mapCommandToCoverPromptDTO(
      input,
      slug,
      coverCfg.stylePrompt,
      coverCfg.format
    );
    const poml = await buildCoverPoml(this.promptTemplate, coverCfg.template, promptParams);

    // Génère l'image directement via le port out (sans agent infra)
    const svc = new ImageGeneratorService(this.imageGenerator);
    let base64: string;
    let mime: string;
    let alt: string | undefined;
    try {
      const out = await svc.generateImage({
        prompt: poml.prompt,
        format: poml.format,
        width: poml.width,
        height: poml.height,
      });
      base64 = out.base64;
      mime = out.mime;
      alt = out.alt;
    } catch {
      // Unifier le message d'erreur attendu par les tests au niveau du use case
      throw new Error('[GenerateCoverImageUseCase] ImageAgent a retourné un JSON invalide');
    }

    // Validation unifiée attendue par les tests (fail-fast côté use case)
    const expectedMime: Record<string, string> = {
      webp: 'image/webp',
      png: 'image/png',
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
    };
    const targetMime = expectedMime[coverCfg.format as keyof typeof expectedMime];
    if (!base64 || base64.trim().length === 0 || (targetMime && mime !== targetMime)) {
      throw new Error('[GenerateCoverImageUseCase] ImageAgent a retourné un JSON invalide');
    }

    const finalAlt =
      alt && alt.trim().length > 0 ? alt : (outlineSummary ?? outlineTitle).slice(0, 140).trim();
    if (!finalAlt) {
      throw new Error(
        '[GenerateCoverImageUseCase] Alt de cover introuvable et aucune description disponible'
      );
    }

    const result: GeneratedCoverImageDTO = {
      base64,
      mime,
      alt: finalAlt,
      format: coverCfg.format,
      slug,
    } as const;

    try {
      logger.log('Génération cover: succès', {
        articleId,
        payload: `base64:${coverCfg.format}`,
        altLength: finalAlt.length,
        filename: ImageGeneratorService.buildCoverFilename(
          slug,
          this.makeShortId(),
          coverCfg.format
        ),
      });
    } catch {
      // ne pas casser le flux en cas d'erreur de log
    }

    return result;
  }

  private buildSlug(title: string, id: string): string {
    const norm = (title || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 64);
    const shortId = (id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    return shortId ? `${norm}-${shortId}` : norm;
  }

  private makeShortId(): string {
    // Identifiant court alphanumérique (8 chars) pour éviter les collisions de fichiers
    return Math.random().toString(36).slice(2, 10);
  }
}
