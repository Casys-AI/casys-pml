import { type DiscoveredRssFeed, mapLanguageToTld, type RssFeedDiscoveryContext } from '@casys/core';
import type { AITextModelPort } from '@casys/application';

import { createLogger } from '../../../../utils/logger';
import { QualifiedWebSearchResponseSchema } from '../schemas/agent-responses.schema';

/**
 * RSS Discovery Agent
 * Discovers RSS feeds using AI-powered query generation and qualification
 *
 * Flow:
 * 1. AI generates optimal RSS-focused search queries
 * 2. DataForSEO SERP finds relevant websites
 * 3. AI qualifies results for relevance (BTP France, etc.)
 * 4. RSS detection on qualified sites
 */

/**
 * Raw SERP result from search engine
 */
export interface SerpResult {
  title: string;
  url: string;
  description: string;
  position?: number;
}

/**
 * Options for RSS discovery agent
 */
export interface RssDiscoveryAgentOptions {
  maxResults?: number;
  minQualificationScore?: number;
  language?: string; // ISO 639-1 code (ex: 'fr', 'en')
  country?: string; // ISO 3166-1 alpha-2 code (ex: 'FR', 'US')
  countryName?: string; // Full country name (ex: 'france', 'united states')
}

export class RssDiscoveryAgent {
  private readonly logger = createLogger(RssDiscoveryAgent.name);

  constructor(
    private readonly aiTextModel: AITextModelPort,
    private readonly options: RssDiscoveryAgentOptions = {}
  ) {
    this.options = {
      maxResults: 20,
      minQualificationScore: 0.7,
      language: options.language,
      country: options.country,
      countryName: options.countryName,
      ...options
    };
  }

  /**
   * Discover RSS feeds based on business context
   */
  async discoverRssFeeds(
    context: RssFeedDiscoveryContext,
    serpSearchFn: (query: string) => Promise<SerpResult[]>,
    onProgress?: (message: string, step: string) => void | Promise<void>
  ): Promise<DiscoveredRssFeed[]> {
    this.logger.log('🔍 Starting AI-powered RSS discovery');

    // Step 1: AI generates optimal search queries
    await onProgress?.('Génération de requêtes de recherche optimales...', 'query_generation');
    const queries = await this.generateRssSearchQueries(context);
    this.logger.debug('📝 AI generated queries:', queries);

    // Step 2: Search with DataForSEO SERP
    await onProgress?.('Recherche de sites web pertinents...', 'serp_search');
    const allResults: SerpResult[] = [];

    for (const query of queries) {
      try {
        this.logger.debug(`🔎 Searching: "${query}"`);
        const results = await serpSearchFn(query);
        allResults.push(...results);
        this.logger.debug(`  ✓ Found ${results.length} results`);
      } catch (error) {
        this.logger.warn(`⚠️ Search failed for "${query}":`, error);
      }
    }

    // Deduplicate by URL
    const uniqueResults = this.deduplicateByUrl(allResults);
    this.logger.log(`🌐 Found ${uniqueResults.length} unique websites`);

    // Step 3: AI qualifies results for relevance
    await onProgress?.('Qualification IA des résultats...', 'qualification');
    const qualifiedSites = await this.qualifyResults(uniqueResults, context);
    this.logger.log(`✅ Qualified ${qualifiedSites.length} relevant sites`);

    return qualifiedSites;
  }

