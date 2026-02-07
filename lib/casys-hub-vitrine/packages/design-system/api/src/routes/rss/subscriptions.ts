/**
 * RSS Subscriptions Management Route
 * GET /api/rss/subscriptions/:projectId - List subscriptions
 * PATCH /api/rss/subscriptions/:id - Update subscription
 * DELETE /api/rss/subscriptions/:id - Delete subscription
 */

import { Hono } from 'hono';
import { z } from 'zod';

import type {
  ListSubscriptionsUseCase,
  ManageSubscriptionUseCase,
} from '@casys/application';

import { createLogger } from '../../utils/logger';

const logger = createLogger('RssSubscriptionsRoute');

// Validation schema for update
const updateSchema = z.object({
  action: z.enum(['pause', 'resume']).optional(),
  updateFrequency: z.string().optional(),
});

type RssSubscriptionsBindings = {
  Variables: {
    useCases: {
      listSubscriptionsUseCase?: ListSubscriptionsUseCase;
      manageSubscriptionUseCase?: ManageSubscriptionUseCase;
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

export const subscriptionsRoute = new Hono<RssSubscriptionsBindings>();

/**
 * GET /api/rss/subscriptions/:projectId
 * List all subscriptions for a project
 */
subscriptionsRoute.get('/subscriptions/:projectId', async (c) => {
  const createApiResponse = c.get('createApiResponse');

  try {
    const projectId = c.req.param('projectId');

    logger.debug('List RSS subscriptions request:', { projectId });

    // Get use case
    const useCases = c.get('useCases');
    const listSubscriptionsUseCase = useCases?.listSubscriptionsUseCase;

    if (!listSubscriptionsUseCase) {
      logger.error('listSubscriptionsUseCase not available');
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
    const subscriptions = await listSubscriptionsUseCase.execute(
      tenantId,
      projectId
    );

    logger.log('RSS subscriptions listed:', {
      count: subscriptions.length,
    });

    return c.json(createApiResponse(true, subscriptions));
  } catch (error) {
    logger.error('List RSS subscriptions error:', error);

    return c.json(
      createApiResponse(false, null, 'Failed to list subscriptions'),
      500
    );
  }
});

/**
 * PATCH /api/rss/subscriptions/:id
 * Update subscription (pause/resume/change frequency)
 */
subscriptionsRoute.patch('/subscriptions/:id', async (c) => {
  const createApiResponse = c.get('createApiResponse');

  try {
    const subscriptionId = c.req.param('id');

    // Parse and validate request
    const body: unknown = await c.req.json();
    const request = updateSchema.parse(body);

    logger.debug('Update RSS subscription request:', {
      subscriptionId,
      action: request.action,
    });

    // Get use case
    const useCases = c.get('useCases');
    const manageSubscriptionUseCase = useCases?.manageSubscriptionUseCase;

    if (!manageSubscriptionUseCase) {
      logger.error('manageSubscriptionUseCase not available');
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

    // Execute appropriate action
    let updated;
    if (request.action === 'pause') {
      updated = await manageSubscriptionUseCase.pause(
        tenantId,
        subscriptionId
      );
    } else if (request.action === 'resume') {
      updated = await manageSubscriptionUseCase.resume(
        tenantId,
        subscriptionId
      );
    } else if (request.updateFrequency) {
      updated = await manageSubscriptionUseCase.changeFrequency(
        tenantId,
        subscriptionId,
        request.updateFrequency
      );
    }

    logger.log('RSS subscription updated:', {
      id: subscriptionId,
      action: request.action,
    });

    return c.json(createApiResponse(true, updated));
  } catch (error) {
    logger.error('Update RSS subscription error:', error);

    // Handle validation errors
    if ((error as any)?.issues) {
      return c.json(
        createApiResponse(false, null, 'Validation error'),
        400
      );
    }

    // Handle not found errors
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      return c.json(createApiResponse(false, null, message), 404);
    }

    return c.json(
      createApiResponse(false, null, 'Failed to update subscription'),
      500
    );
  }
});

/**
 * DELETE /api/rss/subscriptions/:id
 * Delete a subscription
 */
subscriptionsRoute.delete('/subscriptions/:id', async (c) => {
  const createApiResponse = c.get('createApiResponse');

  try {
    const subscriptionId = c.req.param('id');

    logger.debug('Delete RSS subscription request:', { subscriptionId });

    // Get use case
    const useCases = c.get('useCases');
    const manageSubscriptionUseCase = useCases?.manageSubscriptionUseCase;

    if (!manageSubscriptionUseCase) {
      logger.error('manageSubscriptionUseCase not available');
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
    await manageSubscriptionUseCase.delete(tenantId, subscriptionId);

    logger.log('RSS subscription deleted:', { id: subscriptionId });

    return c.json(createApiResponse(true));
  } catch (error) {
    logger.error('Delete RSS subscription error:', error);

    return c.json(
      createApiResponse(false, null, 'Failed to delete subscription'),
      500
    );
  }
});

export default subscriptionsRoute;
