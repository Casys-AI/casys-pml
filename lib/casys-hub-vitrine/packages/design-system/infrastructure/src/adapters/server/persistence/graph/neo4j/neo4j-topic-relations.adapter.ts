import type {
  LinkSectionToTopicParams,
  LinkTopicToKeywordPlanParams,
  TopicRelationsPort,
} from '@casys/application';

import { type Neo4jConnection } from './neo4j-connection';

export class Neo4jTopicRelationsAdapter implements TopicRelationsPort {
  constructor(private readonly conn: Neo4jConnection) {}

  async linkTopicToKeywordPlan(params: LinkTopicToKeywordPlanParams): Promise<void> {
    const { tenantId, projectId, topicId, keywordNormalized } = params;
    const cypher = `
      MATCH (t:Topic { id: $topicId, tenant_id: $tenantId, project_id: $projectId })
      MATCH (k:KeywordPlan { normalized: $normalized, tenant_id: $tenantId, project_id: $projectId })
      MERGE (t)-[:TOPIC_HAS_KEYWORD_PLAN]->(k)
    `;
    await this.conn.query(
      cypher,
      { tenantId, projectId, topicId, normalized: keywordNormalized },
      'WRITE'
    );
  }

  async linkSectionToTopic(params: LinkSectionToTopicParams): Promise<void> {
    const { tenantId, projectId, sectionId, topicId, articleId } = params;
    const cypher = `
      MERGE (a:Article { id: $articleId, tenant_id: $tenantId, project_id: $projectId })
      MERGE (s:Section { id: $sectionId })
      ON CREATE SET s.created_at = timestamp()
      SET s.article_id = COALESCE(s.article_id, $articleId)
      WITH a, s
      MATCH (t:Topic { id: $topicId, tenant_id: $tenantId, project_id: $projectId })
      MERGE (s)-[:BASED_ON]->(t)
      MERGE (a)-[:HAS_SECTION]->(s)
    `;
    await this.conn.query(cypher, { tenantId, projectId, sectionId, topicId, articleId }, 'WRITE');
  }
}
