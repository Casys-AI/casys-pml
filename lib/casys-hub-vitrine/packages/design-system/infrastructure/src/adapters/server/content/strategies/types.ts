import type { TopicCandidate } from '@casys/core';

/**
 * Contenu brut extrait par une stratégie
 */
export interface RawContent {
  content: string;
  title?: string;
  author?: string;
  publishedAt?: Date;
  confidence: number; // 0-1, confiance dans l'extraction
  strategy: string;
  metadata?: Record<string, unknown>;
}

/**
 * Résultat d'extraction qualifié par l'IA
 */
export interface QualifiedContent extends RawContent {
  cleanedContent: string;
  summary?: string;
  keyPoints?: string[];
  contentType: 'article' | 'blog' | 'documentation' | 'news' | 'forum' | 'other';
  qualityScore: number; // 0-1, score de qualité global
}

/**
 * Interface pour les stratégies d'extraction
 */
export interface ContentExtractionStrategy {
  readonly name: string;
  readonly priority: number; // Plus élevé = priorité plus haute
  
  canHandle(url: string): boolean;
  extract(url: string, article?: TopicCandidate): Promise<RawContent>;
}

/**
 * Configuration pour l'agent d'extraction
 */
export interface ContentExtractionConfig {
  maxRetries: number;
  timeout: number;
  userAgents: string[];
  enabledStrategies: string[];
  jinaApiKey?: string;
  firecrawlApiKey?: string;
}
