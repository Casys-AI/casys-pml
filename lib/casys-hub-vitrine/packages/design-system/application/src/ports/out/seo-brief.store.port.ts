import type { BusinessContext, SeoBriefDataV3 } from '@casys/core';

/**
 * Port OUT pour la persistance des SeoBriefDataV3
 * Source canonique au niveau PROJET, avec possibilité de lier à un article
 *
 * v3 Architecture: SeoBriefDataV3 = {
 *   keywordTags, searchIntent, contentStrategy, competitiveAnalysis
 * }
 */
export interface SeoBriefStorePort {
  /**
   * Sauvegarder un SeoBriefDataV3 pour un PROJET
   * Retourne l'identifiant du SeoBrief créé/mis à jour
   */
  saveSeoBriefForProject(params: {
    tenantId: string;
    projectId: string;
    seoBriefData: SeoBriefDataV3;
  }): Promise<{ seoBriefId: string }>;

  /**
   * Récupérer le SeoBriefDataV3 d'un PROJET
   */
  getSeoBriefForProject(params: {
    tenantId: string;
    projectId: string;
  }): Promise<SeoBriefDataV3 | null>;

  /**
   * Lie un SeoBrief EXISTANT au PROJET (si le brief a été créé ailleurs)
   * Crée/assure (Project)-[:HAS_SEO_BRIEF]->(SeoBrief)
   */
  linkSeoBriefToProject(params: {
    tenantId: string;
    projectId: string;
    seoBriefId: string;
  }): Promise<void>;

  /**
   * Lie un SeoBrief à un EditorialBrief
   * Crée (SeoBrief)-[:INFORMS]->(EditorialBrief)
   */
  linkSeoBriefToEditorialBrief(params: {
    tenantId: string;
    projectId: string;
    seoBriefId: string;
    briefId: string;
  }): Promise<void>;

  /**
   * Lie un SeoBrief à des KeywordPlans existants du projet
   * Crée (SeoBrief)-[:SEO_BRIEF_USES_KEYWORD_PLAN]->(KeywordPlan)
   */
  linkSeoBriefToKeywordPlans(params: {
    tenantId: string;
    projectId: string;
    seoBriefId: string;
    keywords: string[]; // labels (seront normalisés côté infra)
  }): Promise<void>;

  /**
   * V3: Lie un SeoBrief au BusinessContext enrichi du projet (siteType, personas)
   * - Crée/assure (Project)-[:PROJECT_HAS_BUSINESS_CONTEXT {active:true}]->(BusinessContext)
   * - Crée (SeoBrief)-[:SEO_BRIEF_USES_BUSINESS_CONTEXT]->(BusinessContext)
   * - Persiste personas comme array JSON dans les propriétés du nœud BusinessContext
   */
  linkSeoBriefToBusinessContext(params: {
    tenantId: string;
    projectId: string;
    seoBriefId: string;
    businessContext: BusinessContext;
  }): Promise<void>;
}
