import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Neo4jSectionHierarchyAdapter } from '../neo4j-section-hierarchy.adapter';
import type { Neo4jConnection } from '../neo4j-connection';

describe('Neo4jSectionHierarchyAdapter', () => {
  let adapter: Neo4jSectionHierarchyAdapter;
  let mockConn: Neo4jConnection;

  beforeEach(() => {
    mockConn = {
      query: vi.fn().mockResolvedValue([]),
    } as unknown as Neo4jConnection;

    adapter = new Neo4jSectionHierarchyAdapter(mockConn);
  });

  describe('linkSectionToParent', () => {
    it('devrait créer la relation HAS_SUBSECTION parent -> enfant', async () => {
      await adapter.linkSectionToParent({
        sectionId: 'article123::2',
        parentSectionId: 'article123::1',
        articleId: 'article123',
        tenantId: 'tenant1',
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MATCH (parent:Section { id: $parentSectionId })');
      expect(query).toContain('MATCH (child:Section { id: $sectionId })');
      expect(query).toContain('MERGE (parent)-[:HAS_SUBSECTION]->(child)');
      expect(query).toContain('DELETE oldRel'); // Suppression ancienne relation

      expect(params.parentSectionId).toBe('article123::1');
      expect(params.sectionId).toBe('article123::2');
      expect(params.articleId).toBe('article123');
    });

    it('devrait supprimer la relation parent si parentSectionId est null', async () => {
      await adapter.linkSectionToParent({
        sectionId: 'article123::1',
        parentSectionId: null,
        articleId: 'article123',
        tenantId: 'tenant1',
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MATCH (parent:Section)-[r:HAS_SUBSECTION]->(s:Section { id: $sectionId })');
      expect(query).toContain('DELETE r');
      expect(params.sectionId).toBe('article123::1');
    });
  });

  describe('getDirectChildren', () => {
    it('devrait récupérer les enfants directs d\'une section', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'article123::2', title: 'Child 1', level: 2, position: 2 },
        { id: 'article123::3', title: 'Child 2', level: 2, position: 3 },
      ]);

      const children = await adapter.getDirectChildren({
        sectionId: 'article123::1',
        articleId: 'article123',
        tenantId: 'tenant1',
      });

      expect(children).toHaveLength(2);
      expect(children[0].id).toBe('article123::2');
      expect(children[0].title).toBe('Child 1');
      expect(children[0].level).toBe(2);
      expect(children[0].position).toBe(2);

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query] = calls[calls.length - 1];

      expect(query).toContain('MATCH (parent:Section { id: $sectionId })-[:HAS_SUBSECTION]->(child:Section)');
      expect(query).toContain('ORDER BY child.position');
    });
  });

  describe('getAllDescendants', () => {
    it('devrait récupérer tous les descendants récursivement', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'article123::2', title: 'Child', level: 2, position: 2, depth: 1 },
        { id: 'article123::3', title: 'Grandchild', level: 3, position: 3, depth: 2 },
      ]);

      const descendants = await adapter.getAllDescendants({
        sectionId: 'article123::1',
        articleId: 'article123',
        maxDepth: 5,
      });

      expect(descendants).toHaveLength(2);
      expect(descendants[0].depth).toBe(1);
      expect(descendants[1].depth).toBe(2);

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query] = calls[calls.length - 1];

      expect(query).toContain('MATCH path = (root:Section { id: $sectionId })-[:HAS_SUBSECTION*1..5]->(descendant:Section)');
      expect(query).toContain('length(path) AS depth');
    });

    it('devrait utiliser maxDepth par défaut de 10', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await adapter.getAllDescendants({
        sectionId: 'article123::1',
        articleId: 'article123',
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query] = calls[calls.length - 1];

      expect(query).toContain('-[:HAS_SUBSECTION*1..10]->');
    });
  });

  describe('getAncestors', () => {
    it('devrait récupérer tous les ancêtres d\'une section', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'article123::1', title: 'Parent', level: 1, position: 1, depth: 1 },
        { id: 'article123::0', title: 'Grandparent', level: 0, position: 0, depth: 2 },
      ]);

      const ancestors = await adapter.getAncestors({
        sectionId: 'article123::3',
        articleId: 'article123',
        tenantId: 'tenant1',
      });

      expect(ancestors).toHaveLength(2);
      expect(ancestors[0].id).toBe('article123::1');
      expect(ancestors[1].id).toBe('article123::0');

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query] = calls[calls.length - 1];

      expect(query).toContain('MATCH path = (ancestor:Section)-[:HAS_SUBSECTION*1..]->(child:Section { id: $sectionId })');
      expect(query).toContain('ORDER BY depth DESC');
    });
  });

  describe('getSectionTree', () => {
    it('devrait récupérer l\'arbre complet d\'une section', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'article123::1', title: 'Root', level: 1, position: 1, depth: 0 },
        { id: 'article123::2', title: 'Child', level: 2, position: 2, depth: 1 },
        { id: 'article123::3', title: 'Grandchild', level: 3, position: 3, depth: 2 },
      ]);

      const tree = await adapter.getSectionTree({
        sectionId: 'article123::1',
        articleId: 'article123',
        maxDepth: 5,
      });

      expect(tree).toHaveLength(3);
      expect(tree[0].depth).toBe(0); // Root
      expect(tree[1].depth).toBe(1); // Child
      expect(tree[2].depth).toBe(2); // Grandchild

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query] = calls[calls.length - 1];

      // Utilise *0.. pour inclure la racine
      expect(query).toContain('MATCH path = (root:Section { id: $sectionId })-[:HAS_SUBSECTION*0..5]->(node:Section)');
    });
  });

  describe('getRootSections', () => {
    it('devrait récupérer les sections sans parent', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'article123::1', title: 'Root 1', level: 1, position: 1 },
        { id: 'article123::5', title: 'Root 2', level: 1, position: 5 },
      ]);

      const roots = await adapter.getRootSections({
        articleId: 'article123',
        tenantId: 'tenant1',
      });

      expect(roots).toHaveLength(2);
      expect(roots[0].id).toBe('article123::1');
      expect(roots[1].id).toBe('article123::5');

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query] = calls[calls.length - 1];

      expect(query).toContain('MATCH (a:Article { id: $articleId');
      expect(query).toContain('WHERE NOT EXISTS { (parent:Section)-[:HAS_SUBSECTION]->(s) }');
      expect(query).toContain('ORDER BY s.position');
    });
  });

  describe('clearHierarchyForArticle', () => {
    it('devrait supprimer toutes les relations HAS_SUBSECTION d\'un article', async () => {
      await adapter.clearHierarchyForArticle({
        articleId: 'article123',
        tenantId: 'tenant1',
      });

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MATCH (parent:Section)-[r:HAS_SUBSECTION]->(child:Section)');
      expect(query).toContain('WHERE parent.article_id = $articleId AND child.article_id = $articleId');
      expect(query).toContain('DELETE r');

      expect(params.articleId).toBe('article123');
      expect(params.tenantId).toBe('tenant1');
    });
  });

  describe('Type coercion', () => {
    it('devrait gérer les valeurs invalides gracieusement', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: null,
          title: undefined,
          level: 'not-a-number',
          position: null,
        },
      ]);

      const children = await adapter.getDirectChildren({
        sectionId: 'article123::1',
        articleId: 'article123',
      });

      expect(children).toHaveLength(1);
      expect(children[0].id).toBe(''); // null → ''
      expect(children[0].title).toBe(''); // undefined → ''
      expect(children[0].level).toBe(0); // 'not-a-number' → 0
      expect(children[0].position).toBe(0); // null → 0
    });
  });
});
