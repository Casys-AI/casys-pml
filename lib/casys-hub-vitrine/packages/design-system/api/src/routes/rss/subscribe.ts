/**
 * RSS Subscription Route
 * POST /api/rss/subscribe - Subscribe to an RSS feed
 */

import { Hono } from 'hono';
import { z } from 'zod';

import type { SubscribeToFeedUseCase } from '@casys/application';

import { createLogger } from '../../utils/logger';

const logger = createLogger('RssSubscribeRoute');

// Validation schema for subscription
const subscribeSchema = z.object({
  projectId: z.string().min(1, 'projectId required'),
  feedUrl: z.string().url('Valid feed URL required'),
  feedTitle: z.string().min(1, 'feedTitle required'),
  feedDescription: z.string().optional(),
  category: z.string().optional(),
  relevanceScore: z.number().min(0).max(100).optional(),
  discoverySource: z.enum(['tavily', 'dataforseo', 'manual']).optional(),
  websiteUrl: z.string().url().optional(),
  updateFrequency: z.string().optional(),
});

type RssSubscribeBindings = {
  Variables: {
    useCases: {
      subscribeToFeedUseCase?: SubscribeToFeedUseCase;
    };
    createApiResponse: <T>(
      success: boolean,
      data?: T,
      error?: string
    ) => {
      success: boolean;
      data?: T;
      error?: string;
    };
  };
};

export const subscribeRoute = new Hono<RssSubscribeBindings>();

/**
 * POST /api/rss/subscribe
 * Subscribe to an RSS feed
 */
subscribeRoute.post('/subscribe', async (c) => {
  const createApiResponse = c.get('createApiResponse');

  try {
    // Parse and validate request
    const body: unknown = await c.req.json();
    const request = subscribeSchema.parse(body);

    logger.debug('RSS subscription request:', {
      projectId: request.projectId,
      feedUrl: request.feedUrl,
    });

    // Get use case
    const useCases = c.get('useCases');
    const subscribeToFeedUseCase = useCases?.subscribeToFeedUseCase;

    if (!subscribeToFeedUseCase) {
      logger.error('subscribeToFeedUseCase not available');
      return c.json(
        createApiResponse(
          false,
          null,
          'Subscription service not available'
        ),
        503
      );
    }

    // TODO: Get tenantId from auth context
    const tenantId = 'kelly-assist';

    // Execute use case
    const subscription = await subscribeToFeedUseCase.execute(
      tenantId,
      request
    );

    logger.log('RSS subscription created:', {
      id: subscription.id,
      feedTitle: subscription.feedTitle,
    });

    return c.json(createApiResponse(true, subscription));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';

    logger.error('RSS subscription error:', error);

    // Handle duplicate subscription
    if (message.includes('Already subscribed')) {
      return c.json(createApiResponse(false, null, message), 409);
    }

    // Handle validation errors
    if ((error as any)?.issues) {
      return c.json(
        createApiResponse(false, null, 'Validation error'),
        400
      );
    }

    return c.json(
      createApiResponse(false, null, 'Failed to subscribe'),
      500
    );
  }
});

export default subscribeRoute;
