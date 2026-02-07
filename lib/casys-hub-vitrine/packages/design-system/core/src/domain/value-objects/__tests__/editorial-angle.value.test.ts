import { describe, it, expect } from 'vitest';
import { EditorialAngle } from '../editorial-angle.value';

describe('EditorialAngle', () => {
  describe('create', () => {
    it('devrait créer un angle valide', () => {
      const angle = EditorialAngle.create('Comment optimiser votre SEO en 2024');

      expect(angle.value).toBe('Comment optimiser votre SEO en 2024');
    });

    it('devrait trim les espaces', () => {
      const angle = EditorialAngle.create('  Angle avec espaces  ');

      expect(angle.value).toBe('Angle avec espaces');
    });

    it('devrait accepter un angle à la limite de 480 caractères', () => {
      const longAngle = 'a'.repeat(480);

      const angle = EditorialAngle.create(longAngle);

      expect(angle.value).toHaveLength(480);
    });
  });

  describe('validation', () => {
    it('devrait rejeter une valeur vide', () => {
      expect(() => EditorialAngle.create('')).toThrow('EditorialAngle: value is required');
    });

    it('devrait rejeter une valeur null', () => {
      expect(() => EditorialAngle.create(null as any)).toThrow('EditorialAngle: value is required');
    });

    it('devrait rejeter une valeur undefined', () => {
      expect(() => EditorialAngle.create(undefined as any)).toThrow('EditorialAngle: value is required');
    });

    it('devrait rejeter des espaces uniquement', () => {
      expect(() => EditorialAngle.create('   ')).toThrow('EditorialAngle: value is required');
    });

    it('devrait rejeter un angle dépassant 480 caractères', () => {
      const tooLong = 'a'.repeat(481);

      expect(() => EditorialAngle.create(tooLong)).toThrow('EditorialAngle: max length is 480');
    });

    it('devrait rejeter du HTML', () => {
      expect(() => EditorialAngle.create('<div>Test</div>')).toThrow('EditorialAngle: HTML is not allowed');
      expect(() => EditorialAngle.create('Test <script>alert("xss")</script>')).toThrow('EditorialAngle: HTML is not allowed');
      expect(() => EditorialAngle.create('<p>Paragraphe</p>')).toThrow('EditorialAngle: HTML is not allowed');
    });

    it('devrait accepter du texte avec < et > isolés (pas du HTML)', () => {
      // Les symboles < et > isolés ne sont pas considérés comme des balises HTML
      const angle = EditorialAngle.create('Optimiser SEO: A > B et B < C');

      expect(angle.value).toBe('Optimiser SEO: A > B et B < C');
    });
  });

  describe('edge cases', () => {
    it('devrait gérer les caractères spéciaux', () => {
      const angle = EditorialAngle.create('Comment utiliser les "guillemets" et l\'apostrophe ?');

      expect(angle.value).toBe('Comment utiliser les "guillemets" et l\'apostrophe ?');
    });

    it('devrait gérer les emojis', () => {
      const angle = EditorialAngle.create('Guide ultime du SEO 🚀 en 2024');

      expect(angle.value).toBe('Guide ultime du SEO 🚀 en 2024');
    });

    it('devrait gérer les caractères unicode', () => {
      const angle = EditorialAngle.create('Réglementation européenne 🇪🇺 2024');

      expect(angle.value).toBe('Réglementation européenne 🇪🇺 2024');
    });

    it('devrait gérer les sauts de ligne', () => {
      const angle = EditorialAngle.create('Premier paragraphe\nDeuxième paragraphe');

      expect(angle.value).toBe('Premier paragraphe\nDeuxième paragraphe');
    });
  });

  describe('immutabilité', () => {
    it('devrait retourner la même valeur', () => {
      const angle = EditorialAngle.create('Angle original');

      expect(angle.value).toBe('Angle original');
      expect(angle.value).toBe('Angle original');

      // La classe protège la valeur avec readonly
      const angle2 = EditorialAngle.create('Autre angle');
      expect(angle2.value).toBe('Autre angle');
    });
  });
});
