import { describe, it, expect } from 'vitest';
import { EditorialBrief } from '@casys/core';
import type { AngleSelectionCommand, TopicCandidate } from '@casys/core';
import {
  mapCommandToAngleSelectionPromptDTO,
  mapTopicCandidatesToArticleDTOs,
} from '../angle-selection.mapper';

describe('angle-selection.mapper', () => {
  describe('mapCommandToAngleSelectionPromptDTO', () => {
    const validCommand: AngleSelectionCommand = {
      tenantId: 'tenant1',
      projectId: 'project1',
      language: 'fr',
      articles: [
        {
          id: 'article1',
          title: 'Article 1',
          sourceUrl: 'https://example.com/article1',
          description: 'Description 1',
          sourceTitle: 'Source 1',
          publishedAt: '2024-01-15',
          language: 'fr',
          categories: ['tech'],
        },
      ],
      seoBriefData: {
        keywordTags: [
          { label: 'SEO', slug: 'seo', source: 'seed' },
        ],
        searchIntent: {
          intent: 'informational',
          confidence: 0.8,
          supportingQueries: [],
          contentRecommendations: [],
        },
        contentStrategy: {
          topicClusters: [
            {
              pillarTag: { label: 'SEO Basics', slug: 'seo-basics', source: 'pillar' },
              satelliteTags: [],
            },
          ],
        },
        competitiveAnalysis: {
          contentGaps: [],
          competitorTitles: [],
        },
      },
      businessContext: {
        industry: 'Tech',
        targetAudience: 'Developers',
        businessDescription: 'Software company',
        contentType: 'blog',
        personas: [],
      },
      existingBriefs: [],
    };

    it('devrait mapper une commande valide vers AngleSelectionPromptDTO', () => {
      const result = mapCommandToAngleSelectionPromptDTO(validCommand);

      expect(result.minAngles).toBe(3);
      expect(result.maxAngles).toBe(5);
      expect(result.businessContext).toEqual(validCommand.businessContext);

      // Vérifier que seoBriefData est transformé via toSeoBriefDataDTO
      expect(result.seoBriefData).toBeDefined();
      expect(result.seoBriefData.keywordTags).toBeDefined();
      expect(result.seoBriefData.keywordTags[0].label).toBe('SEO');
      expect(result.seoBriefData.searchIntent).toBeDefined();
      expect(result.seoBriefData.searchIntent.intent).toBe('informational');
      expect(result.seoBriefData.contentStrategy).toBeDefined();
      expect(result.seoBriefData.competitiveAnalysis).toBeDefined();

      expect(result.personasCount).toBe(0);
      expect(result.existingBriefsCount).toBe(0);
      expect(result.seoHasTopicClusters).toBe(true);
      expect(result.seoHasPriority).toBe(false);
    });

    it('devrait générer articlesJson formaté', () => {
      const result = mapCommandToAngleSelectionPromptDTO(validCommand);

      expect(result.articlesJson).toBeDefined();
      const parsed = JSON.parse(result.articlesJson);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({
        title: 'Article 1',
        description: 'Description 1',
        url: 'https://example.com/article1',
        source: 'Source 1',
        publishedAt: '2024-01-15',
      });
    });

    it('devrait filtrer les articles sans title ou url', () => {
      const cmdWithInvalidArticles: AngleSelectionCommand = {
        ...validCommand,
        articles: [
          { id: '1', title: '', sourceUrl: 'https://example.com/1', language: 'fr', categories: [] },
          { id: '2', title: 'Valid', sourceUrl: '', language: 'fr', categories: [] },
          { id: '3', title: 'Valid', sourceUrl: 'https://example.com/3', language: 'fr', categories: [] },
        ],
      };

      const result = mapCommandToAngleSelectionPromptDTO(cmdWithInvalidArticles);
      const articles = JSON.parse(result.articlesJson);

      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe('Valid');
      expect(articles[0].url).toBe('https://example.com/3');
    });

    it('devrait convertir publishedAt Date vers ISO string', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const cmdWithDatePublishedAt: AngleSelectionCommand = {
        ...validCommand,
        articles: [
          {
            id: 'article1',
            title: 'Article',
            sourceUrl: 'https://example.com/article',
            publishedAt: date,
            language: 'fr',
            categories: [],
          },
        ],
      };

      const result = mapCommandToAngleSelectionPromptDTO(cmdWithDatePublishedAt);
      const articles = JSON.parse(result.articlesJson);

      expect(articles[0].publishedAt).toBe('2024-01-15T10:00:00.000Z');
    });

    it('devrait générer personasJson si personas présents', () => {
      const cmdWithPersonas: AngleSelectionCommand = {
        ...validCommand,
        businessContext: {
          ...validCommand.businessContext,
          personas: [
            {
              category: 'Developer',
              archetype: 'Backend Dev',
              emoji: '💻',
              profile: {
                demographics: 'Male, 25-35',
                psychographics: 'Tech-savvy',
                techSavviness: 'Avancé',
              },
              painPoints: ['Performance'],
              motivations: ['Efficiency'],
              messagingAngle: 'Technical',
            },
          ],
        },
      };

      const result = mapCommandToAngleSelectionPromptDTO(cmdWithPersonas);

      expect(result.personasJson).toBeDefined();
      expect(result.personasCount).toBe(1);

      const personas = JSON.parse(result.personasJson!);
      expect(personas).toHaveLength(1);
      expect(personas[0].category).toBe('Developer');
    });

    it('devrait laisser personasJson undefined si aucun persona', () => {
      const result = mapCommandToAngleSelectionPromptDTO(validCommand);

      expect(result.personasJson).toBeUndefined();
      expect(result.personasCount).toBe(0);
    });

    it('devrait normaliser existingBriefs (EditorialBrief → ExistingBriefDTO)', () => {
      const brief1 = EditorialBrief.create({
        id: 'brief1',
        tenantId: 'tenant1',
        projectId: 'project1',
        language: 'fr',
        angle: 'Guide SEO complet',
        businessContext: {
          industry: 'Tech',
          targetAudience: 'Developers',
          businessDescription: 'Company',
          contentType: 'blog',
        },
        corpusTopicIds: ['topic1'],
        createdAt: '2024-01-10T10:00:00Z',
      });

      const brief2 = EditorialBrief.create({
        id: 'brief2',
        tenantId: 'tenant1',
        projectId: 'project1',
        language: 'fr',
        angle: 'Les meilleurs outils SEO',
        businessContext: {
          industry: 'Tech',
          targetAudience: 'Developers',
          businessDescription: 'Company',
          contentType: 'blog',
        },
        corpusTopicIds: ['topic2'],
        createdAt: '2024-01-12T10:00:00Z',
      });

      const cmdWithBriefs: AngleSelectionCommand = {
        ...validCommand,
        existingBriefs: [brief1, brief2],
      };

      const result = mapCommandToAngleSelectionPromptDTO(cmdWithBriefs);

      expect(result.existingBriefsJson).toBeDefined();
      expect(result.existingBriefsCount).toBe(2);

      const briefs = JSON.parse(result.existingBriefsJson!);
      expect(briefs).toHaveLength(2);
      expect(briefs[0]).toEqual({
        id: 'brief1',
        angle: 'Guide SEO complet',
        createdAt: '2024-01-10T10:00:00Z',
      });
      expect(briefs[1]).toEqual({
        id: 'brief2',
        angle: 'Les meilleurs outils SEO',
        createdAt: '2024-01-12T10:00:00Z',
      });
    });

    it('devrait laisser existingBriefsJson undefined si aucun brief', () => {
      const result = mapCommandToAngleSelectionPromptDTO(validCommand);

      expect(result.existingBriefsJson).toBeUndefined();
      expect(result.existingBriefsCount).toBe(0);
    });

    it('devrait détecter seoHasPriority si keywordTags avec priority', () => {
      const cmdWithPriority: AngleSelectionCommand = {
        ...validCommand,
        seoBriefData: {
          ...validCommand.seoBriefData,
          keywordTags: [
            { label: 'SEO', slug: 'seo', source: 'seed', priority: 1 },
          ],
        },
      };

      const result = mapCommandToAngleSelectionPromptDTO(cmdWithPriority);

      expect(result.seoHasPriority).toBe(true);
    });

    it('devrait détecter seoHasTopicClusters avec contentStrategy.topicClusters', () => {
      const result = mapCommandToAngleSelectionPromptDTO(validCommand);

      expect(result.seoHasTopicClusters).toBe(true);
    });

    it('devrait détecter seoHasTopicClusters avec topicClusters direct (fallback)', () => {
      const cmdWithDirectClusters: AngleSelectionCommand = {
        ...validCommand,
        seoBriefData: {
          ...validCommand.seoBriefData,
          topicClusters: [
            {
              pillarTag: { label: 'SEO Basics', slug: 'seo-basics', source: 'pillar' },
              satelliteTags: [],
            },
          ],
        } as any,
      };

      const result = mapCommandToAngleSelectionPromptDTO(cmdWithDirectClusters);

      expect(result.seoHasTopicClusters).toBe(true);
    });

    it('devrait mettre seoHasTopicClusters à false si aucun cluster', () => {
      const cmdWithoutClusters: AngleSelectionCommand = {
        ...validCommand,
        seoBriefData: {
          keywordTags: [],
          searchIntent: {
            intent: 'informational',
            confidence: 0.8,
            supportingQueries: [],
            contentRecommendations: [],
          },
          contentStrategy: {},
          competitiveAnalysis: {
            contentGaps: [],
            competitorTitles: [],
          },
        },
      };

      const result = mapCommandToAngleSelectionPromptDTO(cmdWithoutClusters);

      expect(result.seoHasTopicClusters).toBe(false);
    });

    describe('Validations fail-fast', () => {
      it('devrait throw si commande invalide', () => {
        expect(() => mapCommandToAngleSelectionPromptDTO(null as any)).toThrow(
          '[angle-selection.mapper] Commande invalide'
        );
      });

      it('devrait throw si businessContext manquant', () => {
        const invalidCmd = { ...validCommand, businessContext: null as any };
        expect(() => mapCommandToAngleSelectionPromptDTO(invalidCmd)).toThrow(
          '[angle-selection.mapper] businessContext requis'
        );
      });

      it('devrait throw si industry manquant', () => {
        const invalidCmd = {
          ...validCommand,
          businessContext: { ...validCommand.businessContext, industry: '' },
        };
        expect(() => mapCommandToAngleSelectionPromptDTO(invalidCmd)).toThrow(
          '[angle-selection.mapper] businessContext.industry requis'
        );
      });

      it('devrait throw si targetAudience manquant', () => {
        const invalidCmd = {
          ...validCommand,
          businessContext: { ...validCommand.businessContext, targetAudience: '   ' },
        };
        expect(() => mapCommandToAngleSelectionPromptDTO(invalidCmd)).toThrow(
          '[angle-selection.mapper] businessContext.targetAudience requis'
        );
      });

      it('devrait throw si articles n\'est pas un array', () => {
        const invalidCmd = { ...validCommand, articles: null as any };
        expect(() => mapCommandToAngleSelectionPromptDTO(invalidCmd)).toThrow(
          '[angle-selection.mapper] articles requis (array)'
        );
      });

      it('devrait throw si aucun article valide (après filtrage)', () => {
        const invalidCmd = {
          ...validCommand,
          articles: [
            { id: '1', title: '', sourceUrl: '', language: 'fr', categories: [] },
          ],
        };
        expect(() => mapCommandToAngleSelectionPromptDTO(invalidCmd)).toThrow(
          '[angle-selection.mapper] Aucun article valide: chaque article doit avoir title et sourceUrl'
        );
      });

      it('devrait throw si seoBriefData manquant', () => {
        const invalidCmd = { ...validCommand, seoBriefData: null as any };
        expect(() => mapCommandToAngleSelectionPromptDTO(invalidCmd)).toThrow(
          '[angle-selection.mapper] seoBriefData requis'
        );
      });
    });
  });

  describe('mapTopicCandidatesToArticleDTOs', () => {
    it('devrait mapper des candidats valides vers ArticleDTOs', () => {
      const candidates: TopicCandidate[] = [
        {
          id: 'article1',
          title: 'Article Title',
          description: 'Article description',
          sourceUrl: 'https://example.com/article1',
          sourceTitle: 'Example Source',
          publishedAt: '2024-01-15',
          language: 'fr',
          relevanceScore: 0.95,
          categories: ['tech', 'seo'],
        },
      ];

      const result = mapTopicCandidatesToArticleDTOs(candidates);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'article1',
        title: 'Article Title',
        description: 'Article description',
        sourceUrl: 'https://example.com/article1',
        sourceTitle: 'Example Source',
        publishedAt: '2024-01-15',
        relevanceScore: 0.95,
        categories: ['tech', 'seo'],
      });
    });

    it('devrait filtrer les candidats sans title ou url', () => {
      const candidates: TopicCandidate[] = [
        {
          id: '1',
          title: '',
          sourceUrl: 'https://example.com/1',
          language: 'fr',
          categories: [],
        },
        {
          id: '2',
          title: 'Valid',
          sourceUrl: '',
          language: 'fr',
          categories: [],
        },
        {
          id: '3',
          title: 'Valid Title',
          sourceUrl: 'https://example.com/3',
          language: 'fr',
          categories: [],
        },
      ];

      const result = mapTopicCandidatesToArticleDTOs(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });

    it('devrait convertir publishedAt Date vers ISO string', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const candidates: TopicCandidate[] = [
        {
          id: 'article1',
          title: 'Article',
          sourceUrl: 'https://example.com/article',
          publishedAt: date,
          language: 'fr',
          categories: [],
        },
      ];

      const result = mapTopicCandidatesToArticleDTOs(candidates);

      expect(result[0].publishedAt).toBe('2024-01-15T10:00:00.000Z');
    });

    it('devrait gérer publishedAt undefined', () => {
      const candidates: TopicCandidate[] = [
        {
          id: 'article1',
          title: 'Article',
          sourceUrl: 'https://example.com/article',
          language: 'fr',
          categories: [],
        },
      ];

      const result = mapTopicCandidatesToArticleDTOs(candidates);

      expect(result[0].publishedAt).toBeUndefined();
    });

    it('devrait gérer les champs optionnels absents', () => {
      const candidates: TopicCandidate[] = [
        {
          id: 'article1',
          title: 'Article',
          sourceUrl: 'https://example.com/article',
          language: 'fr',
          // Pas de description, sourceTitle, relevanceScore, categories
        } as TopicCandidate,
      ];

      const result = mapTopicCandidatesToArticleDTOs(candidates);

      expect(result[0].description).toBeUndefined();
      expect(result[0].sourceTitle).toBeUndefined();
      expect(result[0].relevanceScore).toBeUndefined();
      expect(result[0].categories).toBeUndefined();
    });

    it('devrait retourner un tableau vide si candidats vide', () => {
      const result = mapTopicCandidatesToArticleDTOs([]);

      expect(result).toEqual([]);
    });

    it('devrait gérer null/undefined input', () => {
      const result = mapTopicCandidatesToArticleDTOs(null as any);

      expect(result).toEqual([]);
    });
  });
});
