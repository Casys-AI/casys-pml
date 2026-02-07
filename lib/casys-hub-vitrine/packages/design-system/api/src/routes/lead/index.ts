import { Hono } from 'hono';
import { type SSEStreamingApi,streamSSE } from 'hono/streaming';
import crypto from 'node:crypto';
import { z } from 'zod';

import { leadEventBroadcaster } from '../../services/lead-event-broadcaster';
import { createLogger } from '../../utils/logger';

const logger = createLogger('LeadRoutes');

/**
 * Launch analysis with broadcaster callbacks
 */
async function launchAnalysisWithBroadcaster(
  uc: unknown,
  domain: string
): Promise<void> {
  await (uc as {
    execute: (
      input: { domain: string },
      callbacks: Record<string, (data: unknown) => Promise<void>>
    ) => Promise<unknown>;
  }).execute({ domain }, {
    onStatus: async (message: string) => leadEventBroadcaster.emit(domain, 'status', { message }),
    onMetrics: async (metrics: unknown) => leadEventBroadcaster.emit(domain, 'metrics', metrics),
    onPages: async (count: number) => leadEventBroadcaster.emit(domain, 'pages', { count }),
    onBusinessContext: async (context: unknown) => leadEventBroadcaster.emit(domain, 'businessContext', context),
    onKeywords: async (keywords: unknown) => leadEventBroadcaster.emit(domain, 'keywords', keywords),
    onKeyword: async (keyword: unknown) => leadEventBroadcaster.emit(domain, 'keyword', keyword),
    onProfile: async (profile: unknown) => leadEventBroadcaster.emit(domain, 'profile', profile),
    onCompetitorBacklink: async (backlink: unknown) => leadEventBroadcaster.emit(domain, 'competitorBacklink', backlink),
    onLinkOpportunity: async (opportunity: unknown) => leadEventBroadcaster.emit(domain, 'linkOpportunity', opportunity),
    onOpportunity: async (opp: unknown) => leadEventBroadcaster.emit(domain, 'opportunity', opp),
    onQuickWin: async (win: unknown) => leadEventBroadcaster.emit(domain, 'quickWin', win),
    onContentGap: async (gap: unknown) => leadEventBroadcaster.emit(domain, 'contentGap', gap),
    onTopicCluster: async (cluster: unknown) => leadEventBroadcaster.emit(domain, 'topicCluster', cluster),
    onContentBrief: async (brief: unknown) => leadEventBroadcaster.emit(domain, 'contentBrief', brief),
    onLinkingSuggestion: async (suggestion: unknown) => leadEventBroadcaster.emit(domain, 'linkingSuggestion', suggestion),
    onSummary: async (summary: unknown) => leadEventBroadcaster.emit(domain, 'summary', summary),
    onRecommendation: async (rec: unknown) => leadEventBroadcaster.emit(domain, 'recommendation', rec),
    onRoadmap: async (roadmap: unknown) => leadEventBroadcaster.emit(domain, 'roadmap', roadmap),
    onProgress: async (message: string) => leadEventBroadcaster.emit(domain, 'progress', { message }),
    onDone: async () => leadEventBroadcaster.emit(domain, 'done', {}),
  });
}

const lead = new Hono();

// Start analysis endpoint (fire and forget - launch analysis immediately)
lead.post('/start', async c => {
  const body: unknown = await c.req.json().catch(() => ({}));
  const domain = (body as { domain?: string }).domain;
  
  if (!domain) {
    return c.json({ error: 'domain required' }, 400);
  }

  // Check if already running
  if (leadEventBroadcaster.isRunning(domain)) {
    logger.debug('[start] Analysis already running', { domain });
    return c.json({ success: true, domain, status: 'already_running' }, 200);
  }

  logger.debug('[start] Launching analysis in background', { domain });

  // Launch analysis in background (don't await)
  const uc = c.get('useCases').leadAnalysisUseCase;
  if (uc && typeof (uc as { execute?: unknown }).execute === 'function') {
    // Fire and forget - analysis will emit events to broadcaster
    setImmediate(() => {
      launchAnalysisWithBroadcaster(uc, domain).catch((err) => {
        logger.error('[start] Analysis failed', { domain, error: String(err) });
        leadEventBroadcaster.emit(domain, 'error', { error: String(err) });
      });
    });
  }

  // Provide paths so the caller (Astro) can redirect to dashboard preview and wire SSE
  const encoded = encodeURIComponent(domain);
  const redirectUrl = `http://localhost:4200/preview/${encoded}`; // dashboard Angular dev URL
  const ssePath = `/lead/analyze?domain=${encoded}`; // existing SSE stream (server-side)
  return c.json({ success: true, domain, redirectUrl, ssePath }, 202);
});

