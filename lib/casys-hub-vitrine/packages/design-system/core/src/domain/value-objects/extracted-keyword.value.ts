/**
 * ExtractedKeyword - Value Object
 * Represents a keyword extracted from content with its metrics
 */
export interface ExtractedKeyword {
  keyword: string;
  frequency: number;
  relevanceScore: number; // 0-1
  sources: string[]; // URLs where found
}
