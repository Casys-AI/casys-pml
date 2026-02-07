import { Hono } from 'hono';
import { z } from 'zod';
import generateAngleRouter from './generate-angle';

const app = new Hono();

// Contract minimal pour le use case (structurelle)
interface SeoAnalysisUseCaseContract {
  execute(input: {
    tenantId: string;
    projectId: string;
    language: string;
    keywords?: string[];
  }): Promise<unknown>;
}

function assertSeoAnalysisUseCase(candidate: unknown): asserts candidate is SeoAnalysisUseCaseContract {
  if (!candidate || typeof candidate !== 'object' || typeof (candidate as any).execute !== 'function') {
    throw new Error('Service seoAnalysisUseCase non disponible');
  }
}

const bodySchema = z.object({
  tenantId: z.string().min(1, 'tenantId requis'),
  projectId: z.string().min(1, 'projectId requis'),
  language: z.string().min(2, 'language requis'),
  keywords: z.array(z.string()).optional(),
});

/**
 * POST /api/seo/generate
 * Lance une nouvelle analyse SEO (idempotente et data-driven)
 */
app.post('/generate', async c => {
  try {
    const body: unknown = await c.req.json();
    const input = bodySchema.parse(body);

    const useCases = c.get('useCases') as Record<string, unknown> | undefined;
    if (!useCases) return c.json({ error: 'Use cases indisponibles' }, 500);

    const candidate = (useCases as any).seoAnalysisUseCase;
    assertSeoAnalysisUseCase(candidate);

    const result = await candidate.execute({
      tenantId: input.tenantId,
      projectId: input.projectId,
      language: input.language,
      keywords: input.keywords,
    });

    return c.json({ success: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Données invalides', details: error.errors }, 400);
    }
    const message = (error as Error)?.message ?? 'Erreur interne';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/seo/generate-angle
 * Génère un angle éditorial stratégique
 */
app.route('/generate-angle', generateAngleRouter);

export default app;
