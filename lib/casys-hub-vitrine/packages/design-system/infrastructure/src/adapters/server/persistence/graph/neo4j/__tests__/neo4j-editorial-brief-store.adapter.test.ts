import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Neo4jEditorialBriefStoreAdapter } from '../neo4j-editorial-brief-store.adapter';
import type { Neo4jConnection } from '../neo4j-connection';
import type { EmbeddingPort } from '@casys/application';
import { EditorialBrief } from '@casys/core';
import neo4j from 'neo4j-driver';

describe('Neo4jEditorialBriefStoreAdapter', () => {
  let adapter: Neo4jEditorialBriefStoreAdapter;
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

    adapter = new Neo4jEditorialBriefStoreAdapter(mockConn, mockEmbedding);
  });

  describe('saveEditorialBrief - Création du nœud EditorialBrief', () => {
    it('devrait créer un nœud EditorialBrief avec embedding', async () => {
      const brief = EditorialBrief.create({
        id: 'brief123',
        tenantId: 'tenant1',
        projectId: 'proj1',
        language: 'fr',
        angle: 'Comment optimiser votre SEO en 2024',
        businessContext: {
          targetAudience: 'Marketing professionals',
          industry: 'Digital Marketing',
          businessDescription: 'SEO agency',
          contentType: 'blog',
        },
        corpusTopicIds: ['topic1', 'topic2'],
      });

      await adapter.saveEditorialBrief(brief);

      // Vérifier que la query MERGE EditorialBrief a été appelée
      const briefCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (e:EditorialBrief { id: $id })')
      );

      expect(briefCalls).toHaveLength(1);
      const [query, params] = briefCalls[0];

      // Vérifier les données du brief
      expect(params.id).toBe('brief123');
      expect(params.tenantId).toBe('tenant1');
      expect(params.projectId).toBe('proj1');
      expect(params.language).toBe('fr');
      expect(params.angle).toBe('Comment optimiser votre SEO en 2024');
      expect(params.corpusTopicIds).toEqual(['topic1', 'topic2']);

      // Vérifier que l'embedding a été généré
      expect(mockEmbedding.generateEmbedding).toHaveBeenCalled();
      expect(params.embedding).toBeDefined();
      expect(params.embeddingText).toBeDefined();
    });

    it('devrait gérer l\'échec de génération d\'embedding', async () => {
      // Mock embedding qui échoue
      const failingEmbedding = {
        generateEmbedding: vi.fn().mockRejectedValue(new Error('Embedding failed')),
      } as unknown as EmbeddingPort;

      const adapterWithFailing = new Neo4jEditorialBriefStoreAdapter(mockConn, failingEmbedding);

      const brief = EditorialBrief.create({
        id: 'brief123',
        tenantId: 'tenant1',
        projectId: 'proj1',
        language: 'en',
        angle: 'Test angle',
        businessContext: {
          targetAudience: 'Developers',
          industry: 'Tech',
          businessDescription: 'Software',
          contentType: 'blog',
        },
        corpusTopicIds: [],
      });

      // Ne devrait pas throw
      await expect(adapterWithFailing.saveEditorialBrief(brief)).resolves.toBeUndefined();

      // Vérifier que le brief a été sauvegardé même sans embedding
      const briefCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (e:EditorialBrief')
      );

      expect(briefCalls).toHaveLength(1);
      expect(briefCalls[0][1].embedding).toBeNull();
    });

    it('devrait sauvegarder sans embedding si service non fourni', async () => {
      const adapterWithoutEmbedding = new Neo4jEditorialBriefStoreAdapter(mockConn);

      const brief = EditorialBrief.create({
        id: 'brief123',
        tenantId: 'tenant1',
        projectId: 'proj1',
        language: 'en',
        angle: 'Test angle',
        businessContext: {
          targetAudience: 'Audience',
          industry: 'Industry',
          businessDescription: 'Description',
          contentType: 'blog',
        },
        corpusTopicIds: [],
      });

      await adapterWithoutEmbedding.saveEditorialBrief(brief);

      const briefCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (e:EditorialBrief')
      );

      expect(briefCalls[0][1].embedding).toBeNull();
    });
  });

  describe('saveEditorialBrief - BusinessContext', () => {
    it('devrait créer un BusinessContext centralisé par projet', async () => {
      const brief = EditorialBrief.create({
        id: 'brief123',
        tenantId: 'tenant1',
        projectId: 'proj1',
        language: 'en',
        angle: 'Test angle',
        businessContext: {
          targetAudience: 'Developers',
          industry: 'Technology',
          businessDescription: 'Software company',
          contentType: 'technical blog',
        },
        corpusTopicIds: [],
      });

      await adapter.saveEditorialBrief(brief);

      // Vérifier que BusinessContext a été créé
      const bcCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (bc:BusinessContext { id: $bcId })')
      );

      expect(bcCalls).toHaveLength(1);
      const [query, params] = bcCalls[0];

      // Vérifier l'ID du BusinessContext (centralisé par projet)
      expect(params.bcId).toBe('bc_tenant1_proj1');

      // Vérifier les données
      expect(params.targetAudience).toBe('Developers');
      expect(params.industry).toBe('Technology');
      expect(params.businessDescription).toBe('Software company');
      expect(params.contentType).toBe('technical blog');

      // Vérifier les relations
      expect(query).toContain('MERGE (p)-[rel:PROJECT_HAS_BUSINESS_CONTEXT]->(bc)');
      expect(query).toContain('MERGE (e)-[:BRIEF_USES_BUSINESS_CONTEXT { snapshot_at: $now }]->(bc)');
    });
  });

  describe('getEditorialBrief', () => {
    it('devrait récupérer un EditorialBrief complet', async () => {
      // Mock: EditorialBrief avec BusinessContext et SeoBrief
      (mockConn.query as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
        if (query.includes('MATCH (e:EditorialBrief') && query.includes('BRIEF_USES_BUSINESS_CONTEXT')) {
          return Promise.resolve([
            {
              id: 'brief123',
              tenantId: 'tenant1',
              projectId: 'proj1',
              language: 'fr',
              angle: 'Comment optimiser votre SEO',
              corpusTopicIds: ['topic1', 'topic2'],
              createdAt: Date.now(),
              targetAudience: 'Marketers',
              industry: 'Marketing',
              businessDescription: 'Agency',
              contentType: 'blog',
            },
          ]);
        }
        if (query.includes('MATCH (sb:SeoBrief)-[:INFORMS]->')) {
          return Promise.resolve([
            {
              seoBriefId: 'seobrief123',
              userQuestions: ['Question 1'],
              contentGaps: ['Gap 1'],
              seoRecommendations: ['Rec 1'],
              searchIntent: 'informational',
              searchConfidence: 0.9,
              contentRecommendations: ['Content rec 1'],
            },
          ]);
        }
        if (query.includes('USES_KEYWORD')) {
          return Promise.resolve([
            { label: 'SEO', slug: 'seo', source: 'editorial' },
            { label: 'Content', slug: 'content', source: 'editorial' },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await adapter.getEditorialBrief('brief123', 'tenant1', 'proj1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('brief123');
      expect(result?.angle.value).toBe('Comment optimiser votre SEO');
      expect(result?.language).toBe('fr');
      expect(result?.corpusTopicIds).toEqual(['topic1', 'topic2']);
      expect(result?.businessContext.targetAudience).toBe('Marketers');
    });

    it('devrait retourner null si aucun EditorialBrief trouvé', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await adapter.getEditorialBrief('brief123', 'tenant1', 'proj1');

      expect(result).toBeNull();
    });

    it('devrait retourner null si aucun SeoBrief lié', async () => {
      // Mock: EditorialBrief existe mais pas de SeoBrief
      (mockConn.query as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
        if (query.includes('MATCH (e:EditorialBrief')) {
          return Promise.resolve([
            {
              id: 'brief123',
              tenantId: 'tenant1',
              projectId: 'proj1',
              language: 'en',
              angle: 'Test',
              corpusTopicIds: [],
              createdAt: Date.now(),
              targetAudience: 'Audience',
              industry: 'Industry',
              businessDescription: 'Description',
              contentType: 'blog',
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await adapter.getEditorialBrief('brief123', 'tenant1', 'proj1');

      expect(result).toBeNull();
    });
  });

  describe('searchSimilarBriefs - Vector search', () => {
    it('devrait rechercher des briefs similaires via vector index', async () => {
      // Mock: vector search retourne des résultats
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'brief1',
          tenantId: 'tenant1',
          projectId: 'proj1',
          language: 'en',
          angle: 'Similar angle 1',
          corpusTopicIds: ['topic1'],
          createdAt: Date.now(),
          similarity: 0.85,
          articleId: 'article1',
          articleStatus: 'published',
          targetAudience: 'Developers',
          industry: 'Tech',
          businessDescription: 'Company',
          contentType: 'blog',
        },
        {
          id: 'brief2',
          tenantId: 'tenant1',
          projectId: 'proj1',
          language: 'en',
          angle: 'Similar angle 2',
          corpusTopicIds: ['topic2'],
          createdAt: Date.now(),
          similarity: 0.75,
          articleId: null,
          articleStatus: null,
          targetAudience: 'Marketers',
          industry: 'Marketing',
          businessDescription: 'Agency',
          contentType: 'blog',
        },
      ]);

      const results = await adapter.searchSimilarBriefs({
        queryText: 'How to optimize SEO',
        projectId: 'proj1',
        tenantId: 'tenant1',
        limit: 5,
        threshold: 0.6,
      });

      // Vérifier que l'embedding a été généré pour la query
      expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('How to optimize SEO');

      // Vérifier les résultats
      expect(results).toHaveLength(2);
      expect(results[0].brief.id).toBe('brief1');
      expect(results[0].similarityScore).toBe(0.85);
      expect(results[0].articleId).toBe('article1');
      expect(results[0].articleStatus).toBe('published');

      expect(results[1].brief.id).toBe('brief2');
      expect(results[1].similarityScore).toBe(0.75);
      expect(results[1].articleId).toBeUndefined();

      // Vérifier que la query utilise le vector index avec toInteger()
      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const vectorCall = calls.find((call) =>
        call[0].includes('db.index.vector.queryNodes(\'brief_embedding_index\'')
      );
      expect(vectorCall).toBeDefined();
      expect(vectorCall[0]).toContain('toInteger($limitCandidates)');
    });

    it('devrait filtrer par angle si fourni', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await adapter.searchSimilarBriefs({
        queryText: 'Test query',
        angle: 'Specific angle',
        projectId: 'proj1',
        tenantId: 'tenant1',
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [, params] = calls[calls.length - 1];

      expect(params.angle).toBe('Specific angle');
    });

    it('devrait retourner un tableau vide si pas d\'embedding service', async () => {
      const adapterWithoutEmbedding = new Neo4jEditorialBriefStoreAdapter(mockConn);

      const results = await adapterWithoutEmbedding.searchSimilarBriefs({
        queryText: 'Test query',
        projectId: 'proj1',
        tenantId: 'tenant1',
      });

      expect(results).toEqual([]);
    });

    it('devrait gérer les embeddings invalides', async () => {
      // Mock embedding avec valeurs invalides
      const invalidEmbedding = {
        generateEmbedding: vi
          .fn()
          .mockResolvedValue([NaN, Infinity, -Infinity, 0.1, 1e20, -1e20]),
      } as unknown as EmbeddingPort;

      const adapterWithInvalid = new Neo4jEditorialBriefStoreAdapter(mockConn, invalidEmbedding);

      const results = await adapterWithInvalid.searchSimilarBriefs({
        queryText: 'Test query',
        projectId: 'proj1',
        tenantId: 'tenant1',
      });

      expect(results).toEqual([]);
    });

    it('devrait utiliser limit et threshold corrects', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await adapter.searchSimilarBriefs({
        queryText: 'Test query',
        projectId: 'proj1',
        tenantId: 'tenant1',
        limit: 10,
        threshold: 0.8,
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('WHERE score >= $threshold');
      expect(params.threshold).toBe(0.8);

      // Vérifier que limit est un neo4j.int
      expect(params.limit.toNumber()).toBe(10);
      expect(params.limitCandidates.toNumber()).toBe(40); // limit * 4
    });
  });

  describe('linkBriefToArticle', () => {
    it('devrait créer la relation EditorialBrief -> Article', async () => {
      await adapter.linkBriefToArticle('brief123', 'article456', 'tenant1');

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MATCH (e:EditorialBrief { id: $briefId, tenant_id: $tenantId })');
      expect(query).toContain('MERGE (a:Article { id: $articleId })');
      expect(query).toContain('MERGE (e)-[:BRIEF_GENERATED_ARTICLE]->(a)');

      expect(params.briefId).toBe('brief123');
      expect(params.articleId).toBe('article456');
      expect(params.tenantId).toBe('tenant1');
    });
  });

  describe('linkBriefToKeywordPlans', () => {
    it('devrait créer les relations vers KeywordPlans', async () => {
      await adapter.linkBriefToKeywordPlans('brief123', ['plan1', 'plan2'], 'tenant1');

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;

      // Devrait avoir 2 appels (un par plan)
      const planCalls = calls.filter((call) => call[0].includes('USES_KEYWORD_PLAN'));
      expect(planCalls).toHaveLength(2);

      expect(planCalls[0][1].planId).toBe('plan1');
      expect(planCalls[1][1].planId).toBe('plan2');
    });

    it('ne devrait rien faire si aucun plan fourni', async () => {
      const callsBefore = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.length;

      await adapter.linkBriefToKeywordPlans('brief123', [], 'tenant1');

      const callsAfter = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(callsAfter).toBe(callsBefore);
    });
  });

  describe('hasBriefForArticle', () => {
    it('devrait retourner true si un brief existe pour l\'article', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'brief123' }]);

      const result = await adapter.hasBriefForArticle({
        tenantId: 'tenant1',
        articleId: 'article456',
      });

      expect(result).toBe(true);
    });

    it('devrait retourner false si aucun brief trouvé', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await adapter.hasBriefForArticle({
        tenantId: 'tenant1',
        articleId: 'article456',
      });

      expect(result).toBe(false);
    });
  });

  describe('getExistingAngles', () => {
    it('devrait récupérer les angles existants', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { angle: 'Angle 1' },
        { angle: 'Angle 2' },
        { angle: 'Angle 3' },
      ]);

      const angles = await adapter.getExistingAngles({
        projectId: 'proj1',
        tenantId: 'tenant1',
        limit: 20,
      });

      expect(angles).toEqual(['Angle 1', 'Angle 2', 'Angle 3']);

      // Vérifier que limit est un neo4j.int
      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [, params] = calls[calls.length - 1];
      expect(params.limit.toNumber()).toBe(20);
    });

    it('devrait filtrer les angles vides', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { angle: 'Angle 1' },
        { angle: '' },
        { angle: null },
        { angle: 'Angle 2' },
      ]);

      const angles = await adapter.getExistingAngles({
        projectId: 'proj1',
        tenantId: 'tenant1',
      });

      expect(angles).toEqual(['Angle 1', 'Angle 2']);
    });
  });

  describe('linkBriefToTopicClusters', () => {
    it('devrait créer les relations pillar et satellites avec KeywordTags', async () => {
      await adapter.linkBriefToTopicClusters({
        briefId: 'brief123',
        tenantId: 'tenant1',
        projectId: 'proj1',
        pillarTag: { label: 'SEO', slug: 'seo', source: 'editorial' },
        satelliteTags: [
          { label: 'Content Marketing', slug: 'content-marketing', source: 'editorial' },
          { label: 'Link Building', slug: 'link-building', source: 'editorial' },
        ],
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;

      // Vérifier la relation pillar
      const pillarCalls = calls.filter((call) => call[0].includes('BRIEF_COVERS_PILLAR'));
      expect(pillarCalls).toHaveLength(1);
      expect(pillarCalls[0][1].tagId).toBe('tenant1::proj1::seo');
      expect(pillarCalls[0][1].label).toBe('SEO');

      // Vérifier les relations satellites
      const satelliteCalls = calls.filter((call) => call[0].includes('BRIEF_COVERS_SATELLITE'));
      expect(satelliteCalls).toHaveLength(2);
      expect(satelliteCalls[0][1].tagId).toBe('tenant1::proj1::content-marketing');
      expect(satelliteCalls[1][1].tagId).toBe('tenant1::proj1::link-building');
    });

    it('devrait gérer l\'absence de pillar', async () => {
      await adapter.linkBriefToTopicClusters({
        briefId: 'brief123',
        tenantId: 'tenant1',
        projectId: 'proj1',
        satelliteTags: [{ label: 'Tag 1', slug: 'tag-1', source: 'editorial' }],
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;

      // Pas de relation pillar
      const pillarCalls = calls.filter((call) => call[0].includes('BRIEF_COVERS_PILLAR'));
      expect(pillarCalls).toHaveLength(0);

      // Mais les satellites existent
      const satelliteCalls = calls.filter((call) => call[0].includes('BRIEF_COVERS_SATELLITE'));
      expect(satelliteCalls).toHaveLength(1);
    });

    it('devrait normaliser les slugs avec buildKeywordTagId', async () => {
      await adapter.linkBriefToTopicClusters({
        briefId: 'brief123',
        tenantId: 'tenant1',
        projectId: 'proj1',
        pillarTag: { label: 'Content Marketing Strategy', slug: 'Content Marketing Strategy' },
        satelliteTags: [],
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const pillarCall = calls.find((call) => call[0].includes('BRIEF_COVERS_PILLAR'));

      // Vérifier que le slug a été normalisé
      expect(pillarCall[1].tagId).toBe('tenant1::proj1::content-marketing-strategy');
      expect(pillarCall[1].slug).toBe('content-marketing-strategy');
    });
  });

  describe('getEditorialBriefsForSeoBrief - Graph RAG relation-based', () => {
    it('devrait récupérer les briefs liés via relation [:INFORMS]', async () => {
      // Mock: SeoBrief → EditorialBriefs avec BusinessContext et KeywordTags
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'brief1',
          tenantId: 'tenant1',
          projectId: 'proj1',
          language: 'fr',
          angle: 'Guide complet du SEO technique en 2024',
          corpusTopicIds: ['topic1', 'topic2'],
          createdAt: 1704067200000, // 2024-01-01
          targetAudience: 'Développeurs',
          industry: 'Tech',
          businessDescription: 'Plateforme SaaS',
          contentType: 'guide',
          siteType: 'blog',
          keywords: [
            { label: 'SEO technique', slug: 'seo-technique', source: 'editorial' },
            { label: 'Core Web Vitals', slug: 'core-web-vitals', source: 'editorial' },
          ],
        },
        {
          id: 'brief2',
          tenantId: 'tenant1',
          projectId: 'proj1',
          language: 'fr',
          angle: 'Les meilleurs outils SEO pour 2024',
          corpusTopicIds: ['topic3'],
          createdAt: 1703894400000, // 2023-12-30
          targetAudience: 'Marketers',
          industry: 'Marketing',
          businessDescription: 'Agence SEO',
          contentType: 'liste',
          siteType: undefined,
          keywords: [{ label: 'outils SEO', slug: 'outils-seo', source: 'editorial' }],
        },
      ]);

      const results = await adapter.getEditorialBriefsForSeoBrief({
        seoBriefId: 'seobrief_tenant1_proj1',
        tenantId: 'tenant1',
        projectId: 'proj1',
        limit: 10,
      });

      // Vérifier la query Cypher
      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MATCH (sb:SeoBrief { id: $seoBriefId })-[:INFORMS]->(eb:EditorialBrief)');
      expect(query).toContain('WHERE eb.tenant_id = $tenantId AND eb.project_id = $projectId');
      expect(query).toContain('OPTIONAL MATCH (eb)-[:BRIEF_USES_BUSINESS_CONTEXT]->(bc:BusinessContext)');
      expect(query).toContain('OPTIONAL MATCH (eb)-[:USES_KEYWORD]->(kt:KeywordTag)');
      expect(query).toContain('collect(DISTINCT kt)');
      expect(query).toContain('ORDER BY eb.created_at DESC');
      expect(query).toContain('LIMIT $limit');

      // Vérifier les params
      expect(params.seoBriefId).toBe('seobrief_tenant1_proj1');
      expect(params.tenantId).toBe('tenant1');
      expect(params.projectId).toBe('proj1');
      expect(params.limit.toNumber()).toBe(10);

      // Vérifier les résultats
      expect(results).toHaveLength(2);

      // Brief 1
      expect(results[0].id).toBe('brief1');
      expect(results[0].angle.value).toBe('Guide complet du SEO technique en 2024');
      expect(results[0].language).toBe('fr');
      expect(results[0].businessContext.targetAudience).toBe('Développeurs');
      expect(results[0].businessContext.industry).toBe('Tech');
      expect(results[0].businessContext.contentType).toBe('guide');
      expect(results[0].businessContext.siteType).toBe('blog');
      expect(results[0].keywordTags).toHaveLength(2);
      expect(results[0].keywordTags[0].label).toBe('SEO technique');
      expect(results[0].corpusTopicIds).toEqual(['topic1', 'topic2']);

      // Brief 2
      expect(results[1].id).toBe('brief2');
      expect(results[1].angle.value).toBe('Les meilleurs outils SEO pour 2024');
      expect(results[1].keywordTags).toHaveLength(1);
      expect(results[1].businessContext.siteType).toBeUndefined();
    });

    it('devrait retourner un tableau vide si aucun brief trouvé', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const results = await adapter.getEditorialBriefsForSeoBrief({
        seoBriefId: 'seobrief_nonexistent',
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      expect(results).toEqual([]);
    });

    it('devrait utiliser la limite par défaut de 10 si non fournie', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await adapter.getEditorialBriefsForSeoBrief({
        seoBriefId: 'seobrief_tenant1_proj1',
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [, params] = calls[calls.length - 1];

      expect(params.limit.toNumber()).toBe(10);
    });

    it('devrait créer des EditorialBrief partiels sans seoBrief (pattern ligne 431)', async () => {
      // Mock: Brief minimal sans BusinessContext ni KeywordTags
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'brief_minimal',
          tenantId: 'tenant1',
          projectId: 'proj1',
          language: 'en',
          angle: 'Minimal brief',
          corpusTopicIds: [],
          createdAt: Date.now(),
          targetAudience: null,
          industry: null,
          businessDescription: null,
          contentType: null,
          siteType: null,
          keywords: [],
        },
      ]);

      const results = await adapter.getEditorialBriefsForSeoBrief({
        seoBriefId: 'seobrief_tenant1_proj1',
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      expect(results).toHaveLength(1);

      // Vérifier que le brief est créé avec des valeurs par défaut défensives
      const brief = results[0];
      expect(brief.id).toBe('brief_minimal');
      expect(brief.angle.value).toBe('Minimal brief');
      expect(brief.businessContext.targetAudience).toBe('Unknown'); // Fallback défensif
      expect(brief.businessContext.industry).toBe('Unknown'); // Fallback défensif
      expect(brief.businessContext.businessDescription).toBe('No description'); // Fallback défensif
      expect(brief.businessContext.contentType).toBe('');
      expect(brief.keywordTags).toEqual([]);

      // CRITIQUE: Vérifier que seoBrief n'est PAS présent (pattern validé ligne 431)
      expect(brief).not.toHaveProperty('seoBrief');
    });

    it('devrait gérer les KeywordTags avec sources diverses', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'brief_tags',
          tenantId: 'tenant1',
          projectId: 'proj1',
          language: 'fr',
          angle: 'Brief avec tags variés',
          corpusTopicIds: [],
          createdAt: Date.now(),
          targetAudience: 'Audience',
          industry: 'Industry',
          businessDescription: 'Description',
          contentType: 'blog',
          keywords: [
            { label: 'Tag Editorial', slug: 'tag-editorial', source: 'editorial' },
            { label: 'Tag Seed', slug: 'tag-seed', source: 'seed' },
            { label: 'Tag Sans Source', slug: 'tag-sans-source' }, // Pas de source
          ],
        },
      ]);

      const results = await adapter.getEditorialBriefsForSeoBrief({
        seoBriefId: 'seobrief_tenant1_proj1',
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      const tags = results[0].keywordTags;
      expect(tags).toHaveLength(3);
      expect(tags[0].source).toBe('editorial');
      expect(tags[1].source).toBe('seed');
      expect(tags[2].source).toBe('editorial'); // Fallback par défaut
    });

    it('devrait gérer les timestamps en nombre ou string', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'brief_timestamp_number',
          tenantId: 'tenant1',
          projectId: 'proj1',
          language: 'en',
          angle: 'Brief timestamp number',
          corpusTopicIds: [],
          createdAt: 1704067200000, // Number
          targetAudience: 'Valid Audience', // Valeurs valides requises
          industry: 'Valid Industry',
          businessDescription: 'Valid Description',
          contentType: '',
          keywords: [],
        },
        {
          id: 'brief_timestamp_string',
          tenantId: 'tenant1',
          projectId: 'proj1',
          language: 'en',
          angle: 'Brief timestamp string',
          corpusTopicIds: [],
          createdAt: '2024-01-01T00:00:00.000Z', // String ISO
          targetAudience: 'Valid Audience', // Valeurs valides requises
          industry: 'Valid Industry',
          businessDescription: 'Valid Description',
          contentType: '',
          keywords: [],
        },
      ]);

      const results = await adapter.getEditorialBriefsForSeoBrief({
        seoBriefId: 'seobrief_tenant1_proj1',
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      expect(results).toHaveLength(2);

      // Vérifier que les deux timestamps sont en format ISO string
      expect(results[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(results[1].createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('devrait filtrer par tenant et project correctement', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await adapter.getEditorialBriefsForSeoBrief({
        seoBriefId: 'seobrief_tenant2_proj2',
        tenantId: 'tenant2',
        projectId: 'proj2',
        limit: 5,
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      // Vérifier que la query filtre bien par tenant et project
      expect(query).toContain('WHERE eb.tenant_id = $tenantId AND eb.project_id = $projectId');
      expect(params.tenantId).toBe('tenant2');
      expect(params.projectId).toBe('proj2');
      expect(params.limit.toNumber()).toBe(5);
    });
  });

  describe('V3.1 Section Constraints Persistence', () => {
    it('devrait sauvegarder et lire les contraintes structurelles', async () => {
      const brief = EditorialBrief.create({
        id: 'brief_constraints',
        tenantId: 'tenant1',
        projectId: 'proj1',
        language: 'fr',
        angle: 'Test angle with constraints',
        businessContext: {
          targetAudience: 'Developers',
          industry: 'Tech',
          businessDescription: 'Test business',
          contentType: 'article',
        },
        corpusTopicIds: ['topic1'],
        keywordTags: [{ label: 'test', slug: 'test', source: 'opportunity' }],
        // V3.1: Contraintes structurelles
        targetSectionsCount: 7,
        targetCharsPerSection: 1200,
      });

      await adapter.saveEditorialBrief(brief);

      // Vérifier que save a bien utilisé neo4j.int()
      const saveCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const saveCall = saveCalls.find((call) =>
        call[0].includes('MERGE (e:EditorialBrief')
      );
      expect(saveCall).toBeDefined();
      expect(saveCall![1].targetSectionsCount).toBeDefined();
      expect(saveCall![1].targetCharsPerSection).toBeDefined();

      // Mock la lecture avec Neo4j Integer types
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'brief_constraints',
          tenantId: 'tenant1',
          projectId: 'proj1',
          language: 'fr',
          angle: 'Test angle with constraints',
          targetSectionsCount: neo4j.int(7), // Neo4j Integer
          targetCharsPerSection: neo4j.int(1200), // Neo4j Integer
          createdAt: new Date().toISOString(),
          keywordTags: [{ label: 'test', slug: 'test', source: 'opportunity' }],
          targetAudience: 'Developers',
          industry: 'Tech',
          businessDescription: 'Test business',
          contentType: 'article',
          corpusTopicIds: ['topic1'],
        },
      ]);

      const retrieved = await adapter.getEditorialBrief(
        'brief_constraints',
        'tenant1',
        'proj1'
      );

      expect(retrieved).toBeDefined();
      expect(retrieved!.targetSectionsCount).toBe(7); // Converti en number
      expect(retrieved!.targetCharsPerSection).toBe(1200); // Converti en number
    });

    it('devrait gérer les contraintes undefined (optionnelles)', async () => {
      const brief = EditorialBrief.create({
        id: 'brief_no_constraints',
        tenantId: 'tenant1',
        projectId: 'proj1',
        language: 'fr',
        angle: 'Test angle without constraints',
        businessContext: {
          targetAudience: 'Developers',
          industry: 'Tech',
          businessDescription: 'Test business',
          contentType: 'article',
        },
        corpusTopicIds: ['topic1'],
        keywordTags: [{ label: 'test', slug: 'test', source: 'opportunity' }],
        // V3.1: Pas de contraintes spécifiées (undefined)
      });

      await adapter.saveEditorialBrief(brief);

      // Vérifier que save a bien passé null pour les contraintes absentes
      const saveCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const saveCall = saveCalls.find((call) =>
        call[0].includes('MERGE (e:EditorialBrief')
      );
      expect(saveCall).toBeDefined();
      expect(saveCall![1].targetSectionsCount).toBeNull();
      expect(saveCall![1].targetCharsPerSection).toBeNull();

      // Mock la lecture avec NULL values
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'brief_no_constraints',
          tenantId: 'tenant1',
          projectId: 'proj1',
          language: 'fr',
          angle: 'Test angle without constraints',
          targetSectionsCount: null,
          targetCharsPerSection: null,
          createdAt: new Date().toISOString(),
          keywordTags: [{ label: 'test', slug: 'test', source: 'opportunity' }],
          targetAudience: 'Developers',
          industry: 'Tech',
          businessDescription: 'Test business',
          contentType: 'article',
          corpusTopicIds: ['topic1'],
        },
      ]);

      const retrieved = await adapter.getEditorialBrief(
        'brief_no_constraints',
        'tenant1',
        'proj1'
      );

      expect(retrieved).toBeDefined();
      expect(retrieved!.targetSectionsCount).toBeUndefined();
      expect(retrieved!.targetCharsPerSection).toBeUndefined();
    });

    it('devrait gérer la conversion des types Neo4j Integer mixtes', async () => {
      // Mock avec différents types de retour (Neo4j Integer vs number)
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'brief_mixed_types',
          tenantId: 'tenant1',
          projectId: 'proj1',
          language: 'fr',
          angle: 'Test angle',
          targetSectionsCount: neo4j.int(9), // Neo4j Integer
          targetCharsPerSection: 1500, // JavaScript number (fallback)
          createdAt: new Date().toISOString(),
          keywordTags: [{ label: 'test', slug: 'test', source: 'opportunity' }],
          targetAudience: 'Developers',
          industry: 'Tech',
          businessDescription: 'Test business',
          contentType: 'article',
          corpusTopicIds: ['topic1'],
        },
      ]);

      const retrieved = await adapter.getEditorialBrief(
        'brief_mixed_types',
        'tenant1',
        'proj1'
      );

      expect(retrieved).toBeDefined();
      // Les deux doivent être convertis en number JavaScript
      expect(typeof retrieved!.targetSectionsCount).toBe('number');
      expect(typeof retrieved!.targetCharsPerSection).toBe('number');
      expect(retrieved!.targetSectionsCount).toBe(9);
      expect(retrieved!.targetCharsPerSection).toBe(1500);
    });

    it('devrait sauvegarder les contraintes dans getEditorialBriefsForSeoBrief', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'brief1',
          tenantId: 'tenant1',
          projectId: 'proj1',
          language: 'fr',
          angle: 'Brief with constraints',
          targetSectionsCount: neo4j.int(8),
          targetCharsPerSection: neo4j.int(1000),
          createdAt: new Date().toISOString(),
          targetAudience: 'Developers',
          industry: 'Tech',
          businessDescription: 'Test business',
          contentType: 'article',
          corpusTopicIds: [],
          keywords: [],
        },
        {
          id: 'brief2',
          tenantId: 'tenant1',
          projectId: 'proj1',
          language: 'fr',
          angle: 'Brief without constraints',
          targetSectionsCount: null,
          targetCharsPerSection: null,
          createdAt: new Date().toISOString(),
          targetAudience: 'Developers',
          industry: 'Tech',
          businessDescription: 'Test business',
          contentType: 'article',
          corpusTopicIds: [],
          keywords: [],
        },
      ]);

      const results = await adapter.getEditorialBriefsForSeoBrief({
        seoBriefId: 'seobrief1',
        tenantId: 'tenant1',
        projectId: 'proj1',
        limit: 10,
      });

      expect(results).toHaveLength(2);
      // Premier brief avec contraintes
      expect(results[0].targetSectionsCount).toBe(8);
      expect(results[0].targetCharsPerSection).toBe(1000);
      // Second brief sans contraintes
      expect(results[1].targetSectionsCount).toBeUndefined();
      expect(results[1].targetCharsPerSection).toBeUndefined();
    });
  });
});
