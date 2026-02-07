import type { KeywordTag, LeadSnapshot } from '@casys/core';

import type { BacklinksResult } from './backlinks.usecase';
import type { ContentCreationResult } from './content-creation.usecase';
import type { LeadAnalysisUseCaseDeps } from './types';

export interface DashboardSummary {
  overallScore: number; // 0-100
  scores: {
    seo: number;
    content: number;
    backlinks: number;
    keywords: number;
  };
  kpis: {
    totalKeywords: number;
    averagePosition: number;
    estimatedTraffic: number;
    referringDomains: number;
    contentGaps: number;
    opportunities: number;
  };
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  category: 'keyword' | 'content' | 'backlinks' | 'technical';
  priority: 'high' | 'medium' | 'low';
  estimatedImpact: 'high' | 'medium' | 'low';
  estimatedEffort: 'low' | 'medium' | 'high';
  actionItems: string[];
}

export interface Roadmap {
  phase1: { // 0-30 days
    title: string;
    items: string[];
  };
  phase2: { // 30-90 days
    title: string;
    items: string[];
  };
  phase3: { // 90+ days
    title: string;
    items: string[];
  };
}

export interface DashboardResult {
  summary: DashboardSummary;
  recommendations: Recommendation[];
  roadmap: Roadmap;
}

export interface DashboardCallbacks {
  onSummary: (summary: DashboardSummary) => Promise<void>;
  onRecommendation: (recommendation: Recommendation) => Promise<void>;
  onRoadmap: (roadmap: Roadmap) => Promise<void>;
  onProgress: (status: string) => Promise<void>;
}

/**
 * Lead Analysis - Dashboard (Step 5)
 * Aggregates all results and generates summary, recommendations, and roadmap
 */
export class DashboardUseCase {
  constructor(private readonly deps: LeadAnalysisUseCaseDeps) {}

  /**
   * Execute Dashboard generation with streaming
   * @param input - All results from previous steps
   * @param callbacks - SSE streaming callbacks
   */
  async execute(
    input: {
      overview: LeadSnapshot;
      enrichedKeywords: KeywordTag[];
      contentCreation: ContentCreationResult;
      backlinks: BacklinksResult;
    },
    callbacks: DashboardCallbacks
  ): Promise<DashboardResult> {
    await callbacks.onProgress('Dashboard generation temporarily simplified - needs refactoring for keyword-based approach');

    // TODO: Dashboard needs to be refactored to work with enrichedKeywords instead of opportunities/quickWins/contentGaps
    // This is Step 5 - will be implemented after defining what metrics/insights we want to show

    // Temporary simplified implementation
    const summary: DashboardSummary = {
      overallScore: 0,
      scores: {
        seo: 0,
        content: 0,
        backlinks: 0,
        keywords: 0
      },
      kpis: {
        totalKeywords: input.enrichedKeywords.length,
        averagePosition: 0,
        estimatedTraffic: 0,
        referringDomains: input.backlinks.profile.referringDomains,
        contentGaps: 0,
        opportunities: 0
      }
    };

    await callbacks.onSummary(summary);

    const recommendations: Recommendation[] = [];
    const roadmap: Roadmap = {
      phase1: { title: 'Quick Wins (0-30 days)', items: [] },
      phase2: { title: 'Content Expansion (30-90 days)', items: [] },
      phase3: { title: 'Scaling & Authority (90+ days)', items: [] }
    };

    await callbacks.onRoadmap(roadmap);
    await callbacks.onProgress('Dashboard complete (simplified)');

    return {
      summary,
      recommendations,
      roadmap
    };
  }

  // TODO: These methods will be refactored when we define Dashboard metrics
  // For now, they are not used (simplified implementation above)
}
