import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Neo4jSeoBriefStoreAdapter } from '../neo4j-seo-brief-store.adapter';
import type { Neo4jConnection } from '../neo4j-connection';
import type { EmbeddingPort } from '@casys/application';
import type { Logger } from '../../../../../../utils/logger';
import type { SeoBriefDataV3 } from '@casys/core';

// Helper pour créer des mocks SeoBriefDataV3
function makeSeoBriefDataV3(partial?: Partial<SeoBriefDataV3>): SeoBriefDataV3 {
  return {
    keywordTags: [],
    searchIntent: {
      intent: 'informational',
      confidence: 0.8,
      supportingQueries: [],
    },
    contentStrategy: {
      topicClusters: [],
      recommendations: { seo: [], editorial: [], technical: [] },
    },
    competitiveAnalysis: {
      contentGaps: [],
      competitorTitles: [],
    },
    ...partial,
  };
}

describe('Neo4jSeoBriefStoreAdapter', () => {
  let adapter: Neo4jSeoBriefStoreAdapter;
  let mockConn: Neo4jConnection;
  let mockLogger: Logger;
  let mockEmbedding: EmbeddingPort;

  beforeEach(() => {
    // Mock Neo4j connection
    mockConn = {
      query: vi.fn().mockResolvedValue([]),
    } as unknown as Neo4jConnection;

    // Mock logger
    mockLogger = {
      log: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;

    // Mock embedding service
    mockEmbedding = {
      generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    } as unknown as EmbeddingPort;

    adapter = new Neo4jSeoBriefStoreAdapter(mockConn, mockLogger, mockEmbedding);
  });

  describe('saveSeoBriefForProject - Création du nœud SeoBrief', () => {
    it('devrait créer un nœud SeoBrief avec les données complètes', async () => {
      const seoBriefData = makeSeoBriefDataV3({
        keywordTags: [
          {
            label: 'SEO Content',
            slug: 'seo-content',
            source: 'opportunity' as const,
            priority: 1,
            opportunityScore: 85,
            clusterType: 'pillar',
            searchVolume: 1000,
            difficulty: 45,
            cpc: 2.5,
            competition: 0.6,
            lowTopOfPageBid: 1.5,
            highTopOfPageBid: 3.5,
          },
        ],
        searchIntent: {
          intent: 'informational',
          confidence: 0.9,
          supportingQueries: ['What is SEO?', 'How to optimize content?'],
        },
        contentStrategy: {
          topicClusters: [{ pillar: 'SEO', satellites: ['Content', 'Technical'] } as any],
          recommendations: {
            seo: ['Add meta descriptions', 'Optimize headings'],
            editorial: ['Use examples', 'Add visuals'],
            technical: [],
          },
        },
        competitiveAnalysis: {
          contentGaps: [{ gap: 'Missing technical SEO section', priority: 'high' } as any],
          competitorTitles: [],
        },
      });

      const result = await adapter.saveSeoBriefForProject({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefData,
      });

      // Vérifier que la query MERGE SeoBrief a été appelée
      const mergeCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (b:SeoBrief')
      );

      expect(mergeCalls).toHaveLength(1);
      const [query, params] = mergeCalls[0];

      // Vérifier l'ID du SeoBrief
      expect(params.id).toBe('seobrief_tenant1_proj1');
      expect(result.seoBriefId).toBe('seobrief_tenant1_proj1');

      // Vérifier les données du SeoBrief (v3 extraction)
      expect(params.tenantId).toBe('tenant1');
      expect(params.projectId).toBe('proj1');
      expect(params.userQuestions).toEqual(seoBriefData.searchIntent.supportingQueries);
      expect(params.seoRecommendations).toEqual(seoBriefData.contentStrategy.recommendations.seo);
      expect(params.searchIntent).toBe('informational');
      expect(params.searchConfidence).toBe(0.9);

      // Vérifier que les champs structurés sont sérialisés en JSON
      expect(params.contentGapsJson).toBe(JSON.stringify(seoBriefData.competitiveAnalysis.contentGaps));
      expect(params.topicClustersJson).toBe(JSON.stringify(seoBriefData.contentStrategy.topicClusters));
      expect(params.contentRecommendationsJson).toBe(
        JSON.stringify(seoBriefData.contentStrategy.recommendations)
      );
    });

    it('devrait gérer les champs optionnels absents', async () => {
      const minimalData = makeSeoBriefDataV3({
        keywordTags: [],
      });

      await adapter.saveSeoBriefForProject({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefData: minimalData,
      });

      const mergeCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (b:SeoBrief')
      );

      const [, params] = mergeCalls[0];

      // Vérifier les valeurs par défaut (v3)
      expect(params.userQuestions).toEqual([]); // searchIntent.supportingQueries par défaut
      expect(params.seoRecommendations).toEqual([]); // contentStrategy.recommendations.seo par défaut
      expect(params.searchIntent).toBe('informational'); // searchIntent.intent par défaut
      expect(params.searchConfidence).toBe(0.8); // searchIntent.confidence par défaut dans makeSeoBriefDataV3
    });
  });

  describe('saveSeoBriefForProject - KeywordTag avec métriques SEO', () => {
    it('devrait créer un KeywordTag avec ID canonique et toutes les métriques', async () => {
      const seoBriefData = makeSeoBriefDataV3({
        keywordTags: [
          {
            label: 'Machine Learning',
            slug: 'machine-learning',
            source: 'opportunity' as const,
            priority: 1,
            opportunityScore: 92,
            clusterType: 'pillar',
            searchVolume: 5000,
            difficulty: 68,
            cpc: 4.2,
            competition: 0.75,
            lowTopOfPageBid: 2.8,
            highTopOfPageBid: 6.5,
          },
        ],
      });

      await adapter.saveSeoBriefForProject({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefData,
      });

      // Vérifier que la query MERGE KeywordTag a été appelée
      const keywordTagCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (kt:KeywordTag')
      );

      expect(keywordTagCalls).toHaveLength(1);
      const [query, params] = keywordTagCalls[0];

      // Vérifier l'ID canonique
      expect(params.tagId).toBe('tenant1::proj1::machine-learning');
      expect(params.label).toBe('Machine Learning');
      expect(params.normalized).toBe('machine-learning');
      expect(params.source).toBe('opportunity');

      // Vérifier toutes les métriques SEO
      expect(params.priority).toBe(1);
      expect(params.opportunityScore).toBe(92);
      expect(params.clusterType).toBe('pillar');
      expect(params.searchVolume).toBe(5000);
      expect(params.difficulty).toBe(68);
      expect(params.cpc).toBe(4.2);
      expect(params.competition).toBe(0.75);
      expect(params.lowTopOfPageBid).toBe(2.8);
      expect(params.highTopOfPageBid).toBe(6.5);
    });

    it('devrait accumuler les sources dans le tableau sources[]', async () => {
      const seoBriefData = makeSeoBriefDataV3({
        keywordTags: [
          {
            label: 'SEO',
            slug: 'seo',
            source: 'opportunity' as const,
          },
        ],
      });

      await adapter.saveSeoBriefForProject({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefData,
      });

      const keywordTagCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (kt:KeywordTag')
      );

      const query = keywordTagCalls[0][0];

      // Vérifier la logique d'accumulation des sources
      expect(query).toContain('WHEN $source IS NOT NULL AND NOT $source IN COALESCE(kt.sources, [])');
      expect(query).toContain('THEN COALESCE(kt.sources, []) + $source');
      expect(query).toContain('ON CREATE SET kt.label = $label');
      expect(query).toContain('kt.sources = [$source]');
    });

    it('devrait générer un embedding pour le KeywordTag', async () => {
      const seoBriefData = makeSeoBriefDataV3({
        keywordTags: [
          {
            label: 'Artificial Intelligence',
            slug: 'artificial-intelligence',
            source: 'opportunity' as const,
          },
        ],
      });

      await adapter.saveSeoBriefForProject({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefData,
      });

      // Vérifier que generateEmbedding a été appelé
      expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('Artificial Intelligence');

      // Vérifier que l'embedding est passé à la query
      const keywordTagCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (kt:KeywordTag')
      );

      expect(keywordTagCalls[0][1].embedding).toBeDefined();
      expect(keywordTagCalls[0][1].embedding).toHaveLength(1536);
    });

    it('devrait gérer les erreurs d\'embedding de manière non bloquante', async () => {
      // Mock embedding service qui échoue
      const failingEmbedding = {
        generateEmbedding: vi.fn().mockRejectedValue(new Error('Embedding service down')),
      } as unknown as EmbeddingPort;

      const adapterWithFailing = new Neo4jSeoBriefStoreAdapter(
        mockConn,
        mockLogger,
        failingEmbedding
      );

      const seoBriefData = makeSeoBriefDataV3({
        keywordTags: [
          {
            label: 'Test',
            slug: 'test',
            source: 'opportunity' as const,
          },
        ],
      });

      // Ne devrait pas throw
      await expect(
        adapterWithFailing.saveSeoBriefForProject({
          tenantId: 'tenant1',
          projectId: 'proj1',
          seoBriefData,
        })
      ).resolves.toBeDefined();

      // Vérifier que l'embedding est null
      const keywordTagCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (kt:KeywordTag')
      );

      expect(keywordTagCalls[0][1].embedding).toBeNull();
    });
  });

  describe('saveSeoBriefForProject - Relation HAS_KEYWORD', () => {
    it('devrait créer la relation SeoBrief -> KeywordTag', async () => {
      const seoBriefData = makeSeoBriefDataV3({
        keywordTags: [
          {
            label: 'Content Marketing',
            slug: 'content-marketing',
            source: 'opportunity' as const,
          },
        ],
      });

      await adapter.saveSeoBriefForProject({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefData,
      });

      const keywordTagCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('HAS_KEYWORD')
      );

      expect(keywordTagCalls).toHaveLength(1);
      const query = keywordTagCalls[0][0];

      // Vérifier la relation
      expect(query).toContain('MATCH (sb:SeoBrief { id: $seoBriefId })');
      expect(query).toContain('MERGE (sb)-[rel:HAS_KEYWORD]->(kt)');
      expect(query).toContain('ON CREATE SET rel.source = $source, rel.created_at = $now');
    });

    it('devrait traiter plusieurs KeywordTags', async () => {
      const seoBriefData = makeSeoBriefDataV3({
        keywordTags: [
          { label: 'SEO', slug: 'seo', source: 'opportunity' as const },
          { label: 'Content', slug: 'content', source: 'opportunity' as const },
          { label: 'Marketing', slug: 'marketing', source: 'opportunity' as const },
        ],
      });

      await adapter.saveSeoBriefForProject({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefData,
      });

      // Vérifier que 3 KeywordTags ont été créés
      const keywordTagCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (kt:KeywordTag')
      );

      expect(keywordTagCalls).toHaveLength(3);

      // Vérifier les IDs canoniques
      expect(keywordTagCalls[0][1].tagId).toBe('tenant1::proj1::seo');
      expect(keywordTagCalls[1][1].tagId).toBe('tenant1::proj1::content');
      expect(keywordTagCalls[2][1].tagId).toBe('tenant1::proj1::marketing');
    });

    it('devrait ignorer les tags avec label vide', async () => {
      const seoBriefData = makeSeoBriefDataV3({
        keywordTags: [
          { label: '', slug: 'empty', source: 'opportunity' as const },
          { label: '  ', slug: 'whitespace', source: 'opportunity' as const },
          { label: 'Valid', slug: 'valid', source: 'opportunity' as const },
        ],
      });

      await adapter.saveSeoBriefForProject({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefData,
      });

      // Seul le tag valide devrait être créé
      const keywordTagCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (kt:KeywordTag')
      );

      expect(keywordTagCalls).toHaveLength(1);
      expect(keywordTagCalls[0][1].label).toBe('Valid');
    });
  });

  describe('getSeoBriefForProject', () => {
    it('devrait récupérer un SeoBrief avec ses KeywordTags', async () => {
      // Mock: SeoBrief existe avec données
      (mockConn.query as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
        // Premier appel: récupérer le SeoBrief
        if (query.includes('MATCH (b:SeoBrief') && query.includes('tenant_id: $tenantId')) {
          return Promise.resolve([
            {
              userQuestions: ['Question 1', 'Question 2'],
              contentGapsJson: JSON.stringify([{ gap: 'Gap 1', priority: 'high' }]),
              topicClustersJson: JSON.stringify([{ pillar: 'Main', satellites: ['Sub1', 'Sub2'] }]),
              seoRecommendations: ['Rec 1', 'Rec 2'],
              searchIntent: 'informational',
              searchConfidence: 0.85,
              contentRecommendationsJson: JSON.stringify(['Content rec 1']),
              seoBriefId: 'seobrief_tenant1_proj1',
            },
          ]);
        }
        // Deuxième appel: récupérer les KeywordTags
        if (query.includes('HAS_KEYWORD') && query.includes('kt:KeywordTag')) {
          return Promise.resolve([
            { label: 'SEO', slug: 'seo', source: 'opportunity', sources: ['opportunity'] },
            {
              label: 'Content',
              slug: 'content',
              source: 'opportunity',
              sources: ['opportunity', 'editorial'],
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await adapter.getSeoBriefForProject({
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      expect(result).toBeDefined();
      expect(result?.keywordTags).toHaveLength(2);
      expect(result?.keywordTags[0]).toEqual({
        label: 'SEO',
        slug: 'seo',
        source: 'opportunity',
        sources: ['opportunity'],
      });
      // V3 structure assertions
      expect(result?.searchIntent.supportingQueries).toEqual(['Question 1', 'Question 2']);
      expect(result?.searchIntent.intent).toBe('informational');
      expect(result?.searchIntent.confidence).toBe(0.85);
    });

    it('devrait retourner null si aucun SeoBrief trouvé', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await adapter.getSeoBriefForProject({
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      expect(result).toBeNull();
    });

    it('devrait retourner null si seoBriefId est manquant', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          userQuestions: [],
          // seoBriefId manquant
        },
      ]);

      const result = await adapter.getSeoBriefForProject({
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      expect(result).toBeNull();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('seoBriefId manquant'),
        expect.any(Object)
      );
    });
  });

  describe('linkSeoBriefToProject', () => {
    it('devrait créer la relation Project -> SeoBrief', async () => {
      await adapter.linkSeoBriefToProject({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefId: 'brief123',
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MERGE (p:Project { id: $projectId })');
      expect(query).toContain('MERGE (b:SeoBrief { id: $seoBriefId })');
      expect(query).toContain('MERGE (p)-[:HAS_SEO_BRIEF]->(b)');
      expect(params.projectId).toBe('proj1');
      expect(params.seoBriefId).toBe('brief123');
    });
  });

  describe('linkSeoBriefToEditorialBrief', () => {
    it('devrait créer la relation SeoBrief -> EditorialBrief', async () => {
      await adapter.linkSeoBriefToEditorialBrief({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefId: 'seobrief123',
        briefId: 'editorialbrief456',
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MATCH (b:SeoBrief { id: $seoBriefId');
      expect(query).toContain('MATCH (e:EditorialBrief { id: $briefId');
      expect(query).toContain('MERGE (b)-[:INFORMS]->(e)');
      expect(params.seoBriefId).toBe('seobrief123');
      expect(params.briefId).toBe('editorialbrief456');
    });
  });

  describe('linkSeoBriefToKeywordPlans', () => {
    it('devrait créer les relations vers KeywordPlans', async () => {
      await adapter.linkSeoBriefToKeywordPlans({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefId: 'brief123',
        keywords: ['seo content', 'SEO Content', 'content marketing'],
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MATCH (b:SeoBrief { id: $seoBriefId');
      expect(query).toContain('MATCH (kp:KeywordPlan { normalized: norm');
      expect(query).toContain('MERGE (b)-[:SEO_BRIEF_USES_KEYWORD_PLAN]->(kp)');

      // Vérifier la déduplication (seo content et SEO Content devraient être le même)
      expect(params.norms).toEqual(['seo content', 'content marketing']);
    });

    it('ne devrait rien faire si aucun keyword fourni', async () => {
      await adapter.linkSeoBriefToKeywordPlans({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefId: 'brief123',
        keywords: [],
      });

      // Aucune query ne devrait être exécutée
      expect(mockConn.query).not.toHaveBeenCalled();
    });
  });

  describe('linkSeoBriefToBusinessContext', () => {
    it('devrait créer un BusinessContext et les relations', async () => {
      await adapter.linkSeoBriefToBusinessContext({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefId: 'brief123',
        businessContext: {
          targetAudience: 'Developers',
          industry: 'Technology',
          businessDescription: 'Software company',
          contentType: 'blog',
        },
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MERGE (bc:BusinessContext { id: $bcId })');
      expect(query).toContain('MERGE (p)-[rel:PROJECT_HAS_BUSINESS_CONTEXT]->(bc)');
      expect(query).toContain('MERGE (b)-[:SEO_BRIEF_USES_BUSINESS_CONTEXT]->(bc)');

      expect(params.bcId).toBe('bc_tenant1_proj1');
      expect(params.targetAudience).toBe('Developers');
      expect(params.industry).toBe('Technology');
      expect(params.businessDescription).toBe('Software company');
      expect(params.contentType).toBe('blog');
    });
  });

  describe('Normalisation et ID canonique', () => {
    it('devrait normaliser les slugs avec buildKeywordTagId', async () => {
      const seoBriefData = makeSeoBriefDataV3({
        keywordTags: [
          { label: 'SEO Content Marketing', slug: 'SEO Content Marketing', source: 'opportunity' as const },
          { label: 'Réglementation BTP', slug: 'reglementation-btp', source: 'opportunity' as const },
        ],
      });

      await adapter.saveSeoBriefForProject({
        tenantId: 'tenant1',
        projectId: 'proj1',
        seoBriefData,
      });

      const keywordTagCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (kt:KeywordTag')
      );

      // Vérifier que slugifyKeyword a été appliqué
      expect(keywordTagCalls[0][1].tagId).toBe('tenant1::proj1::seo-content-marketing');
      expect(keywordTagCalls[0][1].normalized).toBe('seo-content-marketing');

      expect(keywordTagCalls[1][1].tagId).toBe('tenant1::proj1::reglementation-btp');
      expect(keywordTagCalls[1][1].normalized).toBe('reglementation-btp');
    });
  });
});
