import type { EditorialBrief } from '@casys/core';

export interface EditorialBriefSearchResult {
  brief: EditorialBrief;
  similarityScore: number;
  articleId?: string;       // Si brief a généré un article
  articleStatus?: string;   // 'draft' | 'published' | null
}

/**
 * Port OUT pour la persistance des EditorialBrief (agrégats)
 */
export interface EditorialBriefStorePort {
  /**
   * Sauvegarder un EditorialBrief
   * Crée les relations:
   * - (EditorialBrief)-[:BRIEF_USES_BUSINESS_CONTEXT]->(BusinessContext)
   * - (EditorialBrief)-[:BRIEF_FOR_TOPICS]->(Topic)
   * - (EditorialBrief)-[:BRIEF_USES_KEYWORD_PLAN]->(KeywordPlan)
   */
  saveEditorialBrief(brief: EditorialBrief): Promise<void>;

  /**
   * Récupérer un EditorialBrief
   */
  getEditorialBrief(id: string, tenantId: string, projectId: string): Promise<EditorialBrief | null>;
  
  /**
   * Recherche sémantique de briefs similaires (pour TopicSelector)
   * Utilise les embeddings sur angle + topics pour détecter doublons stratégiques
   */
  searchSimilarBriefs(params: {
    queryText: string;        // Topics + description à rechercher
    angle?: string;           // Optionnel, filtrer par angle spécifique
    projectId: string;
    tenantId: string;
    limit?: number;           // Défaut: 5
    threshold?: number;       // Défaut: 0.6
  }): Promise<EditorialBriefSearchResult[]>;
  
  /**
   * Lie un brief à l'article qu'il a généré
   * Crée (EditorialBrief)-[:BRIEF_GENERATED_ARTICLE]->(Article)
   */
  linkBriefToArticle(briefId: string, articleId: string, tenantId: string): Promise<void>;
  
  /**
   * Lie un brief aux KeywordPlans utilisés (seeds projet)
   * Crée (EditorialBrief)-[:USES_KEYWORD_PLAN]->(KeywordPlan)
   */
  linkBriefToKeywordPlans(briefId: string, planIds: string[], tenantId: string): Promise<void>;
  
  /**
   * Vérifie si un article a déjà un EditorialBrief lié.
   * Sert à garantir l'idempotence lors des analyses répétées.
   */
  hasBriefForArticle(params: { tenantId: string; articleId: string }): Promise<boolean>;
  
  /**
   * Récupère uniquement les angles existants (léger, pas d'embeddings)
   * Pour analyse content gaps et feedback dans LangGraph
   */
  getExistingAngles(params: {
    projectId: string;
    tenantId: string;
    limit?: number;
  }): Promise<string[]>;

  /**
   * Récupère TOUS les EditorialBriefs du projet (complets, sans seoBrief)
   * Pour anti-doublons dans AngleSelectionWorkflow
   *
   * V3.1: Charge tous les briefs du projet (pas de filtre SeoBrief)
   * Le mapper extrait {id, angle, createdAt} pour le prompt POML
   *
   * TODO V4: Filtrer par TopicCluster une fois briefs d'existing articles liés aux clusters
   */
  getAllEditorialBriefs(params: {
    projectId: string;
    tenantId: string;
    limit?: number;
  }): Promise<EditorialBrief[]>;

  /**
   * Récupère les EditorialBriefs liés à un SeoBrief via [:INFORMS]
   * Retourne briefs partiels (sans seoBrief) avec businessContext + keywordTags
   * Pour contexte anti-doublons dans AngleSelectionWorkflow
   *
   * Plus simple que searchSimilarBriefs: suit relation directe au lieu de vector search
   */
  getEditorialBriefsForSeoBrief(params: {
    seoBriefId: string;
    tenantId: string;
    projectId: string;
    limit?: number;
  }): Promise<EditorialBrief[]>;

  /**
   * Lie un brief aux TopicClusters/Keywords choisis par le Topic Selector
   * Crée les relations:
   * - (EditorialBrief)-[:BRIEF_COVERS_PILLAR]->(KeywordTag) pour le pillar
   * - (EditorialBrief)-[:BRIEF_COVERS_SATELLITE]->(KeywordTag) pour les satellites
   * - (EditorialBrief)-[:BRIEF_USES_CLUSTER]->(TopicCluster) si cluster existe dans le projet
   */
  linkBriefToTopicClusters(params: {
    briefId: string;
    tenantId: string;
    projectId: string;
    pillarTag?: { label: string; slug: string; source?: string };
    satelliteTags: { label: string; slug: string; source?: string }[];
  }): Promise<void>;
}
