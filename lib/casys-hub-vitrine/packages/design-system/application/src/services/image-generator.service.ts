import type { ImageFormat } from '@casys/shared';

import type { ImageGeneratorPort } from '../ports/out';
import { createLogger } from '../utils/logger';

export class ImageGeneratorService implements ImageGeneratorPort {
  private readonly logger = createLogger('ImageGeneratorService');

  constructor(private readonly imageGenerator: ImageGeneratorPort) {}

  async generateImage(data: {
    prompt: string;
    format: string;
    width: number;
    height: number;
  }): Promise<{ base64: string; mime: string; alt: string }> {
    // Fail-fast: validation des entrées
    const prompt = (data?.prompt || '').trim();
    const format = String(data?.format || '').toLowerCase() as ImageFormat;
    const width = Number(data?.width);
    const height = Number(data?.height);
    if (!prompt) {
      throw new Error('[ImageGeneratorService] prompt requis');
    }
    if (!format) {
      throw new Error('[ImageGeneratorService] format requis');
    }
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new Error('[ImageGeneratorService] dimensions invalides (width/height > 0 requis)');
    }
    // Vérifie que le format est supporté (levera si non supporté)
    const expectedMime = ImageGeneratorService.formatToMime(format);
    // Délègue au générateur sous-jacent
    const result = await this.imageGenerator.generateImage({ prompt, format, width, height });
    const base64 = (result?.base64 || '').trim();
    const mime = (result?.mime || '').toLowerCase();
    const alt = (result?.alt || '').trim();
    if (!base64) {
      throw new Error('[ImageGeneratorService] Générateur image a retourné un base64 vide');
    }
    ImageGeneratorService.validateMimeForFormat(mime, format);
    // Normalise le MIME retourné
    return { base64, mime: expectedMime, alt };
  }

  /**
   * Mapping strict format -> MIME. Fail-fast si non supporté.
   */
  static formatToMime(format: ImageFormat): 'image/webp' | 'image/png' | 'image/jpeg' {
    const f = (format ?? '').toLowerCase();
    if (f === 'webp') return 'image/webp';
    if (f === 'png') return 'image/png';
    if (f === 'jpeg' || f === 'jpg') return 'image/jpeg';
    throw new Error(`[ImageGeneratorService] Format d'image non supporté: ${format}`);
  }

  /**
   * Vérifie la concordance MIME attendu vs fourni. Fail-fast en cas de mismatch.
   */
  static validateMimeForFormat(mime: string, format: ImageFormat): void {
    const expected = this.formatToMime(format);
    const provided = (mime || '').toLowerCase();
    if (provided !== expected) {
      throw new Error(
        `[ImageGeneratorService] Le générateur ne retourne pas un média '${expected}' — reçu: '${mime || 'n/a'}'`
      );
    }
  }

  /**
   * Construit un nom de fichier strict pour la cover: cover-<slug>.<format>
   * - On n'ajoute pas d'identifiant supplémentaire ici pour éviter la multiplication des UUID.
   * - La déduplication/collision est gérée en amont par le slug (qui peut déjà inclure un shortId)
   *   ou en aval par le publisher (chemin final).
   */
  static buildCoverFilename(slug: string, _shortId: string, format: ImageFormat): string {
    const s = (slug || '').trim();
    if (!s) throw new Error('[ImageGeneratorService] slug requis pour le nom de fichier');
    // Vérifie que le format est supporté (levera si non supporté)
    this.formatToMime(format);
    return `cover-${s}.${format}`;
  }
}
