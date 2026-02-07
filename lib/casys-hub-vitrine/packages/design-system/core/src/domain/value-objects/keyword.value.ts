import { normalizeSeoKeyword } from '../services/text-normalization.service';

/**
 * Normalisation générique des mots-clés côté Value Object.
 * Délègue au service de domaine `normalizeSeoKeyword` pour conserver
 * une implémentation unique et cohérente à travers le codebase.
 *
 * Remarque: gardé ici pour l'ergonomie (import côté entités), la logique
 * reste centralisée dans le service.
 */
export function normalizeKeyword(value: string): string {
  return normalizeSeoKeyword(value);
}

/**
 * Slugifie un mot-clé de manière canonique (normalisation + espaces → tirets).
 * À utiliser partout pour générer les slugs de KeywordTag.
 */
export function slugifyKeyword(value: string): string {
  return normalizeSeoKeyword(value).replace(/\s+/g, '-');
}
