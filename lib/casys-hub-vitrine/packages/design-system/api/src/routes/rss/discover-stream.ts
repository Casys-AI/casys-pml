/**
 * RSS Feed Discovery Route (Streaming)
 * POST /api/rss/discover-stream - Discover RSS feeds with real-time streaming
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';

import type { RssFeedDiscoveryRequestDTO } from '@casys/shared';
import type { DiscoverRssFeedsUseCase } from '@casys/application';

import { createLogger } from '../../utils/logger';

const logger = createLogger('RssDiscoveryStreamRoute');

// Validation schema for request
const requestSchema = z.object({
  projectId: z.string().min(1, 'projectId required'),
  industry: z.string().optional(),
  targetAudience: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  maxResults: z.number().min(1).max(50).optional(),
  minRelevanceScore: z.number().min(0).max(100).optional(),
  languages: z.array(z.string()).optional(),
  excludeUrls: z.array(z.string()).optional()
});

type RssDiscoveryBindings = {
  Variables: {
    useCases: {
      discoverRssFeedsUseCase?: DiscoverRssFeedsUseCase;
    };
    createApiResponse: <T>(success: boolean, data?: T, error?: string) => {
      success: boolean;
      data?: T;
      error?: string;
    };
    infraServices: {
      configReader?: {
        getProjectConfig(userId: string, projectId: string): Promise<any>;
      };
    };
  };
};

export const discoverRssStreamRoute = new Hono<RssDiscoveryBindings>();

/**
 * GET /api/rss/discover-stream
 * Discover RSS feeds with Server-Sent Events streaming
 * Uses GET method with query params (required for EventSource)
 */
