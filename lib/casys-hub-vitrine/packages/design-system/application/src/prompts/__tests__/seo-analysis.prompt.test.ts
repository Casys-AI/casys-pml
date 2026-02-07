import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeoAnalysisPromptDTO } from '@casys/shared';

import type { PromptTemplatePort } from '../../ports/out';
import { buildSeoAnalysisPoml } from '../seo-analysis.prompt';

// Mock du PromptTemplatePort
const mockLoadTemplate = vi.fn();
const mockTemplatePort: PromptTemplatePort = {
  loadTemplate: mockLoadTemplate,
};

describe('seo-analysis.prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockValidParams: SeoAnalysisPromptDTO = {
    keywords: ['seo', 'marketing', 'digital'],
    maxKeywords: 10,
    targetAudience: 'entrepreneurs',
    businessDescription: 'Agence de marketing digital spécialisée SEO',
    industry: 'marketing',
    competitorTitles: ['Competitor 1', 'Competitor 2'],
    trendData: ['keyword1: rising', 'keyword2: stable'],
    webContext: 'competitive analysis context',
    language: 'fr',
    trendPriority: 0.5,
    excludeCategories: [],
  };

  const mockTemplate = `
<poml>
<system>
Tu es un expert SEO. Analyse les mots-clés: {{keywords}}
Concurrents: {{competitorTitles}}
Tendances: {{trendData}}
Contexte web: {{webContext}}
Audience: {{targetAudience}}
Max keywords: {{maxKeywords}}
</system>
</poml>`;

  describe('buildSeoAnalysisPoml', () => {
    it('should build POML successfully with valid parameters', async () => {
      const templatePath = 'prompts/seo-analysis.poml';
      mockLoadTemplate.mockResolvedValue(mockTemplate);

      const result = await buildSeoAnalysisPoml(
        mockTemplatePort,
        templatePath,
        mockValidParams
      );

      expect(mockLoadTemplate).toHaveBeenCalledWith(templatePath);
      expect(result).toContain('<env');
      expect(result).not.toMatch(/\{\{\s*\w+\s*\}\}/);
    });

    it('should fail-fast if templatePath is missing', async () => {
      await expect(
        buildSeoAnalysisPoml(mockTemplatePort, '', mockValidParams)
      ).rejects.toThrow('[seo-analysis.prompt] Paramètre requis manquant: templatePath');

      await expect(
        buildSeoAnalysisPoml(mockTemplatePort, '   ', mockValidParams)
      ).rejects.toThrow('[seo-analysis.prompt] Paramètre requis manquant: templatePath');
    });

    it('should fail-fast if keywords are missing', async () => {
      const invalidParams = { ...mockValidParams, keywords: undefined as any };

      await expect(
        buildSeoAnalysisPoml(mockTemplatePort, 'test.poml', invalidParams)
      ).rejects.toThrow('[seo-analysis.prompt] Paramètre requis manquant: keywords');
    });

    it('should fail-fast if keywords are empty', async () => {
      const invalidParams = { ...mockValidParams, keywords: [] };

      await expect(
        buildSeoAnalysisPoml(mockTemplatePort, 'test.poml', invalidParams)
      ).rejects.toThrow('[seo-analysis.prompt] Paramètre requis manquant: keywords');
    });

    it('should fail-fast if maxKeywords is invalid', async () => {
      const invalidParams = { ...mockValidParams, maxKeywords: 0 };

      await expect(
        buildSeoAnalysisPoml(mockTemplatePort, 'test.poml', invalidParams)
      ).rejects.toThrow('[seo-analysis.prompt] maxKeywords requis (>0)');

      const invalidParams2 = { ...mockValidParams, maxKeywords: -1 };

      await expect(
        buildSeoAnalysisPoml(mockTemplatePort, 'test.poml', invalidParams2)
      ).rejects.toThrow('[seo-analysis.prompt] maxKeywords requis (>0)');

      const invalidParams3 = { ...mockValidParams, maxKeywords: undefined as any };

      await expect(
        buildSeoAnalysisPoml(mockTemplatePort, 'test.poml', invalidParams3)
      ).rejects.toThrow('[seo-analysis.prompt] maxKeywords requis (>0)');
    });

    it('should fail-fast if targetAudience is missing', async () => {
      const invalidParams = { ...mockValidParams, targetAudience: '' };

      await expect(
        buildSeoAnalysisPoml(mockTemplatePort, 'test.poml', invalidParams)
      ).rejects.toThrow('[seo-analysis.prompt] Paramètre requis manquant: targetAudience');
    });

    it('should fail-fast if projectContext is missing', async () => {
      const invalidParams = { ...mockValidParams, projectContext: null as any };

      await expect(
        buildSeoAnalysisPoml(mockTemplatePort, 'test.poml', invalidParams)
      ).rejects.toThrow('[seo-analysis.prompt] Paramètre requis manquant: projectContext');
    });

    it('should allow missing competitorTitles (IA-first, optional)', async () => {
      mockLoadTemplate.mockResolvedValue(mockTemplate);
      const params = { ...mockValidParams, competitorTitles: undefined as any };
      const result = await buildSeoAnalysisPoml(mockTemplatePort, 'test.poml', params);
      expect(typeof result).toBe('string');
      expect(result).toContain('<env');
    });

    it('should allow missing trendData (IA-first, optional)', async () => {
      mockLoadTemplate.mockResolvedValue(mockTemplate);
      const params = { ...mockValidParams, trendData: [] };
      const result = await buildSeoAnalysisPoml(mockTemplatePort, 'test.poml', params);
      expect(typeof result).toBe('string');
      expect(result).toContain('<env');
    });

    it('should allow missing webContext (IA-first, optional)', async () => {
      mockLoadTemplate.mockResolvedValue(mockTemplate);
      const params = { ...mockValidParams, webContext: '   ' };
      const result = await buildSeoAnalysisPoml(mockTemplatePort, 'test.poml', params);
      expect(typeof result).toBe('string');
      expect(result).toContain('<env');
    });

    it('should not fail when template contains unknown variables (renderer tolerant)', async () => {
      const brokenTemplate = '<poml><invalid>{{unknownVar}}</invalid></poml>';
      mockLoadTemplate.mockResolvedValue(brokenTemplate);

      const result = await buildSeoAnalysisPoml(
        mockTemplatePort,
        'test.poml',
        mockValidParams
      );
      expect(typeof result).toBe('string');
      expect(result).toContain('<env');
    });

    it('should handle template loading errors', async () => {
      mockLoadTemplate.mockRejectedValue(new Error('Template not found'));

      await expect(
        buildSeoAnalysisPoml(mockTemplatePort, 'nonexistent.poml', mockValidParams)
      ).rejects.toThrow('Template not found');
    });

    it('should handle array parameters correctly', async () => {
      const templateWithArrays = `
<poml>
<system>
Keywords: {{keywords}}
Competitors: {{competitorTitles}}
Trends: {{trendData}}
</system>
</poml>`;

      mockLoadTemplate.mockResolvedValue(templateWithArrays);

      const paramsWithArrays: SeoAnalysisPromptDTO = {
        ...mockValidParams,
        keywords: ['test1', 'test2', 'test3'],
        competitorTitles: ['Site A', 'Site B'],
        trendData: ['trend1: +50%', 'trend2: -10%'],
      };

      const result = await buildSeoAnalysisPoml(
        mockTemplatePort,
        'test.poml',
        paramsWithArrays
      );

      expect(result).toContain('<env');
      expect(result).not.toMatch(/\{\{\s*\w+\s*\}\}/);
    });

    it('should convert maxKeywords to string (no unresolved placeholders)', async () => {
      const templateWithMaxKeywords = `
<poml>
<system>Max: {{maxKeywords}}</system>
</poml>`;

      mockLoadTemplate.mockResolvedValue(templateWithMaxKeywords);

      const result = await buildSeoAnalysisPoml(
        mockTemplatePort,
        'test.poml',
        { ...mockValidParams, maxKeywords: 15 }
      );

      expect(result).toContain('<env');
      expect(result).not.toMatch(/\{\{\s*\w+\s*\}\}/);
    });
  });
});
