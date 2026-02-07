import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ComponentDefinition } from '@casys/core';

import { type ComponentCatalogPort, type ComponentVectorStorePort } from '../../ports/out';
import {
  type ComponentIndexingParams,
  ComponentIndexingService,
} from '../component-indexing.service';

describe('ComponentIndexingService', () => {
  let service: ComponentIndexingService;
  let mockVectorStore: ComponentVectorStorePort;
  let mockCatalogPort: ComponentCatalogPort;

  const mockComponent: ComponentDefinition = {
    id: 'comp-123',
    name: 'TestButton',
    description: 'A reusable button component',
    category: 'ui',
    subcategory: 'button',
    filePath: '/components/TestButton.astro',
    props: {
      text: { type: 'string', required: true },
      variant: { type: 'string', required: false },
    },
    projectId: 'project-456',
    tags: ['button', 'ui'],
    useCases: ['forms', 'navigation'],
  };

  const mockComponents: ComponentDefinition[] = [
    mockComponent,
    {
      ...mockComponent,
      id: 'comp-456',
      name: 'TestCard',
      description: 'A reusable card component',
      category: 'layout',
    },
  ];

  beforeEach(() => {
    mockVectorStore = {
      indexComponent: vi.fn(),
      getComponentById: vi.fn(),
      getAllComponents: vi.fn(),
    } as unknown as ComponentVectorStorePort;

    mockCatalogPort = {
      getBaseCatalog: vi.fn(),
      getTenantCatalog: vi.fn(),
      getProjectCatalog: vi.fn(),
    };

    service = new ComponentIndexingService(mockVectorStore, mockCatalogPort);
  });

  describe('indexBaseCatalog', () => {
    it('should index base catalog successfully', async () => {
      vi.mocked(mockCatalogPort.getBaseCatalog).mockResolvedValue(mockComponents);
      vi.mocked(mockVectorStore.indexComponent).mockResolvedValue();

      const result = await service.indexBaseCatalog();

      expect(result.success).toBe(true);
      expect(result.scope).toBe('global');
      expect(result.indexedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.indexedComponentIds).toEqual(['comp-123', 'comp-456']);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle missing catalog port', async () => {
      const serviceWithoutCatalog = new ComponentIndexingService(mockVectorStore);

      const result = await serviceWithoutCatalog.indexBaseCatalog();

      expect(result.success).toBe(false);
      expect(result.scope).toBe('global');
      expect(result.indexedCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('ComponentCatalog non disponible');
    });

    it('should handle catalog retrieval errors', async () => {
      const error = new Error('Catalog service unavailable');
      vi.mocked(mockCatalogPort.getBaseCatalog).mockRejectedValue(error);

      const result = await service.indexBaseCatalog();

      expect(result.success).toBe(false);
      expect(result.scope).toBe('global');
      expect(result.indexedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toContain(error);
      expect(result.message).toContain('Échec de récupération du catalogue');
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(mockCatalogPort.getBaseCatalog).mockRejectedValue('String error');

      const result = await service.indexBaseCatalog();

      expect(result.success).toBe(false);
      expect(result.errors[0]).toBeInstanceOf(Error);
      expect(result.errors[0].message).toBe('String error');
    });
  });

  describe('indexTenantCatalog', () => {
    const tenantId = 'tenant-123';

    it('should index tenant catalog successfully', async () => {
      vi.mocked(mockCatalogPort.getTenantCatalog).mockResolvedValue(mockComponents);
      vi.mocked(mockVectorStore.indexComponent).mockResolvedValue();

      const result = await service.indexTenantCatalog(tenantId);

      expect(result.success).toBe(true);
      expect(result.scope).toBe('tenant');
      expect(result.tenantId).toBe(tenantId);
      expect(result.indexedCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });

    it('should handle missing catalog port', async () => {
      const serviceWithoutCatalog = new ComponentIndexingService(mockVectorStore);

      const result = await serviceWithoutCatalog.indexTenantCatalog(tenantId);

      expect(result.success).toBe(false);
      expect(result.scope).toBe('tenant');
      expect(result.tenantId).toBe(tenantId);
      expect(result.errors[0].message).toContain('ComponentCatalog non disponible');
    });

    it('should call getTenantCatalog with correct parameters', async () => {
      vi.mocked(mockCatalogPort.getTenantCatalog).mockResolvedValue([]);
      vi.mocked(mockVectorStore.indexComponent).mockResolvedValue();

      await service.indexTenantCatalog(tenantId);

      expect(mockCatalogPort.getTenantCatalog).toHaveBeenCalledWith(tenantId);
    });
  });

  describe('indexProjectCatalog', () => {
    const tenantId = 'tenant-123';
    const projectId = 'project-456';

    it('should index project catalog successfully', async () => {
      vi.mocked(mockCatalogPort.getProjectCatalog).mockResolvedValue(mockComponents);
      vi.mocked(mockVectorStore.indexComponent).mockResolvedValue();

      const result = await service.indexProjectCatalog(tenantId, projectId);

      expect(result.success).toBe(true);
      expect(result.scope).toBe('project');
      expect(result.tenantId).toBe(tenantId);
      expect(result.projectId).toBe(projectId);
      expect(result.indexedCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });

    it('should handle missing catalog port', async () => {
      const serviceWithoutCatalog = new ComponentIndexingService(mockVectorStore);

      const result = await serviceWithoutCatalog.indexProjectCatalog(tenantId, projectId);

      expect(result.success).toBe(false);
      expect(result.scope).toBe('project');
      expect(result.tenantId).toBe(tenantId);
      expect(result.projectId).toBe(projectId);
      expect(result.errors[0].message).toContain('ComponentCatalog non disponible');
    });

    it('should call getProjectCatalog with correct parameters', async () => {
      vi.mocked(mockCatalogPort.getProjectCatalog).mockResolvedValue([]);
      vi.mocked(mockVectorStore.indexComponent).mockResolvedValue();

      await service.indexProjectCatalog(tenantId, projectId);

      expect(mockCatalogPort.getProjectCatalog).toHaveBeenCalledWith(tenantId, projectId);
    });
  });

  describe('indexComponents', () => {
    const indexingParams: ComponentIndexingParams = {
      components: mockComponents,
      tenantId: 'tenant-123',
    };

    it('should index components successfully', async () => {
      vi.mocked(mockVectorStore.indexComponent).mockResolvedValue();

      const result = await service.indexComponents(indexingParams);

      expect(result.success).toBe(true);
      expect(result.indexedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.indexedComponentIds).toEqual(['comp-123', 'comp-456']);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle partial indexing failures', async () => {
      vi.mocked(mockVectorStore.indexComponent)
        .mockResolvedValueOnce() // First component succeeds
        .mockRejectedValueOnce(new Error('Indexing failed')); // Second fails

      const result = await service.indexComponents(indexingParams);

      expect(result.success).toBe(true); // Still success if at least one component indexed
      expect(result.indexedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.indexedComponentIds).toEqual(['comp-123']);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle complete indexing failure', async () => {
      const error = new Error('Complete indexing failure');
      vi.mocked(mockVectorStore.indexComponent).mockRejectedValue(error);

      const result = await service.indexComponents(indexingParams);

      expect(result.success).toBe(false);
      expect(result.indexedCount).toBe(0);
      expect(result.failedCount).toBe(2);
      expect(result.indexedComponentIds).toHaveLength(0);
      expect(result.errors).toHaveLength(2);
    });

    it('should call indexComponent with correct parameters', async () => {
      vi.mocked(mockVectorStore.indexComponent).mockResolvedValue();

      await service.indexComponents(indexingParams);

      expect(mockVectorStore.indexComponent).toHaveBeenCalledWith(
        'comp-123',
        [], // Empty embedding array for auto-generation
        expect.objectContaining({
          name: 'TestButton',
          description: 'A reusable button component',
          category: 'ui',
          subcategory: 'button',
          tenantId: 'tenant-123',
          projectId: 'project-456',
          props: expect.objectContaining({
            text: expect.objectContaining({ type: 'string', required: true }),
            variant: expect.objectContaining({ type: 'string', required: false }),
          }),
          tags: expect.arrayContaining(['button', 'ui']),
          useCases: expect.arrayContaining(['forms', 'navigation']),
        })
      );

      expect(mockVectorStore.indexComponent).toHaveBeenCalledWith(
        'comp-456',
        [],
        expect.objectContaining({
          name: 'TestCard',
          description: 'A reusable card component',
          category: 'layout',
          subcategory: 'button',
          tenantId: 'tenant-123',
          projectId: 'project-456',
          props: expect.objectContaining({
            text: expect.objectContaining({ type: 'string', required: true }),
            variant: expect.objectContaining({ type: 'string', required: false }),
          }),
          tags: expect.arrayContaining(['button', 'ui']),
          useCases: expect.arrayContaining(['forms', 'navigation']),
        })
      );
    });

    it('should work without tenantId', async () => {
      vi.mocked(mockVectorStore.indexComponent).mockResolvedValue();

      const paramsWithoutTenant = { components: mockComponents };
      await service.indexComponents(paramsWithoutTenant);

      expect(mockVectorStore.indexComponent).toHaveBeenCalledWith(
        'comp-123',
        [],
        expect.objectContaining({
          name: 'TestButton',
          description: 'A reusable button component',
          category: 'ui',
          subcategory: 'button',
          projectId: 'project-456',
        })
      );
    });

    it('should handle empty components array', async () => {
      const result = await service.indexComponents({ components: [] });

      expect(result.success).toBe(false);
      expect(result.indexedCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.indexedComponentIds).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.message).toBe("Échec de l'indexation: 0 erreurs");
    });
  });

  describe('single component indexing', () => {
    it('should index single component successfully', async () => {
      vi.mocked(mockVectorStore.indexComponent).mockResolvedValue();

      const result = await service.indexComponents({
        components: [mockComponent],
        tenantId: 'tenant-123',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('composants indexés avec succès');
      expect(mockVectorStore.indexComponent).toHaveBeenCalledWith(
        'comp-123',
        [],
        expect.objectContaining({
          name: 'TestButton',
          description: 'A reusable button component',
          category: 'ui',
          subcategory: 'button',
          tenantId: 'tenant-123',
          projectId: 'project-456',
        })
      );
    });

    it('should handle single component indexing failure', async () => {
      const error = new Error('Component indexing failed');
      vi.mocked(mockVectorStore.indexComponent).mockRejectedValue(error);

      const result = await service.indexComponents({ components: [mockComponent] });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Échec de l'indexation");
    });

    it('should work without tenantId for single component', async () => {
      vi.mocked(mockVectorStore.indexComponent).mockResolvedValue();

      await service.indexComponents({ components: [mockComponent] });

      expect(mockVectorStore.indexComponent).toHaveBeenCalledWith(
        'comp-123',
        [],
        expect.objectContaining({
          name: 'TestButton',
          description: 'A reusable button component',
          category: 'ui',
          subcategory: 'button',
          projectId: 'project-456',
        })
      );
    });
  });

  describe('edge cases', () => {
    it('should handle components with missing optional fields', async () => {
      const minimalComponent: ComponentDefinition = {
        id: 'minimal-comp',
        name: 'MinimalComponent',
        description: 'Basic component',
        category: 'basic',
        subcategory: 'test',
        filePath: '/components/MinimalComponent.astro',
        props: {},
        tags: [],
        useCases: [],
      };

      vi.mocked(mockVectorStore.indexComponent).mockResolvedValue();

      const result = await service.indexComponents({ components: [minimalComponent] });

      expect(result.success).toBe(true);
      expect(mockVectorStore.indexComponent).toHaveBeenCalledWith(
        'minimal-comp',
        [],
        expect.objectContaining({
          name: 'MinimalComponent',
          category: 'basic',
          subcategory: 'test',
          description: 'Basic component',
        })
      );
    });

    it('should handle very large component arrays', async () => {
      const largeComponentArray: ComponentDefinition[] = Array.from({ length: 100 }, (_, i) => ({
        ...mockComponent,
        id: `comp-${i}`,
        name: `Component${i}`,
      }));

      vi.mocked(mockVectorStore.indexComponent).mockResolvedValue();

      const result = await service.indexComponents({
        components: largeComponentArray,
      });

      expect(result.success).toBe(true);
      expect(result.indexedCount).toBe(100);
      expect(mockVectorStore.indexComponent).toHaveBeenCalledTimes(100);
    });

    it('should handle mixed success/failure scenarios', async () => {
      vi.mocked(mockVectorStore.indexComponent).mockImplementation(id => {
        if (id === 'comp-123') return Promise.resolve();
        return Promise.reject(new Error(`Failed to index ${id}`));
      });

      const result = await service.indexComponents({
        components: mockComponents,
      });

      expect(result.success).toBe(true); // At least one succeeded
      expect(result.indexedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.indexedComponentIds).toEqual(['comp-123']);
      expect(result.errors).toHaveLength(1);
    });
  });
});
