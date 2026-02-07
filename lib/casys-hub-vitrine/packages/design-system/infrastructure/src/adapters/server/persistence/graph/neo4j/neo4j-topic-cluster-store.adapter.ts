import { buildKeywordTagId, slugifyKeyword, type TopicCluster } from '@casys/core';
import type { TopicClusterStorePort } from '@casys/application';

import type { Logger } from '../../../../../utils/logger';
import type { Neo4jConnection } from './neo4j-connection';

/**
 * Adapter Neo4j pour la persistence des TopicClusters
 * Stocke les clusters comme nœuds avec relations explicites vers KeywordTags
 */
export class Neo4jTopicClusterStoreAdapter implements TopicClusterStorePort {
  constructor(
    private readonly conn: Neo4jConnection,
    private readonly logger: Logger
  ) {}

  async saveTopicCluster(params: {
    tenantId: string;
    projectId: string;
    cluster: TopicCluster;
  }): Promise<string> {
    const { tenantId, projectId, cluster } = params;

    // Generate ID if not present
    const clusterId = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // 1. Create TopicCluster node
    const createNodeCypher = `
      MERGE (tc:TopicCluster {
        id: $clusterId,
        tenant_id: $tenantId,
        project_id: $projectId
      })
      SET tc.pillar_keyword = $pillarKeyword,
          tc.created_at = datetime(),
          tc.updated_at = datetime()
      RETURN tc.id AS id
    `;

    await this.conn.query(
      createNodeCypher,
      {
        clusterId,
        tenantId,
        projectId,
        pillarKeyword: cluster.pillarKeyword,
      },
      'WRITE'
    );

    // 2. Ensure pillar KeywordTag exists with metrics and create HAS_PILLAR relation
    const pillarTag = cluster.pillarTag || { label: cluster.pillarKeyword };
    const pillarSlug = slugifyKeyword(pillarTag.label || cluster.pillarKeyword);
    const pillarTagId = buildKeywordTagId(tenantId, projectId, pillarSlug);
    const pillarCypher = `
      MATCH (tc:TopicCluster {id: $clusterId, tenant_id: $tenantId, project_id: $projectId})
      MERGE (kt:KeywordTag {
        id: $pillarTagId,
        tenant_id: $tenantId,
        project_id: $projectId
      })
      ON CREATE SET kt.label = $pillarLabel,
                    kt.slug = $pillarSlug,
                    kt.source = 'topic_cluster',
                    kt.sources = ['topic_cluster'],
                    kt.created_at = datetime(),
                    kt.priority = $priority,
                    kt.opportunity_score = $opportunityScore,
                    kt.cluster_type = $clusterType,
                    kt.search_volume = $searchVolume,
                    kt.difficulty = $difficulty,
                    kt.cpc = $cpc,
                    kt.competition = $competition,
                    kt.low_top_of_page_bid = $lowTopOfPageBid,
                    kt.high_top_of_page_bid = $highTopOfPageBid
      ON MATCH SET kt.priority = COALESCE($priority, kt.priority),
                   kt.opportunity_score = COALESCE($opportunityScore, kt.opportunity_score),
                   kt.cluster_type = COALESCE($clusterType, kt.cluster_type),
                   kt.search_volume = COALESCE($searchVolume, kt.search_volume),
                   kt.difficulty = COALESCE($difficulty, kt.difficulty),
                   kt.cpc = COALESCE($cpc, kt.cpc),
                   kt.competition = COALESCE($competition, kt.competition),
                   kt.low_top_of_page_bid = COALESCE($lowTopOfPageBid, kt.low_top_of_page_bid),
                   kt.high_top_of_page_bid = COALESCE($highTopOfPageBid, kt.high_top_of_page_bid)
      MERGE (tc)-[:HAS_PILLAR]->(kt)
    `;

    await this.conn.query(
      pillarCypher,
      {
        clusterId,
        tenantId,
        projectId,
        pillarTagId,
        pillarSlug,
        pillarLabel: pillarTag.label || cluster.pillarKeyword,
        priority: pillarTag.priority ?? null,
        opportunityScore: pillarTag.opportunityScore ?? null,
        clusterType: pillarTag.clusterType ?? 'pillar',
        searchVolume: pillarTag.searchVolume ?? null,
        difficulty: pillarTag.difficulty ?? null,
        cpc: pillarTag.cpc ?? null,
        competition: pillarTag.competition ?? null,
        lowTopOfPageBid: pillarTag.lowTopOfPageBid ?? null,
        highTopOfPageBid: pillarTag.highTopOfPageBid ?? null,
      },
      'WRITE'
    );

    // 3. Ensure satellite KeywordTags exist with metrics and create HAS_SATELLITE relations
    const satellites = cluster.satelliteTags || cluster.clusterKeywords?.map(kw => ({ label: kw })) || [];
    if (satellites.length > 0) {
      for (const satellite of satellites) {
        const satelliteLabel = typeof satellite === 'string' ? satellite : satellite.label;
        const satelliteSlug = slugifyKeyword(satelliteLabel);
        const satelliteTagId = buildKeywordTagId(tenantId, projectId, satelliteSlug);
        const satelliteCypher = `
          MATCH (tc:TopicCluster {id: $clusterId, tenant_id: $tenantId, project_id: $projectId})
          MERGE (kt:KeywordTag {
            id: $satelliteTagId,
            tenant_id: $tenantId,
            project_id: $projectId
          })
          ON CREATE SET kt.label = $satelliteLabel,
                        kt.slug = $satelliteSlug,
                        kt.source = 'topic_cluster',
                        kt.sources = ['topic_cluster'],
                        kt.created_at = datetime(),
                        kt.priority = $priority,
                        kt.opportunity_score = $opportunityScore,
                        kt.cluster_type = $clusterType,
                        kt.search_volume = $searchVolume,
                        kt.difficulty = $difficulty,
                        kt.cpc = $cpc,
                        kt.competition = $competition,
                        kt.low_top_of_page_bid = $lowTopOfPageBid,
                        kt.high_top_of_page_bid = $highTopOfPageBid
          ON MATCH SET kt.priority = COALESCE($priority, kt.priority),
                       kt.opportunity_score = COALESCE($opportunityScore, kt.opportunity_score),
                       kt.cluster_type = COALESCE($clusterType, kt.cluster_type),
                       kt.search_volume = COALESCE($searchVolume, kt.search_volume),
                       kt.difficulty = COALESCE($difficulty, kt.difficulty),
                       kt.cpc = COALESCE($cpc, kt.cpc),
                       kt.competition = COALESCE($competition, kt.competition),
                       kt.low_top_of_page_bid = COALESCE($lowTopOfPageBid, kt.low_top_of_page_bid),
                       kt.high_top_of_page_bid = COALESCE($highTopOfPageBid, kt.high_top_of_page_bid)
          MERGE (tc)-[r:HAS_SATELLITE]->(kt)
        `;
        
        const satelliteMetrics = typeof satellite === 'object' ? satellite : {};
        await this.conn.query(
          satelliteCypher,
          { 
            clusterId, 
            tenantId, 
            projectId,
            satelliteTagId,
            satelliteSlug,
            satelliteLabel,
            priority: satelliteMetrics.priority ?? null,
            opportunityScore: satelliteMetrics.opportunityScore ?? null,
            clusterType: satelliteMetrics.clusterType ?? 'cluster',
            searchVolume: satelliteMetrics.searchVolume ?? null,
            difficulty: satelliteMetrics.difficulty ?? null,
            cpc: satelliteMetrics.cpc ?? null,
            competition: satelliteMetrics.competition ?? null,
            lowTopOfPageBid: satelliteMetrics.lowTopOfPageBid ?? null,
            highTopOfPageBid: satelliteMetrics.highTopOfPageBid ?? null,
          },
          'WRITE'
        );
      }
    }

    this.logger.debug?.('[Neo4jTopicClusterStore] Saved TopicCluster', {
      clusterId,
      pillarKeyword: cluster.pillarKeyword,
      satellitesCount: satellites.length,
    });

    return clusterId;
  }

