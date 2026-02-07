import type { KeywordPlanDTO } from '@casys/shared';
import type { KeywordPlan, KeywordTag } from '@casys/core';

import type { KeywordPlanRepositoryPort } from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

export interface PersistKeywordPlanParams {
  tenantId: string;
  projectId: string;
  seoBriefId?: string; // ✅ Lien au SeoBrief (source de vérité SEO)
  plan: KeywordPlanDTO;
  planHash?: string; // Hash du prompt/config qui a généré ce plan (pour dédup/versioning)
  seedNormalized?: string;
}

export interface PersistKeywordPlanResult {
  planId: string;
  tagsCount: number;
}

/**
 * Use case pour persister un KeywordPlan.
 * Orchestre la sauvegarde via le KeywordPlanRepository et assure la cohérence.
 */
export class PersistKeywordPlanUseCase {
  constructor(private readonly keywordPlanRepository: KeywordPlanRepositoryPort) {}

  async execute(params: PersistKeywordPlanParams): Promise<PersistKeywordPlanResult> {
    const { tenantId, projectId, seoBriefId, plan, planHash, seedNormalized } = params;

    // Fail-fast validations
    if (!tenantId?.trim()) throw new Error('[PersistKeywordPlanUseCase] tenantId requis');
    if (!projectId?.trim()) throw new Error('[PersistKeywordPlanUseCase] projectId requis');
    if (!plan) throw new Error('[PersistKeywordPlanUseCase] plan requis');

    // Validation métier du plan
    if (!Array.isArray(plan.tags)) {
      throw new Error('[PersistKeywordPlanUseCase] plan.tags doit être un tableau');
    }
    if (plan.tags.length === 0) {
      throw new Error('[PersistKeywordPlanUseCase] plan.tags ne peut pas être vide');
    }

    // Validation des tags - fail-fast sur les champs requis
    for (const tag of plan.tags) {
      if (!tag.label?.trim()) {
        throw new Error('[PersistKeywordPlanUseCase] Tous les tags doivent avoir un label non vide');
      }
      if (!tag.slug?.trim()) {
        throw new Error('[PersistKeywordPlanUseCase] Tous les tags doivent avoir un slug non vide');
      }
      if (!tag.source?.trim()) {
        throw new Error('[PersistKeywordPlanUseCase] Tous les tags doivent avoir une source non vide');
      }
    }

    try {
      // Mapper DTO -> domaine
      // Les métriques appartiennent aux KeywordTag (atomiques), pas au KeywordPlan (agrégat)
      const domainTags: KeywordTag[] = plan.tags.map(t => ({
        label: t.label,
        slug: t.slug,
        source: t.source,
        weight: t.weight,
        // Blog strategy v2
        priority: t.priority,
        clusterType: t.clusterType,
        // SEO metrics
        searchVolume: t.searchVolume,
        difficulty: t.difficulty,
        cpc: t.cpc,
        competition: t.competition,
        lowTopOfPageBid: t.lowTopOfPageBid,
        highTopOfPageBid: t.highTopOfPageBid,
        monthlySearches: t.monthlySearches,
      }));
      const domainPlan: KeywordPlan = {
        tags: domainTags,
        // Blog strategy v2 (plan-level)
        topicClusters: plan.topicClusters,
        recommendations: plan.recommendations,
        contentGaps: plan.contentGaps,
      };

      const { planId } = await this.keywordPlanRepository.upsertProjectKeywordPlan({
        tenantId,
        projectId,
        seoBriefId, // ✅ Passé au repository pour créer la relation
        plan: domainPlan,
        planHash,
        seedNormalized,
      });

      const persistResult: PersistKeywordPlanResult = {
        planId: planId ?? planHash ?? `plan-${Date.now()}`,
        tagsCount: plan.tags.length,
      };

      return persistResult;
    } catch (error) {
      logger.error('[PersistKeywordPlanUseCase] Failed to persist KeywordPlan:', error);
      throw error;
    }
  }
}
