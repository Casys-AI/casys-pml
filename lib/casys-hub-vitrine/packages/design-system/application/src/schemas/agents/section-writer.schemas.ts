import { z } from 'zod';

import type { ComponentUsage } from '@casys/core';

// Schéma Zod pour validation ComponentUsage DDD (via TextFragment)
const componentUsageValidationSchema = z.object({
  id: z.string(),
  componentId: z.string(),
  textFragmentId: z.string(), // Composants liés via TextFragment (architecture DDD correcte)
  props: z.record(z.unknown()),
  position: z.number().int().min(0),
  isSectionHeader: z.boolean().optional(),
});

// Schéma pour les topics externes utilisés retournés par l'IA
const usedTopicSchema = z.object({
  topicId: z.string(),
  reason: z.string().optional(), // Pourquoi ce topic a été utilisé
});

// Schéma pour les articles internes utilisés retournés par l'IA (maillage interne)
const usedArticleSchema = z.object({
  articleId: z.string(),
  reason: z.string().optional(), // Pourquoi cet article a été lié ici
});

// Schéma de validation pour la réponse IA du SectionWriter (simplifié)
export const SectionWriteResultSchema = z.object({
  content: z.string().min(1, 'Le contenu est requis'),
  usedTopics: z.array(usedTopicSchema).default([]), // Topics externes effectivement utilisés
  usedArticles: z.array(usedArticleSchema).default([]), // Articles internes effectivement liés
  componentUsages: z.array(componentUsageValidationSchema).default([]), // Composants utilisés
  metadata: z.object({
    estimatedReadTime: z.number().min(0),
    keyTopics: z.array(z.string()),
  }),
});

// Type pour les topics externes utilisés
export interface UsedTopic {
  topicId: string;
  reason?: string; // Pourquoi ce topic a été utilisé
}

// Type pour les articles internes utilisés (maillage interne)
export interface UsedArticle {
  articleId: string;
  reason?: string; // Pourquoi cet article a été lié ici
}

// Type exporté utilisant ComponentUsage DDD directement (simplifié)
export interface SectionWriteResult {
  content: string;
  usedTopics: UsedTopic[]; // Topics externes effectivement utilisés par l'IA
  usedArticles: UsedArticle[]; // Articles internes effectivement liés par l'IA
  componentUsages: ComponentUsage[]; // Composants utilisés
  metadata: {
    estimatedReadTime: number;
    keyTopics: string[];
  };
}

// Interface minimale pour éviter l'export de types génériques profonds dans les .d.ts
// Réutilise l'interface générique commune OutputParserLike

// Note: createSectionWriteOutputParser supprimé car avec POML, 
// le schéma est directement dans le template et on utilise JSON.parse()