  async linkTopicClusterToSeoBrief(params: {
    tenantId: string;
    projectId: string;
    clusterId: string;
    seoBriefId: string;
  }): Promise<void> {
    const { tenantId, projectId, clusterId, seoBriefId } = params;

    const cypher = `
      MATCH (tc:TopicCluster {id: $clusterId, tenant_id: $tenantId, project_id: $projectId})
      MATCH (sb:SeoBrief {id: $seoBriefId, tenant_id: $tenantId, project_id: $projectId})
      MERGE (sb)-[:DEFINES_CLUSTERS]->(tc)
    `;

    await this.conn.query(cypher, { tenantId, projectId, clusterId, seoBriefId }, 'WRITE');

    this.logger.debug?.('[Neo4jTopicClusterStore] Linked TopicCluster to SeoBrief', {
      clusterId,
      seoBriefId,
    });
  }

  async getTopicClustersForProject(params: {
    tenantId: string;
    projectId: string;
  }): Promise<TopicCluster[]> {
    const { tenantId, projectId } = params;

    const cypher = `
      MATCH (tc:TopicCluster {tenant_id: $tenantId, project_id: $projectId})
      OPTIONAL MATCH (tc)-[:HAS_SATELLITE]->(satellite:KeywordTag)
      WITH tc, COLLECT(satellite.label) AS satellites
      RETURN tc.id AS id,
             tc.pillar_keyword AS pillarKeyword,
             satellites AS clusterKeywords
      ORDER BY tc.created_at DESC
    `;

    const rows = await this.conn.query<{
      id: string;
      pillarKeyword: string;
      clusterKeywords: string[];
    }>(cypher, { tenantId, projectId }, 'READ');

    return rows.map(r => ({
      pillarKeyword: r.pillarKeyword,
      clusterKeywords: r.clusterKeywords ?? [],
    }));
  }

