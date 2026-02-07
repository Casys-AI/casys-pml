/**
 * PageCandidate - Value Object
 * Represents a candidate page with its relevance score for discovery
 */
export interface PageCandidate {
  url: string;
  score: number;
  source: 'sitemap' | 'homepage-links' | 'ai-selection';
  metadata?: {
    title?: string;
    priority?: number;
  };
}
