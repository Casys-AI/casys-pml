import { type ContextVariableMap, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';

import { ApplicationEventTypes } from '@casys/shared';

interface GenerateArticleBindings {
  Variables: Pick<ContextVariableMap, 'logger' | 'useCases'>;
}

const app = new Hono<GenerateArticleBindings>();
interface AppEvent {
  type: (typeof ApplicationEventTypes)[keyof typeof ApplicationEventTypes];
  payload?: unknown;
}

interface GenerateArticleUseCaseContract {
  execute(
    input: {
      articles: unknown[];
      keywords: string[];
      tenantId?: string;
      projectId?: string;
    },
    options: {
      onEvent: (event: AppEvent) => Promise<void> | void;
    }
  ): Promise<unknown>;
}

function assertGenerateArticleUseCase(
  candidate: unknown
): asserts candidate is GenerateArticleUseCaseContract {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Service generateArticleLinearUseCase non disponible');
  }
  if (typeof (candidate as { execute?: unknown }).execute !== 'function') {
    throw new Error('Service generateArticleLinearUseCase non disponible');
  }
}

// Schema de validation pour la génération d'article
const generateArticleSchema = z.object({
  articles: z.array(
    z.object({
      articleId: z.string(),
      articleTitle: z.string(),
      sectionId: z.string().optional(),
      sectionTitle: z.string().optional(),
      sectionLevel: z.number().optional(),
      relevanceScore: z.number(),
      componentIds: z.array(z.string()).optional(),
      usagePosition: z.number().optional(),
      isSectionHeader: z.boolean().optional(),
    })
  ),
  keywords: z.array(z.string()).min(1, 'Au moins un mot-clé requis'),
  language: z.string().default('fr'),
  tenantId: z.string().optional(),
  projectId: z.string().optional(),
});

/**
 * POST /content/generate
 * Génère un article via le pipeline DDD avec streaming SSE
 */
app.post('/generate', async c => {
  try {
    // Récupération du logger injecté
    const logger = c.get('logger');
    
    // Validation des données d'entrée
    const body: unknown = await c.req.json();
    const input = generateArticleSchema.parse(body);

    // Récupération du service depuis le middleware
    const useCases = c.get('useCases');
    if (!useCases) {
      logger.error('❌ useCases non disponible dans le contexte');
      return c.json({ error: 'useCases non disponible' }, 500);
    }

    const generateArticleLinearUseCaseCandidate = useCases.generateArticleLinearUseCase;
    if (!generateArticleLinearUseCaseCandidate) {
      logger.error('❌ generateArticleLinearUseCase non disponible', {
        availableKeys: Object.keys(useCases || {}),
      });
      return c.json(
        {
          error: 'feature_unavailable',
          feature: 'articleGeneration',
          reason:
            'generateArticleLinearUseCase requires seoAnalysisUseCase and other critical dependencies',
        },
        501
      );
    }
    assertGenerateArticleUseCase(generateArticleLinearUseCaseCandidate);
    const generateArticleLinearUseCase = generateArticleLinearUseCaseCandidate;

    // Configuration du streaming SSE
    return streamSSE(c, async stream => {
      // Heartbeat pour éviter les timeouts d'inactivité sur la connexion SSE
      const heartbeat = setInterval(() => {
        stream
          .writeSSE({
            event: 'progress',
            data: JSON.stringify({ type: 'heartbeat' }),
          })
          .catch(() => {
            // ignore heartbeat errors
          });
      }, 4000);
      try {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'status',
            message: "Démarrage de la génération d'article...",
            step: 'init',
          }),
          event: 'progress',
        });

        // 1. Sélection du sujet
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'status',
            message: 'Sélection du sujet principal...',
            step: 'topic-selection',
          }),
          event: 'progress',
        });

        // 2. Génération du plan
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'status',
            message: "Génération du plan de l'article...",
            step: 'outline-generation',
          }),
          event: 'progress',
        });

        // 3. Rédaction des sections
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'status',
            message: 'Rédaction des sections...',
            step: 'content-generation',
          }),
          event: 'progress',
        });

        // Exécution du use case
        const result = await generateArticleLinearUseCase.execute(
          {
            articles: input.articles,
            keywords: input.keywords,
            tenantId: input.tenantId,
            projectId: input.projectId,
          },
          {
            onEvent: async (evt: AppEvent) => {
              // Relayer les événements applicatifs typés vers le client SSE
              await stream.writeSSE({
                event: evt.type,
                data: JSON.stringify({ type: evt.type, payload: evt.payload ?? {} }),
              });
              // Émettre un event dérivé pour initialiser la progression
              if (evt.type === ApplicationEventTypes.OutlineIndexed) {
                const sectionsCount =
                  (evt.payload as { sectionsCount?: number } | undefined)?.sectionsCount ?? 0;
                await stream.writeSSE({
                  event: 'sections_total',
                  data: JSON.stringify({ type: 'sections_total', total: sectionsCount }),
                });
              }
              // Message de progression convivial (facultatif)
              let msg = 'Événement';
              switch (evt.type) {
                case ApplicationEventTypes.OutlineIndexed:
                  msg = 'Plan indexé';
                  break;
                case ApplicationEventTypes.SectionStarted:
                  msg = 'Section en cours';
                  break;
                case ApplicationEventTypes.SectionIndexed:
                  msg = 'Section indexée';
                  break;
                case ApplicationEventTypes.SectionCompleted:
                  msg = 'Section terminée';
                  break;
                case ApplicationEventTypes.ArticlePublished:
                  msg = 'Publication terminée';
                  break;
                case ApplicationEventTypes.SeoPostEvalTodo:
                  msg = 'Post SEO eval';
                  break;
                default:
                  msg = 'Événement';
              }
              await stream.writeSSE({
                event: 'progress',
                data: JSON.stringify({ type: 'status', message: msg, step: evt.type }),
              });
            },
          }
        );

        // Envoi du résultat final
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'result',
            data: result,
            message: 'Article généré avec succès !',
            step: 'completed',
          }),
          event: 'result',
        });

        // Fermeture du stream
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'status',
            message: 'Génération terminée',
            step: 'done',
          }),
          event: 'done',
        });
        // Assurer la terminaison du flux côté serveur
        clearInterval(heartbeat);
        await stream.close();
      } catch (error) {
        // Erreur lors de la génération
        clearInterval(heartbeat);
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : 'Erreur inconnue',
            step: 'error',
          }),
          event: 'error',
        });
        // En cas d'erreur, fermer explicitement le flux
        await stream.close();
      }
    });
  } catch (error) {
    // Erreur de validation (SSE)
    if (error instanceof z.ZodError) {
      return c.json(
        {
          error: "Données d'entrée invalides",
          details: error.errors,
        },
        400
      );
    }
    // Propager le message d'erreur applicatif attendu par les tests (ex: service indisponible)
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Erreur interne du serveur',
      },
      500
    );
  }
});

export default app;
