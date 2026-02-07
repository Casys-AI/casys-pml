import { describe, it, expect } from 'vitest';
import { normalizeKeyword, slugifyKeyword } from '../keyword.value';

describe('normalizeKeyword', () => {
  it('devrait déléguer à normalizeSeoKeyword', () => {
    expect(normalizeKeyword('SEO Content')).toBe('seo content');
    expect(normalizeKeyword('Réglementation')).toBe('reglementation');
  });

  it('devrait retourner une chaîne vide pour entrée vide', () => {
    expect(normalizeKeyword('')).toBe('');
    expect(normalizeKeyword(null as any)).toBe('');
    expect(normalizeKeyword(undefined as any)).toBe('');
  });
});

describe('slugifyKeyword', () => {
  describe('slugification basique', () => {
    it('devrait remplacer les espaces par des tirets', () => {
      expect(slugifyKeyword('seo content marketing')).toBe('seo-content-marketing');
      expect(slugifyKeyword('machine learning')).toBe('machine-learning');
    });

    it('devrait normaliser puis slugifier', () => {
      expect(slugifyKeyword('SEO Content Marketing')).toBe('seo-content-marketing');
      expect(slugifyKeyword('Réglementation BTP')).toBe('reglementation-btp');
    });

    it('devrait gérer les espaces multiples', () => {
      expect(slugifyKeyword('seo   content   marketing')).toBe('seo-content-marketing');
      expect(slugifyKeyword('keyword    with     spaces')).toBe('keyword-with-spaces');
    });

    it('devrait trim les espaces avant slugification', () => {
      expect(slugifyKeyword('  seo content  ')).toBe('seo-content');
      expect(slugifyKeyword('\t\tkeyword\t\t')).toBe('keyword');
    });
  });

  describe('normalisation combinée', () => {
    it('devrait convertir en minuscules et remplacer espaces', () => {
      expect(slugifyKeyword('MACHINE LEARNING')).toBe('machine-learning');
    });

    it('devrait supprimer les accents et slugifier', () => {
      expect(slugifyKeyword('stratégie de contenu')).toBe('strategie-de-contenu');
      expect(slugifyKeyword('école française')).toBe('ecole-francaise');
    });

    it('devrait combiner trim, normalisation et slugification', () => {
      expect(slugifyKeyword('  RÉGLEMENTATION  BTP  ')).toBe('reglementation-btp');
    });
  });

  describe('edge cases', () => {
    it('devrait retourner une chaîne vide pour entrée vide', () => {
      expect(slugifyKeyword('')).toBe('');
    });

    it('devrait gérer null et undefined', () => {
      expect(slugifyKeyword(null as any)).toBe('');
      expect(slugifyKeyword(undefined as any)).toBe('');
    });

    it('devrait retourner une chaîne vide pour espaces uniquement', () => {
      expect(slugifyKeyword('   ')).toBe('');
      expect(slugifyKeyword('\t\t\t')).toBe('');
    });

    it('devrait préserver les tirets existants', () => {
      expect(slugifyKeyword('self-service')).toBe('self-service');
      expect(slugifyKeyword('e-commerce platform')).toBe('e-commerce-platform');
    });

    it('devrait préserver les underscores', () => {
      expect(slugifyKeyword('keyword_tag')).toBe('keyword_tag');
      expect(slugifyKeyword('test_value keyword')).toBe('test_value-keyword');
    });
  });

  describe('cas réels SEO', () => {
    it('devrait générer des slugs cohérents pour keywords SEO', () => {
      expect(slugifyKeyword('Optimisation du référencement')).toBe('optimisation-du-referencement');
      expect(slugifyKeyword('Stratégie de contenu')).toBe('strategie-de-contenu');
      expect(slugifyKeyword('Génération automatique')).toBe('generation-automatique');
    });

    it('devrait gérer des expressions longues', () => {
      expect(slugifyKeyword('Comment optimiser votre SEO en 2024')).toBe(
        'comment-optimiser-votre-seo-en-2024'
      );
    });

    it('devrait générer des slugs pour mots techniques', () => {
      expect(slugifyKeyword('Machine Learning AI')).toBe('machine-learning-ai');
      expect(slugifyKeyword('Natural Language Processing')).toBe('natural-language-processing');
    });
  });

  describe('cohérence avec buildKeywordTagId', () => {
    it('devrait générer des slugs compatibles avec les IDs canoniques', () => {
      // Les slugs générés doivent être utilisables dans buildKeywordTagId
      const slug = slugifyKeyword('SEO Content Marketing');
      expect(slug).toBe('seo-content-marketing');

      // Format ID: tenantId::projectId::slug
      const mockId = `tenant1::proj1::${slug}`;
      expect(mockId).toBe('tenant1::proj1::seo-content-marketing');
    });

    it('devrait générer des slugs sans espaces pour éviter les problèmes d\'ID', () => {
      const slugs = [
        slugifyKeyword('keyword one'),
        slugifyKeyword('keyword two'),
        slugifyKeyword('keyword three'),
      ];

      slugs.forEach((slug) => {
        expect(slug).not.toContain(' ');
        expect(slug).toMatch(/^[a-z0-9-_]+$/);
      });
    });
  });

  describe('caractères spéciaux', () => {
    it('devrait préserver certains caractères spéciaux', () => {
      expect(slugifyKeyword('keyword@example')).toBe('keyword@example');
      expect(slugifyKeyword('test.value')).toBe('test.value');
    });

    it('devrait combiner normalisation et caractères spéciaux', () => {
      expect(slugifyKeyword('SEO-2024 Strategy')).toBe('seo-2024-strategy');
      expect(slugifyKeyword('B2B SaaS')).toBe('b2b-saas');
    });
  });
});
