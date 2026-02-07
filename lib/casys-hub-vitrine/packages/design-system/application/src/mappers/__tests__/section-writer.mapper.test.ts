import { describe, it, expect } from 'vitest';
import {
  mapStateToSectionWriterPromptDTO,
  type SectionWriterStateInput,
  type SectionWriterSectionInput,
} from '../section-writer.mapper';

describe('section-writer.mapper', () => {
  describe('mapStateToSectionWriterPromptDTO', () => {
    it('devrait mapper correctement les valeurs complètes depuis le state', () => {
      // Arrange
      const state: SectionWriterStateInput = {
        language: 'fr',
        outline: {
          angle: 'Guide pratique pour débutants',
        },
      };

      const section: SectionWriterSectionInput = {
        title: 'Introduction aux Concepts',
        description: 'Vue d\'ensemble des concepts fondamentaux',
        relatedArticles: [
          {
            id: 'article-1',
            title: 'Article Connexe',
            excerpt: 'Extrait de l\'article',
            url: '/articles/related',
            relevanceScore: 0.85,
            reason: 'Explique les bases',
          },
        ],
        suggestedTopics: [
          {
            id: 'topic-1',
            title: 'Topic Externe',
            excerpt: 'Source externe',
            url: 'https://example.com/topic',
            relevanceScore: 0.9,
            reason: 'Données statistiques',
          },
        ],
      };

      const context = 'Contexte formaté pour la section';

      // Act
      const dto = mapStateToSectionWriterPromptDTO(state, section, context);

      // Assert
      expect(dto).toEqual({
        topicTitle: 'Introduction aux Concepts',
        context: 'Contexte formaté pour la section',
        language: 'fr',
        sectionDescription: 'Vue d\'ensemble des concepts fondamentaux',
        angle: 'Guide pratique pour débutants',
        relatedArticles: section.relatedArticles,
        suggestedTopics: section.suggestedTopics,
      });
    });

    it('devrait gérer l\'absence d\'angle (optionnel)', () => {
      // Arrange
      const state: SectionWriterStateInput = {
        language: 'en',
        outline: {}, // Pas d'angle
      };

      const section: SectionWriterSectionInput = {
        title: 'Test Section',
      };

      const context = 'Test context';

      // Act
      const dto = mapStateToSectionWriterPromptDTO(state, section, context);

      // Assert
      expect(dto.angle).toBeUndefined();
      expect(dto.language).toBe('en');
      expect(dto.topicTitle).toBe('Test Section');
    });

    it('devrait gérer l\'absence de description (optionnel)', () => {
      // Arrange
      const state: SectionWriterStateInput = {
        language: 'es',
        outline: { angle: 'Test angle' },
      };

      const section: SectionWriterSectionInput = {
        title: 'Sección de Prueba',
        // Pas de description
      };

      const context = 'Contexto de prueba';

      // Act
      const dto = mapStateToSectionWriterPromptDTO(state, section, context);

      // Assert
      expect(dto.sectionDescription).toBeUndefined();
      expect(dto.topicTitle).toBe('Sección de Prueba');
    });

    it('devrait gérer l\'absence de relatedArticles et suggestedTopics (optionnels)', () => {
      // Arrange
      const state: SectionWriterStateInput = {
        language: 'de',
        outline: { angle: 'Testwinkel' },
      };

      const section: SectionWriterSectionInput = {
        title: 'Testabschnitt',
        // Pas de relatedArticles ni suggestedTopics
      };

      const context = 'Testkontext';

      // Act
      const dto = mapStateToSectionWriterPromptDTO(state, section, context);

      // Assert
      expect(dto.relatedArticles).toBeUndefined();
      expect(dto.suggestedTopics).toBeUndefined();
    });

    it('devrait échouer si language est manquant', () => {
      // Arrange
      const state = {
        language: '',
        outline: { angle: 'Test' },
      };

      const section: SectionWriterSectionInput = {
        title: 'Test Section',
      };

      const context = 'Test context';

      // Act & Assert
      expect(() => mapStateToSectionWriterPromptDTO(state, section, context)).toThrow(
        '[section-writer.mapper] state.language requis et non vide'
      );
    });

    it('devrait échouer si section.title est manquant', () => {
      // Arrange
      const state: SectionWriterStateInput = {
        language: 'fr',
        outline: { angle: 'Test' },
      };

      const section = {
        title: '',
      };

      const context = 'Test context';

      // Act & Assert
      expect(() => mapStateToSectionWriterPromptDTO(state, section, context)).toThrow(
        '[section-writer.mapper] section.title requis et non vide'
      );
    });

    it('devrait échouer si state est null', () => {
      // Arrange
      const section: SectionWriterSectionInput = {
        title: 'Test',
      };

      const context = 'Test';

      // Act & Assert
      expect(() => mapStateToSectionWriterPromptDTO(null as any, section, context)).toThrow(
        '[section-writer.mapper] state requis (objet)'
      );
    });

    it('devrait échouer si section est null', () => {
      // Arrange
      const state: SectionWriterStateInput = {
        language: 'fr',
        outline: {},
      };

      const context = 'Test';

      // Act & Assert
      expect(() => mapStateToSectionWriterPromptDTO(state, null as any, context)).toThrow(
        '[section-writer.mapper] section requis (objet)'
      );
    });

    it('devrait accepter un contexte vide (string vide valide)', () => {
      // Arrange
      const state: SectionWriterStateInput = {
        language: 'fr',
        outline: { angle: 'Test' },
      };

      const section: SectionWriterSectionInput = {
        title: 'Test Section',
      };

      const context = ''; // Contexte vide accepté

      // Act
      const dto = mapStateToSectionWriterPromptDTO(state, section, context);

      // Assert
      expect(dto.context).toBe('');
      expect(dto.topicTitle).toBe('Test Section');
    });

    it('devrait valider que les valeurs ne sont PAS hardcodées', () => {
      // Arrange: Valeurs spécifiques pour détecter hardcoding
      const state: SectionWriterStateInput = {
        language: 'ja', // Japonais, pas français par défaut
        outline: {
          angle: 'Angle très spécifique pour validation',
        },
      };

      const section: SectionWriterSectionInput = {
        title: 'Titre personnalisé unique',
        description: 'Description personnalisée unique',
        relatedArticles: [
          {
            id: 'custom-article-xyz',
            title: 'Article Custom XYZ',
            excerpt: 'Custom excerpt',
            url: '/custom/xyz',
          },
        ],
        suggestedTopics: [
          {
            id: 'custom-topic-abc',
            title: 'Topic Custom ABC',
            excerpt: 'Custom topic excerpt',
            url: 'https://custom.com/abc',
          },
        ],
      };

      const context = 'Contexte personnalisé unique';

      // Act
      const dto = mapStateToSectionWriterPromptDTO(state, section, context);

      // Assert: Vérifier que TOUTES les valeurs custom sont présentes
      expect(dto.language).toBe('ja');
      expect(dto.angle).toBe('Angle très spécifique pour validation');
      expect(dto.topicTitle).toBe('Titre personnalisé unique');
      expect(dto.sectionDescription).toBe('Description personnalisée unique');
      expect(dto.context).toBe('Contexte personnalisé unique');
      expect(dto.relatedArticles).toHaveLength(1);
      expect(dto.relatedArticles![0].id).toBe('custom-article-xyz');
      expect(dto.suggestedTopics).toHaveLength(1);
      expect(dto.suggestedTopics![0].id).toBe('custom-topic-abc');

      // ✅ Si ce test passe, aucune valeur n'est hardcodée dans le mapper
    });
  });
});
