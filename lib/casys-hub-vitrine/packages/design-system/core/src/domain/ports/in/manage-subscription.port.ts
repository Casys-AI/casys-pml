import type { RssSubscription } from '../../types/rss-subscription.types';

/**
 * Port IN for managing RSS feed subscriptions
 *
 * Defines the public contract of the ManageSubscriptionUseCase.
 * Implemented by ManageSubscriptionUseCase in @casys/application.
 *
 * Supports operations:
 * - Pause: Set subscribed = false (soft delete, preserves data)
 * - Resume: Set subscribed = true (reactivate)
 * - Delete: Permanently remove subscription (hard delete)
 * - Change Frequency: Update fetch frequency
 */
export interface ManageSubscriptionPort {
  /**
   * Pause an active RSS feed subscription
   *
   * Sets subscribed = false to stop fetching articles.
   * Preserves subscription data for potential resume.
   *
   * @param tenantId - Tenant identifier for multi-tenancy
   * @param subscriptionId - Subscription identifier
   * @returns Updated RSS subscription
   * @throws Error if subscription not found
   */
  pause(tenantId: string, subscriptionId: string): Promise<RssSubscription>;

  /**
   * Resume a paused RSS feed subscription
   *
   * Sets subscribed = true to restart fetching articles.
   *
   * @param tenantId - Tenant identifier for multi-tenancy
   * @param subscriptionId - Subscription identifier
   * @returns Updated RSS subscription
   * @throws Error if subscription not found
   */
  resume(tenantId: string, subscriptionId: string): Promise<RssSubscription>;

  /**
   * Delete an RSS feed subscription permanently
   *
   * Hard delete removes subscription and all relationships.
   * Cannot be undone.
   *
   * @param tenantId - Tenant identifier for multi-tenancy
   * @param subscriptionId - Subscription identifier
   * @throws Error if subscription not found
   */
  delete(tenantId: string, subscriptionId: string): Promise<void>;

  /**
   * Change the update frequency of an RSS feed subscription
   *
   * Updates how often the feed should be fetched.
   *
   * @param tenantId - Tenant identifier for multi-tenancy
   * @param subscriptionId - Subscription identifier
   * @param frequency - New update frequency ('hourly', 'daily', 'weekly')
   * @returns Updated RSS subscription
   * @throws Error if subscription not found
   */
  changeFrequency(
    tenantId: string,
    subscriptionId: string,
    frequency: string
  ): Promise<RssSubscription>;
}
