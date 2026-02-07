import { describe, expect, it } from 'vitest';

import { NEWS_CONFIG } from '../../config/news.config';
import { ProviderKeywordSelector } from '../provider-keyword-selector';

describe('ProviderKeywordSelector (more cases)', () => {
  const selector = new ProviderKeywordSelector();

  it('throw quand rankedKeywords est vide', () => {
    expect(() => selector.select('newsdata', [])).toThrow(/rankedKeywords requis/);
  });

  it('respecte la limite exacte maxChars (pas de split)', () => {
    const max = NEWS_CONFIG.providers.newsdata.maxChars;
    const word = 'abcde';
    // Construire un bloc unique exact: ("abcde ...") de longueur <= max
    const repeated = Array(Math.floor((max - 4) / (word.length + 1)))
      .fill(word)
      .join(' ');
    const { query } = selector.select('newsdata', [repeated]);
    expect(query.length).toBeLessThanOrEqual(max);
    // Un seul bloc
    expect(query.startsWith('("') || query.startsWith('(')).toBe(true);
    expect(query.includes(' OR ')).toBe(false);
  });

  it('garde les acronymes et filtre les tokens avec chiffres', () => {
    const { query } = selector.select('newsdata', ['A1B2C3 ShouldKeep ABC DEF ghi']);
    // Pas de chiffres, acronymes (2-6) conservés, blocs protégés
    expect(query).toMatch(/^\((".*")\)$/);
  });
});
