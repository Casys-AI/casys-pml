import type { ProjectConfig } from '@casys/shared';
import type { ArticleStructure } from '@casys/core';

import { buildArticleSlug } from '../../../utils/mdx-utils';

export interface CanonicalFrontmatter {
  title: string;
  publishDate: string;
  excerpt?: string;
  tags: string[];
  slug: string;
  canonical: string;
  // champs optionnels selon profils
  draft?: boolean;
  cover?: { src: string; alt?: string };
}

function assertNonEmpty(value: unknown, msg: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(msg);
  }
}

export function buildCanonicalFrontmatter(
  article: ArticleStructure,
  project: ProjectConfig,
  opts?: { excerpt?: string }
): CanonicalFrontmatter {
  const canonicalBase = project.publication?.canonicalBaseUrl?.trim();
  assertNonEmpty(canonicalBase, '[Frontmatter] canonicalBaseUrl requis');

  const title = article.article.title ?? 'Article sans titre';
  const publishDate = article.article.createdAt ?? new Date().toISOString();
  // Utilise le slug généré par OutlineWriter AI si disponible, sinon fallback sur génération depuis title
  const slug = article.article.slug ?? buildArticleSlug(article.article.title, article.article.id);
  const canonical = `${canonicalBase.replace(/\/+$/, '')}/${slug}`;
  const tags = article.article.keywords;
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error('[Frontmatter] keywords requis (provenant de OutlineWriter)');
  }
  const excerpt = opts?.excerpt;

  const cover = article.article.cover?.src
    ? {
        src: article.article.cover.src,
        ...(article.article.cover.alt ? { alt: article.article.cover.alt } : {}),
      }
    : undefined;

  return {
    title,
    publishDate,
    slug,
    canonical,
    tags,
    ...(excerpt ? { excerpt } : {}),
    ...(cover ? { cover } : {}),
  };
}
