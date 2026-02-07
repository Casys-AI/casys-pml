/**
 * Use Case: Discover RSS Feeds Based on Business Context (v2 Architecture)
 *
 * Architecture v2:
 * 1. Discover raw feeds (fast, unqualified)
 * 2. Stream all raw feeds immediately to UI
 * 3. Qualify feeds in parallel with AI
 * 4. Stream qualifications as they arrive
 * 5. Auto-select best feeds (🟢 + 🟠, max 5)
 *
 * Clean Architecture:
 * - Input: Uses DTOs from @casys/shared (API boundary)
 * - Port calls: Uses domain types from @casys/core (domain boundary)
 * - Output: Returns domain types (mapped to DTOs in API layer)
 */

import type { BusinessContextDTO } from '@casys/shared';
import type {
  DiscoveredRssFeed,
  FeedQualification,
  RawFeed,
  RssFeedDiscoveryContext} from '@casys/core';

import type { FeedQualificationPort, RssFeedDiscoveryPort, RssFeedRepositoryPort } from '../../ports/out';
import { applicationLogger as logger } from '../../utils/logger';

export interface DiscoverRssFeedsInput {
  tenantId: string; // Required for persistence
  projectId: string;
  businessContext: BusinessContextDTO;
  language: string; // ISO 639-1 code from project config (ex: 'fr', 'en', 'es')
  maxResults?: number;
  excludeUrls?: string[];
  searchDepth?: 'basic' | 'advanced'; // Tavily search depth (advanced = more credits)
  discoverySource?: 'tavily' | 'dataforseo' | 'manual'; // Source of discovery (default: dataforseo)

  // Streaming callbacks for progressive updates (v2 architecture)
  onFeedDiscovered?: (feed: RawFeed) => Promise<void> | void;
  onFeedQualifying?: (feed: RawFeed) => Promise<void> | void;
  onFeedQualified?: (feed: RawFeed, qualification: FeedQualification) => Promise<void> | void;
  onSelectionComplete?: (selected: DiscoveredRssFeed[], rejected: DiscoveredRssFeed[]) => Promise<void> | void;
  onProgress?: (message: string, step: string) => Promise<void> | void;
}

/**
 * Use case: Discover RSS feeds based on business context (v2 architecture)
 * Orchestrates: discovery → streaming → parallel qualification → auto-selection
 */
export class DiscoverRssFeedsUseCase {
  constructor(
    private readonly rssFeedDiscovery: RssFeedDiscoveryPort,
    private readonly feedQualification: FeedQualificationPort,
    private readonly rssFeedRepository: RssFeedRepositoryPort
  ) {}

  async execute(input: DiscoverRssFeedsInput): Promise<DiscoveredRssFeed[]> {
    logger.log('🔍 Discovering RSS feeds (v2) for project:', input.projectId);

    // Validate business context
    if (!input.businessContext.industry) {
      throw new Error('Business context must include industry');
    }

    if (!input.businessContext.targetAudience) {
      throw new Error('Business context must include targetAudience');
    }

    // Validate language (required from project config)
    if (!input.language?.trim()) {
      throw new Error('Language is required (should come from project config)');
    }

    logger.debug('RSS discovery input:', {
      industry: input.businessContext.industry,
      targetAudience: input.businessContext.targetAudience,
      language: input.language,
      maxResults: input.maxResults ?? 10,
    });

    // Map DTO to domain type
    const domainContext: RssFeedDiscoveryContext = {
      industry: input.businessContext.industry,
      targetAudience: input.businessContext.targetAudience,
      businessDescription: input.businessContext.businessDescription,
      contentType: input.businessContext.contentType,
    };

    // STEP 1: Discover raw feeds (fast, unqualified)
    await input.onProgress?.('Découverte des flux RSS...', 'discovery');
    const rawFeeds = await this.rssFeedDiscovery.discoverRawFeeds(domainContext, {
      maxResults: input.maxResults ?? 15, // Get more to have choice after qualification
      language: input.language,
      excludeUrls: input.excludeUrls,
      searchDepth: input.searchDepth ?? 'basic',
      onProgress: input.onProgress,
    });

    logger.log(`📰 Discovered ${rawFeeds.length} raw feeds`);

    if (rawFeeds.length === 0) {
      await input.onProgress?.('❌ Aucun flux RSS trouvé', 'done');
      return [];
    }

    // STEP 2: Stream all raw feeds immediately
    await input.onProgress?.(`Streaming de ${rawFeeds.length} flux découverts...`, 'streaming');
    for (const feed of rawFeeds) {
      await input.onFeedDiscovered?.(feed);
    }

    // STEP 3: Qualify ALL feeds in parallel
    await input.onProgress?.(`Qualification de ${rawFeeds.length} flux en parallèle...`, 'qualifying');
    const qualifications = await Promise.all(
      rawFeeds.map(async (feed) => {
        // Signal qualification start
        await input.onFeedQualifying?.(feed);

        // Qualify with AI
        const qualification = await this.feedQualification.qualifyFeed(feed, domainContext);

        // Stream qualification as soon as it arrives
        await input.onFeedQualified?.(feed, qualification);

        return qualification;
      })
    );

    // STEP 4: Combine feeds + qualifications
    const qualifiedFeeds: DiscoveredRssFeed[] = rawFeeds.map((feed, i) => ({
      feedUrl: feed.url,
      feedTitle: feed.title,
      feedDescription: feed.description,
      relevanceScore: qualifications[i].score,
      relevanceReason: qualifications[i].relevanceReason,
      category: qualifications[i].category,
      updateFrequency: qualifications[i].updateFrequency,
      lastUpdated: qualifications[i].lastUpdated,
      language: feed.language,
      websiteUrl: feed.websiteUrl,
    }));

    // STEP 5: Persist ALL qualified feeds with MERGE (idempotent, thread-safe)
    await input.onProgress?.('Persistence des flux découverts...', 'persisting');
    const persistResults = await Promise.all(
      qualifiedFeeds.map(async (feed) => {
        try {
          // Upsert idempotent (MERGE atomique, pas de check avant!)
          return await this.rssFeedRepository.upsertDiscoveredFeed(
            input.tenantId,
            input.projectId,
            feed,
            input.discoverySource ?? 'dataforseo'
          );
        } catch (error) {
          logger.error('Failed to upsert discovered feed', {
            feedUrl: feed.feedUrl,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      })
    );

    const createdCount = persistResults.filter(r => r?.wasCreated).length;
    const rediscoveredCount = persistResults.filter(r => r && !r.wasCreated).length;
    const failedCount = persistResults.filter(r => !r).length;

    logger.log(
      `💾 Persisted feeds: ${createdCount} new, ${rediscoveredCount} rediscovered, ${failedCount} failed`
    );

    // STEP 6: Auto-selection (🟢 green >= 80 + 🟠 orange >= 60, max 5)
    const selected = qualifiedFeeds
      .filter((f) => f.relevanceScore >= 60) // Green + Orange
      .sort((a, b) => b.relevanceScore - a.relevanceScore) // Best first
      .slice(0, 5); // Max 5

    const rejected = qualifiedFeeds.filter((f) => f.relevanceScore < 60); // Red

    logger.log(`✅ Auto-selected ${selected.length} feeds (🟢+🟠), rejected ${rejected.length} (🔴)`);

    await input.onSelectionComplete?.(selected, rejected);
    await input.onProgress?.(`✅ Sélection terminée: ${selected.length} flux retenus`, 'done');

    return selected;
  }
}