import type { TopicCandidate, TopicFetchQuery } from '@casys/core';

// Options d'analyse utilisées par la découverte et le service d'analyse
export interface TrendAnalysisOptions {
  maxArticles?: number;
  allowedSources?: { rss?: string[]; newsApi?: string[] };
  language?: string;
  userInterests?: string[];
  minRelevanceScore?: number;
  maxTopics?: number;
}

/**
 * Port unifié pour découvrir des candidats de sujets à partir de différentes sources.
 * Les adaptateurs (RSS, NewsAPI, etc.) implémentent ce port et exposent leurs sources.
 */
export interface TopicDiscoveryPort {
  // Découverte de sujets
  discoverCandidates(
    query: TopicFetchQuery,
    options?: Partial<TrendAnalysisOptions>
  ): Promise<TopicCandidate[]>;
}
