import { Tool } from '@langchain/core/tools';

import type { ImageGeneratorService } from '@casys/application';

import { createLogger } from '../../../../utils/logger';

/**
 * The ImageAgent is a specialized tool for generating images related to an article.
 */
export class ImageAgent extends Tool {
  name = 'image_generator';
  description =
    "Génère une image à partir d'un DTO JSON {prompt, format, width, height} et retourne {base64, mime, alt} en JSON.";

  private imageGeneratorService: ImageGeneratorService;
  private readonly logger = createLogger('ImageAgent');

  constructor(imageGeneratorService: ImageGeneratorService) {
    super();
    this.imageGeneratorService = imageGeneratorService;
  }

  protected async _call(arg: string): Promise<string> {
    try {
      // arg est un JSON string représentant { prompt, format, width, height }
      if (!arg || typeof arg !== 'string' || arg.trim().length === 0) {
        throw new Error('ImageAgent: payload JSON requis');
      }
      let payload: unknown;
      try {
        payload = JSON.parse(arg);
      } catch {
        throw new Error('ImageAgent: payload JSON invalide');
      }
      const data = payload as { prompt?: string; format?: string; width?: number; height?: number };
      if (!data?.prompt?.trim() || !data?.format || !data?.width || !data?.height) {
        throw new Error('ImageAgent: champs requis manquants (prompt, format, width, height)');
      }
      const { base64, mime, alt } = await this.imageGeneratorService.generateImage({
        prompt: data.prompt.trim(),
        format: String(data.format),
        width: Number(data.width),
        height: Number(data.height),
      });
      return JSON.stringify({ base64, mime, alt });
    } catch (error) {
      this.logger.error('Error generating image:', error);
      return 'Error: Could not generate image.';
    }
  }
}

/**
 * Factory function to create an instance of the ImageAgent tool.
 */
export function createImageAgentTool(imageGeneratorService: ImageGeneratorService): ImageAgent {
  return new ImageAgent(imageGeneratorService);
}
