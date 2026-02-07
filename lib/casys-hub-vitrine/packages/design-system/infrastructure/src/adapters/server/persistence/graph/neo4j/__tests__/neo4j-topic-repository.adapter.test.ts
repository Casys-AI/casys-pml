import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Neo4jTopicRepositoryAdapter } from '../neo4j-topic-repository.adapter';
import type { Neo4jConnection } from '../neo4j-connection';
import type { EmbeddingPort } from '@casys/application';
import type { Topic } from '@casys/core';

describe('Neo4jTopicRepositoryAdapter', () => {
  let adapter: Neo4jTopicRepositoryAdapter;
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

    adapter = new Neo4jTopicRepositoryAdapter(mockConn, mockEmbedding);
  });

  describe('upsertTopics - Validation', () => {
    it('devrait valider tenantId et projectId', async () => {
      await expect(
        adapter.upsertTopics({
          tenantId: '',
          projectId: 'proj1',
          topics: [{ id: 'topic1', title: 'Title' }],
        })
      ).rejects.toThrow('tenantId/projectId requis');

      await expect(
        adapter.upsertTopics({
          tenantId: 'tenant1',
          projectId: '  ',
          topics: [{ id: 'topic1', title: 'Title' }],
        })
      ).rejects.toThrow('tenantId/projectId requis');
    });

    it('devrait valider que topics n\'est pas vide', async () => {
      await expect(
        adapter.upsertTopics({
          tenantId: 'tenant1',
          projectId: 'proj1',
          topics: [],
        })
      ).rejects.toThrow('topics[] vide');
    });

    it('devrait valider topic.id', async () => {
      await expect(
        adapter.upsertTopics({
          tenantId: 'tenant1',
          projectId: 'proj1',
          topics: [{ id: '', title: 'Title' }],
        })
      ).rejects.toThrow('topic.id requis');
    });
  });

  describe('upsertTopics - Création Tenant/Project', () => {
    it('devrait créer la structure Tenant -> Project', async () => {
      const topics: Topic[] = [
        {
          id: 'topic1',
          title: 'SEO Best Practices',
          language: 'en',
        },
      ];

      await adapter.upsertTopics({
        tenantId: 'tenant1',
        projectId: 'proj1',
        topics,
      });

      // Vérifier que Tenant et Project ont été créés
      const tenantProjectCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (ten:Tenant { id: $tenantId })')
      );

      expect(tenantProjectCalls).toHaveLength(1);
      const [query, params] = tenantProjectCalls[0];

      expect(query).toContain('MERGE (proj:Project { id: $projectId })');
      expect(query).toContain('MERGE (ten)-[:TENANT_HAS_PROJECT]->(proj)');
      expect(params.tenantId).toBe('tenant1');
      expect(params.projectId).toBe('proj1');
    });
  });

  describe('upsertTopics - Création Topics avec embeddings', () => {
    it('devrait créer un topic avec toutes les données', async () => {
      const topics: Topic[] = [
        {
          id: 'topic123',
          title: 'Complete Guide to SEO',
          language: 'en',
          sourceUrl: 'https://example.com/seo-guide',
          sourceContent: 'This is a comprehensive guide about SEO optimization...',
          imageUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
        },
      ];

      await adapter.upsertTopics({
        tenantId: 'tenant1',
        projectId: 'proj1',
        topics,
      });

      // Vérifier la création du topic
      const topicCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t:Topic { id: $id })')
      );

      expect(topicCalls).toHaveLength(1);
      const [query, params] = topicCalls[0];

      expect(params.id).toBe('topic123');
      expect(params.name).toBe('Complete Guide to SEO');
      expect(params.tenantId).toBe('tenant1');
      expect(params.projectId).toBe('proj1');
      expect(params.sourceUrl).toBe('https://example.com/seo-guide');
      expect(params.language).toBe('en');
      expect(params.summary).toBe('This is a comprehensive guide about SEO optimization...');
      expect(params.imageUrls).toEqual([
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
      ]);
    });

    it('devrait générer des embeddings pour titre et description', async () => {
      const topics: Topic[] = [
        {
          id: 'topic1',
          title: 'Machine Learning Basics',
          sourceContent: 'An introduction to machine learning algorithms and techniques.',
        },
      ];

      await adapter.upsertTopics({
        tenantId: 'tenant1',
        projectId: 'proj1',
        topics,
      });

      // Vérifier que les embeddings ont été générés
      expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('Machine Learning Basics');
      expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith(
        'An introduction to machine learning algorithms and techniques.'
      );

      // Vérifier que les embeddings ont été sauvegardés
      const embeddingCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) =>
          call[0].includes('SET t.embedding_title = $emb') ||
          call[0].includes('SET t.embedding_desc = $emb')
      );

      expect(embeddingCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('devrait gérer l\'échec d\'embedding de manière non bloquante', async () => {
      const failingEmbedding = {
        generateEmbedding: vi.fn().mockRejectedValue(new Error('Embedding failed')),
      } as unknown as EmbeddingPort;

      const adapterWithFailing = new Neo4jTopicRepositoryAdapter(mockConn, failingEmbedding);

      const topics: Topic[] = [
        {
          id: 'topic1',
          title: 'Test Topic',
          sourceContent: 'Test content',
        },
      ];

      // Ne devrait pas throw
      await expect(
        adapterWithFailing.upsertTopics({
          tenantId: 'tenant1',
          projectId: 'proj1',
          topics,
        })
      ).resolves.toBeUndefined();
    });

    it('devrait limiter le summary à 400 caractères', async () => {
      const longContent = 'a'.repeat(500);
      const topics: Topic[] = [
        {
          id: 'topic1',
          title: 'Test',
          sourceContent: longContent,
        },
      ];

      await adapter.upsertTopics({
        tenantId: 'tenant1',
        projectId: 'proj1',
        topics,
      });

      const topicCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t:Topic')
      );

      expect(topicCalls[0][1].summary).toHaveLength(400);
    });

    it('devrait filtrer les imageUrls non-strings', async () => {
      const topics: Topic[] = [
        {
          id: 'topic1',
          title: 'Test',
          imageUrls: ['valid.jpg', 123 as any, null as any, 'another.png', undefined as any],
        },
      ];

      await adapter.upsertTopics({
        tenantId: 'tenant1',
        projectId: 'proj1',
        topics,
      });

      const topicCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t:Topic')
      );

      expect(topicCalls[0][1].imageUrls).toEqual(['valid.jpg', 'another.png']);
    });

    it('devrait gérer les champs optionnels absents', async () => {
      const topics: Topic[] = [
        {
          id: 'topic1',
          title: 'Minimal Topic',
        },
      ];

      await adapter.upsertTopics({
        tenantId: 'tenant1',
        projectId: 'proj1',
        topics,
      });

      const topicCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t:Topic')
      );

      expect(topicCalls[0][1].sourceUrl).toBeNull();
      expect(topicCalls[0][1].language).toBeNull();
      expect(topicCalls[0][1].summary).toBeNull();
      expect(topicCalls[0][1].imageUrls).toEqual([]);
    });
  });

  describe('upsertTopics - Liaison aux KeywordTags', () => {
    it('devrait lier le topic aux KeywordTags via URL keywords (match exact)', async () => {
      // Mock: KeywordTag existe
      (mockConn.query as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
        if (query.includes('MATCH (kt:KeywordTag {id: $tagId})')) {
          return Promise.resolve([{ id: 'tenant1::proj1::seo' }]);
        }
        return Promise.resolve([]);
      });

      const topics: Topic[] = [
        {
          id: 'topic1',
          title: 'SEO Guide',
          sourceUrl: 'https://example.com/blog/seo-optimization-tips',
        },
      ];

      await adapter.upsertTopics({
        tenantId: 'tenant1',
        projectId: 'proj1',
        topics,
      });

      // Vérifier que la relation RELATES_TO a été créée
      const relatesToCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t)-[r:RELATES_TO]->(kt)')
      );

      expect(relatesToCalls.length).toBeGreaterThan(0);

      // Vérifier les attributs de la relation
      const firstRelation = relatesToCalls[0];
      expect(firstRelation[0]).toContain("ON CREATE SET r.score = 1.0, r.source = 'url_exact'");
    });

    it('ne devrait pas créer de relation si KeywordTag n\'existe pas', async () => {
      // Mock: aucun KeywordTag trouvé
      (mockConn.query as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
        if (query.includes('MATCH (kt:KeywordTag')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      const topics: Topic[] = [
        {
          id: 'topic1',
          title: 'Guide',
          sourceUrl: 'https://example.com/blog/nonexistent-keyword',
        },
      ];

      await adapter.upsertTopics({
        tenantId: 'tenant1',
        projectId: 'proj1',
        topics,
      });

      // Vérifier qu'aucune relation RELATES_TO n'a été créée
      const relatesToCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t)-[r:RELATES_TO]->(kt)')
      );

      expect(relatesToCalls).toHaveLength(0);
    });

    it('devrait extraire plusieurs keywords de l\'URL', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
        if (query.includes('MATCH (kt:KeywordTag')) {
          // Simuler que tous les tags existent
          return Promise.resolve([{ id: 'tag' }]);
        }
        return Promise.resolve([]);
      });

      const topics: Topic[] = [
        {
          id: 'topic1',
          title: 'Guide',
          sourceUrl: 'https://example.com/seo-content-marketing-strategy',
        },
      ];

      await adapter.upsertTopics({
        tenantId: 'tenant1',
        projectId: 'proj1',
        topics,
      });

      // Devrait avoir cherché plusieurs keywords (seo, content, marketing, strategy)
      const tagCheckCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MATCH (kt:KeywordTag {id: $tagId})')
      );

      expect(tagCheckCalls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('upsertTopics - Traitement de plusieurs topics', () => {
    it('devrait traiter plusieurs topics dans une seule opération', async () => {
      const topics: Topic[] = [
        { id: 'topic1', title: 'Topic 1' },
        { id: 'topic2', title: 'Topic 2' },
        { id: 'topic3', title: 'Topic 3' },
      ];

      await adapter.upsertTopics({
        tenantId: 'tenant1',
        projectId: 'proj1',
        topics,
      });

      // Vérifier que 3 topics ont été créés
      const topicCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (t:Topic { id: $id })')
      );

      expect(topicCalls).toHaveLength(3);
      expect(topicCalls[0][1].id).toBe('topic1');
      expect(topicCalls[1][1].id).toBe('topic2');
      expect(topicCalls[2][1].id).toBe('topic3');
    });
  });

  describe('getTopicById', () => {
    it('devrait récupérer un topic par ID', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'topic123',
          name: 'SEO Guide',
        },
      ]);

      const topic = await adapter.getTopicById({
        topicId: 'topic123',
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      expect(topic).toBeDefined();
      expect(topic?.id).toBe('topic123');
      expect(topic?.title).toBe('SEO Guide');
    });

    it('devrait retourner null si topic non trouvé', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const topic = await adapter.getTopicById({
        topicId: 'nonexistent',
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      expect(topic).toBeNull();
    });
  });

  describe('getTopicBySourceUrl', () => {
    it('devrait récupérer un topic par sourceUrl', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'topic456',
          name: 'Content Marketing',
          tenantId: 'tenant1',
          projectId: 'proj1',
          sourceUrl: 'https://example.com/content-marketing',
          language: 'en',
          summary: 'Content marketing guide',
          imageUrls: [],
          createdAt: Date.now(),
        },
      ]);

      const topic = await adapter.getTopicBySourceUrl({
        sourceUrl: 'https://example.com/content-marketing',
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      expect(topic).toBeDefined();
      expect(topic?.id).toBe('topic456');
      expect(topic?.sourceUrl).toBe('https://example.com/content-marketing');
    });

    it('devrait retourner null si aucun topic avec cette URL', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const topic = await adapter.getTopicBySourceUrl({
        sourceUrl: 'https://example.com/nonexistent',
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      expect(topic).toBeNull();
    });
  });

  describe('Type coercion', () => {
    it('devrait gérer les données invalides gracieusement', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'topic1',
          name: null, // null
        },
      ]);

      const topic = await adapter.getTopicById({
        topicId: 'topic1',
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      // Ne devrait pas throw et retourner des valeurs par défaut
      expect(topic).toBeDefined();
      expect(topic?.title).toBe('topic1'); // null name → fallback to id
      expect(typeof topic?.id).toBe('string');
    });
  });

  describe('extractKeywordsFromUrl - Pattern matching', () => {
    it('devrait extraire correctement les mots-clés des URLs', async () => {
      // Test indirect via upsertTopics
      (mockConn.query as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
        if (query.includes('MATCH (kt:KeywordTag {id: $tagId})')) {
          // Capturer les tagId pour vérifier l'extraction
          return Promise.resolve([{ id: 'tag' }]);
        }
        return Promise.resolve([]);
      });

      const topics: Topic[] = [
        {
          id: 'topic1',
          title: 'Test',
          sourceUrl: 'https://example.com/path/seo-optimization',
        },
      ];

      await adapter.upsertTopics({
        tenantId: 'tenant1',
        projectId: 'proj1',
        topics,
      });

      // Vérifier que les bons keywords ont été extraits
      const tagCheckCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MATCH (kt:KeywordTag {id: $tagId})')
      );

      const extractedTagIds = tagCheckCalls.map((call) => call[1].tagId);

      // Devrait contenir les slugs normalisés
      expect(extractedTagIds.some((id: string) => id.includes('::seo'))).toBe(true);
      expect(extractedTagIds.some((id: string) => id.includes('::optimization'))).toBe(true);
    });
  });
});
