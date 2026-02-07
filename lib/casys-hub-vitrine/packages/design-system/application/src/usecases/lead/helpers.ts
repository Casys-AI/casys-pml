import type { PageContent } from '../../ports/out/page-scraper.port';
import type { LeadAnalysisUseCaseDeps } from './types';

/**
 * Constants
 */
export const MAX_PAGES = 1;
export const ONTOLOGY_TIMEOUT_MS = 180_000; // 3 minutes

/**
 * Build a summary of pages for business context agent
 */
export function buildPagesSummary(pages: PageContent[]): string {
  return pages
    .slice(0, 3) // Max 3 pages
    .map((p, i) => {
      const content = (p.content ?? '').slice(0, 2000); // Cap 2000 chars per page
      return `Page ${i + 1} (${p.url}):\nTitle: ${p.title ?? 'N/A'}\nDescription: ${p.description ?? 'N/A'}\nContent: ${content}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Match AI-extracted keywords with ranked keywords from DataForSEO
 * Returns enriched keywords (with volume/position) and unmatched ranked keywords
 */
export async function matchKeywordsWithRankedData(
  extractedKeywords: { keyword: string; relevanceScore: number }[],
  rankedKeywords: { keyword: string; position?: number; searchVolume?: number }[]
): Promise<{
  enrichedKeywords: { keyword: string; position: number; searchVolume: number }[];
  unmatchedRankedKeywords: { keyword: string; position: number; searchVolume: number }[];
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fuzz: any = await import('fuzzball');
  const matchedRanked = new Set<string>();

  const enrichedKeywords = extractedKeywords.map((kw, index) => {
    const normalized = kw.keyword.toLowerCase().trim();
    const rankedChoices = rankedKeywords.map(rk => rk.keyword);
    
    // Si pas de ranked keywords, skip fuzzy matching (évite les logs "No choices")
    const raw: unknown = rankedChoices.length === 0 
      ? []
      : fuzz && typeof fuzz.extract === 'function' && typeof fuzz.token_set_ratio === 'function'
        ? fuzz.extract(normalized, rankedChoices, { scorer: fuzz.token_set_ratio, limit: 1 })
        : [];

    let label: string | undefined;
    let score = 0;
    if (Array.isArray(raw) && raw.length > 0) {
      const top = raw[0] as unknown;
      if (Array.isArray(top)) {
        const maybeLabel = top[0];
        const maybeScore = top[1];
        if (typeof maybeLabel === 'string') label = maybeLabel;
        if (typeof maybeScore === 'number') score = maybeScore;
      }
    }

    if (score > 70 && label) {
      const rk = rankedKeywords.find(x => x.keyword === label);
      if (rk) {
        matchedRanked.add(rk.keyword);
        return {
          keyword: kw.keyword,
          position: typeof rk.position === 'number' ? rk.position : index + 1,
          searchVolume: typeof rk.searchVolume === 'number' ? rk.searchVolume : Math.round(kw.relevanceScore * 1000),
        };
      }
    }

    return { keyword: kw.keyword, position: index + 1, searchVolume: Math.round(kw.relevanceScore * 1000) };
  });

  const unmatchedRankedKeywords = rankedKeywords
    .filter(rk => !matchedRanked.has(rk.keyword))
    .map((rk, i) => ({
      keyword: rk.keyword,
      position: typeof rk.position === 'number' ? rk.position : enrichedKeywords.length + i + 1,
      searchVolume: typeof rk.searchVolume === 'number' ? rk.searchVolume : 0,
    }));

  return { enrichedKeywords, unmatchedRankedKeywords };
}

/**
 * Timeout wrapper to avoid LLM blocking
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * Filter pages by detected language
 */
export function filterPagesByLanguage(pages: PageContent[], targetLanguage: string): PageContent[] {
  return pages.filter(p => {
    if (!p.language) return true; // Keep if no language detected
    return p.language.toLowerCase().startsWith(targetLanguage.toLowerCase().slice(0, 2));
  });
}

/**
 * Scrape important pages from a domain
 */
export async function scrapeImportantPages(
  domain: string,
  deps: Pick<LeadAnalysisUseCaseDeps, 'pageScraper' | 'logger'>
): Promise<PageContent[]> {
  // Homepage only strategy
  const normalizeHost = (h: string) => h.replace(/^www\./i, '').toLowerCase();
  const homepage = `https://${domain}/`;
  let canonical = homepage;
  try {
    const url = new URL(homepage);
    if (normalizeHost(url.hostname) !== normalizeHost(domain)) {
      canonical = `https://${normalizeHost(domain)}/`;
    } else {
      url.hash = '';
      url.search = '';
      url.protocol = 'https:';
      // Strip leading www for canonical form
      url.hostname = normalizeHost(url.hostname);
      url.pathname = '/';
      canonical = url.toString();
    }
  } catch {
    canonical = `https://${normalizeHost(domain)}/`;
  }

  const pages = await deps.pageScraper.scrapePages([canonical]);
  deps.logger?.debug?.(`Scraped ${pages.length} page for ${domain} (homepage only)`);
  return pages.slice(0, 1);
}
