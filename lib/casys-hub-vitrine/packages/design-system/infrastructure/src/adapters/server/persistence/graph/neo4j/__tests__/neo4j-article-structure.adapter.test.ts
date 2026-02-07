import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Neo4jArticleStructureAdapter } from '../neo4j-article-structure.adapter';
import type { Neo4jConnection } from '../neo4j-connection';
import type { EmbeddingPort } from '@casys/application';
import type { ArticleNode, SectionNode } from '@casys/core';

describe('Neo4jArticleStructureAdapter', () => {
  let adapter: Neo4jArticleStructureAdapter;
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

    adapter = new Neo4jArticleStructureAdapter(mockConn, mockEmbedding);
  });

  describe('upsertOutline - Création Article et Sections', () => {
    it('devrait créer un article avec embedding', async () => {
      const article: ArticleNode = {
        id: 'article123',
        title: 'Guide to SEO Optimization',
        description: 'Complete guide to optimize your website for search engines',
        projectId: 'proj1',
        tenantId: 'tenant1',
        keywords: ['SEO', 'optimization'],
        sources: ['manual'],
        language: 'en',
        createdAt: new Date().toISOString(),
      };

      const sections: SectionNode[] = [];

      await adapter.upsertOutline(article, sections, 'tenant1');

      // Vérifier que la query MERGE Article a été appelée
      const articleCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (a:Article { id: $id })')
      );

      expect(articleCalls).toHaveLength(1);
      const [query, params] = articleCalls[0];

      // Vérifier les données de l'article
      expect(params.id).toBe('article123');
      expect(params.title).toBe('Guide to SEO Optimization');
      expect(params.description).toBe('Complete guide to optimize your website for search engines');
      expect(params.projectId).toBe('proj1');
      expect(params.tenantId).toBe('tenant1');
      expect(params.keywords).toEqual(['SEO', 'optimization']);
      expect(params.sources).toEqual(['manual']);

      // Vérifier que l'embedding a été généré
      expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith(
        'Guide to SEO Optimization\n\nComplete guide to optimize your website for search engines'
      );
      expect(params.embedding).toBeDefined();
      expect(params.embeddingText).toBeDefined();
    });

    it('devrait créer les sections avec relations HAS_SECTION', async () => {
      const article: ArticleNode = {
        id: 'article123',
        title: 'Test Article',
        projectId: 'proj1',
        language: 'en',
        createdAt: new Date().toISOString(),
      };

      const sections: SectionNode[] = [
        {
          articleId: 'article123',
          title: 'Introduction',
          description: 'Introduction section',
          level: 1,
          position: 1,
          content: 'Introduction content',
        },
        {
          articleId: 'article123',
          title: 'Main Content',
          description: 'Main content section',
          level: 1,
          position: 2,
          content: 'Main content',
        },
        {
          articleId: 'article123',
          title: 'Subsection',
          description: 'A subsection',
          level: 2,
          position: 3,
          parentSectionId: '2', // Parent position
          content: 'Subsection content',
        },
      ];

      await adapter.upsertOutline(article, sections, 'tenant1');

      // Vérifier que les sections ont été créées
      const sectionCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (s:Section { id: $id })')
      );

      expect(sectionCalls).toHaveLength(3);

      // Vérifier les IDs canoniques
      expect(sectionCalls[0][1].id).toBe('article123::1');
      expect(sectionCalls[0][1].title).toBe('Introduction');
      expect(sectionCalls[0][1].level).toBe(1);
      expect(sectionCalls[0][1].position).toBe(1);
      expect(sectionCalls[0][1].parentSectionId).toBeNull();

      expect(sectionCalls[1][1].id).toBe('article123::2');
      expect(sectionCalls[1][1].title).toBe('Main Content');

      expect(sectionCalls[2][1].id).toBe('article123::3');
      expect(sectionCalls[2][1].title).toBe('Subsection');
      expect(sectionCalls[2][1].parentSectionId).toBe('2');

      // Vérifier les relations HAS_SECTION
      sectionCalls.forEach(([query]) => {
        expect(query).toContain('MERGE (a)-[:HAS_SECTION]->(s)');
      });
    });

    it('devrait gérer les articles sans embedding service', async () => {
      const adapterWithoutEmbedding = new Neo4jArticleStructureAdapter(mockConn);

      const article: ArticleNode = {
        id: 'article123',
        title: 'Test',
        projectId: 'proj1',
        language: 'en',
        createdAt: new Date().toISOString(),
      };

      await adapterWithoutEmbedding.upsertOutline(article, [], 'tenant1');

      const articleCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('MERGE (a:Article')
      );

      expect(articleCalls[0][1].embedding).toBeNull();
    });

    it('devrait gérer les erreurs d\'embedding de manière non bloquante', async () => {
      const failingEmbedding = {
        generateEmbedding: vi.fn().mockRejectedValue(new Error('Embedding failed')),
      } as unknown as EmbeddingPort;

      const adapterWithFailing = new Neo4jArticleStructureAdapter(mockConn, failingEmbedding);

      const article: ArticleNode = {
        id: 'article123',
        title: 'Test',
        projectId: 'proj1',
        language: 'en',
        createdAt: new Date().toISOString(),
      };

      // Ne devrait pas throw
      await expect(adapterWithFailing.upsertOutline(article, [], 'tenant1')).resolves.toBeUndefined();
    });
  });

  describe('updateSectionContent', () => {
    it('devrait mettre à jour le contenu d\'une section avec embedding', async () => {
      // Mock: section existe avec un titre
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { title: 'Introduction' },
      ]);

      await adapter.updateSectionContent(
        'article123::1',
        'This is the updated content for the introduction section.',
        'proj1',
        'tenant1',
        'Brief summary of introduction'
      );

      // Vérifier que l'embedding a été généré avec titre + contenu
      expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith(
        'Introduction\n\nThis is the updated content for the introduction section.'
      );

      // Vérifier la mise à jour
      const updateCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('SET s.content = $content')
      );

      expect(updateCalls).toHaveLength(1);
      const [query, params] = updateCalls[0];

      expect(params.sectionId).toBe('article123::1');
      expect(params.content).toBe('This is the updated content for the introduction section.');
      expect(params.summary).toBe('Brief summary of introduction');
      expect(params.embedding).toBeDefined();
      expect(params.embeddingText).toBeDefined();
    });

    it('devrait gérer l\'absence de summary', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { title: 'Section Title' },
      ]);

      await adapter.updateSectionContent('article123::2', 'Content', 'proj1', 'tenant1');

      const updateCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('SET s.content = $content')
      );

      expect(updateCalls[0][1].summary).toBeNull();
    });

    it('devrait gérer les sections sans embedding service', async () => {
      const adapterWithoutEmbedding = new Neo4jArticleStructureAdapter(mockConn);

      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ title: 'Title' }]);

      await adapterWithoutEmbedding.updateSectionContent(
        'article123::1',
        'Content',
        'proj1',
        'tenant1'
      );

      const updateCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('SET s.content = $content')
      );

      expect(updateCalls[0][1].embedding).toBeNull();
    });
  });

  describe('deleteArticleStructure', () => {
    it('devrait supprimer un article et ses sections', async () => {
      await adapter.deleteArticleStructure('article123', 'tenant1');

      const deleteCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].includes('DETACH DELETE s, a')
      );

      expect(deleteCalls).toHaveLength(1);
      const [query, params] = deleteCalls[0];

      expect(query).toContain('MATCH (a:Article { id: $articleId');
      expect(query).toContain('OPTIONAL MATCH (a)-[:HAS_SECTION]->(s:Section)');
      expect(params.articleId).toBe('article123');
      expect(params.tenantId).toBe('tenant1');
    });

    it('devrait supprimer sans tenantId si non fourni', async () => {
      await adapter.deleteArticleStructure('article123');

      const deleteCalls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query] = deleteCalls[deleteCalls.length - 1];

      // Ne devrait pas contenir tenant_id dans la query
      expect(query).not.toContain('tenant_id: $tenantId');
    });
  });

  describe('getAllArticles', () => {
    it('devrait récupérer tous les articles avec limite', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'article1',
          title: 'Article 1',
          description: 'Description 1',
          projectId: 'proj1',
          tenantId: 'tenant1',
          keywords: ['keyword1'],
          sources: ['source1'],
          language: 'en',
          createdAt: Date.now(),
          agents: ['agent1'],
          content: 'Content 1',
        },
        {
          id: 'article2',
          title: 'Article 2',
          description: 'Description 2',
          projectId: 'proj1',
          tenantId: 'tenant1',
          keywords: ['keyword2'],
          sources: ['source2'],
          language: 'fr',
          createdAt: Date.now(),
          agents: ['agent2'],
          content: null,
        },
      ]);

      const articles = await adapter.getAllArticles(50);

      expect(articles).toHaveLength(2);
      expect(articles[0].id).toBe('article1');
      expect(articles[0].title).toBe('Article 1');
      expect(articles[0].keywords).toEqual(['keyword1']);
      expect(articles[0].content).toBe('Content 1');

      expect(articles[1].id).toBe('article2');
      expect(articles[1].content).toBeUndefined(); // null devrait devenir undefined
    });
  });

  describe('getArticlesByProjectId', () => {
    it('devrait récupérer les articles d\'un projet', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'article1',
          title: 'Project Article',
          description: 'Description',
          projectId: 'proj1',
          tenantId: 'tenant1',
          keywords: ['keyword'],
          sources: ['source'],
          language: 'en',
          createdAt: Date.now(),
          agents: [],
        },
      ]);

      const articles = await adapter.getArticlesByProjectId('proj1', 'tenant1', 50);

      expect(articles).toHaveLength(1);
      expect(articles[0].projectId).toBe('proj1');
      expect(articles[0].tenantId).toBe('tenant1');

      // Vérifier la query
      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MATCH (a:Article { project_id: $projectId');
      expect(params.projectId).toBe('proj1');
      expect(params.tenantId).toBe('tenant1');
      expect(params.limit).toBe(50);
    });

    it('devrait fonctionner sans tenantId', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await adapter.getArticlesByProjectId('proj1', undefined, 50);

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query] = calls[calls.length - 1];

      // Ne devrait pas inclure tenant_id dans le filtre
      expect(query).toContain('project_id: $projectId');
    });
  });

  describe('getArticlesByTenantId', () => {
    it('devrait récupérer les articles d\'un tenant', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'article1',
          title: 'Tenant Article 1',
          description: 'Description 1',
          projectId: 'proj1',
          keywords: [],
          sources: [],
          language: 'en',
          createdAt: Date.now(),
          agents: [],
        },
        {
          id: 'article2',
          title: 'Tenant Article 2',
          description: 'Description 2',
          projectId: 'proj2',
          keywords: [],
          sources: [],
          language: 'en',
          createdAt: Date.now(),
          agents: [],
        },
      ]);

      const articles = await adapter.getArticlesByTenantId('tenant1', 50);

      expect(articles).toHaveLength(2);
      expect(articles.every(a => a.tenantId === 'tenant1')).toBe(true);
    });
  });

  describe('getArticleById', () => {
    it('devrait récupérer un article spécifique', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'article123',
          title: 'Specific Article',
          description: 'Description',
          projectId: 'proj1',
          keywords: ['keyword'],
          sources: ['source'],
          language: 'en',
          createdAt: Date.now(),
          agents: ['agent1'],
          content: 'Content',
        },
      ]);

      const article = await adapter.getArticleById('article123', 'tenant1');

      expect(article).toBeDefined();
      expect(article?.id).toBe('article123');
      expect(article?.title).toBe('Specific Article');
    });

    it('devrait retourner null si article non trouvé', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const article = await adapter.getArticleById('nonexistent', 'tenant1');

      expect(article).toBeNull();
    });
  });

  describe('linkSectionToArticle', () => {
    it('devrait créer une relation REFERENCES entre section et article', async () => {
      await adapter.linkSectionToArticle({
        sectionId: 'article123::1',
        articleId: 'article456',
        tenantId: 'tenant1',
        projectId: 'proj1',
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MATCH (s:Section { id: $sectionId })');
      expect(query).toContain('MATCH (target:Article { id: $articleId');
      expect(query).toContain('MERGE (s)-[:REFERENCES]->(target)');

      expect(params.sectionId).toBe('article123::1');
      expect(params.articleId).toBe('article456');
      expect(params.tenantId).toBe('tenant1');
      expect(params.projectId).toBe('proj1');
    });
  });

  describe('upsertSection', () => {
    it('devrait créer ou mettre à jour une section individuelle', async () => {
      const section: SectionNode = {
        articleId: 'article123',
        title: 'New Section',
        description: 'Section description',
        level: 2,
        position: 5,
        parentSectionId: '2',
        content: 'Section content',
      };

      await adapter.upsertSection(section, 'proj1', 'tenant1');

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MATCH (a:Article { id: $articleId, project_id: $projectId');
      expect(query).toContain('MERGE (s:Section { id: $id })');
      expect(query).toContain('MERGE (a)-[:HAS_SECTION]->(s)');

      expect(params.id).toBe('article123::5');
      expect(params.title).toBe('New Section');
      expect(params.level).toBe(2);
      expect(params.position).toBe(5);
      expect(params.parentSectionId).toBe('2');
    });
  });

  describe('Helpers - Type coercion', () => {
    it('devrait convertir les types de manière sécurisée', async () => {
      // Test avec des données invalides
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'article1',
          title: null, // null au lieu de string
          description: undefined, // undefined
          projectId: 123, // number au lieu de string
          keywords: 'not-an-array', // string au lieu d'array
          sources: [1, 2, 'valid'], // array mixte
          language: null,
          createdAt: 'invalid-date', // date invalide
        },
      ]);

      const articles = await adapter.getAllArticles(1);

      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe(''); // null → ''
      expect(articles[0].description).toBe(''); // undefined → ''
      expect(articles[0].projectId).toBe(''); // 123 → '' (number pas string)
      expect(articles[0].keywords).toEqual([]); // 'not-an-array' → []
      expect(articles[0].sources).toEqual(['valid']); // Filtré pour ne garder que les strings
      expect(articles[0].language).toBe('en'); // null → 'en' (fallback)
      expect(articles[0].createdAt).toBe('invalid-date'); // string passé tel quel
    });
  });
});
