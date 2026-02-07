/**
 * RSS Feed Discovery Route
 * POST /api/rss/discover - Discover RSS feeds based on business context
 */

import { Hono } from 'hono';
import { z } from 'zod';

import type { RssFeedDiscoveryRequestDTO, RssFeedDiscoveryResponseDTO } from '@casys/shared';
import type { DiscoverRssFeedsUseCase } from '@casys/application';

import { createLogger } from '../../utils/logger';

const logger = createLogger('RssDiscoveryRoute');

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

export const discoverRssRoute = new Hono<RssDiscoveryBindings>();

/**
 * POST /api/rss/discover
 * Discover RSS feeds based on business context
 */
discoverRssRoute.post('/discover', async c => {
  const createApiResponse = c.get('createApiResponse');

  try {
    // Parse and validate request
    const body: unknown = await c.req.json();
    const request = requestSchema.parse(body) as RssFeedDiscoveryRequestDTO;

    logger.debug('RSS discovery request:', {
      projectId: request.projectId,
      maxResults: request.maxResults
    });

    // Get use case
    const useCases = c.get('useCases');
    const discoverRssFeedsUseCase = useCases?.discoverRssFeedsUseCase;

    if (!discoverRssFeedsUseCase) {
      logger.error('discoverRssFeedsUseCase not available');
      return c.json(
        createApiResponse(false, null, 'RSS discovery service not available'),
        503
      );
    }

    // Get business context from project config
    const infraServices = c.get('infraServices');
    const configReader = infraServices?.configReader;

    if (!configReader) {
      logger.error('configReader not available');
      return c.json(
        createApiResponse(false, null, 'Project config service not available'),
        503
      );
    }

    // Fetch project config
    // Note: tenantId should come from auth context in production
    const tenantId = 'kelly-assist'; // TODO: Get from auth

    let projectConfig;
    try {
      projectConfig = await configReader.getProjectConfig(tenantId, request.projectId);
    } catch (error) {
      logger.error('Failed to load project config:', error);
      return c.json(
        createApiResponse(false, null, 'Project configuration not found'),
        404
      );
    }

    // Extract business context (from businessContext or seoAnalysis)
    const businessContext = projectConfig.businessContext || {
      industry: projectConfig.generation?.seoAnalysis?.industry || '',
      targetAudience: projectConfig.generation?.seoAnalysis?.targetAudience || '',
      businessDescription: projectConfig.generation?.seoAnalysis?.businessDescription
    };

    if (!businessContext.industry || !businessContext.targetAudience) {
      logger.warn('Incomplete business context for project:', request.projectId);
      return c.json(
        createApiResponse(
          false,
          null,
          'Business context incomplete: industry and targetAudience are required'
        ),
        400
      );
    }

    // Validate project language (MANDATORY per ProjectConfig schema)
    if (!projectConfig.language) {
      logger.error('Project language missing from config:', request.projectId);
      return c.json(
        createApiResponse(
          false,
          null,
          'Project language is required in configuration'
        ),
        400
      );
    }

    // Override with request params if provided
    if (request.industry) {
      businessContext.industry = request.industry;
    }
    if (request.targetAudience) {
      businessContext.targetAudience = request.targetAudience;
    }

    // Execute use case
    // Use project language from config (prioritizes user's configured language)
    const feeds = await discoverRssFeedsUseCase.execute({
      tenantId, // Required for persistence
      projectId: request.projectId,
      businessContext,
      language: projectConfig.language, // Required: ISO 639-1 code from config
      maxResults: request.maxResults ?? 10,
      excludeUrls: request.excludeUrls,
      discoverySource: 'dataforseo' // Current adapter
    });

    // Build response
    const response: RssFeedDiscoveryResponseDTO = {
      feeds,
      totalFound: feeds.length,
      discoveryContext: {
        industry: businessContext.industry,
        targetAudience: businessContext.targetAudience,
        keywords: request.keywords ?? []
      },
      sources: ['tavily']
    };

    logger.log(`✅ Discovered ${feeds.length} RSS feeds for project ${request.projectId}`);

    return c.json(createApiResponse(true, response), 200);

  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Validation error:', error.errors);
      return c.json(
        createApiResponse(false, null, `Validation error: ${error.errors.map(e => e.message).join(', ')}`),
        400
      );
    }

    logger.error('Error discovering RSS feeds:', error);
    return c.json(
      createApiResponse(
        false,
        null,
        error instanceof Error ? error.message : 'Internal server error'
      ),
      500
    );
  }
});

export default discoverRssRoute;
