import { z } from 'zod';

import type { TagSourceDTO } from '@casys/shared';
import type { Topic, TopicCandidate } from '@casys/core';


// Schéma Zod pour validation TopicCandidate (sans duplication entité DDD)
const topicCandidateValidationSchema = z.object({
  id: z.string().default(() => `temp-${Math.random().toString(36).substring(2, 9)}`),
  title: z.string(),
  description: z.string().default(''),
  sourceUrl: z.string().url(),
  sourceTitle: z.string().default('Source inconnue'),
  publishedAt: z
    .union([z.string(), z.date()])
    .transform(val => (val instanceof Date ? val.toISOString() : val)),
  relevanceScore: z.number().min(0).max(1).default(0.5),
  categories: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

// Fonction pour valider un article d'entrée (retourne TopicCandidate DDD)
function validateArticleInput(input: unknown): TopicCandidate {
  return topicCandidateValidationSchema.parse(input) as TopicCandidate;
}

// Interface pour les options de sélection de sujets
interface TopicSelectorOptionsType {
  maxTopics?: number;
  minRelevanceScore?: number;
  requiredCategories?: string[];
  excludeCategories?: string[];
  language?: string;
  deduplicate?: boolean;
  // Transmis depuis la config projet (generation.keywords -> userInterests)
  // Requis: au moins 1 mot-clé
  userInterests: string[];
  // Contexte optionnel de tendances
  currentTrends?: string[];
  // Poids des tendances (optionnel)
  trendPriority?: number;
}

// Fonction pour valider les options de sélection
function validateTopicSelectorOptions(input: unknown): TopicSelectorOptions {
  const schema = z
    .object({
      maxTopics: z.number().int().positive().optional(),
      minRelevanceScore: z.number().min(0).max(1).optional(),
      requiredCategories: z.array(z.string()).optional(),
      excludeCategories: z.array(z.string()).optional(),
      language: z.string().optional(),
      deduplicate: z.boolean().optional(),
      // Clé supportée explicitement pour relayer les mots-clés de config
      // Exigée: au moins 1 mot-clé (fail-fast)
      userInterests: z.array(z.string()).min(1, 'userInterests requires at least 1 item'),
      // Tendances optionnelles et priorité
      currentTrends: z.array(z.string()).optional(),
      trendPriority: z.number().min(0).max(1).optional(),
    })
    // Préserver d'autres clés optionnelles (ex: currentTrends, trendPriority)
    // afin de ne pas les perdre si elles sont passées en amont.
    .passthrough();

  return schema.parse(input) as TopicSelectorOptions;
}

// Schéma Zod pour un sujet sélectionné (exporté pour réutilisation)
// Cohérent avec le schéma TopicCandidate original
export const selectedTopicZodSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  sourceUrl: z.string(),
  sourceTitle: z.string(),
  publishedAt: z.string(),
  relevanceScore: z.number(),
  categories: z.array(z.string()),
  keywords: z.array(z.string()),
  metadata: z.record(z.unknown()),
});

// Schéma Zod pour validation Topic DDD (sortie IA)
export const topicValidationSchema = z.object({
  id: z.string().default(() => `temp-${Math.random().toString(36).substring(2, 9)}`),
  title: z.string(),
  createdAt: z.string().default(() => new Date().toISOString()), // ISO 8601 attendu
  language: z.string().optional(),
  keywords: z.array(z.string()).optional().default([]),
  sourceUrl: z.string().url().optional(), // Optionnel dans Topic DDD
  imageUrls: z.array(z.string()).optional(),
  sourceContent: z.string().optional(), // Pas nullable pour compatibilité Topic DDD
});
// Fonction pour valider un Topic (retourne Topic DDD)
function validateSelectedTopic(input: unknown): Topic {
  return topicValidationSchema.parse(input) as Topic;
}

// Helpers
const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, '-');

// Schéma pour KeywordTag avec normalisation
const keywordTagSchema = z.object({
  label: z.string(),
  slug: z.string().optional(),
  source: z.string().optional(),
  weight: z.number().optional(),
  searchVolume: z.number().optional(),
  difficulty: z.number().optional(),
  cpc: z.number().optional(),
  competition: z.enum(['low', 'medium', 'high']).optional(),
  lowTopOfPageBid: z.number().optional(),
  highTopOfPageBid: z.number().optional(),
  monthlySearches: z.array(z.object({
    year: z.number(),
    month: z.number(),
    searchVolume: z.number(),
  })).optional(),
}).transform(t => ({
  label: t.label,
  slug: t.slug ?? slugify(t.label),
  source: (t.source ?? 'ai') as TagSourceDTO,
  weight: t.weight,
  searchVolume: t.searchVolume,
  difficulty: t.difficulty,
  cpc: t.cpc,
  competition: t.competition,
  lowTopOfPageBid: t.lowTopOfPageBid,
  highTopOfPageBid: t.highTopOfPageBid,
  monthlySearches: t.monthlySearches,
}));

