import { describe, it, expect, vi } from 'vitest';

import { SeoAnalysisUseCase } from '../seo-analysis.usecase';

// Minimal deps for constructor; tests assert early fail-fast in execute()
const deps = {
  aiTextModel: { generate: vi.fn() },
  promptTemplate: { getTemplate: vi.fn() },
  googleScraping: { scrape: vi.fn(), scrapeTopResults: vi.fn() },
  googleTrends: { getTrends: vi.fn() },
  keywordEnrichment: { enrichKeywords: vi.fn(), getRelatedKeywords: vi.fn() },
  domainAnalysis: { analyze: vi.fn() },
  keywordPlanRepo: { getKeywordPlanBySeed: vi.fn(), getKeywordPlanById: vi.fn() },
  configReader: { getProjectConfig: vi.fn() },
  projectSettings: { getSeoProjectSettings: vi.fn() },
  seoAnalysisAgent: { analyze: vi.fn() },
} as const;

describe('SeoAnalysisUseCase - invariants', () => {
  it('should fail-fast when tenantId/projectId are missing', async () => {
    const uc = SeoAnalysisUseCase.create(deps as any);
    await expect(uc.execute({ tenantId: '', projectId: '', language: 'fr' } as any))
      .rejects.toThrow('tenantId et projectId requis');
  });

  it('should fail-fast when language is missing', async () => {
    const uc = SeoAnalysisUseCase.create(deps as any);
    await expect(uc.execute({ tenantId: 't1', projectId: 'p1', language: '' } as any))
      .rejects.toThrow('language requis dans la commande');
  });
});
