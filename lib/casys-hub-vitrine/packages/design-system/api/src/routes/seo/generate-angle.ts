import { Hono } from 'hono';
import { z } from 'zod';
import type { TopicCandidate, SeoBriefDataV3, AngleSelectionResult } from '@casys/core';

const app = new Hono();

// Contract minimal pour le use case (structurelle)
interface GenerateAngleUseCaseContract {
  execute(input: {
    tenantId: string;
    projectId: string;
    language: string;
    articles: TopicCandidate[];
    seoBriefData: SeoBriefDataV3;
  }): Promise<AngleSelectionResult>;
}

function assertGenerateAngleUseCase(
  candidate: unknown
): asserts candidate is GenerateAngleUseCaseContract {
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    typeof (candidate as any).execute !== 'function'
  ) {
    throw new Error('Service generateAngleUseCase non disponible');
  }
}

// Schema Zod pour TopicCandidate
const topicCandidateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  content: z.string().optional(),
  sourceUrl: z.string(),
  sourceTitle: z.string().optional(),
  publishedAt: z.union([z.string(), z.date()]),
  author: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
  language: z.string().optional(),
});

// Schema Zod pour SeoBriefDataV3 (structure simplifiée pour validation)
const seoBriefDataV3Schema = z.object({
  targetKeywords: z.array(z.any()), // KeywordTag[]
  relatedKeywords: z.array(z.any()).optional(),
  suggestedTopics: z.array(z.any()).optional(),
  contentGaps: z.array(z.any()).optional(),
  competitorInsights: z.array(z.any()).optional(),
  searchIntent: z.string().optional(),
  difficulty: z.string().optional(),
  opportunities: z.array(z.any()).optional(),
});

const bodySchema = z.object({
  tenantId: z.string().min(1, 'tenantId requis'),
  projectId: z.string().min(1, 'projectId requis'),
  language: z.string().min(2, 'language requis (ex: "en", "fr")'),
  articles: z.array(topicCandidateSchema).min(1, 'Au moins 1 article requis'),
  seoBriefData: seoBriefDataV3Schema,
});

/**
 * POST /api/seo/generate-angle
 * Génère un angle éditorial stratégique à partir d'articles découverts et d'un brief SEO
 *
 * Body:
 * {
 *   tenantId: string,
 *   projectId: string,
 *   language: string,
 *   articles: TopicCandidate[],  // Articles découverts avec contenu complet
 *   seoBriefData: SeoBriefDataV3  // Brief SEO complet
 * }
 *
 * Retourne: AngleSelectionResult {
 *   selectedAngle: string,
 *   chosenCluster: ChosenCluster,
 *   contentType: ContentType,
 *   selectionMode: ClusterSelectionMode,
 *   targetPersona?: PersonaProfile
 * }
 */
app.post('/', async c => {
  try {
    const body: unknown = await c.req.json();
    const input = bodySchema.parse(body);

    const useCases = c.get('useCases') as Record<string, unknown> | undefined;
    if (!useCases) return c.json({ error: 'Use cases indisponibles' }, 500);

    const candidate = (useCases as any).generateAngleUseCase;
    assertGenerateAngleUseCase(candidate);

    const result: AngleSelectionResult = await candidate.execute({
      tenantId: input.tenantId,
      projectId: input.projectId,
      language: input.language,
      articles: input.articles,
      seoBriefData: input.seoBriefData as SeoBriefDataV3,
    });

    return c.json({
      success: true,
      result: {
        selectedAngle: result.selectedAngle,
        chosenCluster: result.chosenCluster,
        contentType: result.contentType,
        selectionMode: result.selectionMode,
        targetPersona: result.targetPersona,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json(
        {
          success: false,
          error: 'Données invalides',
          details: error.errors,
        },
        400
      );
    }
    const message = (error as Error)?.message ?? 'Erreur interne';
    return c.json({ success: false, error: message }, 500);
  }
});

export default app;