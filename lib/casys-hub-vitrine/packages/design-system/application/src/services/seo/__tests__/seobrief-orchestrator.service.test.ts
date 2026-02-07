import { describe, it, expect, vi } from 'vitest';
import type { SeoBriefData } from '@casys/core';
import type { SeoBriefStorePort } from '../../../ports/out';
import { SeoBriefOrchestrator } from '../seobrief-orchestrator.service';

describe('SeoBriefOrchestrator', () => {
  it('should be idempotent: reuse existing SeoBrief if already created for project', async () => {
    const mockStore: SeoBriefStorePort = {
      getSeoBriefForProject: vi.fn().mockResolvedValue({
        id: 'seobrief_t1_p1',
        keywordTags: [{ label: 'test', slug: 'test' }],
      }),
      saveSeoBriefForProject: vi.fn(),
    } as any;

    const orchestrator = new SeoBriefOrchestrator(mockStore);

    const result = await orchestrator.persistProjectBrief({
      tenantId: 't1',
      projectId: 'p1',
      seoBriefData: {} as SeoBriefData,
    });

    // ✅ Should return existing ID without calling save
    expect(result.seoBriefId).toBe('seobrief_t1_p1');
    expect(mockStore.getSeoBriefForProject).toHaveBeenCalledWith({ tenantId: 't1', projectId: 'p1' });
    expect(mockStore.saveSeoBriefForProject).not.toHaveBeenCalled();
  });

  it('should create SeoBrief if none exists for project', async () => {
    const mockStore: SeoBriefStorePort = {
      getSeoBriefForProject: vi.fn().mockResolvedValue(undefined),
      saveSeoBriefForProject: vi.fn().mockResolvedValue({ seoBriefId: 'seobrief_t1_p1' }),
    } as any;

    const orchestrator = new SeoBriefOrchestrator(mockStore);

    const result = await orchestrator.persistProjectBrief({
      tenantId: 't1',
      projectId: 'p1',
      seoBriefData: { keywordTags: [], userQuestions: [] } as SeoBriefData,
    });

    // ✅ Should create new SeoBrief
    expect(result.seoBriefId).toBe('seobrief_t1_p1');
    expect(mockStore.getSeoBriefForProject).toHaveBeenCalledWith({ tenantId: 't1', projectId: 'p1' });
    expect(mockStore.saveSeoBriefForProject).toHaveBeenCalled();
  });
});