  /**
   * Generate optimal RSS-focused search queries using AI with advanced Google operators
   */
  async generateRssSearchQueries(context: RssFeedDiscoveryContext): Promise<string[]> {
    // Get TLD for geographic targeting
    const tld = mapLanguageToTld(this.options.language ?? 'en');

    const prompt = `
You are an expert in Google advanced search operators for discovering RSS feeds.

Business context:
- Industry: ${context.industry}
- Target audience: ${context.targetAudience}
${context.businessDescription ? `- Description: ${context.businessDescription}` : ''}
${context.contentType ? `- Content type: ${context.contentType}` : ''}

Target specifications:
- Language: ${this.options.language ?? 'en'}
- Country: ${this.options.countryName ?? this.options.country ?? 'united states'}
- TLD: ${tld}

Mission: Generate 7 highly specific Google search queries using ADVANCED OPERATORS.
Use RSS-related terms appropriate for the target language (e.g., "flux RSS" for French, "RSS feed" for English, "feed RSS" for Spanish).

REQUIRED search strategies with operators:

1. **Industry Leaders & Major Publications**
   Use: Target known major players in the industry with OR operators + RSS terms
   Example for French BTP: (batiactu OR "le moniteur" OR batiweb OR construction21) "flux RSS"
   Example for English Tech: (techcrunch OR wired OR "the verge") "RSS feed"
   CRITICAL: Use your knowledge of major industry publications to identify 3-5 leaders

2. **Official News Sources with RSS**
   Use: site:${tld} + RSS terms + industry
   Example for French: "flux RSS" site:${tld} ${context.industry} actualités
   Example for English: "RSS feed" site:${tld} ${context.industry} news

3. **Professional Blogs with RSS**
   Use: inurl: operator for feed/rss in URL
   Example: (inurl:feed OR inurl:rss) ${context.industry} ${this.options.countryName ?? this.options.country}

4. **Professional Industry Portals**
   Use: site:${tld} + RSS terms + "professionnel" or "professional" + industry
   Example for French: site:${tld} ${context.industry} "flux RSS" professionnel -annuaire
   Example for English: site:${tld} ${context.industry} "RSS feed" professional -directory

5. **Specialized Publications**
   Use: Exact phrases with exclusions
   Example: "${context.industry}" "RSS feed" "presse professionnelle" -site:youtube.com -site:facebook.com -site:twitter.com

6. **RSS Directories**
   Use: Multiple RSS keywords
   Example: "RSS" "${context.industry}" articles site:${tld}

7. **Industry RSS Aggregators**
   Use: site:${tld} + "annuaire" or "directory" + RSS + industry
   Example for French: site:${tld} "annuaire" "flux RSS" ${context.industry} articles
   Example for English: site:${tld} "directory" "RSS feed" ${context.industry} articles

CRITICAL constraints:
- USE Google operators: site:, inurl:, intitle:, OR, quotes for exact phrases
- INCLUDE at least one RSS-specific term per query (adapted to target language)
- EXCLUDE social media: -site:twitter.com -site:facebook.com -site:instagram.com
- USE site:${tld} in at least 4 queries for geographic precision (national level only)
- VARY operator combinations (don't repeat same pattern)
- Adapt RSS terms to target language naturally
- DO NOT use regional filters (no Île-de-France, Occitanie, etc.) - focus on national sources only
- Strategy 1 MUST identify actual industry leaders (not generic terms) - use your knowledge base

JSON response format (EXACTLY 7 queries):
{
  "queries": [
    "query 1 targeting major industry publications with OR operators",
    "query 2 with site: and RSS terms",
    "query 3 with inurl: operator",
    "query 4 with professionnel/professional terms",
    "query 5 with exclusions",
    "query 6 with multiple RSS keywords",
    "query 7 with aggregators/directories"
  ]
}
`;

    const response = await this.aiTextModel.generateText(prompt);
    const parsed = JSON.parse(response) as { queries?: unknown };

    if (!parsed.queries || !Array.isArray(parsed.queries)) {
      throw new Error('Invalid AI response format for query generation');
    }

    // Validate we have 7 queries
    if (parsed.queries.length < 7) {
      this.logger.warn(`AI returned only ${parsed.queries.length} queries instead of 7`);
    }

    return parsed.queries as string[];
  }

  /**
   * Qualify search results using AI
   * Filters for relevance to business context
   */
  private async qualifyResults(
    results: SerpResult[],
    context: RssFeedDiscoveryContext
  ): Promise<DiscoveredRssFeed[]> {
    if (results.length === 0) return [];

    const prompt = `
Analyze these search results and qualify them for RSS feed discovery.

Business context:
- Industry: ${context.industry}
- Target audience: ${context.targetAudience}
${context.businessDescription ? `- Description: ${context.businessDescription}` : ''}

Target language: ${this.options.language ?? 'en'}
Target country: ${this.options.countryName ?? this.options.country ?? 'united states'}

Qualification criteria:
- Relevance for ${context.industry} industry in ${this.options.countryName ?? this.options.country}
- Sites matching target language (${this.options.language ?? 'en'})
- Source quality and authority
- Likelihood of having an active RSS feed
- Publication frequency

Results to analyze:
${JSON.stringify(results.slice(0, 20), null, 2)}

Return JSON with this structure:
{
  "qualified": [
    {
      "title": "site title",
      "url": "site url",
      "content": "relevant description",
      "score": 0.85,
      "publishedDate": "date if available or null",
      "source": "source name"
    }
  ]
}

Important:
- Score 0-1: 0.9+ = highly relevant, 0.7-0.9 = relevant, <0.7 = low relevance
- Only include sites relevant for ${context.industry}
- Exclude generic sites, non-target-language sites, sports, etc.
`;

    const aiResponse = await this.aiTextModel.generateText(prompt);
    const validatedResponse = QualifiedWebSearchResponseSchema.parse(JSON.parse(aiResponse));

    this.logger.debug(`🤖 AI qualified ${validatedResponse.qualified.length} results`);

    // Filter by minimum score
    const filtered = validatedResponse.qualified.filter(
      result => result.score >= this.options.minQualificationScore!
    );

    this.logger.debug(`✅ After score filtering (min=${this.options.minQualificationScore}): ${filtered.length} results`);

    // Convert to DiscoveredRssFeed format (without RSS URL yet - that's next step)
    return filtered.map(result => ({
      feedUrl: '', // Will be filled by RSS detection
      feedTitle: result.title,
      feedDescription: result.content?.substring(0, 200),
      category: this.inferCategory(result.title, result.content || '', context.industry),
      relevanceScore: Math.round(result.score * 100),
      updateFrequency: 'daily' as const,
      lastUpdated: result.publishedDate ?? new Date().toISOString(),
      language: this.options.language ?? 'en',
      relevanceReason: `Qualified by AI with score ${result.score.toFixed(2)}`,
      websiteUrl: result.url
    }));
  }

