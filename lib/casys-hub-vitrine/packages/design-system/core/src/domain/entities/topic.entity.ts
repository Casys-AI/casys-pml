// Entité métier Topic
export interface Topic {
  id: string;
  title: string;
  createdAt: string; // ISO string
  language?: string; // Code de langue (ex: 'fr', 'en')
  sourceUrl?: string;
  imageUrls?: string[];
  sourceContent?: string;
}

/**
 * Candidat de sujet (source brute pour la sélection)
 * Simplifié au strict nécessaire pour le scoring et le filtrage.
 */
export interface TopicCandidate {
  id: string;
  title: string;
  description?: string;
  content?: string;
  sourceUrl: string;
  sourceTitle?: string;
  publishedAt: string | Date;
  author?: string;
  imageUrls?: string[];
  language?: string;
  categories?: string[];
  relevanceScore?: number; // Optionnel: score initial (0..1)
  // SEO data sera géré séparément via SeoStrategy
  metadata?: Record<string, unknown>;
}

export interface TopicSource {
  id: string;
  type: 'rss' | 'newsapi' | 'worldnews' | 'newsdata' | 'webagent' | 'custom'; // étendu pour news providers
  name: string;
  url?: string;
  apiKey?: string;
  params?: Record<string, unknown>;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface TopicFetchQuery {
  seoKeywords?: string[]; // Keywords SEO courts (tags labels) pour News APIs
  supportingQueries?: string[]; // Questions complètes pour recherche web (Tavily/WebAgent)
  since?: Date;
  until?: Date;
  sources?: string[];
  limit?: number;
  language?: string;
  allowedSources?: {
    rss?: string[];
    newsApi?: string[];
    bing?: string[];
    worldNews?: string[];
    newsData?: string[];
    webAgent?: string[]; // Sources: 'reddit', 'github', 'stackoverflow', 'medium', 'blogs', 'news'
  };
}
