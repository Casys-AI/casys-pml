import { describe, expect, it } from 'vitest';

import { NEWS_CONFIG } from '../../config/news.config';
import { ProviderKeywordSelector } from '../provider-keyword-selector';

/**
 * Tests XP/Fail-fast pour la construction des requêtes NewsData
 */
describe('ProviderKeywordSelector (newsdata)', () => {
  const selector = new ProviderKeywordSelector();
  const maxChars = NEWS_CONFIG.providers.newsdata.maxChars;

  it('met des guillemets pour les multi-mots et parenthèses pour tous les blocs', () => {
    const { query } = selector.select('newsdata', [
      'gestion administrative BTP',
      'conformité réglementaire chantier',
      'suivi administratif chantier',
    ]);

    // Chaque bloc doit être parenthésé
    expect(query).toMatch(/^\(.+\)(\sOR\s\(.+\)){1,2}$/);
    // Les blocs multi-mots doivent être quotés
    expect(query).toContain('("gestion administrative BTP")');
  });

  it('joint les blocs avec OR', () => {
    const { query } = selector.select('newsdata', ['BTP', 'chantier', 'réglementation']);
    expect(query).toContain(') OR (');
  });

  it('respecte strictement la limite de longueur (<= maxChars)', () => {
    const { query } = selector.select('newsdata', [
      'gestion administrative BTP',
      'conformité réglementaire chantier',
      'suivi administratif chantier',
    ]);
    expect(query.length).toBeLessThanOrEqual(maxChars);
  });

  it('réduit le nombre de blocs si nécessaire pour rester <= maxChars', () => {
    const longPhrase = 'x'.repeat(maxChars);
    const { query } = selector.select('newsdata', [longPhrase, longPhrase, longPhrase]);
    // Avec 3 phrases très longues, on doit tomber à 1 bloc tronqué
    expect(query.startsWith('("') || query.startsWith('(')).toBe(true);
    expect(query.endsWith('")') || query.endsWith(')')).toBe(true);
    expect(query.includes(' OR ')).toBe(false);
    expect(query.length).toBeLessThanOrEqual(maxChars);
  });

  it('tronque le contenu interne d’un bloc unique si nécessaire', () => {
    const over = 'Test "quoted" string'.repeat(50); // dépasse 100
    const { query } = selector.select('newsdata', [over]);
    // Doit être un seul bloc, tronqué, avec wrapper
    expect(query.startsWith('("') || query.startsWith('(')).toBe(true);
    expect(query.length).toBeLessThanOrEqual(maxChars);
  });
});
