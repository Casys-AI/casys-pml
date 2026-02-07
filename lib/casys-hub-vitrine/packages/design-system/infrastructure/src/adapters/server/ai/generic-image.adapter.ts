import OpenAI from 'openai';

import { type ImageGeneratorPort } from '@casys/application';

/**
 * Adapter générique pour la génération/récupération d'images.
 * Remplace l'ancien Dalle3ImageAdapter.
 */
export class GenericImageAdapter implements ImageGeneratorPort {
  private readonly client: OpenAI;
  private readonly modelName: string;

  constructor(apiKey?: string, modelName?: string) {
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('[GenericImageAdapter] OPENAI_API_KEY manquant');
    }
    this.client = new OpenAI({ apiKey: key });
    this.modelName = modelName ?? process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1';
  }

  /**
   * Valide le format et le mappe vers un type MIME.
   * Normalisation déjà effectuée par buildCoverPoml.
   */
  private validateAndMapFormat(format: string): string {
    const f = format.toLowerCase();
    switch (f) {
      case 'webp':
        return 'image/webp';
      case 'png':
        return 'image/png';
      case 'jpeg':
        return 'image/jpeg';
      default:
        throw new Error(`[GenericImageAdapter] Format non supporté: ${format}`);
    }
  }

  async generateImage(data: {
    prompt: string;
    format: string;
    width: number;
    height: number;
  }): Promise<{ base64: string; mime: string; alt: string }> {
    const _startedAt = Date.now();

    if (!data.prompt?.trim()) {
      throw new Error('[GenericImageAdapter] prompt manquant');
    }
    if (!data.format) {
      throw new Error('[GenericImageAdapter] format manquant');
    }
    if (!data.width || !data.height) {
      throw new Error('[GenericImageAdapter] dimensions manquantes');
    }

    const sizeStr = `${data.width}x${data.height}`;
    const mime = this.validateAndMapFormat(data.format);

    // Appel API images — gpt-image-1 (b64_json par défaut)
    const response = await this.client.images.generate({
      model: this.modelName,
      prompt: data.prompt.trim(),
      size: sizeStr as OpenAI.Images.ImageGenerateParams['size'],
    });

    const first = response.data?.[0];
    const b64: string | null | undefined = first?.b64_json ?? null;
    if (!b64 || typeof b64 !== 'string' || b64.trim().length === 0) {
      throw new Error("[GenericImageAdapter] Le provider n'a pas renvoyé de b64_json");
    }

    // Optionnel: timing interne (logger externe si besoin)

    const alt = data.prompt.length > 140 ? `${data.prompt.slice(0, 140)}…` : data.prompt;
    return { base64: b64, mime, alt };
  }
}
