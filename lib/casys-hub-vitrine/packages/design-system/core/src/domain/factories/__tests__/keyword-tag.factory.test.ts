import { describe, it, expect } from 'vitest';
import { createKeywordTag } from '../keyword-tag.factory';

describe('createKeywordTag', () => {
  describe('création basique', () => {
    it('devrait créer un KeywordTag avec label et slug généré', () => {
      const tag = createKeywordTag('SEO Content');

      expect(tag.label).toBe('SEO Content');
      expect(tag.slug).toBe('seo-content');
      expect(tag.source).toBeUndefined();
      expect(tag.weight).toBeUndefined();
    });

    it('devrait trim le label', () => {
      const tag = createKeywordTag('  Machine Learning  ');

      expect(tag.label).toBe('Machine Learning');
      expect(tag.slug).toBe('machine-learning');
    });

    it('devrait générer un slug à partir du label si slug non fourni', () => {
      const tag = createKeywordTag('Réglementation BTP');

      expect(tag.slug).toBe('reglementation-btp');
    });
  });

  describe('options', () => {
    it('devrait utiliser le slug fourni', () => {
      const tag = createKeywordTag('SEO Content', { slug: 'custom-slug' });

      expect(tag.label).toBe('SEO Content');
      expect(tag.slug).toBe('custom-slug');
    });

    it('devrait normaliser le slug fourni', () => {
      const tag = createKeywordTag('SEO', { slug: 'CUSTOM SLUG' });

      expect(tag.slug).toBe('custom-slug');
    });

    it('devrait accepter une source', () => {
      const tag = createKeywordTag('keyword', { source: 'article' });

      expect(tag.source).toBe('article');
    });

    it('devrait accepter un weight', () => {
      const tag = createKeywordTag('keyword', { weight: 0.75 });

      expect(tag.weight).toBe(0.75);
    });

    it('devrait accepter toutes les options combinées', () => {
      const tag = createKeywordTag('SEO Content', {
        slug: 'seo-custom',
        source: 'editorial',
        weight: 0.9,
      });

      expect(tag.label).toBe('SEO Content');
      expect(tag.slug).toBe('seo-custom');
      expect(tag.source).toBe('editorial');
      expect(tag.weight).toBe(0.9);
    });
  });

  describe('weight clamping', () => {
    it('devrait clamp weight entre 0 et 1', () => {
      const tag1 = createKeywordTag('keyword', { weight: -0.5 });
      expect(tag1.weight).toBe(0);

      const tag2 = createKeywordTag('keyword', { weight: 1.5 });
      expect(tag2.weight).toBe(1);

      const tag3 = createKeywordTag('keyword', { weight: 0.5 });
      expect(tag3.weight).toBe(0.5);
    });

    it('devrait gérer les valeurs limites', () => {
      const tag1 = createKeywordTag('keyword', { weight: 0 });
      expect(tag1.weight).toBe(0);

      const tag2 = createKeywordTag('keyword', { weight: 1 });
      expect(tag2.weight).toBe(1);
    });

    it('devrait retourner undefined pour weight invalide', () => {
      const tag1 = createKeywordTag('keyword', { weight: NaN });
      expect(tag1.weight).toBeUndefined();

      const tag2 = createKeywordTag('keyword', { weight: undefined });
      expect(tag2.weight).toBeUndefined();
    });

    it('devrait clamp les valeurs extrêmes', () => {
      const tag1 = createKeywordTag('keyword', { weight: -100 });
      expect(tag1.weight).toBe(0);

      const tag2 = createKeywordTag('keyword', { weight: 100 });
      expect(tag2.weight).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('devrait gérer un label vide', () => {
      const tag = createKeywordTag('');

      expect(tag.label).toBe('');
      expect(tag.slug).toBe('');
    });

    it('devrait gérer null et undefined', () => {
      const tag1 = createKeywordTag(null as any);
      expect(tag1.label).toBe('');
      expect(tag1.slug).toBe('');

      const tag2 = createKeywordTag(undefined as any);
      expect(tag2.label).toBe('');
      expect(tag2.slug).toBe('');
    });

    it('devrait gérer des espaces uniquement', () => {
      const tag = createKeywordTag('   ');

      expect(tag.label).toBe('');
      expect(tag.slug).toBe('');
    });
  });

  describe('sources valides', () => {
    it('devrait accepter les sources standards', () => {
      const sources = ['article', 'editorial', 'opportunity', 'seed', 'related_keywords'];

      sources.forEach((source) => {
        const tag = createKeywordTag('keyword', { source: source as any });
        expect(tag.source).toBe(source);
      });
    });
  });

  describe('cas réels', () => {
    it('devrait créer des tags pour keywords SEO réels', () => {
      const examples = [
        { label: 'Optimisation du référencement', expected: 'optimisation-du-referencement' },
        { label: 'Stratégie de contenu', expected: 'strategie-de-contenu' },
        { label: 'Machine Learning AI', expected: 'machine-learning-ai' },
      ];

      examples.forEach(({ label, expected }) => {
        const tag = createKeywordTag(label);
        expect(tag.label).toBe(label);
        expect(tag.slug).toBe(expected);
      });
    });

    it('devrait créer des tags avec métadonnées complètes', () => {
      const tag = createKeywordTag('SEO Content Marketing', {
        slug: 'seo-content',
        source: 'opportunity',
        weight: 0.85,
      });

      expect(tag).toEqual({
        label: 'SEO Content Marketing',
        slug: 'seo-content',
        source: 'opportunity',
        weight: 0.85,
      });
    });
  });

  describe('immutabilité', () => {
    it('devrait retourner un objet simple (pas de classe)', () => {
      const tag = createKeywordTag('keyword');

      expect(typeof tag).toBe('object');
      expect(tag.constructor.name).toBe('Object');
    });

    it('devrait créer des tags indépendants', () => {
      const tag1 = createKeywordTag('keyword 1');
      const tag2 = createKeywordTag('keyword 2');

      expect(tag1.label).not.toBe(tag2.label);
      expect(tag1.slug).not.toBe(tag2.slug);
    });
  });
});
