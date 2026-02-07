import type { ArticleStructure } from '@casys/core';

/**
 * Utilitaires partagés pour la sérialisation MDX et la génération de slug.
 */
export function buildArticleSlug(title: string | undefined | null, id: string): string {
  const shortId = id.replace(/-/g, '').slice(0, 8);
  const baseTitle = title?.trim() ?? '';
  const baseSlug = baseTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

  if (!baseSlug) return shortId;
  return `${baseSlug}-${shortId}`;
}

/**
 * Extrait un extrait court depuis la première section.
 */
export function buildExcerpt(article: ArticleStructure, max = 180): string | undefined {
  const first = article.sections?.[0]?.content?.trim();
  if (!first) return undefined;
  return first.replace(/\s+/g, ' ').slice(0, max);
}

/**
 * Retourne le contenu MDX de l'article.
 * Utilise article.article.content (assemblé avec titres dans le usecase)
 * ou fallback sur sections si content n'existe pas.
 */
export function buildBodyFromSections(article: ArticleStructure): string {
  // Priorité 1: Utiliser le contenu déjà assemblé avec titres (depuis usecase)
  if (article.article?.content) {
    return article.article.content;
  }

  // ⚠️ DEBUG: Ce fallback ne devrait JAMAIS être utilisé si le usecase fonctionne correctement
  console.warn('[buildBodyFromSections] ⚠️  FALLBACK activé - article.article.content manquant!', {
    articleId: article.article?.id,
    hasArticleObject: !!article.article,
    sectionsCount: article.sections?.length ?? 0,
    reason: 'Le contenu devrait être assemblé avec titres dans GenerateArticleLinearUseCase (ligne 662-666)',
  });

  // Fallback: réassembler depuis sections avec titres (évite perte totale)
  return (
    article.sections
      ?.map(section => {
        // Si on doit réassembler, ajouter les titres comme le fait le usecase
        const heading = section.level && section.title
          ? '#'.repeat(section.level) + ' ' + section.title + '\n\n'
          : '';
        return heading + (section.content ?? '');
      })
      .filter(Boolean)
      .join('\n\n') ?? ''
  );
}

/**
 * Sérialisation simple d'un objet en YAML minimal.
 */
export function serializeYamlObject(obj: Record<string, unknown>, indent = ''): string {
  const lines: string[] = [];
  const isPrimitive = (v: unknown) =>
    ['string', 'number', 'boolean'].includes(typeof v) || v === null;
  // Clés susceptibles d'être des dates et attendues comme Date par Astro Content Collections
  const DATE_KEYS = new Set(['publishDate', 'date', 'updated', 'updatedAt', 'lastmod']);
  const isIsoLike = (s: string): boolean => {
    // Parse robuste: Date.parse accepte de nombreux formats ISO/RFC. On filtre les strings très courtes
    if (typeof s !== 'string' || s.length < 8) return false;
    const time = Date.parse(s);
    return !Number.isNaN(time);
  };

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      const arr = value.map(v => (typeof v === 'string' ? `"${v}"` : String(v))).join(', ');
      lines.push(`${indent}${key}: [${arr}]`);
    } else if (value instanceof Date) {
      // Les Date sont imprimées en ISO sans guillemets pour permettre le typage Date côté Astro
      lines.push(`${indent}${key}: ${value.toISOString()}`);
    } else if (value && typeof value === 'object') {
      lines.push(`${indent}${key}:`);
      lines.push(serializeYamlObject(value as Record<string, unknown>, indent + '  '));
    } else if (isPrimitive(value)) {
      if (value === null || value === undefined) continue;
      // Ne pas mettre de guillemets autour des dates attendues comme Date
      if (typeof value === 'string' && DATE_KEYS.has(key) && isIsoLike(value)) {
        lines.push(`${indent}${key}: ${value}`);
      } else {
        // À ce stade, value est primitif (string, number, boolean)
        // On vérifie explicitement le type pour éviter l'erreur de linting
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          lines.push(`${indent}${key}: "${String(value)}"`);
        }
      }
    }
  }
  return lines.join('\n');
}

/**
 * Sérialisation simple d'un objet en TOML minimal (tables plates par dot-paths déjà résolues).
 */
export function serializeTomlObject(obj: Record<string, unknown>, indent = ''): string {
  const lines: string[] = [];
  const isPrimitive = (v: unknown) =>
    ['string', 'number', 'boolean'].includes(typeof v) || v === null;
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      const arr = value.map(v => (typeof v === 'string' ? `"${v}"` : String(v))).join(', ');
      lines.push(`${indent}${key} = [${arr}]`);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (isPrimitive(v)) {
          lines.push(`${indent}${key}.${k} = ${typeof v === 'string' ? `"${v}"` : String(v)}`);
        }
      }
    } else if (isPrimitive(value)) {
      if (typeof value === 'string') {
        lines.push(`${indent}${key} = "${value}"`);
      } else {
        lines.push(`${indent}${key} = ${String(value)}`);
      }
    }
  }
  return lines.join('\n');
}
