import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComponentDefinition } from '@casys/core/src/domain/entities/component.entity';
import type { ComponentListingReadPort } from '../ports/out/component-listing.read.port';
import type { ComponentVectorStorePort } from '../ports/out/component-vector-store.port';
import { ComponentListingService } from '../component-listing.service';

describe('ComponentListingService', () => {
  let service: ComponentListingService;
  let mockListingStore: ComponentListingReadPort;
  let mockVectorStore: ComponentVectorStorePort;

  const sampleComponents: ComponentDefinition[] = [
    {
      id: 'c1',
      name: 'A',
      category: 'ui',
      subcategory: 'cards',
      description: 'A',
      filePath: '/A.astro',
      props: {},
      metadata: {},
      tags: [],
      useCases: [],
      tenantId: 't1',
      projectId: 'p1',
    },
    {
      id: 'c2',
      name: 'B',
      category: 'ui',
      subcategory: 'buttons',
      description: 'B',
      filePath: '/B.astro',
      props: {},
      metadata: {},
      tags: [],
      useCases: [],
      tenantId: 't2',
      projectId: 'p2',
    },
  ];

  beforeEach(() => {
    mockListingStore = {
      getAllComponents: vi.fn(),
      getComponentsByTenant: vi.fn(),
      getComponentsByProject: vi.fn(),
      getComponentsByArticle: vi.fn(),
      getComponent: vi.fn(),
    } as unknown as ComponentListingReadPort;

    mockVectorStore = {
      indexComponent: vi.fn(),
      getComponentById: vi.fn(),
    } as unknown as ComponentVectorStorePort;

    service = new ComponentListingService(mockListingStore, mockVectorStore);
  });

  it('getAllComponents: retourne la liste globale et le total', async () => {
    vi.mocked(mockListingStore.getAllComponents).mockResolvedValue({
      scope: 'global',
      total: 2,
      components: sampleComponents,
    });

    const res = await service.getAllComponents();
    expect(res.scope).toBe('global');
    expect(res.total).toBe(2);
    expect(res.components).toHaveLength(2);
    expect(mockListingStore.getAllComponents).toHaveBeenCalled();
  });

  it('getComponentsByTenant: filtre par tenantId', async () => {
    vi.mocked(mockListingStore.getComponentsByTenant).mockResolvedValue({
      scope: 'tenant',
      tenantId: 't1',
      total: 1,
      components: [sampleComponents[0]],
    });

    const res = await service.getComponentsByTenant('t1');
    expect(res.scope).toBe('tenant');
    expect(res.tenantId).toBe('t1');
    expect(res.components).toHaveLength(1);
    expect(res.components[0].tenantId).toBe('t1');
  });

  it('getComponentsByProject: filtre par tenantId + projectId', async () => {
    vi.mocked(mockListingStore.getComponentsByProject).mockResolvedValue({
      scope: 'project',
      tenantId: 't2',
      projectId: 'p2',
      total: 1,
      components: [sampleComponents[1]],
    });

    const res = await service.getComponentsByProject('t2', 'p2');
    expect(res.scope).toBe('project');
    expect(res.tenantId).toBe('t2');
    expect(res.projectId).toBe('p2');
    expect(res.components).toHaveLength(1);
    expect(res.components[0].tenantId).toBe('t2');
    expect(res.components[0].projectId).toBe('p2');
  });

  it('getComponent: succès quand trouvé', async () => {
    vi.mocked(mockListingStore.getComponent).mockResolvedValue({
      success: true,
      component: sampleComponents[0],
    });

    const res = await service.getComponent({ componentId: 'c1' });
    expect(res.success).toBe(true);
    expect(res.component?.id).toBe('c1');
    expect(res.message).toMatch(/récupéré avec succès/i);
  });

  it('getComponent: not found', async () => {
    vi.mocked(mockListingStore.getComponent).mockResolvedValue({
      success: false,
      component: undefined,
    });

    const res = await service.getComponent({ componentId: 'unknown' });
    expect(res.success).toBe(false);
    expect(res.component).toBeUndefined();
    expect(res.message).toMatch(/non trouvé/i);
  });

  it("getComponent: propage un message d'erreur lisible", async () => {
    vi.mocked(mockListingStore.getComponent).mockResolvedValue({
      success: false,
      component: undefined,
    });

    const res = await service.getComponent({ componentId: 'c1' });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/non trouvé/i);
  });
});