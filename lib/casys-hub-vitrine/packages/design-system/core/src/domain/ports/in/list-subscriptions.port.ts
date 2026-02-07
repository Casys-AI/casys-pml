import type { RssSubscription } from '../../types/rss-subscription.types';

/**
 * Port IN for listing RSS feed subscriptions
 *
 * Defines the public contract of the ListSubscriptionsUseCase.
 * Implemented by ListSubscriptionsUseCase in @casys/application.
 */
export interface ListSubscriptionsPort {
  /**
   * List all RSS feed subscriptions for a project
   *
   * Optionally includes inactive (paused) subscriptions based on the flag.
   *
   * @param tenantId - Tenant identifier for multi-tenancy
   * @param projectId - Project identifier
   * @param includeInactive - Whether to include paused subscriptions (default: true)
   * @returns Array of RSS subscriptions for the project
   */
  execute(
    tenantId: string,
    projectId: string,
    includeInactive?: boolean
  ): Promise<RssSubscription[]>;
}