  async getTopicClustersForSeoBrief(params: {
    tenantId: string;
    projectId: string;
    seoBriefId: string;
  }): Promise<TopicCluster[]> {
    const { tenantId, projectId, seoBriefId } = params;

    const cypher = `
      MATCH (sb:SeoBrief {id: $seoBriefId, tenant_id: $tenantId, project_id: $projectId})
      MATCH (sb)-[:DEFINES_CLUSTERS]->(tc:TopicCluster)
      OPTIONAL MATCH (tc)-[:HAS_SATELLITE]->(satellite:KeywordTag)
      WITH tc, COLLECT(satellite.label) AS satellites
      RETURN tc.id AS id,
             tc.pillar_keyword AS pillarKeyword,
             satellites AS clusterKeywords
      ORDER BY tc.created_at DESC
    `;

    const rows = await this.conn.query<{
      id: string;
      pillarKeyword: string;
      clusterKeywords: string[];
    }>(cypher, { tenantId, projectId, seoBriefId }, 'READ');

    return rows.map(r => ({
      pillarKeyword: r.pillarKeyword,
      clusterKeywords: r.clusterKeywords ?? [],
    }));
  }

  async getTopicClusterByPillar(params: {
    tenantId: string;
    projectId: string;
    pillarKeyword: string;
  }): Promise<TopicCluster | null> {
    const { tenantId, projectId, pillarKeyword } = params;

    const cypher = `
      MATCH (tc:TopicCluster {
        tenant_id: $tenantId,
        project_id: $projectId,
        pillar_keyword: $pillarKeyword
      })
      OPTIONAL MATCH (tc)-[:HAS_SATELLITE]->(satellite:KeywordTag)
      WITH tc, COLLECT(satellite.label) AS satellites
      RETURN tc.id AS id,
             tc.pillar_keyword AS pillarKeyword,
             satellites AS clusterKeywords
      LIMIT 1
    `;

    const rows = await this.conn.query<{
      id: string;
      pillarKeyword: string;
      clusterKeywords: string[];
    }>(cypher, { tenantId, projectId, pillarKeyword }, 'READ');

    if (rows.length === 0) return null;

    const r = rows[0];
    return {
      pillarKeyword: r.pillarKeyword,
      clusterKeywords: r.clusterKeywords ?? [],
    };
  }

  async getSatellitesForPillar(params: {
    tenantId: string;
    projectId: string;
    pillarKeyword: string;
  }): Promise<{ keyword: string; priority?: number }[]> {
    const { tenantId, projectId, pillarKeyword } = params;

    const cypher = `
      MATCH (tc:TopicCluster {
        tenant_id: $tenantId,
        project_id: $projectId,
        pillar_keyword: $pillarKeyword
      })
      MATCH (tc)-[r:HAS_SATELLITE]->(satellite:KeywordTag)
      RETURN satellite.label AS keyword,
             satellite.priority AS priority
      ORDER BY satellite.priority DESC
    `;

    const rows = await this.conn.query<{
      keyword: string;
      priority?: number;
    }>(cypher, { tenantId, projectId, pillarKeyword }, 'READ');

    return rows;
  }
}
