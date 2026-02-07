import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ComponentUsage } from '@casys/core/src/domain/entities/component.entity';
import type { ComponentUsageStorePort } from '@casys/application';
import {
  type ComponentUsageCreationParams,
  ComponentUsageService,
} from '../component-usage.service';

describe('ComponentUsageService', () => {
  let service: ComponentUsageService;
  let mockUsageStore: ComponentUsageStorePort;

  const mockComponentUsage: ComponentUsage = {
    id: 'usage-123',
    componentId: 'comp-456',
    textFragmentId: 'fragment-789',
    props: { title: 'Test Button', variant: 'primary' },
    position: 1,
    isSectionHeader: false,
  };

  beforeEach(() => {
    mockUsageStore = {
      // CREATE
      createComponentUsages: vi.fn(),
      // READ
      getComponentUsageById: vi.fn(),
      getComponentUsagesBySectionId: vi.fn(),
      getComponentUsagesByArticleId: vi.fn(),
      getComponentUsagesByComponentId: vi.fn(),
      // UPDATE
      updateComponentUsage: vi.fn(),
      updateComponentUsageProps: vi.fn(),
      // DELETE
      deleteComponentUsageById: vi.fn(),
      deleteComponentUsagesBySectionId: vi.fn(),
      deleteComponentUsagesByArticleId: vi.fn(),
      // ANALYTICS
      countComponentUsages: vi.fn(),
      // MAINTENANCE
      clearComponentUsages: vi.fn(),
    } as unknown as ComponentUsageStorePort;

    service = new ComponentUsageService(mockUsageStore);
  });

  describe('createComponentUsage', () => {
    const validParams: ComponentUsageCreationParams = {
      componentId: 'comp-456',
      textFragmentId: 'fragment-789',
      props: { title: 'Test Button', variant: 'primary' },
      position: 1,
      tenantId: 'tenant-123',
    };

    it('should create component usage successfully', async () => {
      vi.mocked(mockUsageStore.createComponentUsages).mockResolvedValue();

      const result = await service.createComponentUsage(validParams);

      expect(result.success).toBe(true);
      expect(result.usage).toBeDefined();
      expect(result.usage?.componentId).toBe(validParams.componentId);
      expect(result.usage?.textFragmentId).toBe(validParams.textFragmentId);
      expect(result.usage?.props).toEqual(validParams.props);
      expect(result.usage?.position).toBe(validParams.position);
      expect(result.usage?.isSectionHeader).toBe(false);
      expect(result.usage?.id).toBeDefined();
    });

    it('should set isSectionHeader to true when specified', async () => {
      vi.mocked(mockUsageStore.createComponentUsages).mockResolvedValue();

      const paramsWithHeader = { ...validParams, isSectionHeader: true };
      const result = await service.createComponentUsage(paramsWithHeader);

      expect(result.success).toBe(true);
      expect(result.usage?.isSectionHeader).toBe(true);
    });

    it('should call store with correct parameters', async () => {
      vi.mocked(mockUsageStore.createComponentUsages).mockResolvedValue();

      await service.createComponentUsage(validParams);

      expect(mockUsageStore.createComponentUsages).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            componentId: validParams.componentId,
            textFragmentId: validParams.textFragmentId,
            props: validParams.props,
            position: validParams.position,
            isSectionHeader: false,
          }),
        ]),
        validParams.tenantId
      );
    });

    it('should generate unique IDs for usages', async () => {
      vi.mocked(mockUsageStore.createComponentUsages).mockResolvedValue();

      const result1 = await service.createComponentUsage(validParams);
      const result2 = await service.createComponentUsage(validParams);

      expect(result1.usage?.id).toBeDefined();
      expect(result2.usage?.id).toBeDefined();
      expect(result1.usage?.id).not.toBe(result2.usage?.id);
    });

    it('should handle store errors gracefully', async () => {
      const error = new Error('Database connection failed');
      vi.mocked(mockUsageStore.createComponentUsages).mockRejectedValue(error);

      const result = await service.createComponentUsage(validParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
      expect(result.usage).toBeUndefined();
    });

    it('should handle unknown errors', async () => {
      vi.mocked(mockUsageStore.createComponentUsages).mockRejectedValue('String error');

      const result = await service.createComponentUsage(validParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur inconnue');
    });

    it('should work without tenantId', async () => {
      vi.mocked(mockUsageStore.createComponentUsages).mockResolvedValue();

      const paramsWithoutTenant = { ...validParams };
      delete (paramsWithoutTenant as any).tenantId;

      const result = await service.createComponentUsage(paramsWithoutTenant);

      expect(result.success).toBe(true);
      expect(mockUsageStore.createComponentUsages).toHaveBeenCalledWith(
        expect.any(Array),
        undefined
      );
    });
  });

  describe('getComponentUsages', () => {
    const mockUsages: ComponentUsage[] = [
      mockComponentUsage,
      {
        id: 'usage-456',
        componentId: 'comp-456',
        textFragmentId: 'fragment-890',
        props: { title: 'Another Button', variant: 'secondary' },
        position: 2,
        isSectionHeader: true,
      },
    ];

    it('should retrieve component usages successfully', async () => {
      vi.mocked(mockUsageStore.getComponentUsagesByComponentId).mockResolvedValue(mockUsages);

      const result = await service.getComponentUsages('comp-456', 'tenant-123');

      expect(result.success).toBe(true);
      expect(result.usages).toEqual(mockUsages);
      expect(result.count).toBe(2);
    });

    it('should call store with correct parameters', async () => {
      vi.mocked(mockUsageStore.getComponentUsagesByComponentId).mockResolvedValue(mockUsages);

      await service.getComponentUsages('comp-456', 'tenant-123');

      expect(mockUsageStore.getComponentUsagesByComponentId).toHaveBeenCalledWith(
        'comp-456',
        'tenant-123'
      );
    });

    it('should work without tenantId', async () => {
      vi.mocked(mockUsageStore.getComponentUsagesByComponentId).mockResolvedValue(mockUsages);

      await service.getComponentUsages('comp-456');

      expect(mockUsageStore.getComponentUsagesByComponentId).toHaveBeenCalledWith(
        'comp-456',
        undefined
      );
    });

    it('should handle empty results', async () => {
      vi.mocked(mockUsageStore.getComponentUsagesByComponentId).mockResolvedValue([]);

      const result = await service.getComponentUsages('comp-nonexistent');

      expect(result.success).toBe(true);
      expect(result.usages).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should handle store errors gracefully', async () => {
      const error = new Error('Query failed');
      vi.mocked(mockUsageStore.getComponentUsagesByComponentId).mockRejectedValue(error);

      const result = await service.getComponentUsages('comp-456');

      expect(result.success).toBe(false);
      expect(result.usages).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should handle unknown errors', async () => {
      vi.mocked(mockUsageStore.getComponentUsagesByComponentId).mockRejectedValue('Network error');

      const result = await service.getComponentUsages('comp-456');

      expect(result.success).toBe(false);
      expect(result.usages).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex props objects', async () => {
      vi.mocked(mockUsageStore.createComponentUsages).mockResolvedValue();

      const complexProps = {
        title: 'Complex Button',
        onClick: 'handleClick',
        style: {
          backgroundColor: '#007bff',
          padding: '10px 20px',
          borderRadius: '4px',
        },
        children: ['Icon', 'Text'],
        metadata: {
          analyticsId: 'btn_001',
          testId: 'submit-button',
        },
      };

      const params: ComponentUsageCreationParams = {
        componentId: 'comp-456',
        textFragmentId: 'fragment-789',
        props: complexProps,
        position: 1,
      };

      const result = await service.createComponentUsage(params);

      expect(result.success).toBe(true);
      expect(result.usage?.props).toEqual(complexProps);
    });

    it('should handle multiple concurrent creations', async () => {
      vi.mocked(mockUsageStore.createComponentUsages).mockResolvedValue();

      const params1: ComponentUsageCreationParams = {
        componentId: 'comp-1',
        textFragmentId: 'fragment-1',
        props: { title: 'Button 1' },
        position: 1,
      };

      const params2: ComponentUsageCreationParams = {
        componentId: 'comp-2',
        textFragmentId: 'fragment-2',
        props: { title: 'Button 2' },
        position: 2,
      };

      const [result1, result2] = await Promise.all([
        service.createComponentUsage(params1),
        service.createComponentUsage(params2),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.usage?.id).not.toBe(result2.usage?.id);
      expect(mockUsageStore.createComponentUsages).toHaveBeenCalledTimes(2);
    });
  });
});
