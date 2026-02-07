import type { KeywordTag, ManageTopicClustersPort, TopicCluster } from '@casys/core';

import type { TopicClusterStorePort } from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

/**
 * Use Case pour la gestion des TopicClusters
 *
 * Implémente le port IN (métier) ManageTopicClustersPort
 * et utilise le port OUT (technique) TopicClusterStorePort
 *
 * Architecture hexagonale:
 * Port IN (ManageTopicClustersPort) ← UseCase → Port OUT (TopicClusterStorePort)
 */
export class ManageTopicClustersUseCase implements ManageTopicClustersPort {
  constructor(private readonly topicClusterStore: TopicClusterStorePort) {}

  async saveTopicClusters(params: {
    tenantId: string;
    projectId: string;
    clusters: TopicCluster[];
    seoBriefId?: string;
  }): Promise<string[]> {
    const { tenantId, projectId, clusters, seoBriefId } = params;

    logger.log('[ManageTopicClustersUseCase] Saving topic clusters', {
      tenantId,
      projectId,
      clustersCount: clusters.length,
      seoBriefId,
    });

    const clusterIds: string[] = [];

    // Sauvegarder chaque TopicCluster
    for (const cluster of clusters) {
      const clusterId = await this.topicClusterStore.saveTopicCluster({
        tenantId,
        projectId,
        cluster,
      });

      clusterIds.push(clusterId);

      // Lier au SeoBrief si fourni
      if (seoBriefId) {
        await this.topicClusterStore.linkTopicClusterToSeoBrief({
          tenantId,
          projectId,
          clusterId,
          seoBriefId,
        });

        logger.debug('[ManageTopicClustersUseCase] Linked cluster to SeoBrief', {
          clusterId,
          seoBriefId,
        });
      }
    }

    logger.log('[ManageTopicClustersUseCase] Successfully saved topic clusters', {
      tenantId,
      projectId,
      clusterIds,
    });

    return clusterIds;
  }

  async getProjectTopicClusters(params: {
    tenantId: string;
    projectId: string;
  }): Promise<TopicCluster[]> {
    const { tenantId, projectId } = params;

    logger.debug('[ManageTopicClustersUseCase] Getting project topic clusters', {
      tenantId,
      projectId,
    });

    return await this.topicClusterStore.getTopicClustersForProject({
      tenantId,
      projectId,
    });
  }

  async getUncoveredSatellites(params: {
    tenantId: string;
    projectId: string;
    pillarTag?: KeywordTag;
  }): Promise<{
    pillarTag: KeywordTag;
    satelliteTag: KeywordTag;
  }[]> {
    const { tenantId, projectId, pillarTag } = params;

    logger.debug('[ManageTopicClustersUseCase] Getting uncovered satellites', {
      tenantId,
      projectId,
      pillarTag,
    });

    // Récupérer tous les clusters (ou filtrer par pillar)
    const clusters = await this.topicClusterStore.getTopicClustersForProject({
      tenantId,
      projectId,
    });

    // Filtrer par pillar si spécifié
    const filteredClusters = pillarTag
      ? clusters.filter(cluster => cluster.pillarTag?.label === pillarTag.label)
      : clusters;

    // Pour chaque cluster, récupérer les satellites non couverts
    const uncoveredSatellites: {
      pillarTag: KeywordTag;
      satelliteTag: KeywordTag;
    }[] = [];

    for (const cluster of filteredClusters) {
      if (cluster.satelliteTags && cluster.pillarTag) {
        const satellites = await this.topicClusterStore.getSatellitesForPillar({
          tenantId,
          projectId,
          pillarKeyword: cluster.pillarTag.label,
        });

        // Utiliser le pillarTag du cluster
        const clusterPillarTag: KeywordTag = cluster.pillarTag;

        // Ajouter les satellites à la liste
        // Le store retourne { keyword: string, priority?: number }
        // On doit construire un KeywordTag complet (TODO: améliorer le port OUT pour retourner KeywordTag directement)
        satellites.forEach(satellite => {
          uncoveredSatellites.push({
            pillarTag: clusterPillarTag,
            satelliteTag: {
              label: satellite.keyword,
              slug: satellite.keyword.toLowerCase().replace(/\s+/g, '-'),
              source: 'satellite' as const,
              // Les metrics SEO seront récupérées depuis Neo4j KeywordTag node
              // Pour l'instant, on utilise priority comme proxy
              weight: satellite.priority,
            },
          });
        });
      }
    }

    logger.log('[ManageTopicClustersUseCase] Found uncovered satellites', {
      tenantId,
      projectId,
      count: uncoveredSatellites.length,
    });

    return uncoveredSatellites;
  }
}
