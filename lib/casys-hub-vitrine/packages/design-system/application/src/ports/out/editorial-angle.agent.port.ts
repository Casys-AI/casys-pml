import type { SeoBriefData } from '@casys/core';

export interface EditorialAngleAgentParams {
  // SEO: optionnel (nouvel article = complet, article existant = skip)
  seoBrief: SeoBriefData;
  articleContext?: {
    title?: string;
    sectionTitles?: string[];
    internalLinksCount?: number;
    externalDomains?: string[];
  };
  businessContext: {
    targetAudience: string;
    industry: string;
    businessDescription: string;
    contentType?: string;
  };
  language: string;
  maxLen?: number; // default 120
}

export interface EditorialAngleAgentPort {
  generateAngle(params: EditorialAngleAgentParams): Promise<{ angle: string }>;
}