// Full Lead Analysis Streaming: Connects to broadcaster or launches new analysis
// Supports preview mode with ?preview=true (fast 2-step analysis, ~6-10s)
lead.get('/analyze', async c => {
  const domain = c.req.query('domain');
  const preview = c.req.query('preview') === 'true';

  if (!domain) {
    return c.json({ error: 'domain query param required' }, 400);
  }

  // Choose use case based on preview flag
  const useCases = c.get('useCases');
  const uc = preview
    ? useCases.leadPreviewUseCase
    : useCases.leadAnalysisUseCase;

  if (!uc || typeof (uc as { execute?: unknown }).execute !== 'function') {
    const ucName = preview ? 'leadPreviewUseCase' : 'leadAnalysisUseCase';
    return c.json({ error: `Service ${ucName}.execute non disponible` }, 500);
  }

  return streamSSE(c, async (stream: SSEStreamingApi) => {
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: 'heartbeat', data: '{}' }).catch(() => { return; });
    }, 5000);

    let unsubscribe: (() => void) | null = null;

    try {
      // Check for ?force=true query param
      const force = c.req.query('force') === 'true';

      // Check if cached analysis exists in filesystem (unless force=true)
      const store = c.get('leadAnalysisStore');
      if (store && !force && !preview) {
        try {
          const existing = await store.getByDomain(domain);

          if (existing) {
            logger.debug('[analyze] Loading cached analysis from filesystem', {
              domain,
              snapshotId: existing.id,
              keywordsCount: existing.discoveredKeywords?.length ?? 0
            });

            // Stream cached data to client (fast UX)
            await stream.writeSSE({
              event: 'status',
              data: JSON.stringify({ message: 'Loading cached analysis...' })
            });

            // Stream domain metrics
            if (existing.domainMetrics) {
              await stream.writeSSE({
                event: 'metrics',
                data: JSON.stringify(existing.domainMetrics)
              });
            }

            // Stream pages count if available
            if (existing.discoveredKeywords) {
              await stream.writeSSE({
                event: 'pages',
                data: JSON.stringify({ count: existing.discoveredKeywords.length })
              });
            }

            // Stream business context
            if (existing.businessContext) {
              await stream.writeSSE({
                event: 'businessContext',
                data: JSON.stringify(existing.businessContext)
              });
            }

            // Stream all discovered keywords individually (progressive UI)
            if (existing.discoveredKeywords && Array.isArray(existing.discoveredKeywords)) {
              for (const kw of existing.discoveredKeywords) {
                await stream.writeSSE({
                  event: 'keyword',
                  data: JSON.stringify(kw)
                });
              }

              await stream.writeSSE({
                event: 'status',
                data: JSON.stringify({ message: `Loaded ${existing.discoveredKeywords.length} cached keywords` })
              });
            }

            // Send completion event
            await stream.writeSSE({
              event: 'done',
              data: JSON.stringify({
                cached: true,
                snapshotId: existing.id,
                message: 'Cached analysis loaded successfully. Use ?force=true to re-analyze.'
              })
            });

            logger.debug('[analyze] Cached analysis streamed successfully', { domain });

            // Close heartbeat and exit early
            clearInterval(heartbeat);
            return;
          } else {
            logger.debug('[analyze] No cached analysis found, will run fresh analysis', { domain });
          }
        } catch (cacheError) {
          logger.warn('[analyze] Error loading cached analysis, will run fresh analysis', {
            domain,
            error: cacheError instanceof Error ? cacheError.message : String(cacheError)
          });
          // Continue with fresh analysis
        }
      } else if (force) {
        logger.debug('[analyze] Force flag set, skipping cache', { domain });
      }

      // Check if analysis is running BEFORE subscribing
      const wasRunning = leadEventBroadcaster.isRunning(domain);
      
      // Subscribe to broadcaster (gets cached + new events)
      unsubscribe = leadEventBroadcaster.subscribe(
        domain,
        (event) => {
          stream.writeSSE({ event: event.event, data: event.data }).catch(() => { return; });
        },
        () => {
          // On 'done' event, close stream
          clearInterval(heartbeat);
          if (unsubscribe) unsubscribe();
        }
      );

      // Launch analysis if it wasn't running before
      if (!wasRunning) {
        const mode = preview ? 'preview' : 'full';
        logger.debug(`[analyze] Launching new ${mode} analysis`, { domain });
        setImmediate(() => {
          launchAnalysisWithBroadcaster(uc, domain).catch((err: unknown) => {
            logger.error(`[analyze] ${mode} analysis failed`, { domain, error: String(err) });
            leadEventBroadcaster.emit(domain, 'error', { error: String(err) });
          });
        });
      } else {
        logger.debug('[analyze] Connecting to existing analysis', { domain });
      }

      // Wait until stream is closed by client or done event
      await new Promise<void>((resolve) => {
        // Stream will close when client disconnects or 'done' event fires
        c.req.raw.signal.addEventListener('abort', () => {
          clearInterval(heartbeat);
          if (unsubscribe) unsubscribe();
          resolve();
        });
      });
    } catch (error) {
      logger.error('[analyze] Error during lead analysis', error);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
      });
    } finally {
      clearInterval(heartbeat);
    }
  });
});

