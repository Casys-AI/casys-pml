import { z } from 'zod';

// Schéma pour l'intention du mot-clé
export const keywordIntentSchema = z.enum(['transactional', 'commercial', 'informational', 'navigational']);

// Schéma pour l'enrichissement IA
export const aiEnrichmentSchema = z.object({
  intent: z.object({
    type: keywordIntentSchema,
  }).optional(),
  description: z.object({
    text: z.string(),
  }).optional(),
}).optional();

// Schéma principal pour le KeywordTagDTO
export const keywordTagDtoSchema = z.object({
  label: z.string(),
  slug: z.string(),
  source: z.string().optional(),
  searchVolume: z.number().optional(),
  difficulty: z.number().optional(),
  cpc: z.number().optional(),
  lowTopOfPageBid: z.number().optional(),
  highTopOfPageBid: z.number().optional(),
  competition: z.enum(['low', 'medium', 'high']).optional(),
  priority: z.number().optional(),
  monthlySearches: z.array(z.object({
    year: z.number(),
    month: z.number(),
    searchVolume: z.number(),
  })).optional(),
  aiEnrichment: aiEnrichmentSchema,
});
