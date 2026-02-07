import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersistKeywordPlanUseCase } from '../persist-keyword-plan.usecase';
import type { KeywordPlanRepositoryPort } from '../../ports/out';
import type { KeywordPlanDTO } from '@casys/shared';

describe('PersistKeywordPlanUseCase', () => {
  let useCase: PersistKeywordPlanUseCase;
  let mockRepository: KeywordPlanRepositoryPort;

  beforeEach(() => {
    mockRepository = {
      upsertProjectKeywordPlan: vi.fn().mockImplementation(async (params) => ({
        planId: 'plan123',
        tagsCount: params.plan.tags.length,
      })),
    } as unknown as KeywordPlanRepositoryPort;

    useCase = new PersistKeywordPlanUseCase(mockRepository);
  });

  describe('validation', () => {
    it('devrait rejeter si tenantId est vide', async () => {
      await expect(
        useCase.execute({
          tenantId: '',
          projectId: 'proj1',
          plan: createValidPlan(),
        })
      ).rejects.toThrow('[PersistKeywordPlanUseCase] tenantId requis');
    });

    it('devrait rejeter si projectId est vide', async () => {
      await expect(
        useCase.execute({
          tenantId: 'tenant1',
          projectId: '',
          plan: createValidPlan(),
        })
      ).rejects.toThrow('[PersistKeywordPlanUseCase] projectId requis');
    });

    it('devrait rejeter si plan est manquant', async () => {
      await expect(
        useCase.execute({
          tenantId: 'tenant1',
          projectId: 'proj1',
          plan: null as any,
        })
      ).rejects.toThrow('[PersistKeywordPlanUseCase] plan requis');
    });

    it('devrait rejeter si plan.tags n\'est pas un tableau', async () => {
      await expect(
        useCase.execute({
          tenantId: 'tenant1',
          projectId: 'proj1',
          plan: { tags: 'not-an-array' } as any,
        })
      ).rejects.toThrow('[PersistKeywordPlanUseCase] plan.tags doit être un tableau');
    });

    it('devrait rejeter si plan.tags est vide', async () => {
      await expect(
        useCase.execute({
          tenantId: 'tenant1',
          projectId: 'proj1',
          plan: { tags: [] },
        })
      ).rejects.toThrow('[PersistKeywordPlanUseCase] plan.tags ne peut pas être vide');
    });
  });

  describe('validation des tags', () => {
    it('devrait rejeter si un tag n\'a pas de label', async () => {
      await expect(
        useCase.execute({
          tenantId: 'tenant1',
          projectId: 'proj1',
          plan: {
            tags: [
              { label: '', slug: 'seo', source: 'seed' },
            ],
          },
        })
      ).rejects.toThrow('[PersistKeywordPlanUseCase] Tous les tags doivent avoir un label non vide');
    });

    it('devrait rejeter si un tag n\'a pas de slug', async () => {
      await expect(
        useCase.execute({
          tenantId: 'tenant1',
          projectId: 'proj1',
          plan: {
            tags: [
              { label: 'SEO', slug: '', source: 'seed' },
            ],
          },
        })
      ).rejects.toThrow('[PersistKeywordPlanUseCase] Tous les tags doivent avoir un slug non vide');
    });

    it('devrait rejeter si un tag n\'a pas de source', async () => {
      await expect(
        useCase.execute({
          tenantId: 'tenant1',
          projectId: 'proj1',
          plan: {
            tags: [
              { label: 'SEO', slug: 'seo', source: '' },
            ],
          },
        })
      ).rejects.toThrow('[PersistKeywordPlanUseCase] Tous les tags doivent avoir une source non vide');
    });

    it('devrait rejeter si un tag a label whitespace uniquement', async () => {
      await expect(
        useCase.execute({
          tenantId: 'tenant1',
          projectId: 'proj1',
          plan: {
            tags: [
              { label: '   ', slug: 'seo', source: 'seed' },
            ],
          },
        })
      ).rejects.toThrow('[PersistKeywordPlanUseCase] Tous les tags doivent avoir un label non vide');
    });
  });

  describe('execution réussie', () => {
    it('devrait persister un plan valide', async () => {
      const plan = createValidPlan();

      const result = await useCase.execute({
        tenantId: 'tenant1',
        projectId: 'proj1',
        plan,
      });

      expect(result.planId).toBe('plan123');
      expect(result.tagsCount).toBe(2);
      expect(mockRepository.upsertProjectKeywordPlan).toHaveBeenCalled();
    });

    it('devrait mapper correctement les tags DTO vers domaine', async () => {
      const plan: KeywordPlanDTO = {
        tags: [
          {
            label: 'SEO Content',
            slug: 'seo-content',
            source: 'seed',
            weight: 0.8,
            priority: 1,
            clusterType: 'pillar',
            searchVolume: 1000,
            difficulty: 45,
            cpc: 2.5,
            competition: 0.6,
            lowTopOfPageBid: 1.5,
            highTopOfPageBid: 3.5,
            monthlySearches: [{ month: '2024-01', searches: 1000 }],
          },
        ],
      };

      await useCase.execute({
        tenantId: 'tenant1',
        projectId: 'proj1',
        plan,
      });

      expect(mockRepository.upsertProjectKeywordPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant1',
          projectId: 'proj1',
          plan: expect.objectContaining({
            tags: expect.arrayContaining([
              expect.objectContaining({
                label: 'SEO Content',
                slug: 'seo-content',
                source: 'seed',
                weight: 0.8,
                priority: 1,
                clusterType: 'pillar',
                searchVolume: 1000,
                difficulty: 45,
                cpc: 2.5,
                competition: 0.6,
                lowTopOfPageBid: 1.5,
                highTopOfPageBid: 3.5,
                monthlySearches: [{ month: '2024-01', searches: 1000 }],
              }),
            ]),
          }),
        })
      );
    });

    it('devrait passer le seoBriefId si fourni', async () => {
      const plan = createValidPlan();

      await useCase.execute({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefId: 'brief123',
        plan,
      });

      expect(mockRepository.upsertProjectKeywordPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          seoBriefId: 'brief123',
        })
      );
    });

    it('devrait passer le planHash si fourni', async () => {
      const plan = createValidPlan();

      await useCase.execute({
        tenantId: 'tenant1',
        projectId: 'proj1',
        planHash: 'hash123',
        plan,
      });

      expect(mockRepository.upsertProjectKeywordPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          planHash: 'hash123',
        })
      );
    });

    it('devrait passer le seedNormalized si fourni', async () => {
      const plan = createValidPlan();

      await useCase.execute({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seedNormalized: 'seo content',
        plan,
      });

      expect(mockRepository.upsertProjectKeywordPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          seedNormalized: 'seo content',
        })
      );
    });
  });

  describe('métriques SEO optionnelles', () => {
    it('devrait gérer les tags sans métriques', async () => {
      const plan: KeywordPlanDTO = {
        tags: [
          {
            label: 'SEO',
            slug: 'seo',
            source: 'seed',
          },
        ],
      };

      await useCase.execute({
        tenantId: 'tenant1',
        projectId: 'proj1',
        plan,
      });

      expect(mockRepository.upsertProjectKeywordPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: expect.objectContaining({
            tags: expect.arrayContaining([
              expect.objectContaining({
                label: 'SEO',
                slug: 'seo',
                source: 'seed',
              }),
            ]),
          }),
        })
      );
    });
  });

  describe('tags multiples', () => {
    it('devrait persister plusieurs tags', async () => {
      const plan: KeywordPlanDTO = {
        tags: [
          { label: 'SEO', slug: 'seo', source: 'seed' },
          { label: 'Content', slug: 'content', source: 'related_keywords' },
          { label: 'Marketing', slug: 'marketing', source: 'opportunity' },
        ],
      };

      await useCase.execute({
        tenantId: 'tenant1',
        projectId: 'proj1',
        plan,
      });

      expect(mockRepository.upsertProjectKeywordPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: expect.objectContaining({
            tags: expect.arrayContaining([
              expect.objectContaining({ label: 'SEO' }),
              expect.objectContaining({ label: 'Content' }),
              expect.objectContaining({ label: 'Marketing' }),
            ]),
          }),
        })
      );
    });
  });
});

// Helper
function createValidPlan(): KeywordPlanDTO {
  return {
    tags: [
      { label: 'SEO', slug: 'seo', source: 'seed' },
      { label: 'Content', slug: 'content', source: 'seed' },
    ],
  };
}
