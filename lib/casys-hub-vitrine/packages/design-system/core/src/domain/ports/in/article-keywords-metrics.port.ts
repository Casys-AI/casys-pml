export interface ArticleKeywordsMetricsCommand {
  tenantId: string;
  projectId: string;
  language: string;
  labels: string[]; // keywords d'article à enrichir
  articleId?: string; // optionnel, pour tracer un planHash spécifique
  dryRun?: boolean;
}

export interface ArticleKeywordsMetricsResult {
  success: boolean;
  enrichedCount: number;
  errors: string[];
}

export interface ArticleKeywordsMetricsPort {
  execute(command: ArticleKeywordsMetricsCommand): Promise<ArticleKeywordsMetricsResult>;
}
