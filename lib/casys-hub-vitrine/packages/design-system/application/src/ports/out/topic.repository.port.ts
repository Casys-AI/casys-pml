import type { Topic } from '@casys/core';

export interface UpsertTopicsParams {
  tenantId: string;
  projectId: string;
  topics: Topic[];
}

export interface GetTopicByIdParams {
  tenantId: string;
  projectId: string;
  topicId: string;
}

export interface GetTopicBySourceUrlParams {
  tenantId: string;
  projectId: string;
  sourceUrl: string;
}

export interface TopicRepositoryPort {
  /**
   * Upsert idempotent des Topics pour un projet donné (fail-fast si ids manquants)
   */
  upsertTopics(params: UpsertTopicsParams): Promise<void>;

  /**
   * Récupère un Topic par son id dans le contexte tenant+project
   */
  getTopicById(params: GetTopicByIdParams): Promise<Topic | null>;

  /**
   * Récupère un Topic par son sourceUrl dans le contexte tenant+project
   */
  getTopicBySourceUrl(params: GetTopicBySourceUrlParams): Promise<Topic | null>;
}
