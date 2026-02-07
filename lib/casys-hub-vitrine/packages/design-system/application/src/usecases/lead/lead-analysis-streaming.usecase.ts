import type { KeywordTag, LeadSnapshot } from '@casys/core';

import type { BacklinksCallbacks, BacklinksResult } from './backlinks.usecase';
import { BacklinksUseCase } from './backlinks.usecase';
import type { ContentCreationCallbacks, ContentCreationResult } from './content-creation.usecase';
import { ContentCreationUseCase } from './content-creation.usecase';
import type { DashboardCallbacks, DashboardResult } from './dashboard.usecase';
import { DashboardUseCase } from './dashboard.usecase';
import { OverviewUseCase } from './overview.usecase';
import type { DomainIdentityStreamingCallbacks, LeadAnalysisUseCaseDeps } from './types';

/**
 * Combined callbacks for all steps
 */
export interface LeadAnalysisStreamingCallbacks
  extends DomainIdentityStreamingCallbacks,
    ContentCreationCallbacks,
    BacklinksCallbacks,
    DashboardCallbacks {
  onPages: (count: number) => Promise<void>;
  onKeywords: (keywords: unknown) => Promise<void>;
  onDone: () => Promise<void>;
}

/**
 * Complete result from all steps
 */
export interface LeadAnalysisCompleteResult {
  overview: LeadSnapshot;
  enrichedKeywords: KeywordTag[]; // Keywords with AI enrichments + DataForSEO metrics (from Overview)
  contentCreation: ContentCreationResult;
  backlinks: BacklinksResult;
  dashboard: DashboardResult;
}

/**
 * Lead Analysis - Full Streaming Orchestrator
 * Executes all steps with optimal parallelization and SSE streaming
 *
 * Steps:
 * 1. Overview (metrics, business context, keyword discovery with AI enrichments + DataForSEO metrics)
 * 2. Content Creation (topic clusters, briefs, internal linking) [TODO: Refactor]
 * 3. Backlinks (profile, competitor analysis, opportunities) [Disabled - requires paid tier]
 * 4. Dashboard (summary, recommendations, roadmap)
 */
export class LeadAnalysisStreamingUseCase {
  private readonly overviewUseCase: OverviewUseCase;
  private readonly contentCreationUseCase: ContentCreationUseCase;
  private readonly backlinksUseCase: BacklinksUseCase;
  private readonly dashboardUseCase: DashboardUseCase;

  constructor(private readonly deps: LeadAnalysisUseCaseDeps) {
    this.overviewUseCase = new OverviewUseCase(deps);
    this.contentCreationUseCase = new ContentCreationUseCase(deps);
    this.backlinksUseCase = new BacklinksUseCase(deps);
    this.dashboardUseCase = new DashboardUseCase(deps);
  }

  /**
   * Execute complete lead analysis with optimal parallelization
   *
   * Execution graph:
   * ```
   * Overview (Step 1) → [Keyword Research (Step 2) // Content Creation (Step 3)]
   *       ↓
   * Backlinks (Step 4, parallel from start) NOTE : deprecated
   *       ↓
   * Dashboard (Step 5, aggregates all)
   * ```
   */
  async execute(
    input: { domain: string; force?: boolean; region?: string },
    callbacks: LeadAnalysisStreamingCallbacks
  ): Promise<LeadAnalysisCompleteResult> {
    this.deps.logger?.debug?.('[LeadAnalysisStreaming] Starting full analysis...');

    // Step 1: Overview (Backlinks disabled - requires paid DataForSeo tier)
    this.deps.logger?.debug?.('[LeadAnalysisStreaming] Starting Overview...');

    const overview = await this.overviewUseCase.execute(input, {
      onStatus: callbacks.onStatus,
      onMetrics: callbacks.onMetrics,
      onPages: callbacks.onPages,
      onBusinessContext: callbacks.onBusinessContext,
      onKeywords: callbacks.onKeywords,
      onKeyword: callbacks.onKeyword,
    });

    // Backlinks disabled (requires paid DataForSeo subscription)
    const backlinks: BacklinksResult = {
      profile: { totalBacklinks: 0, referringDomains: 0, domainRating: 0, topBacklinks: [] },
      competitorBacklinks: [],
      linkOpportunities: [],
    };
    this.deps.logger?.debug?.('[LeadAnalysisStreaming] Backlinks skipped (requires paid tier)');

    this.deps.logger?.debug?.('[LeadAnalysisStreaming] Overview + Backlinks complete');

    // Fail-fast if no discovered keywords (already enriched with DataForSEO in Overview)
    if (!overview.discoveredKeywords || overview.discoveredKeywords.length === 0) {
      throw new Error('[LeadAnalysisStreaming] No keywords discovered in Overview step');
    }

    // Step 2: Content Creation (TODO: Refactor to use enriched keywords)
    this.deps.logger?.debug?.('[LeadAnalysisStreaming] Starting Content Creation...');

    const contentCreation: ContentCreationResult = await (async () => {
      await callbacks.onProgress(
        'Content creation step temporarily disabled - needs refactoring for keyword-based approach'
      );
      return {
        topicClusters: [],
        contentBriefs: [],
        internalLinkingSuggestions: [],
      };
    })();

    this.deps.logger?.debug?.('[LeadAnalysisStreaming] Content Creation complete');

    // Step 5: Dashboard (aggregates all results)
    this.deps.logger?.debug?.('[LeadAnalysisStreaming] Generating dashboard...');

    const dashboard = await this.dashboardUseCase.execute(
      {
        overview,
        enrichedKeywords: overview.discoveredKeywords,
        contentCreation,
        backlinks,
      },
      {
        onSummary: callbacks.onSummary,
        onRecommendation: callbacks.onRecommendation,
        onRoadmap: callbacks.onRoadmap,
        onProgress: callbacks.onProgress,
      }
    );

    this.deps.logger?.debug?.('[LeadAnalysisStreaming] Complete analysis finished');
    await callbacks.onDone();

    return {
      overview,
      enrichedKeywords: overview.discoveredKeywords, // Keywords with AI enrichments + DataForSEO metrics
      contentCreation,
      backlinks,
      dashboard,
    };
  }
}
