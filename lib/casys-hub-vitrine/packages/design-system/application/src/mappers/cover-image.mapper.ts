import {
  type CoverPromptDTO,
  type GenerateCoverImageCommandDTO,
  type ImageFormat,
} from '@casys/shared';

/**
 * Mappe la commande de génération de cover (métier) vers les paramètres du builder de prompt (agnostiques POML).
 * - topic <= outlineTitle
 * - summary <= outlineSummary (peut être vide; l'alt est géré dans le use case)
 * - tags <= tags
 * - slug fourni par le use case (dépend de la stratégie de nommage)
 */
export function mapCommandToCoverPromptDTO(
  cmd: GenerateCoverImageCommandDTO,
  slug: string,
  stylePrompt: string | undefined,
  format: ImageFormat,
  width?: number,
  height?: number
): CoverPromptDTO {
  return {
    topic: cmd.outlineTitle,
    summary: cmd.outlineSummary ?? '',
    tags: Array.isArray(cmd.tags) ? cmd.tags : [],
    slug,
    format,
    stylePrompt,
    width: width ?? 1536,
    height: height ?? 1024,
  };
}