  /**
   * Qualify a single RSS feed (v2 architecture)
   * Returns qualification with score and color-coded status
   */
  async qualifyFeed(
    feed: import('@casys/core').RawFeed,
    context: RssFeedDiscoveryContext
  ): Promise<import('@casys/core').FeedQualification> {
    const prompt = `
Analyze this RSS feed and qualify its relevance for the business context.

Business context:
- Industry: ${context.industry}
- Target audience: ${context.targetAudience}
${context.businessDescription ? `- Description: ${context.businessDescription}` : ''}

Target language: ${this.options.language ?? 'en'}
Target country: ${this.options.countryName ?? this.options.country ?? 'united states'}

Feed to analyze:
- URL: ${feed.url}
- Title: ${feed.title}
- Description: ${feed.description ?? 'N/A'}
- Website: ${feed.websiteUrl ?? 'N/A'}

CRITICAL VALIDATION RULES:
1. The feed content MUST actually discuss ${context.industry} topics
2. Check if titles and descriptions contain industry-specific keywords and concepts
3. REJECT if feed is about RSS technology itself, tutorials, or completely unrelated topics
4. REJECT if feed is from wrong domain (e.g., tax/finance feeds for construction industry)
5. Example rejections:
   - "Flux RSS" tutorials → NOT relevant for ${context.industry}
   - Tax bulletins (BOFIP) → NOT relevant for construction (BTP)
   - General news without industry focus → NOT relevant
   - RSS aggregator pages → NOT relevant

Qualification criteria:
- MUST be directly relevant to ${context.industry} industry
- Content quality and authority within the industry
- Publication frequency and consistency
- Target audience alignment with ${context.targetAudience}
- Language match (${this.options.language ?? 'en'})

Return JSON with this structure:
{
  "score": 85,
  "relevanceReason": "Highly relevant for [industry] because [specific industry keywords/topics found]",
  "category": "News" or "Blog" or "Industry Updates" etc,
  "updateFrequency": "hourly" or "daily" or "weekly" or "unknown"
}

Score guidelines:
- 80-100: Excellent match (🟢 green) - highly relevant industry content, authoritative source, frequent updates
- 60-79: Good match (🟠 orange) - relevant industry content but less authoritative or less frequent
- 0-59: Poor match (🔴 red) - wrong industry, tutorials about RSS, generic news, or unrelated content

Be VERY STRICT about industry relevance. If you don't see clear industry-specific content, score LOW.
`;

    const aiResponse = await this.aiTextModel.generateText(prompt);
    const parsed = JSON.parse(aiResponse);

    const score = Math.min(100, Math.max(0, parsed.score));
    const status: import('@casys/core').FeedQualificationStatus = 
      score >= 80 ? 'green' : score >= 60 ? 'orange' : 'red';

    const qualification: import('@casys/core').FeedQualification = {
      score,
      status,
      relevanceReason: parsed.relevanceReason || 'No reason provided',
      category: parsed.category || this.inferCategory(feed.title, feed.description || '', context.industry),
      updateFrequency: parsed.updateFrequency || 'unknown',
      lastUpdated: new Date().toISOString()
    };

    this.logger.debug(`🔍 Qualified feed: ${feed.title} → ${status} (${score})`);

    return qualification;
  }

  /**
   * Infer category from content based on industry context
   * Simple keyword-based categorization
   */
  private inferCategory(title: string, content: string, industry: string): string {
    const combined = (title + ' ' + content).toLowerCase();

    // Generic categories that work across industries
    if (combined.includes('news') || combined.includes('actualité') || combined.includes('noticia')) {
      return 'News';
    }
    if (combined.includes('blog')) {
      return 'Blog';
    }
    if (combined.includes('professional') || combined.includes('professionnel') || combined.includes('profesional')) {
      return 'Professional';
    }
    if (combined.includes('regulation') || combined.includes('réglementation') || combined.includes('regulación')) {
      return 'Regulation';
    }

    // Default to industry name
    return industry;
  }

  /**
   * Deduplicate results by URL
   */
  private deduplicateByUrl(results: SerpResult[]): SerpResult[] {
    const urlSet = new Set<string>();
    const unique: SerpResult[] = [];

    for (const result of results) {
      if (!urlSet.has(result.url)) {
        urlSet.add(result.url);
        unique.push(result);
      }
    }

    return unique;
  }
}

/**
 * Factory function to create RSS discovery agent
 */
export function createRssDiscoveryAgent(
  aiTextModel: AITextModelPort,
  options?: RssDiscoveryAgentOptions
): RssDiscoveryAgent {
  return new RssDiscoveryAgent(aiTextModel, options);
}
