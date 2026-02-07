import type { KeywordTag, SeoBriefData } from '@casys/core';
/**
 * Types partagés pour l'analyse d'articles existants
 */

// ===== Command & Result pour l'orchestrateur principal =====
export interface AnalyzeExistingArticleCommand {
  /** Identifiant article (déjà indexé en Kuzu) */
  articleId: string;
  tenantId: string;
  projectId: string;
  dryRun?: boolean;
  /** Si true, exécute une synchronisation GitHub→Kuzu avant l'analyse (par défaut: false) */
  syncBefore?: boolean;
  /** Si true, n'effectue pas de lecture GitHub par article (on s'appuie sur l'index Kuzu) */
  skipGithubRead?: boolean;
}

export interface AnalyzeExistingArticleResult {
  success: boolean;
  articleId: string;
  analysis: {
    // Keywords enrichis (servant à (re)créer des KeywordPlans)
    keywordSeeds: string[];
    enrichedKeywords: {
      keyword: string;
      searchVolume?: number;
      difficulty?: number;
      cpc?: number;
      competition?: 'low' | 'medium' | 'high';
      lowTopOfPageBid?: number;
      highTopOfPageBid?: number;
      monthlySearches?: { year: number; month: number; searchVolume: number }[];
      source?: string;
    }[];
    seoBriefData?: SeoBriefData;
    // Topics (sources) extraits de la SERP
    createdTopics: { id: string; title: string; url: string }[];
    sectionsAnalyzed: number;
  };
  created: {
    keywordPlansUpserted: number; // nombre de mots-clés upsertés dans un plan
    topicsUpserted: number; // nombre de topics persistés
    sectionTopicLinks: number; // nombre de liens (Section)-[:BASED_ON]->(Topic)
    sectionInternalLinks: number; // nombre de liens (Section)-[:REFERENCES]->(Article)
  };
  errors: string[];
}

// ===== Types pour les use cases atomiques =====

/**
 * ExtractKeywordsUseCase
 */
export interface ExtractKeywordsResult {
  keywords: KeywordTag[];
  source: 'tags' | 'title_tokens';
  coverage: {
    projectSeeds: string[];
    articleTags: string[];
    coveredSeeds: string[];
    missingSeeds: string[];
    coverageRatio: number;
  };
  discoveredKeywords: string[]; // KeywordPlans découverts via DataForSEO relatedKeywords
}

/**
 * DiscoverTopicsFromSerpUseCase
 */
export interface DiscoverTopicsCommand {
  query: string;
  language: string;
  maxResults?: number;
  tenantId: string;
  projectId: string;
  dryRun?: boolean;
}

export interface DiscoverTopicsResult {
  topics: {
    id: string;
    title: string;
    sourceUrl: string;
    sourceContent?: string;
  }[];
}

/**
 * LinkInternalReferencesUseCase
 */
export interface LinkInternalReferencesCommand {
  articleId: string;
  tenantId: string;
  projectId: string;
  sections: { id: string; content: string }[];
  dryRun?: boolean;
}

export interface LinkInternalReferencesResult {
  linksCreated: number;
}