// Schéma Zod pour un résumé SEO v3 (objets métier séparés)
const seoSummarySchema = z.object({
  // keywordTags: TOUS les tags = [chosenCluster tags + additionnels max 3-5]
  keywordTags: z.array(keywordTagSchema).min(1),

  // v3: SearchIntent (intention de recherche pure)
  searchIntent: z.object({
    intent: z.enum(['informational', 'commercial', 'navigational', 'transactional']),
    confidence: z.number().min(0).max(1).default(0.5),
    supportingQueries: z.array(z.string()).default([]),
  }),

  // v3: ContentStrategy (organisation éditoriale + approche)
  contentStrategy: z.object({
    recommendations: z.object({
      seo: z.array(z.string()).default([]),
      editorial: z.array(z.string()).default([]),
      technical: z.array(z.string()).default([]),
    }).default({ seo: [], editorial: [], technical: [] }),
  }),

  // v3: CompetitiveAnalysis (opportunités SERP)
  competitiveAnalysis: z.object({
    contentGaps: z.array(z.string()).default([]),
  }),
});


// Schéma Zod pour une sélection de Topic (sortie IA multiple)
interface TopicSelectionResultType {
  status: 'success' | 'error';
  topics?: Topic[]; // Utilise directement l'entité DDD
  count?: number;
  message?: string;
}

// Fonction pour valider le résultat de la sélection
function validateTopicSelectionResult(input: unknown): TopicSelectionResult {
  const schema = z.object({
    status: z.enum(['success', 'error']),
    topic: z.any().transform(validateSelectedTopic).optional(),
    count: z.number().nonnegative().optional(),
    message: z.string().optional(),
  });

  return schema.parse(input) as TopicSelectionResult;
}
// Schéma Zod pour la réponse IA complète (utilise Topic DDD)
export const aiTopicSelectionResponseZodSchema = z.object({
  topics: z.array(topicValidationSchema).min(1, "L'IA doit retourner au moins 1 topic"),
  // Requis: angle éditorial + résumé SEO (subset strict)
  angle: z.string().min(1),
  contentType: z.enum(['guide', 'comparatif', 'liste', 'tutoriel', 'étude-de-cas', 'interview', 'analyse-tendance']).optional(),
  selectionMode: z.enum(['pillar', 'satellite']).optional(),
  // chosenCluster: structure aligneée avec TopicCluster (pillarTag + satelliteTags)
  chosenCluster: z.object({
    pillarTag: keywordTagSchema.optional(),
    satelliteTags: z.array(keywordTagSchema).min(1),
  }).optional(),
  seoSummary: seoSummarySchema,
});

// Types exportés (utilise entités DDD et DTOs shared)
// V3 MIGRATION: seoSummary utilise SeoBriefDataDTO (objets métier)
// Le schéma Zod parse maintenant directement en v3
// Type pour KeywordTag normalisé (alignement avec @casys/core)
interface KeywordTagNormalized {
  label: string;
  slug: string;
  source: TagSourceDTO;
  weight?: number;
  searchVolume?: number;
  difficulty?: number;
  cpc?: number;
  competition?: 'low' | 'medium' | 'high';
  lowTopOfPageBid?: number;
  highTopOfPageBid?: number;
  monthlySearches?: { year: number; month: number; searchVolume: number }[];
}

export interface AITopicSelectionResponse {
  topics: Topic[];
  angle: string;
  contentType?: 'guide' | 'comparatif' | 'liste' | 'tutoriel' | 'étude-de-cas' | 'interview' | 'analyse-tendance';
  selectionMode?: 'pillar' | 'satellite';
  chosenCluster?: {
    pillarTag?: KeywordTagNormalized;
    satelliteTags: KeywordTagNormalized[];
  };
  seoSummary: {
    keywordTags: KeywordTagNormalized[];  // TOUS les tags: [chosenCluster + additionnels]
    searchIntent: {
      intent: 'informational' | 'commercial' | 'navigational' | 'transactional';
      confidence: number;
      supportingQueries: string[];
    };
    contentStrategy: {
      recommendations: { seo: string[]; editorial: string[]; technical: string[] };
    };
    competitiveAnalysis: {
      contentGaps: string[];
    };
  };
}

// Fonction pour valider la réponse IA (utilise directement le schéma d’output DDD)
function validateAITopicSelectionResponse(input: unknown): AITopicSelectionResponse {
  return aiTopicSelectionResponseZodSchema.parse(input);
}

// Exporter les types et les fonctions de validation
export {
  type TopicSelectionResultType as TopicSelectionResult,
  type TopicSelectorOptions as TopicSelectorOptions,
  validateAITopicSelectionResponse,
  validateArticleInput,
  validateTopicSelectionResult,
  validateTopicSelectorOptions,
};

type TopicSelectorOptions = TopicSelectorOptionsType;
type TopicSelectionResult = TopicSelectionResultType;

// Note: createTopicSelectionOutputParser supprimé car avec POML,
// le schéma est directement dans le template et on utilise JSON.parse()
