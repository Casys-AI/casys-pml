import type { ProjectConfig } from '@casys/shared';

import { buildArticleSlug } from './mdx-utils';

export type ContentFormat = 'md' | 'mdx';

export function resolveContentFormat(project: ProjectConfig): ContentFormat {
  const explicit = project.publication?.content_format;
  const legacy = project.publication?.file_system?.format;

  const pick = (val?: string | null): ContentFormat | undefined => {
    if (!val) return undefined;
    const v = String(val).toLowerCase();
    if (v === 'md' || v === 'mdx') return v;
    return undefined;
  };

  const candidate = pick(explicit) ?? pick(legacy);
  if (candidate) {
    // Garde: hugo n'accepte pas mdx
    if (project.type === 'hugo' && candidate === 'mdx') {
      throw new Error('[ContentFormat] project.type=hugo n\'accepte pas content_format="mdx"');
    }
    return candidate;
  }

  // Par défaut par type de projet
  if (project.type === 'astro') return 'mdx';
  if (project.type === 'hugo') return 'md';
  if (project.type === 'wordpress') return 'md';

  // Fallback sécurisé (inatteignable si types bornés)
  return 'mdx';
}

export function ensureExtension(fileName: string, format: ContentFormat): string {
  const base = fileName.replace(/\.(md|mdx)$/i, '');
  return `${base}.${format}`;
}

export function generateFileNameFromArticleWithFormat(
  article: { id: string; title?: string | null; slug?: string | null },
  format: ContentFormat
): string {
  // Utilise le slug généré par OutlineWriter AI si disponible, sinon fallback sur génération depuis title
  const slug = article.slug ?? buildArticleSlug(article.title, article.id);
  return `${slug}.${format}`;
}
