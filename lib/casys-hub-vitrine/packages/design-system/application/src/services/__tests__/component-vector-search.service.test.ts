import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComponentSearchPort } from '../../ports/out';
import { ComponentVectorSearchService } from '../component-vector-search.service';

describe('ComponentVectorSearchService', () => {
  let service: ComponentVectorSearchService;
  let mockComponentSearchPort: ComponentSearchPort;

  beforeEach(() => {
    // Mock pour ComponentSearchPort
    mockComponentSearchPort = {
      searchComponentsWithContext: vi.fn().mockResolvedValue([]),
    };

    service = new ComponentVectorSearchService(mockComponentSearchPort);
  });

  describe('searchComponentsWithContext', () => {
    it('should search components with context successfully', async () => {
      const mockResults = [
        {
          id: 'component-1',
          metadata: { name: 'TestComponent', category: 'ui' },
          similarity: 0.9,
        },
      ];

      mockComponentSearchPort.searchComponentsWithContext = vi.fn().mockResolvedValue(mockResults);

      const query = 'test component';
      const context = { categories: ['ui'] }; // Corriger le format du contexte
      const limit = 10;

      const result = await service.searchComponentsWithContext(query, context, limit);

      expect(result).toEqual(mockResults);
      expect(mockComponentSearchPort.searchComponentsWithContext).toHaveBeenCalledWith(
        query,
        context,
        limit
      );
    });

    it('should handle empty search results', async () => {
      mockComponentSearchPort.searchComponentsWithContext = vi.fn().mockResolvedValue([]);

      const result = await service.searchComponentsWithContext('nonexistent', {}, 10);

      expect(result).toEqual([]);
      expect(mockComponentSearchPort.searchComponentsWithContext).toHaveBeenCalledWith(
        'nonexistent',
        {},
        10
      );
    });

    it('should propagate search errors', async () => {
      const searchError = new Error('Search failed');
      mockComponentSearchPort.searchComponentsWithContext = vi.fn().mockRejectedValue(searchError);

      await expect(service.searchComponentsWithContext('test', {}, 10)).rejects.toThrow(
        'Search failed'
      );
    });
  });
});