// Step 1 Streaming: Photo d'identité SEO avec SSE (legacy route)
lead.get('/step1/stream', async c => {
  const domain = c.req.query('domain');
  const force = c.req.query('force') === 'true';

  if (!domain) {
    return c.json({ error: 'domain query param required' }, 400);
  }

  const uc = c.get('useCases').leadAnalysisUseCase;
  if (!uc || typeof (uc as { execute?: unknown }).execute !== 'function') {
    return c.json({ error: 'Service leadAnalysisUseCase.execute non disponible' }, 500);
  }

  return streamSSE(c, async (stream: SSEStreamingApi) => {
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: 'heartbeat', data: '{}' }).catch(() => { return; });
    }, 5000);

    try {
      // Exécuter Step1 avec streaming
      const result = await (uc as {
        execute: (
          input: { domain: string; force?: boolean },
          callbacks: {
            onStatus: (message: string) => Promise<void>;
            onMetrics: (metrics: unknown) => Promise<void>;
            onPages: (count: number) => Promise<void>;
            onBusinessContext: (context: unknown) => Promise<void>;
            onKeywords: (keywords: unknown) => Promise<void>;
            onKeyword: (keyword: unknown) => Promise<void>;
          }
        ) => Promise<unknown>;
      }).execute({ domain, force }, {
        onStatus: async (message) => {
          logger.debug('[step1/stream] status', { message });
          try {
            await stream.writeSSE({
              event: 'status',
              data: JSON.stringify({ message })
            });
          } catch (err) {
            logger.warn('[step1/stream] writeSSE(status) failed', { err: err instanceof Error ? err.message : String(err) });
          }
        },
        onMetrics: async (metrics) => {
          logger.debug('[step1/stream] metrics', metrics as Record<string, unknown>);
          try {
            await stream.writeSSE({
              event: 'metrics',
              data: JSON.stringify(metrics)
            });
          } catch (err) {
            logger.warn('[step1/stream] writeSSE(metrics) failed', { err: err instanceof Error ? err.message : String(err) });
          }
        },
        onPages: async (count) => {
          logger.debug('[step1/stream] pages', { count });
          try {
            await stream.writeSSE({
              event: 'pages',
              data: JSON.stringify({ count })
            });
          } catch (err) {
            logger.warn('[step1/stream] writeSSE(pages) failed', { err: err instanceof Error ? err.message : String(err) });
          }
        },
        onBusinessContext: async (context) => {
          try {
            logger.debug('[step1/stream] businessContext', context as Record<string, unknown>);
            await stream.writeSSE({
              event: 'businessContext',
              data: JSON.stringify(context)
            });
          } catch (err) {
            logger.error('[step1/stream] onBusinessContext callback failed', err);
            throw err;
          }
        },
        onKeywords: async (keywords) => {
          try {
            logger.debug('[step1/stream] keywords', { count: Array.isArray(keywords) ? keywords.length : 0 });
            await stream.writeSSE({
              event: 'keywords',
              data: JSON.stringify(keywords)
            });
          } catch (err) {
            logger.error('[step1/stream] onKeywords callback failed', err);
            throw err;
          }
        },
        onKeyword: async (keyword) => {
          try {
            const kw = keyword as { label?: string; slug?: string; searchVolume?: number };
            logger.debug('[step1/stream] keyword', { label: kw?.label, slug: kw?.slug, volume: kw?.searchVolume });
            await stream.writeSSE({
              event: 'keyword',
              data: JSON.stringify(keyword)
            });
          } catch (err) {
            logger.warn('[step1/stream] onKeyword callback failed', { err: err instanceof Error ? err.message : String(err) });
          }
        }
      });

      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ success: true, result })
      });

    } catch (error: unknown) {
      const errInfo = {
        type: typeof error,
        isError: error instanceof Error,
        message: (error as { message?: string })?.message,
        stack: (error as { stack?: string })?.stack,
      };
      logger.error('[step1/stream] Error', errInfo);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message: errInfo.message ?? 'Unknown error', details: errInfo })
      });
    } finally {
      clearInterval(heartbeat);
      await stream.close();
    }
  });
});

// Step 2: Opportunités & keywords enrichis
const step2Schema = z.object({
  snapshotId: z.string().min(1),
  selectedSeeds: z.array(z.string()).optional(),
});

