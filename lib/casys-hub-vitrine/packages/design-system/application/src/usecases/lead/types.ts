/**
 * Lead Analysis Use Cases - Types
 *
 * Architecture:
 * - Dependencies: Defined here (application layer)
 * - Results: Use LeadSnapshot from ports (application layer)
 * - DTOs: Use shared DTOs from @casys/shared
 * - Entities: Use core entities from @casys/core
 */

import type {
  BusinessContextAnalysisAgentPort,
  DomainAnalysisPort,
  GoogleScrapingPort,
  GoogleTrendsPort,
  KeywordDiscoveryPort,
  KeywordEnrichmentPort,
  LeadAnalysisStorePort,
  PageScraperPort,
  PromptTemplatePort,
  SeoAnalysisAgentPort,
  SiteKeywordsPort,
} from '../../ports/out';

/**
 * Dependencies for Lead Analysis Use Cases (Full)
 */
export interface LeadAnalysisUseCaseDeps {
  store: LeadAnalysisStorePort;
  domainAnalysis: DomainAnalysisPort;
  keywordEnrichment: KeywordEnrichmentPort;
  googleTrends: GoogleTrendsPort;
  googleScraping: GoogleScrapingPort;
  promptTemplate: PromptTemplatePort;
  seoAnalysisAgent: SeoAnalysisAgentPort;
  businessContextAgent: BusinessContextAnalysisAgentPort;
  keywordDiscovery: KeywordDiscoveryPort;
  pageScraper: PageScraperPort;
  siteKeywords?: SiteKeywordsPort;
  logger?: {
    debug?: (...args: unknown[]) => void;
    log?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
}

/**
 * Dependencies for Light/Preview Use Cases (minimal, no ontology) // nan mais on a tjr besoin de l'ontology maintenant
 */
export interface LeadPreviewUseCaseDeps {
  domainAnalysis: DomainAnalysisPort;
  pageScraper: PageScraperPort;
  businessContextAgent: BusinessContextAnalysisAgentPort;
  siteKeywords?: SiteKeywordsPort;
  logger?: {
    debug?: (...args: unknown[]) => void;
    log?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
}

/**
 * Streaming callbacks for Domain Identity
 */
export interface DomainIdentityStreamingCallbacks {
  onStatus: (message: string) => Promise<void>;
  onMetrics: (metrics: unknown) => Promise<void>;
  onBusinessContext: (context: unknown) => Promise<void>;
  onKeyword: (keyword: unknown) => Promise<void>;
}

// Re-export types from core (single source of truth)
export type { LeadSeeds, LeadSnapshot } from '@casys/core';
