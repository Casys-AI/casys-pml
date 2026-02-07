/**
 * RSS Feed Discovery Adapter using DataForSEO SERP + AI Agent
 * Discovers RSS feeds from websites found via DataForSEO search
 *
 * Flow:
 * 1. AI Agent generates optimal RSS-focused queries
 * 2. DataForSEO SERP finds relevant websites
 * 3. AI Agent qualifies results for relevance
 * 4. RSS detection via HTTP HEAD requests + HTML parsing fallback
 */

import * as cheerio from 'cheerio';
import * as dfs from 'dataforseo-client';
import Parser from 'rss-parser';

import {
  type DiscoveredRssFeed,
  mapLanguageToCountryName,  mapLanguageToRegion,
  type RssFeedDiscoveryContext,
  type RssFeedDiscoveryOptions } from '@casys/core';
import type { AITextModelPort,RssFeedDiscoveryPort } from '@casys/application';

import { createLogger } from '../../../utils/logger';
import { RssDiscoveryAgent, type SerpResult } from '../ai/agents/rss-discovery.agent';

const logger = createLogger('DataForSeoRssDiscoveryAdapter');

/**
 * Adapter implementing RssFeedDiscoveryPort using DataForSEO SERP + AI Agent
 */
export class DataForSeoRssDiscoveryAdapter implements RssFeedDiscoveryPort {
  private readonly serpApi: dfs.SerpApi;
  private readonly authFetch: (url: RequestInfo, init?: RequestInit) => Promise<Response>;

