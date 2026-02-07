import { describe, expect, it } from 'vitest';

import { NEWS_CONFIG } from '../../config/news.config';
import { ProviderKeywordSelector } from '../provider-keyword-selector';

/**
 * Tests XP pour la construction des requêtes NewsAPI
 */
describe('ProviderKeywordSelector (newsapi)', () => {
  const selector = new ProviderKeywordSelector();
  const maxChars = NEWS_CONFIG.providers.newsapi.maxChars;

  it('construit une requête protégée par blocs OR, quote les multi-mots et retire les tokens numériques', () => {
    const kws = [
      'OPPBTP Horizon 2025',
      'PPSPS chantier',
      'Obligations chantier BTP',
      'RE2020 travaux',
    ];
    const { query } = selector.select('newsapi', kws);

    // Parenthèsage par blocs + jointure OR
    expect(query).toMatch(/^\(.+\)(\sOR\s\(.+\)){1,}$/);

    // Multi-mots quotés : on s'attend à au moins un bloc avec guillemets
    expect(/\("[^"]+\)\s|\("[^"]+"\)/.test(query) || query.includes('( "')).toBeTruthy();

    // Tokens numériques supprimés (ex: 2025, RE2020)
    expect(query).not.toMatch(/2025|RE2020/);

    // Respect de la limite de longueur
    expect(query.length).toBeLessThanOrEqual(maxChars);
  });

  it('réduit/tronque pour respecter maxChars', () => {
    const veryLong = 'réglementation administrative chantier '.repeat(20);
    const { query } = selector.select('newsapi', [veryLong, veryLong, veryLong]);

    expect(query.length).toBeLessThanOrEqual(maxChars);
    // Soit un seul bloc tronqué, soit quelques blocs réduits
    expect(query.startsWith('("') || query.startsWith('(')).toBe(true);
  });
});
