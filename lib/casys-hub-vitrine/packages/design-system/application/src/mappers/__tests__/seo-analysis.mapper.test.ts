import { describe, expect,it } from 'vitest';

import type { ProjectConfig, SeoAnalysisCommandDTO, SeoAnalysisResultDTO } from '@casys/shared';

import {
  mapCommandToSeoAnalysisPromptDTO,
  mapSeoAnalysisResultToDomain
} from '../seo-analysis.mapper';

describe('seo-analysis.mapper', () => {
  describe('mapCommandToSeoAnalysisPromptDTO', () => {
    const mockProjectConfig: ProjectConfig = {
      name: 'Test Project',
      type: 'astro',
      language: 'fr',
      sources: {},
      publication: {} as any,
      generation: {
        tone: 'professionnel',
        length: '800-1200',
        seoAnalysis: {
          keywords: ['seo', 'marketing', 'digital'],
          businessDescription: 'Une entreprise de marketing digital',
          industry: 'Marketing',
          targetAudience: 'Entrepreneurs',
          template: 'prompts/seo-analysis.poml',
          trendPriority: 0.7,
          excludeCategories: ['spam', 'adult'],
          contentType: 'article'
        }
      }
    };

    const mockCommand: SeoAnalysisCommandDTO = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
      language: 'fr'
    };

    it('should map command to prompt DTO with project config data', () => {
      const result = mapCommandToSeoAnalysisPromptDTO(mockCommand, mockProjectConfig);

      expect(result).toEqual({
        keywords: ['seo', 'marketing', 'digital'],
        language: 'fr',
        projectName: 'Test Project',
        contentType: 'article',
        trendPriority: 0.7,
        excludeCategories: ['spam', 'adult'],
        maxKeywords: 15,
        targetAudience: 'Entrepreneurs',
        businessDescription: 'Une entreprise de marketing digital',
        industry: 'Marketing'
      });
    });

    it('should use command keywords when provided', () => {
      const commandWithKeywords: SeoAnalysisCommandDTO = {
        ...mockCommand,
        keywords: ['custom', 'keywords']
      };

      const result = mapCommandToSeoAnalysisPromptDTO(commandWithKeywords, mockProjectConfig);

      expect(result.keywords).toEqual(['custom', 'keywords']);
    });

    it('should use command language', () => {
      const commandWithEnglish: SeoAnalysisCommandDTO = {
        ...mockCommand,
        language: 'en'
      };

      const result = mapCommandToSeoAnalysisPromptDTO(commandWithEnglish, mockProjectConfig);

      expect(result.language).toBe('en');
    });

    it('should not require optional context (no competitorTitles/trendData/webContext)', () => {
      const result = mapCommandToSeoAnalysisPromptDTO(
        mockCommand,
        mockProjectConfig
      );

      expect(result).toMatchObject({
        keywords: ['seo', 'marketing', 'digital'],
        language: 'fr'
      });
      expect('competitorTitles' in (result as any)).toBe(false);
      expect('trendData' in (result as any)).toBe(false);
      expect('webContext' in (result as any)).toBe(false);
    });

    it('should fail-fast if seoAnalysis config is missing', () => {
      const configWithoutSeoAnalysis: ProjectConfig = {
        ...mockProjectConfig,
        generation: {
          tone: 'professionnel',
          length: '800-1200'
        }
      };

      expect(() => {
        mapCommandToSeoAnalysisPromptDTO(mockCommand, configWithoutSeoAnalysis);
      }).toThrow('ProjectConfig.generation.seoAnalysis requis');
    });

    it('should fail-fast if keywords are missing', () => {
      const configWithoutKeywords: ProjectConfig = {
        ...mockProjectConfig,
        generation: {
          ...mockProjectConfig.generation,
          seoAnalysis: {
            ...mockProjectConfig.generation.seoAnalysis!,
            keywords: []
          }
        }
      };

      expect(() => {
        mapCommandToSeoAnalysisPromptDTO(mockCommand, configWithoutKeywords);
      }).toThrow('seoAnalysis.keywords requis et non vide');
    });

    it('should fail-fast if businessDescription is missing', () => {
      const configWithoutDescription: ProjectConfig = {
        ...mockProjectConfig,
        generation: {
          ...mockProjectConfig.generation,
          seoAnalysis: {
            ...mockProjectConfig.generation.seoAnalysis!,
            businessDescription: ''
          }
        }
      };

      expect(() => {
        mapCommandToSeoAnalysisPromptDTO(mockCommand, configWithoutDescription);
      }).toThrow('seoAnalysis.businessDescription requis');
    });

    it('should use default values for optional config fields', () => {
      const configWithMinimalSeoAnalysis: ProjectConfig = {
        ...mockProjectConfig,
        generation: {
          ...mockProjectConfig.generation,
          seoAnalysis: {
            keywords: ['test'],
            businessDescription: 'Test description',
            industry: 'Test',
            targetAudience: 'Test audience',
            template: 'test.poml',
            contentType: 'article'
          }
        }
      };

      const result = mapCommandToSeoAnalysisPromptDTO(mockCommand, configWithMinimalSeoAnalysis);

      expect(result.trendPriority).toBe(0.5);
      expect(result.excludeCategories).toEqual([]);
      expect(result.contentType).toBe('article');
    });
  });

  describe('mapSeoAnalysisResultToDomain', () => {
    const mockResultDTO: SeoAnalysisResultDTO = {
      id: 'seo-123',
      language: 'fr',
      createdAt: '2024-01-01T00:00:00Z',
      keywordPlan: {
        tags: [
          { label: 'enhanced', slug: 'enhanced', source: 'opportunity' },
          { label: 'keywords', slug: 'keywords', source: 'opportunity' }
        ],
        contentGaps: [{ keyword: 'Gap 1', reason: 'ai_detected' }],
        recommendations: ['Do this'],
      },
      competitors: [
        { title: 'Competitor 1', url: 'https://competitor1.com' },
      ],
      trends: [
        { keyword: 'trend1', trend: 'rising', searchVolume: 1000 },
      ],
      searchIntent: {
        intent: 'informational',
        confidence: 0.8,
        supportingQueries: ['query1'],
      },
      competitionScore: 0.6,
      trendScore: 0.9,
      analysisDate: '2024-01-01T00:00:00Z',
      dataSource: 'test-source',
    };

    it('should map result DTO to domain entity correctly', () => {
      const result = mapSeoAnalysisResultToDomain(mockResultDTO);
      // Le mapper est une passe directe, donc on vérifie juste que les champs sont bien là.
      expect(result.id).toBe('seo-123');
      expect(result.language).toBe('fr');
      expect(result.keywordPlan.tags[0].label).toBe('enhanced');
      expect(result.competitors![0].title).toBe('Competitor 1');
      expect(result.trends![0].keyword).toBe('trend1');
      expect(result.searchIntent.intent).toBe('informational');
    });

    it('should handle missing optional fields with defaults', () => {
      const minimalDTO: Partial<SeoAnalysisResultDTO> = {
        id: 'seo-456',
        language: 'en',
        createdAt: '2024-01-01T00:00:00Z',
        keywordPlan: { tags: [], contentGaps: [], recommendations: [] },
        competitors: [],
        trends: [],
        searchIntent: { intent: 'commercial', confidence: 0.5 },
        analysisDate: '2024-01-01T00:00:00Z',
        dataSource: 'test',
      };

      const result = mapSeoAnalysisResultToDomain(minimalDTO as SeoAnalysisResultDTO);

      expect(result.competitors).toEqual([]);
      expect(result.trends).toEqual([]);
      expect(result.searchIntent.supportingQueries).toEqual([]);
      expect(result.competitionScore).toBe(0.5);
    });

    it('should handle missing searchIntent with defaults', () => {
      const dtoWithoutSearchIntent: Partial<SeoAnalysisResultDTO> = {
        ...mockResultDTO,
        searchIntent: undefined,
      };

      const result = mapSeoAnalysisResultToDomain(dtoWithoutSearchIntent as SeoAnalysisResultDTO);

      // Mapper fournit des valeurs par défaut si searchIntent absent
      expect(result.searchIntent).toEqual({
        intent: 'informational',
        confidence: 0,
        supportingQueries: [],
        contentRecommendations: [],
      });
    });
  });
});