  constructor(
    private readonly aiTextModel: AITextModelPort,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {
    // Setup auth
    const login = env.DATAFORSEO_LOGIN;
    const password = env.DATAFORSEO_PASSWORD;
    const apiKey = env.DATAFORSEO_API_KEY;
    const baseUrl = env.DATAFORSEO_BASE_URL ?? 'https://api.dataforseo.com';

    let authHeader: string;
    if (apiKey && apiKey.trim().length > 0) {
      authHeader = `Bearer ${apiKey.trim()}`;
    } else if (login && password) {
      authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
    } else {
      throw new Error(
        'DataForSEO credentials missing: set DATAFORSEO_API_KEY or DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD'
      );
    }

    // Authenticated fetch for SDK
    this.authFetch = (url: RequestInfo, init?: RequestInit) => {
      const headers = {
        ...(init?.headers as Record<string, string> | undefined),
        Authorization: authHeader,
      };
      return fetch(url, { ...init, headers });
    };

    // Initialize SERP API client
    this.serpApi = new dfs.SerpApi(baseUrl, { fetch: this.authFetch });

    logger.debug('DataForSeoRssDiscoveryAdapter initialized');
  }

  async discoverFeeds(
    context: RssFeedDiscoveryContext,
    options?: RssFeedDiscoveryOptions & {
      onFeedDiscovered?: (feed: DiscoveredRssFeed, progress: { current: number; total: number }) => void | Promise<void>;
      onProgress?: (message: string, step: string) => void | Promise<void>;
    }
  ): Promise<DiscoveredRssFeed[]> {
    // Validate language
    const language = options?.language;
    if (!language) {
      throw new Error('Language is required (should come from project config via use case)');
    }

    // Map language to region and country name using core mappers
    const region = mapLanguageToRegion(language); // 'fr' → 'FR', 'en' → 'US'
    const countryName = mapLanguageToCountryName(language); // 'fr' → 'france', 'en' → 'united states'

    logger.debug('🔍 Starting DataForSEO RSS discovery for business context:', {
      industry: context.industry,
      targetAudience: context.targetAudience,
      language,
      region,
      countryName,
    });

    try {
      // Create agent with language-specific config
      const rssAgent = new RssDiscoveryAgent(this.aiTextModel, {
        maxResults: 20,
        minQualificationScore: 0.7,
        language,
        country: region,
        countryName
      });

      // Step 1-3: AI Agent generates queries, searches SERP, qualifies results
      const qualifiedSites = await rssAgent.discoverRssFeeds(
        context,
        (query) => this.searchWithDataForSeo(query, language, region),
        options?.onProgress
      );

      logger.log(`✅ AI Agent qualified ${qualifiedSites.length} sites`);

      // Step 4: Detect RSS feeds on qualified sites (with streaming)
      await options?.onProgress?.(`Détection de flux RSS sur ${qualifiedSites.length} sites...`, 'detect');
      const rssFeeds = await this.detectRssFeeds(
        qualifiedSites,
        options?.excludeUrls,
        options?.maxResults ?? 15,
        options?.onFeedDiscovered
      );

      logger.log(`📰 Detected ${rssFeeds.length} RSS feeds`);

      // Step 5: Limit results
      const maxResultsToReturn = options?.maxResults ?? 10;
      const limitedFeeds = rssFeeds.slice(0, maxResultsToReturn);

      await options?.onProgress?.(`✅ Découverte terminée: ${limitedFeeds.length} flux RSS`, 'done');
      logger.log(`✅ Returning ${limitedFeeds.length} RSS feed suggestions`);

      return limitedFeeds;

    } catch (error) {
      logger.error('❌ Error discovering RSS feeds:', error);
      await options?.onProgress?.('❌ Erreur lors de la découverte', 'error');
      return [];
    }
  }

  /**
   * Discover raw RSS feeds without qualification (v2 architecture)
   * Returns unqualified feeds for Use Case to qualify in parallel
   */
  async discoverRawFeeds(
    context: RssFeedDiscoveryContext,
    options?: RssFeedDiscoveryOptions
  ): Promise<import('@casys/core').RawFeed[]> {
    // Validate language
    const language = options?.language;
    if (!language) {
      throw new Error('Language is required (should come from project config via use case)');
    }

    // Map language to region and country name using core mappers
    const region = mapLanguageToRegion(language);
    const countryName = mapLanguageToCountryName(language);

    logger.debug('🔍 Starting raw feed discovery (v2):', {
      industry: context.industry,
      language,
      region,
      countryName,
    });

    try {
      await options?.onProgress?.('Génération des requêtes de recherche...', 'queries');

      // Create agent for query generation only
      const rssAgent = new RssDiscoveryAgent(this.aiTextModel, {
        maxResults: 20,
        minQualificationScore: 0.7,
        language,
        country: region,
        countryName
      });

      // Step 1: Generate search queries
      const queries = await rssAgent.generateRssSearchQueries(context);
      logger.log(`🔍 Generated ${queries.length} search queries`);

      await options?.onProgress?.(`Recherche de sites pertinents (${queries.length} requêtes)...`, 'search');

      // Step 2: Search with DataForSEO (all queries in parallel)
      const searchPromises = queries.map(query => 
        this.searchWithDataForSeo(query, language, region)
      );
      const searchResults = await Promise.all(searchPromises);
      
      // Flatten and deduplicate results
      const allResults = searchResults.flat();
      const uniqueResults = Array.from(
        new Map(allResults.map(r => [r.url, r])).values()
      );

      logger.log(`✅ Found ${uniqueResults.length} unique sites from SERP`);

      await options?.onProgress?.(`Détection de flux RSS sur ${uniqueResults.length} sites...`, 'detect');

      // Step 3: Detect RSS feeds (convert to RawFeed format)
      const rawFeeds: import('@casys/core').RawFeed[] = [];
      const excludeSet = new Set(options?.excludeUrls ?? []);
      const seenFeedUrls = new Set<string>(); // Track discovered feedUrls to avoid duplicates
      const maxResults = options?.maxResults ?? 15;

      for (const result of uniqueResults) {
        if (rawFeeds.length >= maxResults) break;
        if (excludeSet.has(result.url)) continue;

        // Try to find RSS feed URL
        const feedUrl = await this.findRssFeed(result.url);

        // Check if feedUrl is valid, not excluded, and not already discovered
        if (feedUrl && !excludeSet.has(feedUrl) && !seenFeedUrls.has(feedUrl)) {
          seenFeedUrls.add(feedUrl); // Mark as seen to prevent duplicates
          // Parse the actual RSS feed to get real content (much better for AI qualification)
          const feedContent = await this.parseRssFeed(feedUrl);

          if (feedContent) {
            // Use real RSS feed data
            const enrichedDescription = feedContent.recentArticles.length > 0
              ? `${feedContent.description}\n\nArticles récents: ${feedContent.recentArticles.slice(0, 3).join(' | ')}`
              : feedContent.description;

            rawFeeds.push({
              url: feedUrl,
              title: feedContent.title,
              description: enrichedDescription,
              websiteUrl: result.url,
              language
            });

            logger.debug(`✅ Found RSS feed: ${feedUrl} → "${feedContent.title}"`);
          } else {
            // Fallback to HTML meta tags if RSS parsing fails
            rawFeeds.push({
              url: feedUrl,
              title: result.title || 'Unknown',
              description: result.description?.substring(0, 200),
              websiteUrl: result.url,
              language
            });

            logger.debug(`✅ Found RSS feed: ${feedUrl} (parsed from HTML meta)`);
          }
        }
      }

      logger.log(`📰 Detected ${rawFeeds.length} raw RSS feeds (unqualified)`);
      
      return rawFeeds;

    } catch (error) {
      logger.error('❌ Error discovering raw feeds:', error);
      await options?.onProgress?.('❌ Erreur lors de la découverte', 'error');
      return [];
    }
  }

  /**
   * Search with DataForSEO SERP API using SDK
   * Uses DataForSEO location codes for precise geotargeting
   */
  private async searchWithDataForSeo(query: string, language: string, region: string): Promise<SerpResult[]> {
    logger.debug(`🔎 DataForSEO SERP search: "${query}" (${language}, ${region})`);

    // Map region to DataForSEO location_code
    // See: https://docs.dataforseo.com/v3/serp/google/locations/
    const locationCodeMap: Record<string, number> = {
      'FR': 2250,  // France
      'US': 2840,  // United States
      'ES': 2724,  // Spain
      'DE': 2276,  // Germany
      'IT': 2380,  // Italy
      'BR': 2076,  // Brazil
      'GB': 2826,  // United Kingdom (for 'en-gb')
    };

    const locationCode = locationCodeMap[region] ?? 2840; // Default to US if not found

    try {
      // Create task for live advanced search
      const task = new dfs.SerpGoogleOrganicLiveAdvancedRequestInfo();
      task.keyword = query;
      task.language_code = language;
      task.location_code = locationCode;
      task.device = 'desktop';
      task.os = 'windows';

      // Execute live search
      const response = await this.serpApi.googleOrganicLiveAdvanced([task]);

      // Parse results
      const results: SerpResult[] = [];

      if (response?.tasks && response.tasks.length > 0) {
        const taskResult = response.tasks[0];

        if (taskResult.result && taskResult.result.length > 0) {
          const serpResult = taskResult.result[0];

          if (serpResult.items && Array.isArray(serpResult.items)) {
            for (const item of serpResult.items) {
              if (item.type === 'organic' && item.url && item.title) {
                results.push({
                  title: item.title,
                  url: item.url,
                  description: item.description ?? '',
                  position: item.rank_absolute ?? item.rank_group ?? 0
                });
              }
            }
          }
        }
      }

      logger.debug(`  ✓ DataForSEO found ${results.length} organic results`);
      return results;

    } catch (error) {
      logger.warn(`⚠️ DataForSEO search failed for "${query}":`, error);
      return [];
    }
  }

  /**
   * Detect RSS feeds on discovered websites
   * Stops when maxResults is reached for efficiency
   * Optionally streams discovered feeds via callback
   */
  private async detectRssFeeds(
    qualifiedSites: DiscoveredRssFeed[],
    excludeUrls?: string[],
    maxResults = 15,
    onFeedDiscovered?: (feed: DiscoveredRssFeed, progress: { current: number; total: number }) => void | Promise<void>
  ): Promise<DiscoveredRssFeed[]> {
    const feeds: DiscoveredRssFeed[] = [];
    const excludeSet = new Set(excludeUrls ?? []);
    const seenFeedUrls = new Set<string>(); // Track discovered feedUrls to avoid duplicates

    for (const site of qualifiedSites) {
      // Stop when we have enough feeds
      if (feeds.length >= maxResults) {
        logger.debug(`✅ Found ${maxResults} RSS feeds, stopping search`);
        break;
      }

      // Skip if URL in exclude list
      if (!site.websiteUrl || excludeSet.has(site.websiteUrl)) {
        continue;
      }

      // Try to detect RSS feed
      const feedUrl = await this.findRssFeed(site.websiteUrl);

      // Check if feedUrl is valid, not excluded, and not already discovered
      if (feedUrl && !excludeSet.has(feedUrl) && !seenFeedUrls.has(feedUrl)) {
        seenFeedUrls.add(feedUrl); // Mark as seen to prevent duplicates

        const discoveredFeed: DiscoveredRssFeed = {
          ...site,
          feedUrl
        };

        feeds.push(discoveredFeed);

        // Stream the feed immediately if callback provided
        if (onFeedDiscovered) {
          await onFeedDiscovered(discoveredFeed, {
            current: feeds.length,
            total: maxResults
          });
        }
      }
    }

    return feeds;
  }

  /**
   * Find RSS feed URL for a given website using cheerio + HTML parsing
   * First checks <link rel="alternate"> tags, then tries common paths
   */
  private async findRssFeed(websiteUrl: string): Promise<string | null> {
    try {
      // Try 1: Parse HTML to find <link rel="alternate"> RSS tags
      const feedUrl = await this.findRssFeedFromHtml(websiteUrl);
      if (feedUrl) {
        logger.debug(`✅ Found RSS feed from HTML: ${feedUrl}`);
        return feedUrl;
      }

      // Try 2: Check common RSS feed paths
      const commonPaths = [
        '/accueil.rss',  // For Batiactu and similar French sites (priority)
        '/feed',
        '/rss',
        '/feed.xml',
        '/rss.xml',
        '/atom.xml',
        '/feeds/posts/default', // Blogger
      ];

      for (const path of commonPaths) {
        const candidateUrl = new URL(path, websiteUrl).href;
        const isValid = await this.validateRssFeed(candidateUrl);
        if (isValid) {
          logger.debug(`✅ Found RSS feed at common path: ${candidateUrl}`);
          return candidateUrl;
        }
      }

      logger.debug(`❌ No RSS feed found for: ${websiteUrl}`);
      return null;
    } catch (error) {
      logger.debug(`⚠️ RSS discovery failed for ${websiteUrl}:`, error);
      return null;
    }
  }

  /**
   * Parse HTML to find RSS feed URLs in <link rel="alternate"> tags
   */
  private async findRssFeedFromHtml(websiteUrl: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(websiteUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSSDiscovery/1.0)',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Find <link rel="alternate" type="application/rss+xml"> or type="application/atom+xml"
      const rssLinks = $('link[rel="alternate"]').filter((_, el) => {
        const type = $(el).attr('type') ?? '';
        return type.includes('rss') || type.includes('atom');
      });

      if (rssLinks.length > 0) {
        const href = $(rssLinks[0]).attr('href');
        if (href) {
          // Convert relative URL to absolute
          const feedUrl = new URL(href, websiteUrl).href;
          return feedUrl;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Validate that a URL is a valid RSS feed
   */
  private async validateRssFeed(feedUrl: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

      const response = await fetch(feedUrl, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSSDiscovery/1.0)',
        },
      });

      clearTimeout(timeout);

      // Check content type
      const contentType = response.headers.get('content-type') ?? '';
      const isValidContentType =
        contentType.includes('xml') ||
        contentType.includes('rss') ||
        contentType.includes('atom');

      return response.ok && isValidContentType;
    } catch {
      // Timeout or network error
      return false;
    }
  }

