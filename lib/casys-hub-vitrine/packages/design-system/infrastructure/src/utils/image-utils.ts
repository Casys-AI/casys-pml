import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { ImageFormat } from '@casys/shared';
import { ImageGeneratorService } from '@casys/application';

import { buildArticleSlug } from './mdx-utils';

export function isHttpUrl(s?: string): boolean {
  if (!s) return false;
  return /^https?:\/\//i.test(s);
}

export function isDataUrl(s?: string): boolean {
  if (!s) return false;
  return /^data:/i.test(s);
}

export function parseDataUrl(dataUrl: string): { mimeType: string; data: Uint8Array } {
  if (!isDataUrl(dataUrl)) {
    throw new Error('[Images] parseDataUrl: URL invalide (doit commencer par data:)');
  }
  // format attendu: data:<mimeType>;base64,<payload>
  const match = /^data:([^;,]+);base64,(.*)$/i.exec(dataUrl);
  if (!match) {
    throw new Error('[Images] parseDataUrl: format attendu "data:<mime>;base64,<payload>"');
  }
  const mimeType = match[1].trim().toLowerCase();
  const b64 = match[2];
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length === 0) {
      throw new Error('payload vide');
    }
    return { mimeType, data: buf };
  } catch (_e) {
    throw new Error('[Images] parseDataUrl: payload base64 invalide');
  }
}

export function assertNever(x: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${String(x)}`);
}

export function buildCoverFileName(
  title: string | undefined,
  id: string,
  format: ImageFormat,
  slug?: string
): string {
  // Si slug fourni, l'utiliser directement (déjà généré par OutlineWriter AI)
  // Sinon fallback sur génération depuis title
  const baseSlug = slug ?? buildArticleSlug(title, id);
  const short = randomUUID().replace(/-/g, '').slice(0, 8);
  return `${baseSlug}-${short}.${format}`;
}

/**
 * Calcule le sous-dossier d'assets pour un article (stable, basé sur le slug).
 * Exemple: "mon-article-abc123"
 */
/**
 * Calcule le sous-dossier d'assets pour un article (stable, basé sur le slug).
 * Exemple: "mon-article-abc123"
 */
export function buildArticleAssetsSubdir(title: string | undefined, id: string, slug?: string): string {
  // Si slug fourni (généré par OutlineWriter AI), l'utiliser directement
  // Sinon fallback sur génération depuis title
  return slug ?? buildArticleSlug(title, id);
}

export function ensureDirPath(p: string): string {
  return p.split(path.sep).join('/');
}

export function expectedMimeForFormat(format: ImageFormat): string {
  // Délègue à la source de vérité domaine
  return ImageGeneratorService.formatToMime(format);
}

export function assertImageMatchesFormat(mimeType: string | undefined, format: ImageFormat) {
  // Fail-fast cohérent avec le domaine (mime requis et strict)
  ImageGeneratorService.validateMimeForFormat(mimeType ?? '', format);
}
