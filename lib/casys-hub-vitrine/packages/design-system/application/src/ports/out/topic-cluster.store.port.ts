import type { TopicCluster } from '@casys/core';

/**
 * Port pour la persistence des TopicClusters en Neo4j
 * Un TopicCluster représente une stratégie de contenu pilier → satellites
 */
export interface TopicClusterStorePort {
  /**
   * Sauvegarde un TopicCluster et crée les relations vers les KeywordTags
   */
  saveTopicCluster(params: {
    tenantId: string;
    projectId: string;
    cluster: TopicCluster;
  }): Promise<string>; // returns clusterId

  /**
   * Lie un TopicCluster à un SeoBrief
   */
  linkTopicClusterToSeoBrief(params: {
    tenantId: string;
    projectId: string;
    clusterId: string;
    seoBriefId: string;
  }): Promise<void>;

  /**
   * Récupère tous les TopicClusters d'un projet
   */
  getTopicClustersForProject(params: {
    tenantId: string;
    projectId: string;
  }): Promise<TopicCluster[]>;

  /**
   * Récupère les TopicClusters liés à un SeoBrief
   */
  getTopicClustersForSeoBrief(params: {
    tenantId: string;
    projectId: string;
    seoBriefId: string;
  }): Promise<TopicCluster[]>;

  /**
   * Récupère un TopicCluster par son pillar keyword
   */
  getTopicClusterByPillar(params: {
    tenantId: string;
    projectId: string;
    pillarKeyword: string;
  }): Promise<TopicCluster | null>;

  /**
   * Récupère les satellites d'un pilier (KeywordTags)
   */
  getSatellitesForPillar(params: {
    tenantId: string;
    projectId: string;
    pillarKeyword: string;
  }): Promise<Array<{ keyword: string; priority?: number }>>;
}
