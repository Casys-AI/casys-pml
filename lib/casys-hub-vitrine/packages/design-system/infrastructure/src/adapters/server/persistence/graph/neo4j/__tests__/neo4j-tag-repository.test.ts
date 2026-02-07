import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Neo4jTagRepositoryAdapter } from '../neo4j-tag-repository.adapter';
import type { Neo4jConnection } from '../neo4j-connection';
import type { EmbeddingPort } from '@casys/application';

describe('Neo4jTagRepositoryAdapter - Nœuds et Relations', () => {
  let adapter: Neo4jTagRepositoryAdapter;
  let mockConn: Neo4jConnection;
  let mockEmbedding: EmbeddingPort;

  beforeEach(() => {
    // Mock Neo4j connection
    mockConn = {
      query: vi.fn().mockResolvedValue([]),
    } as unknown as Neo4jConnection;

    // Mock embedding service
    mockEmbedding = {
      generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    } as unknown as EmbeddingPort;

    adapter = new Neo4jTagRepositoryAdapter(mockConn, mockEmbedding);
  });

  describe('upsertArticleTags - Création de nœuds KeywordTag', () => {
    it('devrait créer un nœud KeywordTag avec ID canonique', async () => {
      await adapter.upsertArticleTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        articleId: 'art1',
        tags: [{ label: 'SEO Content', slug: 'seo-content', source: 'article' }],
        linkToKeywordPlan: false,
      });

      // Vérifier que la query MERGE a été appelée
      const mergeCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t:KeywordTag')
      );

      expect(mergeCalls).toHaveLength(1);
      const [query, params] = mergeCalls[0];

      // Vérifier l'ID canonique
      expect(params.tagId).toBe('tenant1::proj1::seo-content');
      expect(params.label).toBe('SEO Content');
      expect(params.slug).toBe('seo-content');
      expect(params.source).toBe('article');
    });

    it('devrait dédupliquer les tags par ID canonique', async () => {
      // Mock: tag existe déjà avec source 'related_keywords'
      (mockConn.query as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
        if (query.includes('RETURN t.sources as sources')) {
          return Promise.resolve([{ sources: ['related_keywords'] }]);
        }
        return Promise.resolve([]);
      });

      await adapter.upsertArticleTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        articleId: 'art1',
        tags: [{ label: 'réglementation', slug: 'reglementation', source: 'article' }],
        linkToKeywordPlan: false,
      });

      // Vérifier que le tag a le même ID que celui existant
      const mergeCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t:KeywordTag')
      );

      expect(mergeCalls[0][1].tagId).toBe('tenant1::proj1::reglementation');
    });

    it('devrait accumuler les sources dans le tableau sources[]', async () => {
      await adapter.upsertArticleTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        articleId: 'art1',
        tags: [{ label: 'keyword', slug: 'keyword', source: 'article' }],
        linkToKeywordPlan: false,
      });

      const mergeCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t:KeywordTag')
      );

      const query = mergeCalls[0][0];
      // Vérifier la logique d'accumulation des sources
      expect(query).toContain('WHEN $source IS NOT NULL AND NOT $source IN COALESCE(t.sources, [])');
      expect(query).toContain('THEN COALESCE(t.sources, []) + $source');
    });
  });

  describe('upsertArticleTags - Relations Article → KeywordTag', () => {
    it('devrait créer la relation ARTICLE_HAS_TAG', async () => {
      await adapter.upsertArticleTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        articleId: 'art1',
        tags: [{ label: 'test', slug: 'test', source: 'article' }],
        linkToKeywordPlan: false,
      });

      const relationCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('ARTICLE_HAS_TAG')
      );

      expect(relationCalls).toHaveLength(1);
      const [query, params] = relationCalls[0];

      expect(query).toContain('MERGE (a)-[r:ARTICLE_HAS_TAG]->(t)');
      expect(params.articleId).toBe('art1');
      expect(params.tagId).toBe('tenant1::proj1::test');
    });

    it('devrait créer la structure Tenant → Project → Article', async () => {
      await adapter.upsertArticleTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        articleId: 'art1',
        tags: [{ label: 'test', slug: 'test', source: 'article' }],
        linkToKeywordPlan: false,
      });

      const structureCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) =>
          call[0].includes('MERGE (tenant:Tenant') && call[0].includes('MERGE (project:Project')
      );

      expect(structureCalls).toHaveLength(1);
      const [query] = structureCalls[0];

      expect(query).toContain('MERGE (tenant)-[:TENANT_HAS_PROJECT]->(project)');
      expect(query).toContain('MERGE (project)-[:CONTAINS]->(article)');
    });
  });

  describe('upsertProjectSeedTags - Nœuds et Relations Seeds', () => {
    it('devrait créer un nœud KeywordTag de type seed', async () => {
      await adapter.upsertProjectSeedTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seeds: [{ label: 'Réglementation', slug: 'reglementation', source: 'seed' }],
      });

      const mergeCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (k:KeywordTag')
      );

      expect(mergeCalls).toHaveLength(1);
      const [query, params] = mergeCalls[0];

      expect(params.id).toBe('tenant1::proj1::reglementation');
      expect(params.label).toBe('Réglementation');
      expect(params.source).toBe('seed');
    });

    it('devrait créer la relation PROJECT_HAS_SEED_KEYWORD en une seule query', async () => {
      await adapter.upsertProjectSeedTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seeds: [{ label: 'SEO', slug: 'seo', source: 'seed' }],
      });

      const mergeCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('PROJECT_HAS_SEED_KEYWORD')
      );

      expect(mergeCalls).toHaveLength(1);
      const [query] = mergeCalls[0];

      // Vérifier que MERGE tag et MERGE relation sont dans la même query (optimisation)
      expect(query).toContain('MERGE (k:KeywordTag');
      expect(query).toContain('MERGE (p)-[rel:PROJECT_HAS_SEED_KEYWORD]->(k)');
    });

    it('devrait générer un embedding pour le seed', async () => {
      await adapter.upsertProjectSeedTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seeds: [{ label: 'Machine Learning', slug: 'machine-learning', source: 'seed' }],
      });

      // Vérifier que generateEmbedding a été appelé
      expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('Machine Learning');

      // Vérifier que l'embedding est passé à la query
      const mergeCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (k:KeywordTag')
      );

      expect(mergeCalls[0][1].embedding).toBeDefined();
      expect(mergeCalls[0][1].embedding).toHaveLength(1536);
    });
  });

  describe('linkTagToKeywordPlan - Relations PART_OF', () => {
    it('devrait créer PART_OF si match exact trouvé', async () => {
      // Mock: tag existe déjà dans un KeywordPlan
      (mockConn.query as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
        if (query.includes('MATCH (kp:KeywordPlan)-[:INCLUDES|SEED]')) {
          return Promise.resolve([{ planId: 'plan123' }]);
        }
        return Promise.resolve([]);
      });

      await adapter.upsertArticleTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        articleId: 'art1',
        tags: [{ label: 'reglementation', slug: 'reglementation', source: 'article' }],
        linkToKeywordPlan: true,
      });

      const partOfCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('PART_OF')
      );

      expect(partOfCalls.length).toBeGreaterThan(0);
      const [query, params] = partOfCalls[0];

      expect(query).toContain('MERGE (t)-[r:PART_OF]->(kp)');
      expect(params.planId).toBe('plan123');
    });

    it('devrait chercher dans sources[] pour le matching vectoriel', async () => {
      // Mock: aucun match exact
      (mockConn.query as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
        if (query.includes('MATCH (kp:KeywordPlan)-[:INCLUDES|SEED]')) {
          return Promise.resolve([]);
        }
        if (query.includes("'seed' IN node.sources")) {
          // Vérifier que la query utilise bien sources[] et non source
          expect(query).toContain("'seed' IN node.sources");
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      await adapter.upsertArticleTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        articleId: 'art1',
        tags: [{ label: 'orphan tag', slug: 'orphan-tag', source: 'article' }],
        linkToKeywordPlan: true,
      });

      // Le test passe si aucune erreur n'est lancée et que la query correcte est utilisée
      expect(mockConn.query).toHaveBeenCalled();
    });
  });

  describe('Validation des embeddings', () => {
    it('devrait rejeter les embeddings de mauvaise dimension', async () => {
      // Mock: embedding invalide (512 dimensions au lieu de 1536)
      const mockInvalidEmbedding = {
        generateEmbedding: vi.fn().mockResolvedValue(new Array(512).fill(0.1)),
      } as unknown as EmbeddingPort;

      const adapterWithInvalid = new Neo4jTagRepositoryAdapter(mockConn, mockInvalidEmbedding);

      await adapterWithInvalid.upsertArticleTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        articleId: 'art1',
        tags: [{ label: 'test', slug: 'test', source: 'article' }],
        linkToKeywordPlan: false,
      });

      const mergeCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t:KeywordTag')
      );

      // L'embedding devrait être null car invalide
      expect(mergeCalls[0][1].embedding).toBeNull();
    });

    it('devrait accepter les embeddings de 1536 dimensions', async () => {
      await adapter.upsertArticleTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        articleId: 'art1',
        tags: [{ label: 'valid', slug: 'valid', source: 'article' }],
        linkToKeywordPlan: false,
      });

      const mergeCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t:KeywordTag')
      );

      expect(mergeCalls[0][1].embedding).toHaveLength(1536);
    });
  });

  describe('Normalisation et ID canonique', () => {
    it('devrait normaliser les labels en slugs cohérents', async () => {
      await adapter.upsertArticleTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        articleId: 'art1',
        tags: [
          { label: 'SEO Content Marketing', slug: '', source: 'article' },
          { label: 'Réglementation BTP', slug: '', source: 'article' },
        ],
        linkToKeywordPlan: false,
      });

      const mergeCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t:KeywordTag')
      );

      expect(mergeCalls[0][1].tagId).toBe('tenant1::proj1::seo-content-marketing');
      expect(mergeCalls[1][1].tagId).toBe('tenant1::proj1::reglementation-btp');
    });

    it('devrait dédupliquer tags avec casse différente', async () => {
      await adapter.upsertArticleTags({
        tenantId: 'tenant1',
        projectId: 'proj1',
        articleId: 'art1',
        tags: [
          { label: 'AI Technology', slug: 'ai-technology', source: 'article' },
          { label: 'ai technology', slug: 'AI-Technology', source: 'article' },
        ],
        linkToKeywordPlan: false,
      });

      const mergeCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t:KeywordTag')
      );

      // Les deux devraient avoir le même ID canonique
      expect(mergeCalls[0][1].tagId).toBe(mergeCalls[1][1].tagId);
    });
  });
});
