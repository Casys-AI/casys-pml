import { describe, it, expect } from 'vitest';
import { normalizeSeoKeyword } from '../text-normalization.service';

describe('normalizeSeoKeyword', () => {
  describe('normalisation basique', () => {
    it('devrait convertir en minuscules', () => {
      expect(normalizeSeoKeyword('SEO CONTENT')).toBe('seo content');
      expect(normalizeSeoKeyword('Machine Learning')).toBe('machine learning');
      expect(normalizeSeoKeyword('RÉGLEMENTATION')).toBe('reglementation');
    });

    it('devrait supprimer les accents', () => {
      expect(normalizeSeoKeyword('réglementation')).toBe('reglementation');
      expect(normalizeSeoKeyword('été')).toBe('ete');
      expect(normalizeSeoKeyword('àéèùâêîôûç')).toBe('aeeuaeiouc');
      expect(normalizeSeoKeyword('naïve')).toBe('naive');
    });

    it('devrait trim les espaces', () => {
      expect(normalizeSeoKeyword('  seo content  ')).toBe('seo content');
      expect(normalizeSeoKeyword('\t\tkeyword\t\t')).toBe('keyword');
    });

    it('devrait compacter les espaces multiples', () => {
      expect(normalizeSeoKeyword('seo   content   marketing')).toBe('seo content marketing');
      expect(normalizeSeoKeyword('keyword\t\twith\t\ttabs')).toBe('keyword with tabs');
      expect(normalizeSeoKeyword('multiple   \t  spaces')).toBe('multiple spaces');
    });
  });

  describe('edge cases', () => {
    it('devrait gérer une chaîne vide', () => {
      expect(normalizeSeoKeyword('')).toBe('');
    });

    it('devrait gérer null et undefined', () => {
      expect(normalizeSeoKeyword(null as any)).toBe('');
      expect(normalizeSeoKeyword(undefined as any)).toBe('');
    });

    it('devrait gérer des espaces uniquement', () => {
      expect(normalizeSeoKeyword('   ')).toBe('');
      expect(normalizeSeoKeyword('\t\t\t')).toBe('');
    });

    it('devrait gérer des caractères spéciaux', () => {
      expect(normalizeSeoKeyword('seo-content')).toBe('seo-content');
      expect(normalizeSeoKeyword('keyword_tag')).toBe('keyword_tag');
      expect(normalizeSeoKeyword('test@example.com')).toBe('test@example.com');
    });

    it('devrait préserver les chiffres', () => {
      expect(normalizeSeoKeyword('SEO 2024')).toBe('seo 2024');
      expect(normalizeSeoKeyword('top 10 tips')).toBe('top 10 tips');
    });
  });

  describe('Unicode et caractères internationaux', () => {
    it('devrait normaliser les caractères français', () => {
      expect(normalizeSeoKeyword('École')).toBe('ecole');
      expect(normalizeSeoKeyword('Français')).toBe('francais');
      expect(normalizeSeoKeyword('Être')).toBe('etre');
    });

    it('devrait normaliser les caractères espagnols', () => {
      expect(normalizeSeoKeyword('Niño')).toBe('nino');
      expect(normalizeSeoKeyword('Año')).toBe('ano');
    });

    it('devrait normaliser les caractères allemands', () => {
      expect(normalizeSeoKeyword('Über')).toBe('uber');
      // ß est un cas spécial en allemand (reste inchangé, pas un diacritique)
      expect(normalizeSeoKeyword('Größe')).toBe('große');
    });

    it('devrait gérer les emojis (pas de diacritiques)', () => {
      expect(normalizeSeoKeyword('SEO 🚀')).toBe('seo 🚀');
      expect(normalizeSeoKeyword('Content Marketing ✨')).toBe('content marketing ✨');
    });
  });

  describe('cohérence avec Kuzu', () => {
    it('devrait produire la même normalisation que Kuzu', () => {
      // Ces exemples doivent être cohérents avec KuzuSeoKeywordRepositoryAdapter
      const examples = [
        ['SEO Content Marketing', 'seo content marketing'],
        ['Réglementation BTP', 'reglementation btp'],
        ['  Machine   Learning  ', 'machine learning'],
        ['ÉTAT-NATION', 'etat-nation'],
        ['naïve bayes', 'naive bayes'],
      ];

      examples.forEach(([input, expected]) => {
        expect(normalizeSeoKeyword(input)).toBe(expected);
      });
    });
  });

  describe('normalisation NFD', () => {
    it('devrait décomposer les caractères avec diacritiques', () => {
      // NFD décompose é en e + ´
      const result = normalizeSeoKeyword('café');
      expect(result).toBe('cafe');
    });

    it('devrait gérer les ligatures', () => {
      expect(normalizeSeoKeyword('œuvre')).toBe('œuvre'); // œ n'a pas de diacritique
    });
  });

  describe('cas réels', () => {
    it('devrait normaliser des keywords SEO réels', () => {
      expect(normalizeSeoKeyword('Optimisation du référencement')).toBe('optimisation du referencement');
      expect(normalizeSeoKeyword('Stratégie de contenu')).toBe('strategie de contenu');
      expect(normalizeSeoKeyword('Génération automatique')).toBe('generation automatique');
      expect(normalizeSeoKeyword('Intelligence artificielle')).toBe('intelligence artificielle');
    });

    it('devrait normaliser des mots composés', () => {
      expect(normalizeSeoKeyword('Self-service')).toBe('self-service');
      expect(normalizeSeoKeyword('E-commerce')).toBe('e-commerce');
      expect(normalizeSeoKeyword('B2B SaaS')).toBe('b2b saas');
    });
  });
});
