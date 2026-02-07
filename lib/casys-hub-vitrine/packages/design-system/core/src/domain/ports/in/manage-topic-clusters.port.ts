import type { TopicCluster } from '../../types/seo.types';

/**
 * Port IN (métier) pour la gestion des TopicClusters
 *
 * Architecture hexagonale:
 * - Port IN = Interface métier (use case)
 * - Port OUT = Interface technique (store/repository)
 *
 * Ce port définit les opérations métier sur les TopicClusters,
 * utilisé par SeoAnalysisUseCase pour persister la stratégie de contenu.
 */
export interface ManageTopicClustersPort {
  /**
   * Sauvegarde des TopicClusters générés par l'analyse SEO
   *
   * @param params - Paramètres de sauvegarde
   * @param params.tenantId - ID du tenant
   * @param params.projectId - ID du projet
   * @param params.clusters - Clusters à sauvegarder
   * @param params.seoBriefId - ID du SeoBrief associé (pour la relation)
   * @returns IDs des clusters créés
   */
  saveTopicClusters(params: {
    tenantId: string;
    projectId: string;
    clusters: TopicCluster[];
    seoBriefId?: string;
  }): Promise<string[]>; // Retourne les IDs des clusters créés

  /**
   * Récupère les TopicClusters d'un projet
   *
   * @param params - Paramètres de récupération
   * @returns TopicClusters du projet
   */
  getProjectTopicClusters(params: { tenantId: string; projectId: string }): Promise<TopicCluster[]>;

  /**
   * Récupère les satellites non couverts pour un pilier
   * (Content gap analysis pour Graph RAG)
   *
   * @param params - Paramètres de recherche
   * @param params.pillarTag - Si spécifié, satellites de ce pilier uniquement (filtre par label)
   * @returns Paires pilier-satellite avec KeywordTags complets (metrics SEO)
   */
  getUncoveredSatellites(params: {
    tenantId: string;
    projectId: string;
    pillarTag?: import('../../types/seo.types').KeywordTag; // Filtre optionnel par pilier
  }): Promise<
    {
      pillarTag: import('../../types/seo.types').KeywordTag; // Tag pilier avec metrics
      satelliteTag: import('../../types/seo.types').KeywordTag; // Tag satellite avec metrics
    }[]
  >;
}