lead.post('/step2', async c => {
  const uc = c.get('useCases').leadAnalysisUseCase;
  if (!uc || typeof (uc as { executeStep2?: unknown }).executeStep2 !== 'function') {
    return c.json({ error: 'Service leadAnalysisUseCase non disponible' }, 500);
  }

  const body: unknown = await c.req.json().catch(() => ({}));
  const input = step2Schema.safeParse(body);
  if (!input.success) {
    return c.json({ error: 'Entrée invalide', details: input.error.flatten() }, 400);
  }

  try {
    const result = await (uc as { executeStep2: (input: { snapshotId: string; selectedSeeds?: string[] }) => Promise<unknown> }).executeStep2(input.data);
    return c.json(result);
  } catch (error: unknown) {
    return c.json({ error: error instanceof Error ? error.message : 'Erreur' }, 500);
  }
});

lead.get('/result/:id', async c => {
  const id = c.req.param('id');
  const store = c.get('leadAnalysisStore');
  if (!store) return c.json({ error: 'leadAnalysisStore non disponible' }, 500);
  const snap = await store.getById(id);
  if (!snap) return c.json({ error: 'Snapshot introuvable' }, 404);
  return c.json(snap);
});

export default lead;

// Subscribe endpoint: returns an unlock token and sets httpOnly cookie
const subscribeSchema = z.object({ domain: z.string().min(1), email: z.string().email() });
lead.post('/subscribe', async c => {
  const body: unknown = await c.req.json().catch(() => ({}));
  const input = subscribeSchema.safeParse(body);
  if (!input.success) return c.json({ error: 'Entrée invalide', details: input.error.flatten() }, 400);

  const store = c.get('leadAnalysisStore');
  if (!store) return c.json({ error: 'leadAnalysisStore non disponible' }, 500);
  const token = crypto.randomUUID();
  await store.upsertUnlock({ domain: input.data.domain.toLowerCase(), email: input.data.email.toLowerCase(), token, createdAt: new Date().toISOString() });
  // Set-Cookie httpOnly
  c.header('Set-Cookie', `lead_unlock=${token}; HttpOnly; Path=/; Max-Age=2592000`); // 30 jours
  return c.json({ ok: true, token });
});

// Preview endpoint: redacted graph (no labels, trimmed edges)
lead.get('/preview/:id', async c => {
  const id = c.req.param('id');
  const store = c.get('leadAnalysisStore');
  if (!store) return c.json({ error: 'leadAnalysisStore non disponible' }, 500);
  const snap = await store.getById(id);
  if (!snap) return c.json({ error: 'Snapshot introuvable' }, 404);

  // Build redacted graph from keywordPlan tags
  interface TagLike { slug?: string; label?: string }
  const tags: TagLike[] = Array.isArray(snap.keywordPlan?.tags)
    ? (snap.keywordPlan.tags as TagLike[])
    : [];
  const nodes = tags.slice(0, 30).map((t) => ({ id: `tag-${String(t.slug ?? t.label ?? '').toLowerCase()}`, type: 'tag' as const }));
  const edges: { source: string; target: string; weight?: number }[] = []; // aucun edge pour la preview
  const payload = { nodes, edges, counts: { tags: tags.length, nodes: nodes.length, edges: edges.length } };
  return c.json(payload);
});

// Full graph endpoint: requires unlock token cookie + email query
lead.get('/full/:id', async c => {
  const id = c.req.param('id');
  const email = String(c.req.query('email') ?? '').toLowerCase();
  const store = c.get('leadAnalysisStore');
  if (!store) return c.json({ error: 'leadAnalysisStore non disponible' }, 500);
  const snap = await store.getById(id);
  if (!snap) return c.json({ error: 'Snapshot introuvable' }, 404);

  const cookie = c.req.header('cookie') ?? '';
  const m = /(?:^|;\s*)lead_unlock=([^;]+)/.exec(cookie);
  const token = m?.[1] ?? '';
  if (!email || !token) return c.json({ error: 'Accès refusé' }, 403);
  const expected = await store.findUnlockToken(snap.domain, email);
  if (!expected || expected !== token) return c.json({ error: 'Accès refusé' }, 403);

  // Build a simple full graph (tags only for V1)
  const tags = Array.isArray(snap.keywordPlan?.tags) ? snap.keywordPlan.tags : [] as { slug?: string; label?: string }[];
  const nodes = tags.map((t) => ({ id: `tag-${String(t.slug ?? t.label ?? '').toLowerCase()}`, type: 'tag' as const, label: String(t.label ?? t.slug ?? '') }));
  const edges: { source: string; target: string; weight?: number }[] = [];
  return c.json({ nodes, edges, counts: { tags: tags.length, nodes: nodes.length, edges: edges.length } });
});
