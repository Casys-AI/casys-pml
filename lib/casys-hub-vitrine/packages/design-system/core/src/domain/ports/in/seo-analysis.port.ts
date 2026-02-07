import type { SeoAnalysisCommand, SeoAnalysisResult } from '../../types/seo-analysis.types';

export interface SeoAnalysisPort {
  execute(command: SeoAnalysisCommand): Promise<SeoAnalysisResult>;
}