  /**
   * Parse RSS feed to extract real content (title, description, recent articles)
   * Uses rss-parser for robust parsing of all RSS/Atom formats
   */
  private async parseRssFeed(feedUrl: string): Promise<{
    title: string;
    description: string;
    recentArticles: string[];
  } | null> {
    try {
      const parser = new Parser({
        timeout: 5000, // 5s timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSSDiscovery/1.0)',
        },
      });

      // Parse the RSS/Atom feed
      // Supports RSS 0.90, RSS 0.91, RSS 1.0, RSS 2.0, Atom 1.0
      const feed = await parser.parseURL(feedUrl);

      if (!feed) {
        logger.debug(`⚠️ No feed data found: ${feedUrl}`);
        return null;
      }

      // Extract feed metadata
      const title = feed.title ?? 'Unknown';
      const description = feed.description?.substring(0, 300) ?? '';

      // Extract recent article titles (limit to 5)
      const recentArticles = (feed.items ?? [])
        .filter((item): item is typeof item & { title: string } => Boolean(item.title)) // Only items with titles
        .slice(0, 5) // First 5 articles
        .map(item => item.title);

      logger.debug(`📰 Parsed RSS feed via rss-parser: "${title}" with ${recentArticles.length} recent articles`);

      return {
        title,
        description,
        recentArticles
      };

    } catch {
      logger.debug(`⚠️ rss-parser failed for: ${feedUrl}`);
      return null;
    }
  }

  /**
   * Extract base URL from full URL
   */
  private getBaseUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.hostname}`;
    } catch {
      return url;
    }
  }
}

/**
 * Factory function to create the adapter
 */
export function createDataForSeoRssDiscoveryAdapter(
  aiTextModel: AITextModelPort,
  env?: NodeJS.ProcessEnv
): DataForSeoRssDiscoveryAdapter {
  return new DataForSeoRssDiscoveryAdapter(aiTextModel, env);
}
