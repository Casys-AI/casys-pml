import type { KeywordPlan } from '@casys/core';

// Interface principale pour upsert d'un KeywordPlan complet
export interface UpsertProjectKeywordPlanParams {
  tenantId: string;
  projectId: string;
  seoBriefId?: string; // ✅ Lien au SeoBrief (source de vérité SEO)
  plan: KeywordPlan;
  planHash?: string;
  seedNormalized?: string;
}

// Removed atomic search types from KeywordPlan repo (now handled by TagRepository)

export interface KeywordPlanRepositoryPort {
  /**
   * Upsert d'un KeywordPlan complet (recommandé)
   * Crée un plan agrégé avec relations vers les tags + persistance des content gaps/recommendations
   */
  upsertProjectKeywordPlan(params: UpsertProjectKeywordPlanParams): Promise<{ planId: string }>;

  /**
   * Lookup an existing KeywordPlan for a given seed (normalized) to avoid regeneration
   */
  getKeywordPlanBySeed(params: {
    tenantId: string;
    projectId: string;
    seedNormalized: string;
  }): Promise<{ planId: string } | null>;

  /**
   * Retrieve a specific KeywordPlan by its id
   */
  getKeywordPlanById(params: {
    tenantId: string;
    projectId: string;
    planId: string;
  }): Promise<KeywordPlan | null>;
}
