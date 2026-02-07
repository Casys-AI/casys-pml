import type { ArticleStructure } from '@casys/core';
import { applicationLogger as logger } from '../../utils/logger';

/**
 * Détection de la langue depuis les métadonnées de l'article
 * Fallback 'en' si non renseigné
 */
export function detectLanguageFromArticle(article: ArticleStructure): string {
  // Si déjà renseigné dans les métadonnées
  const preset = (article.article as { language?: string })?.language;
  if (preset && typeof preset === 'string' && preset.trim().length === 2) {
    return preset.toLowerCase();
  }

  // Fallback: anglais par défaut
  // Note: Pour une détection plus précise, utiliser DomainAnalysisPort.analyzeDomains()
  // qui retourne detectedLanguageCode via DataForSEO
  logger.warn?.('[ArticleAnalysis] Langue indéterminée, fallback "en"');
  return 'en';
}

/**
 * Fallback de tokenisation naïve si aucun tag n'est disponible
 */
export function tokenizeTitle(title: string): string[] {
  const tokens = (title || '')
    .toLowerCase()
    .replace(/["'`]/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(t => t.length > 2);
  // Garder 3-5 tokens distincts
  return Array.from(new Set(tokens)).slice(0, 5);
}

/**
 * Construit un id stable pour Topic à partir de l'URL source (sans dépendre d'un UUID)
 */
export function buildTopicIdFromUrl(url: string): string {
  const clean = url
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
  return `topic-${clean}`;
}

/**
 * Extrait les href internes (markdown) du contenu d'une section
 */
export function extractInternalLinks(markdown: string): string[] {
  const links: string[] = [];
  const re = /\[[^\]]+\]\(([^)]+)\)/g; // markdown [text](href)
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const href = m[1] ?? '';
    if (!href) continue;
    if (href.startsWith('http')) continue; // externe → ignoré ici
    links.push(href);
  }
  return links;
}

/**
 * Extrait un slug pertinent depuis un chemin relatif
 * /articles/mon-slug → mon-slug ; ./mon-slug → mon-slug ; mon-slug → mon-slug
 */
export function extractSlugFromPath(path: string): string | null {
  try {
    const cleaned = path.trim().replace(/^\.\//, '').replace(/^\//, '');
    const parts = cleaned.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    return slugify(parts[parts.length - 1]);
  } catch {
    return null;
  }
}

/**
 * Slugify text (lowercase + normalize + hyphenize)
 */
export function slugify(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
