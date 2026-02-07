import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Neo4jComponentStoreAdapter } from '../neo4j-component-store.adapter';
import type { Neo4jConnection } from '../neo4j-connection';
import type { ComponentDefinition } from '@casys/core';

describe('Neo4jComponentStoreAdapter', () => {
  let adapter: Neo4jComponentStoreAdapter;
  let mockConn: Neo4jConnection;

  beforeEach(() => {
    mockConn = {
      query: vi.fn().mockResolvedValue([]),
    } as unknown as Neo4jConnection;

    adapter = new Neo4jComponentStoreAdapter(mockConn);
  });

  describe('indexComponent', () => {
    it('devrait indexer un composant avec embedding', async () => {
      const componentId = 'ButtonComponent';
      const embedding = new Array(1536).fill(0.1);
      const metadata: Partial<ComponentDefinition> = {
        name: 'Button',
        path: '/components/Button.tsx',
        description: 'A reusable button component',
        category: 'ui',
        tags: ['button', 'interactive'],
        props: { variant: 'string', size: 'string' },
      };

      await adapter.indexComponent(componentId, embedding, metadata);

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [query, params] = calls[calls.length - 1];

      expect(query).toContain('MERGE (c:Component { id: $id })');
      expect(query).toContain('SET c.name = $name');
      expect(query).toContain('c.embedding = $embedding');

      expect(params.id).toBe('ButtonComponent');
      expect(params.name).toBe('Button');
      expect(params.path).toBe('/components/Button.tsx');
      expect(params.description).toBe('A reusable button component');
      expect(params.category).toBe('ui');
      expect(params.tags).toEqual(['button', 'interactive']);
      expect(params.propsJson).toBe(JSON.stringify({ variant: 'string', size: 'string' }));
      expect(params.embedding).toEqual(embedding);
      expect(params.embeddingText).toBe('Button\n\nA reusable button component');
    });

    it('devrait gérer les métadonnées minimales', async () => {
      const componentId = 'MinimalComponent';
      const embedding = new Array(1536).fill(0.1);

      await adapter.indexComponent(componentId, embedding, {});

      const calls = (mockConn.query as ReturnType<typeof vi.fn>).mock.calls;
      const [, params] = calls[calls.length - 1];

      expect(params.name).toBe('MinimalComponent');
      expect(params.path).toBeNull();
      expect(params.description).toBe('');
      expect(params.category).toBeNull();
      expect(params.tags).toEqual([]);
      expect(params.propsJson).toBeNull();
    });
  });

  describe('getComponentById', () => {
    it('devrait récupérer un composant par ID', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'Button',
          name: 'Button Component',
          path: '/components/Button.tsx',
          description: 'A button',
          category: 'ui',
          tags: ['button'],
          propsJson: JSON.stringify({ variant: 'string' }),
        },
      ]);

      const component = await adapter.getComponentById('Button');

      expect(component).toBeDefined();
      expect(component?.id).toBe('Button');
      expect(component?.name).toBe('Button Component');
      expect(component?.props).toEqual({ variant: 'string' });
    });

    it('devrait retourner null si composant non trouvé', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const component = await adapter.getComponentById('NonExistent');

      expect(component).toBeNull();
    });

    it('devrait gérer les props JSON invalides', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'Button',
          name: 'Button',
          propsJson: 'invalid json{',
        },
      ]);

      const component = await adapter.getComponentById('Button');

      expect(component?.props).toBeUndefined();
    });
  });

  describe('getAllComponents', () => {
    it('devrait récupérer tous les composants', async () => {
      (mockConn.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'Button', name: 'Button', path: '/Button.tsx', tags: ['ui'] },
        { id: 'Input', name: 'Input', path: '/Input.tsx', tags: ['form'] },
      ]);

      const result = await adapter.getAllComponents(100);

      expect(result.components).toHaveLength(2);
      expect(result.components[0].id).toBe('Button');
      expect(result.components[1].id).toBe('Input');
    });
  });
});