discoverRssStreamRoute.get('/discover-stream', async c => {
  try {
    // Parse and validate query params
    const queryParams = {
      projectId: c.req.query('projectId'),
      industry: c.req.query('industry'),
      targetAudience: c.req.query('targetAudience'),
      keywords: c.req.query('keywords')?.split(',').filter(Boolean),
      maxResults: c.req.query('maxResults') ? Number(c.req.query('maxResults')) : undefined,
      minRelevanceScore: c.req.query('minRelevanceScore') ? Number(c.req.query('minRelevanceScore')) : undefined,
      languages: c.req.query('languages')?.split(',').filter(Boolean),
      excludeUrls: c.req.query('excludeUrls')?.split(',').filter(Boolean),
      searchDepth: c.req.query('searchDepth') as 'basic' | 'advanced' | undefined
    };

    const request = requestSchema.parse(queryParams) as RssFeedDiscoveryRequestDTO;

    logger.debug('RSS discovery stream request:', {
      projectId: request.projectId,
      maxResults: request.maxResults
    });

    // Get use case
    const useCases = c.get('useCases');
    const discoverRssFeedsUseCase = useCases?.discoverRssFeedsUseCase;

    if (!discoverRssFeedsUseCase) {
      logger.error('discoverRssFeedsUseCase not available');
      return c.json(
        {
          success: false,
          error: 'RSS discovery service not available'
        },
        503
      );
    }

    // Get business context from project config
    const infraServices = c.get('infraServices');
    logger.debug('infraServices available:', { hasInfraServices: !!infraServices });

    const configReader = infraServices?.configReader;
    logger.debug('configReader available:', { hasConfigReader: !!configReader });

    if (!configReader) {
      logger.error('ConfigReader not available');
      return c.json(
        {
          success: false,
          error: 'Configuration service not available'
        },
        503
      );
    }

    // Load project config
    // TODO: Get real userId from auth context
    const userId = 'kelly-assist';
    logger.debug('Loading project config:', { userId, projectId: request.projectId });

    const projectConfig = await configReader.getProjectConfig(userId, request.projectId);
    logger.debug('Project config loaded:', { hasConfig: !!projectConfig, language: projectConfig?.language });

    if (!projectConfig) {
      logger.error('Project config not found:', request.projectId);
      return c.json(
        {
          success: false,
          error: 'Project configuration not found'
        },
        404
      );
    }

    // Validate project language (MANDATORY per ProjectConfig schema)
    if (!projectConfig.language) {
      logger.error('Project language missing from config:', request.projectId);
      return c.json(
        {
          success: false,
          error: 'Project language is required in configuration'
        },
        400
      );
    }

    // Build business context
    const businessContext = {
      industry: request.industry || projectConfig.businessContext?.industry || 'Generic',
      targetAudience: request.targetAudience || projectConfig.businessContext?.targetAudience,
      businessDescription: projectConfig.businessContext?.businessDescription
    };

    // Override with request params if provided
    if (request.industry) {
      businessContext.industry = request.industry;
    }
    if (request.targetAudience) {
      businessContext.targetAudience = request.targetAudience;
    }

    logger.debug('Starting SSE stream for RSS discovery');

    // Stream RSS discovery results via SSE
    return streamSSE(c, async (stream) => {
      logger.debug('SSE stream initiated');
      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        stream
          .writeSSE({
            event: 'heartbeat',
            data: JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }),
          })
          .catch(() => {
            // Ignore heartbeat errors
          });
      }, 10000); // Every 10 seconds

      try {
        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({
            type: 'started',
            message: 'Démarrage de la découverte RSS...',
            step: 'init'
          })
        });

        // Execute use case with streaming callbacks (v2 architecture)
        const feeds = await discoverRssFeedsUseCase.execute({
          tenantId: userId, // Required for persistence
          projectId: request.projectId,
          businessContext,
          language: projectConfig.language, // Single language from project config
          maxResults: request.maxResults ?? 10,
          excludeUrls: request.excludeUrls,
          searchDepth: request.searchDepth ?? 'basic', // Default to 'basic' (cheaper)
          discoverySource: 'dataforseo', // Current adapter

          // Stream raw feeds as they're discovered
          onFeedDiscovered: async (feed) => {
            await stream.writeSSE({
              event: 'feed_discovered',
              data: JSON.stringify({
                type: 'feed_discovered',
                feed: {
                  url: feed.url,
                  title: feed.title,
                  description: feed.description,
                  websiteUrl: feed.websiteUrl,
                  language: feed.language
                }
              })
            });
          },

          // Signal qualification start
          onFeedQualifying: async (feed) => {
            await stream.writeSSE({
              event: 'feed_qualifying',
              data: JSON.stringify({
                type: 'feed_qualifying',
                feed: {
                  url: feed.url,
                  title: feed.title
                }
              })
            });
          },

          // Stream qualification results as they arrive
          onFeedQualified: async (feed, qualification) => {
            await stream.writeSSE({
              event: 'feed_qualified',
              data: JSON.stringify({
                type: 'feed_qualified',
                feed: {
                  url: feed.url,
                  title: feed.title
                },
                qualification: {
                  score: qualification.score,
                  status: qualification.status, // 'green' | 'orange' | 'red'
                  relevanceReason: qualification.relevanceReason,
                  category: qualification.category
                }
              })
            });
          },

          // Stream final selection
          onSelectionComplete: async (selected, rejected) => {
            await stream.writeSSE({
              event: 'selection_complete',
              data: JSON.stringify({
                type: 'selection_complete',
                selected: selected.length,
                rejected: rejected.length,
                counts: {
                  green: selected.filter(f => f.relevanceScore >= 80).length,
                  orange: selected.filter(f => f.relevanceScore >= 60 && f.relevanceScore < 80).length,
                  red: rejected.length
                }
              })
            });
          },

          // Progress updates
          onProgress: async (message, step) => {
            await stream.writeSSE({
              event: 'progress',
              data: JSON.stringify({
                type: 'progress',
                message,
                step
              })
            });
          }
        });

        // Send completion event
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({
            type: 'done',
            message: `Découverte terminée: ${feeds.length} flux RSS trouvés`,
            totalFeeds: feeds.length
          })
        });

        logger.log(`✅ RSS discovery stream completed: ${feeds.length} feeds`);

      } catch (error) {
        logger.error('❌ Error during RSS discovery stream:', {
          error,
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          type: typeof error,
          stringified: String(error)
        });

        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : 'Erreur lors de la découverte RSS',
            error: String(error)
          })
        });
      } finally {
        clearInterval(heartbeat);
      }
    });

  } catch (error) {
    logger.error('❌ Error in RSS discovery stream route:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      type: typeof error
    });

    if (error instanceof z.ZodError) {
      return c.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.errors
        },
        400
      );
    }

    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      500
    );
  }
});

export default discoverRssStreamRoute;