import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { createLogger } from '../../utils/logger';

const app = new Hono();
const logger = createLogger('ComponentGenerateRoute');

// Schema de validation pour la génération de composants
const GenerateComponentSchema = z.object({
  commentText: z.string().min(1, 'Le texte du commentaire est requis'),
  articleId: z.string().optional(),
  sectionId: z.string().optional(),
  textFragmentId: z.string().optional(),
  tenantId: z.string().optional(),
  context: z
    .object({
      articleTitle: z.string().optional(),
      sectionTitle: z.string().optional(),
      surroundingText: z.string().optional(),
    })
    .optional(),
});

type GenerateComponentRequest = z.infer<typeof GenerateComponentSchema>;

// Schema de réponse
interface GenerateComponentResponse {
  success: boolean;
  data?: {
    componentId: string;
    componentName: string;
    props: Record<string, unknown>;
    usageId: string;
    metadata: {
      aiGenerated: boolean;
      confidence: number;
      generatedAt: string;
    };
  };
  error?: string;
}

interface GenerateComponentUseCaseInput {
  commentText: string;
  articleId?: string;
  sectionId?: string;
  textFragmentId?: string;
  tenantId?: string;
  context?: {
    articleTitle?: string;
    sectionTitle?: string;
    surroundingText?: string;
  };
}

interface GeneratedComponentSummary {
  id?: string;
  name?: string;
  props?: Record<string, unknown>;
  aiMetadata?: { confidence?: number };
}

interface ComponentUsageSummary {
  id?: string;
}

interface GenerateComponentUseCaseResult {
  success: boolean;
  error?: string;
  generatedComponent?: GeneratedComponentSummary;
  componentUsage?: ComponentUsageSummary;
  result?: {
    selectedComponent?: GeneratedComponentSummary;
    generatedProps?: Record<string, unknown>;
    componentUsage?: ComponentUsageSummary;
    confidence?: number;
  };
}

interface GenerateComponentUseCaseContract {
  execute(input: GenerateComponentUseCaseInput): Promise<GenerateComponentUseCaseResult>;
}

function assertGenerateComponentUseCase(
  candidate: unknown
): asserts candidate is GenerateComponentUseCaseContract {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Service de génération de composants non disponible');
  }
  if (typeof (candidate as { execute?: unknown }).execute !== 'function') {
    throw new Error('Service de génération de composants non disponible');
  }
}

function pickGeneratedComponent(result: GenerateComponentUseCaseResult): {
  component: GeneratedComponentSummary | undefined;
  usage: ComponentUsageSummary | undefined;
  confidence: number | undefined;
  generatedProps: Record<string, unknown> | undefined;
} {
  const fromLegacy = result.generatedComponent;
  const fromNew = result.result?.selectedComponent;
  const component = fromLegacy ?? fromNew;
  const usage = result.componentUsage ?? result.result?.componentUsage;
  const confidence = fromLegacy?.aiMetadata?.confidence ?? result.result?.confidence ?? undefined;
  const generatedProps = fromLegacy?.props ?? result.result?.generatedProps;
  return { component, usage, confidence, generatedProps };
}

/**
 * POST /components/generate - Génère un composant à partir d'un commentaire
 * Utilise le GenerateComponentFromCommentUseCase
 */
app.post('/generate', zValidator('json', GenerateComponentSchema), async c => {
  logger.log('=== DÉBUT GÉNÉRATION COMPOSANT ===');

  try {
    const request = c.req.valid('json') as GenerateComponentRequest;
    logger.log('1. Requête validée:', {
      commentText: request.commentText.substring(0, 100) + '...',
      articleId: request.articleId,
      hasContext: !!request.context,
    });

    const generateComponentUseCaseCandidate = c.get('useCases').generateComponentFromCommentUseCase;
    assertGenerateComponentUseCase(generateComponentUseCaseCandidate);
    const generateComponentUseCase = generateComponentUseCaseCandidate;

    logger.log('2. Use case récupéré, exécution...');

    // Exécution du use case
    const result = await generateComponentUseCase.execute({
      commentText: request.commentText,
      articleId: request.articleId,
      sectionId: request.sectionId,
      textFragmentId: request.textFragmentId,
      tenantId: request.tenantId,
      context: request.context,
    });

    logger.log('3. Génération terminée:', {
      success: result.success,
      componentGenerated: !!(result.generatedComponent ?? result.result?.selectedComponent),
    });

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error ?? 'Échec de la génération du composant',
        } as GenerateComponentResponse,
        400
      );
    }

    const { component, usage, confidence, generatedProps } = pickGeneratedComponent(result);

    const componentId = component?.id ?? usage?.id ?? 'unknown-component';
    const componentName = component?.name ?? 'Component';
    const props: Record<string, unknown> = generatedProps ?? component?.props ?? {};
    const usageId = usage?.id ?? 'usage-unknown';
    const resolvedConfidence = confidence ?? 0.8;

    // Construire la réponse de succès
    const response: GenerateComponentResponse = {
      success: true,
      data: {
        componentId,
        componentName,
        props,
        usageId,
        metadata: {
          aiGenerated: true,
          confidence: resolvedConfidence,
          generatedAt: new Date().toISOString(),
        },
      },
    };

    logger.log('4. Réponse construite avec succès');
    return c.json(response);
  } catch (error) {
    logger.error('Erreur lors de la génération du composant:', error);
    return c.json(
      {
        success: false,
        error: 'Erreur interne du serveur',
      } as GenerateComponentResponse,
      500
    );
  }
});

/**
 * GET /components/generate - Méthode non autorisée
 */
app.get('/generate', c => {
  return c.json(
    {
      success: false,
      error: 'Méthode GET non supportée. Utilisez POST.',
    },
    405
  );
});

export default app;
