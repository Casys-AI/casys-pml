import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComponentUsage } from '@casys/core/src/domain/entities/component.entity';
import type { ComponentUsageStorePort } from '../../ports/out';
import { ComponentUsageService } from '../component-usage.service';

describe('ComponentUsageService (more)', () => {
  let service: ComponentUsageService;
  let store: ComponentUsageStorePort;

  beforeEach(() => {
    store = {
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
    } as any;

    service = new ComponentUsageService(store);
  });

  describe('getSectionUsages', () => {
    it('retourne les usages et le count en succès', async () => {
      const rows: ComponentUsage[] = [
        {
          id: 'u1',
          componentId: 'c1',
          textFragmentId: 'tf1',
          props: {},
          position: 1,
          isSectionHeader: false,
        },
      ];
      vi.mocked(store.getComponentUsagesBySectionId).mockResolvedValue(rows);

      const res = await service.getSectionUsages('s1', 'tenant-1');
      expect(res.success).toBe(true);
      expect(res.count).toBe(1);
      expect(res.usages[0].id).toBe('u1');
      expect(store.getComponentUsagesBySectionId).toHaveBeenCalledWith('s1', 'tenant-1');
    });

    it('renvoie tableau vide en cas derreur (fail-soft)', async () => {
      vi.mocked(store.getComponentUsagesBySectionId).mockRejectedValue(new Error('boom'));

      const res = await service.getSectionUsages('s2');
      expect(res.success).toBe(true); // le service continue avec vide
      expect(res.count).toBe(0);
      expect(res.usages).toEqual([]);
    });
  });
});
