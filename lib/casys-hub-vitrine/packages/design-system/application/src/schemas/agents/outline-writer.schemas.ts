import { z } from 'zod';

import type { KeywordTag, SectionNode } from '@casys/core';


// Schéma Zod pour validation Topic en input (mode "topic-only")
export const topicInputValidationSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceUrl: z.string().url().optional(), // sourceUrl optionnel dans Topic DDD
  createdAt: z.string(),
  language: z.string().optional(),
  keywords: z.array(z.string()).optional().default([]),
});

// Schéma pour article source avec contenu
export const sourceArticleSchema = z.object({
  title: z.string(),
  sourceUrl: z.string().url(),
  content: z.string(),
  summary: z.string(),
});

// Schéma pour données SEO complètes
export const seoDataSchema = z.object({
  enrichedKeywords: z.array(z.string()),
  searchIntent: z.object({
    keyword: z.string(),
    intent: z.enum(['informational', 'commercial', 'navigational', 'transactional']),
    confidence: z.number().min(0).max(1),
    userQuestions: z.array(z.string()),
  }),
  // Optionnel: type de contenu visé (ex: "article", "fiche produit")
  contentType: z.string().optional(),
  competitorAnalysis: z
    .array(
      z.object({
        url: z.string(),
        title: z.string(),
        ranking: z.number(),
        keywords: z.array(z.string()),
        headings: z.array(z.string()),
      })
    )
    .optional()
    .default([]),
  contentGaps: z.array(z.string()).optional().default([]),
  trendData: z
    .array(
      z.object({
        keyword: z.string(),
        interest: z.number().min(0).max(100),
        relatedQueries: z.array(z.string()).optional(),
      })
    )
    .optional()
    .default([]),
});

export const outlineWriterInputSchema = z.object({
  topics: z.array(topicInputValidationSchema).min(1),
  articleId: z.string(),
  language: z.string().length(2).optional().default('fr'),
  // Multi-sources
  sourceArticles: z.array(sourceArticleSchema).optional().default([]),
  seoData: seoDataSchema.optional(), // Données SEO complètes (legacy)
  // Nouvel input optionnel: angle éditorial et SEO écrémée alignée angle
  angle: z.string().min(1).optional(),
  seoSummary: z
    .object({
      enrichedKeywords: z.array(z.string()).optional(),
      userQuestions: z.array(z.string()).optional(),
      competitorTitles: z.array(z.string()).optional(),
      contentGaps: z.array(z.string()).optional(),
    })
    .optional(),
});

// Schéma pour les articles liés (Graph RAG)
const relatedArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  excerpt: z.string(),
  url: z.string().optional(),
  relevanceScore: z.number().optional(),
  reason: z.string().optional(), // Pourquoi ce lien ici (généré par IA)
});

// Schéma pour les topics suggérés (sources externes)
const suggestedTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  excerpt: z.string(),
  url: z.string(),
  relevanceScore: z.number().optional(),
  reason: z.string().optional(), // Pourquoi ce topic suggéré ici (généré par IA)
});

// Schéma Zod pour validation d'une section d'outline et transformation en SectionNode DDD
const outlineSectionSchema = z
  .object({
    id: z.string(),
    title: z.string().min(1),
    level: z.number().int().min(0).max(6), // allow 0 to let business validation handle errors
    // Optionnel côté outline, le contenu est généré plus tard
    content: z.string().optional().default(''),
    // La position peut être fournie par l'agent (sinon normalisée côté service)
    position: z.number().int().min(0).optional(),
    articleId: z.string(),
    // L'agent peut fournir parentId; on le convertira en parentSectionId
    parentId: z.string().optional(),
    // Description courte générée par l'agent d'outline
    description: z.string().optional(),
    // V3.1: Contrainte de longueur cible pour génération de contenu
    targetCharsPerSection: z.number().int().min(300).max(3000).optional(),
    // ✨ Graph RAG : Articles et topics suggérés par section
    relatedArticles: z.array(relatedArticleSchema).optional().default([]),
    suggestedTopics: z.array(suggestedTopicSchema).optional().default([]),
  })
  .transform(
    (s): SectionNode => ({
      id: s.id,
      title: s.title,
      level: s.level,
      content: s.content ?? '',
      // Conserver la position si fournie; sinon sera normalisée plus tard
      position: (s as { position?: number }).position ?? 0,
      articleId: s.articleId,
      parentSectionId: s.parentId,
      description: s.description,
      // V3.1: Contrainte structurelle
      targetCharsPerSection: s.targetCharsPerSection,
      // ✨ Propager les liens contextuels
      relatedArticles: s.relatedArticles,
      suggestedTopics: s.suggestedTopics,
    })
  );

// Schéma pour l'outline complet d'un article (produit des SectionNode[] DDD)
export const articleOutlineSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  slug: z.string().min(1).max(200), // Slug SEO-optimisé généré par l'IA (max 200 chars)
  keywordTags: z.array(z.object({ label: z.string(), slug: z.string().optional() })).optional(), // Tags générés pour cover image et métadonnées (slug optionnel, calculé côté app)
  sections: z.array(outlineSectionSchema).min(1), // Transform -> SectionNode
});

// Types exportés (utilise entités DDD directement)
export type OutlineWriterInput = z.infer<typeof outlineWriterInputSchema>;
export interface ArticleOutline {
  title: string;
  summary: string;
  slug: string; // Slug SEO-optimisé généré par l'IA
  keywordTags?: KeywordTag[]; // Tags générés pour cover image et métadonnées
  sections: SectionNode[]; // Utilise directement l'entité DDD SectionNode
}

// Fonctions de validation
export function validateOutlineWriterInput(input: unknown): OutlineWriterInput {
  return outlineWriterInputSchema.parse(input);
}

export function validateArticleOutline(input: unknown): ArticleOutline {
  return articleOutlineSchema.parse(input);
}

// Note: createOutlineWriterOutputParser supprimé car avec POML,
// le schéma est directement dans le template et on utilise JSON.parse()
