export type TopicSourceType = 'rss' | 'newsapi' | 'worldnews' | 'newsdata' | 'custom';

export interface LinkTopicToKeywordPlanParams {
  tenantId: string;
  projectId: string;
  topicId: string;
  keywordNormalized: string; // déjà normalisé (lowercase, no diacritics)
}

export interface LinkTopicToSeoKeywordParams {
  tenantId: string;
  projectId: string;
  topicId: string;
  keywordNormalized: string; // déjà normalisé (lowercase, no diacritics)
}

export interface LinkSectionToTopicParams {
  tenantId: string;
  projectId: string;
  sectionId: string;
  topicId: string;
  articleId: string; // Pour cohérence du graphe
}

export interface TopicRelationsPort {
  /**
   * MERGE idempotent de la relation (Topic)-[:TOPIC_HAS_KEYWORD_PLAN]->(KeywordPlan)
   */
  linkTopicToKeywordPlan(params: LinkTopicToKeywordPlanParams): Promise<void>;

  /**
   * MERGE idempotent de la relation (Section)-[:BASED_ON]->(Topic)
   * Granularité fine : chaque section peut être basée sur un topic différent
   */
  linkSectionToTopic(params: LinkSectionToTopicParams): Promise<void>;
}
