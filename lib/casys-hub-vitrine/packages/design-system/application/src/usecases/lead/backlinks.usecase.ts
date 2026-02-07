import type { LeadAnalysisUseCaseDeps } from './types';

export interface BacklinkProfile {
  totalBacklinks: number;
  referringDomains: number;
  domainRating: number;
  topBacklinks: {
    url: string;
    domain: string;
    anchorText: string;
    domainRating: number;
  }[];
}

export interface CompetitorBacklink {
  competitor: string;
  url: string;
  linkingDomain: string;
  anchorText: string;
  domainRating: number;
  opportunity: 'high' | 'medium' | 'low';
}

export interface LinkOpportunity {
  domain: string;
  url?: string;
  type: 'guest-post' | 'resource-page' | 'broken-link' | 'competitor-backlink';
  estimatedDR: number;
  contactInfo?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface BacklinksResult {
  profile: BacklinkProfile;
  competitorBacklinks: CompetitorBacklink[];
  linkOpportunities: LinkOpportunity[];
}

export interface BacklinksCallbacks {
  onProfile: (profile: BacklinkProfile) => Promise<void>;
  onCompetitorBacklink: (backlink: CompetitorBacklink) => Promise<void>;
  onLinkOpportunity: (opportunity: LinkOpportunity) => Promise<void>;
  onProgress: (message: string) => Promise<void>;
  onError?: (error: Error) => Promise<void>;
}

/**
 * Lead Analysis - Backlinks (Step 4)
 * Analyzes backlink profile, competitor backlinks, and link opportunities
 */
export class BacklinksUseCase {
  constructor(private readonly deps: LeadAnalysisUseCaseDeps) {}

  /**
   * Execute Backlinks analysis with streaming
   * @param input - Domain to analyze
   * @param callbacks - SSE streaming callbacks
   */
  async execute(
    input: { domain: string },
    callbacks: BacklinksCallbacks
  ): Promise<BacklinksResult> {
    await callbacks.onProgress('Analyzing backlink profile...');

    // 1. Analyze backlink profile
    // TODO: Integrate with actual backlink API (Ahrefs, SEMrush, Moz)
    const profile: BacklinkProfile = {
      totalBacklinks: 0,
      referringDomains: 0,
      domainRating: 0,
      topBacklinks: [],
    };

    // Try to get data from domain analysis if available
    try {
      const domainData = await this.deps.domainAnalysis.analyzeDomains([input.domain]);
      if (domainData[0]) {
        const metrics = domainData[0] as {
          backlinksCount?: number;
          referringDomains?: number;
          domainRank?: number;
        };
        profile.totalBacklinks = metrics.backlinksCount ?? 0;
        profile.referringDomains = metrics.referringDomains ?? 0;
        profile.domainRating = metrics.domainRank ?? 0;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.deps.logger?.warn?.('[BacklinksUseCase] Could not fetch domain metrics', err);
      if (callbacks.onError) {
        await callbacks.onError(err);
      }
    }

    await callbacks.onProfile(profile);

    // 2. Analyze competitor backlinks
    await callbacks.onProgress('Analyzing competitor backlinks...');
    const competitorBacklinks: CompetitorBacklink[] = [];

    // TODO: Implement actual competitor backlink analysis
    // For now, return empty array

    // 3. Find link opportunities
    await callbacks.onProgress('Finding link building opportunities...');
    const linkOpportunities: LinkOpportunity[] = [];

    // Generate some basic opportunities based on domain metrics
    if (profile.domainRating < 50) {
      // Suggest guest posting for lower DR sites
      const guestPostOpp: LinkOpportunity = {
        domain: 'industry-blog-placeholder.com',
        type: 'guest-post',
        estimatedDR: 60,
        priority: 'high',
      };
      linkOpportunities.push(guestPostOpp);
      await callbacks.onLinkOpportunity(guestPostOpp);
    }

    // Suggest resource pages
    const resourceOpp: LinkOpportunity = {
      domain: 'resource-directory-placeholder.com',
      type: 'resource-page',
      estimatedDR: 45,
      priority: 'medium',
    };
    linkOpportunities.push(resourceOpp);
    await callbacks.onLinkOpportunity(resourceOpp);

    await callbacks.onProgress('Backlink analysis complete');

    return {
      profile,
      competitorBacklinks,
      linkOpportunities,
    };
  }
}
