import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Neo4jTopicRelationsAdapter } from '../neo4j-topic-relations.adapter';
import type { Neo4jConnection } from '../neo4j-connection';

describe('Neo4jTopicRelationsAdapter', () => {
  let adapter: Neo4jTopicRelationsAdapter;
  let mockConn: Neo4jConnection;

  beforeEach(() => {
    mockConn = {
      query: vi.fn().mockResolvedValue([]),
    } as unknown as Neo4jConnection;

    adapter = new Neo4jTopicRelationsAdapter(mockConn);
  });

  describe('linkTopicToKeywordPlan', () => {
    it('devrait créer la relation Topic -> KeywordPlan', async () => {
      await adapter.linkTopicToKeywordPlan({
        tenantId: 'tenant1',
        projectId: 'proj1',
        topicId: 'topic123',
        keywordNormalized: 'seo content',
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MATCH (t:Topic { id: $topicId, tenant_id: $tenantId, project_id: $projectId })');
      expect(query).toContain('MATCH (k:KeywordPlan { normalized: $normalized, tenant_id: $tenantId, project_id: $projectId })');
      expect(query).toContain('MERGE (t)-[:TOPIC_HAS_KEYWORD_PLAN]->(k)');

      expect(params.tenantId).toBe('tenant1');
      expect(params.projectId).toBe('proj1');
      expect(params.topicId).toBe('topic123');
      expect(params.normalized).toBe('seo content');
    });
  });

  describe('linkSectionToTopic', () => {
    it('devrait créer la relation Section BASED_ON Topic', async () => {
      await adapter.linkSectionToTopic({
        tenantId: 'tenant1',
        projectId: 'proj1',
        sectionId: 'article123::1',
        topicId: 'topic456',
        articleId: 'article123',
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MERGE (a:Article { id: $articleId, tenant_id: $tenantId, project_id: $projectId })');
      expect(query).toContain('MERGE (s:Section { id: $sectionId })');
      expect(query).toContain('MATCH (t:Topic { id: $topicId, tenant_id: $tenantId, project_id: $projectId })');
      expect(query).toContain('MERGE (s)-[:BASED_ON]->(t)');
      expect(query).toContain('MERGE (a)-[:HAS_SECTION]->(s)');

      expect(params.sectionId).toBe('article123::1');
      expect(params.topicId).toBe('topic456');
      expect(params.articleId).toBe('article123');
      expect(params.tenantId).toBe('tenant1');
      expect(params.projectId).toBe('proj1');
    });

    it('devrait créer la section si elle n\'existe pas', async () => {
      await adapter.linkSectionToTopic({
        tenantId: 'tenant1',
        projectId: 'proj1',
        sectionId: 'article123::1',
        topicId: 'topic456',
        articleId: 'article123',
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query] = calls[calls.length - 1];

      expect(query).toContain('ON CREATE SET s.created_at = timestamp()');
      expect(query).toContain('SET s.article_id = COALESCE(s.article_id, $articleId)');
    });
  });
});
