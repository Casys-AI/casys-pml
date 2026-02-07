import { z } from 'zod';

/**
 * Schéma pour les résultats de recherche web qualifiés par l'IA
 */
export const WebSearchResultSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  content: z.string(),
  publishedDate: z.string().nullish(), // Accept null, undefined, or string
  source: z.string().nullish(),
  score: z.number().min(0).max(1),
});

export const QualifiedWebSearchResponseSchema = z.object({
  qualified: z.array(WebSearchResultSchema),
});

export type QualifiedWebSearchResponse = z.infer<typeof QualifiedWebSearchResponseSchema>;

/**
 * Schéma pour la réponse de l'adapter WebTopicDiscovery
 */
export const WebTopicDiscoveryResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(WebSearchResultSchema).optional(),
  error: z.string().optional(),
});

export type WebTopicDiscoveryResponse = z.infer<typeof WebTopicDiscoveryResponseSchema>;

/**
 * Schéma pour les résultats de qualification de contenu
 */
export const ContentQualificationResultSchema = z.object({
  cleanedContent: z.string(),
  contentType: z.enum(['article', 'tutorial', 'documentation', 'news', 'other']),
  keyPoints: z.array(z.string()),
  qualityScore: z.number().min(0).max(1),
  summary: z.string().optional(),
});

export const ContentQualificationResponseSchema = z.object({
  success: z.boolean(),
  result: ContentQualificationResultSchema.optional(),
  error: z.string().optional(),
});

export type ContentQualificationResponse = z.infer<typeof ContentQualificationResponseSchema>;
