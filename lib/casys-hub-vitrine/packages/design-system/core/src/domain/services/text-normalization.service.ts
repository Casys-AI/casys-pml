/**
 * Service de normalisation texte (domaine)²
 * - Source unique de vérité pour la normalisation des SeoKeywords
 * - Aligner STRICTEMENT avec la logique utilisée par KuzuSeoKeywordRepositoryAdapter
 */
export function normalizeSeoKeyword(input: string): string {
  return (
    (input ?? '')
      .toLowerCase()
      .normalize('NFD')
      // Supprime les diacritiques (accents)
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      // Compacte les espaces en un seul espace
      .replace(/\s+/g, ' ')
  );
}
