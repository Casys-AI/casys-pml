export interface SeoKeywordsMetricsCommand {
  tenantId: string;
  projectId: string;
  language: string;
  seedsOverride?: string[];
  depth?: number;
  forceRegenerate?: boolean;
  dryRun?: boolean;
}

export interface SeoKeywordsMetricsResult {
  success: boolean;
  seedsCount: number;
  newPlansCount: number;
  relatedKeywordsCount: number;
  planIds: string[];
  errors: string[];
}

export interface SeoKeywordsMetricsPort {
  execute(command: SeoKeywordsMetricsCommand): Promise<SeoKeywordsMetricsResult>;
}
