import type { CoverPromptDTO, ImageFormat } from '@casys/shared';

import type { PromptTemplatePort } from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

function assertNonEmpty(value: unknown, name: string) {
  if (!value || (typeof value === 'string' && value.trim().length === 0)) {
    throw new Error(`[cover-prompt] Paramètre requis manquant: ${name}`);
  }
}

/**
 * Construit un prompt final pour la génération d'une image de couverture.
 * - Charge un template POML via PromptTemplatePort (fail-fast si manquant/vide)
 * - Injecte les variables avec pomljs.read()
 * - Retourne le prompt rendu avec métadonnées depuis les paramètres
 */
export async function buildCoverPoml(
  templatePort: PromptTemplatePort,
  templatePath: string,
  params: CoverPromptDTO
): Promise<{ prompt: string; format: ImageFormat; width: number; height: number }> {
  assertNonEmpty(templatePath, 'templatePath');
  // Validation stricte: pas de fallback ici
  assertNonEmpty(params?.topic, 'topic');
  assertNonEmpty(params?.slug, 'slug');
  // summary peut être vide; l'alt sera géré par le use case
  if (!Array.isArray(params.tags) || params.tags.length === 0) {
    throw new Error('[cover-prompt] Paramètre requis manquant: tags');
  }
  // Le format est validé au niveau du use case et injecté via params.format.

  const raw = await templatePort.loadTemplate(templatePath);

  // Construire le contexte pour l'injection de variables
  const context = {
    topic: params.topic,
    slug: params.slug,
    summary: params.summary ?? '',
    style: params.stylePrompt ?? '',
    tags: params.tags.join(', '),
    format: params.format,
  };

  // Extraire la taille depuis le template brut AVANT rendu POML (format POML officiel uniquement)
  const sizeMatchLet = /<let\s+name\s*=\s*["']imageSize["']\s*>(\d+)x(\d+)<\/let>/i.exec(raw);
  if (!sizeMatchLet) {
    throw new Error(
      '[cover-prompt] Taille non spécifiée dans le template POML (<let name="imageSize">WxH</let> requis)'
    );
  }

  const widthStr = sizeMatchLet[1];
  const heightStr = sizeMatchLet[2];
  try {
    logger.debug('[cover-prompt] extracted template size', { widthStr, heightStr });
  } catch {
    // Ignorer toute erreur de logging pour ne pas affecter le flux applicatif
  }

  // Maintenant rendre le template POML pour le prompt final
  let rendered: string;
  try {
    const { read } = await import('pomljs');
    rendered = await read(raw, undefined, context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[cover-prompt] Erreur lors du parsing POML: ${msg}`);
  }

  if (!rendered?.trim()) {
    throw new Error('[cover-prompt] Template rendu vide');
  }

  const width = parseInt(widthStr, 10);
  const height = parseInt(heightStr, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('[cover-prompt] Taille invalide dans le template POML');
  }

  const allowedSizes = new Set(['1536x1024', '1024x1536', '1024x1024']);
  const sizeKey = `${width}x${height}`;
  if (!allowedSizes.has(sizeKey)) {
    throw new Error('Taille non supportée par gpt-image-1');
  }

  // Normaliser et valider le format côté paramètres (le template n'est pas source de vérité pour le format)
  const normalizedParamFormat =
    params.format.toLowerCase() === 'jpg' ? 'jpeg' : params.format.toLowerCase();
  if (!['webp', 'png', 'jpeg'].includes(normalizedParamFormat)) {
    throw new Error(
      `Format non supporté (params): ${params.format}. Formats acceptés: webp, png, jpeg, jpg`
    );
  }

  return {
    prompt: rendered.trim(),
    format: normalizedParamFormat as ImageFormat,
    width,
    height,
  };
}
