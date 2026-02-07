import type { Domain } from '../value-objects/domain.vo';
import type { ExtractedKeyword } from '../value-objects/extracted-keyword.value';

/**
 * KeywordExtractionInput
 * Input parameters for keyword extraction operation
 */
export interface KeywordExtractionInput {
  domain: Domain;
  pages: {
    url: string;
    title?: string;
    description?: string;
    content?: string;
  }[];
  language?: string;
  maxKeywords?: number;
}

/**
 * KeywordExtractionResult
 * Result of keyword extraction operation
 */
export interface KeywordExtractionResult {
  keywords: ExtractedKeyword[];
  totalProcessed: number;
}
