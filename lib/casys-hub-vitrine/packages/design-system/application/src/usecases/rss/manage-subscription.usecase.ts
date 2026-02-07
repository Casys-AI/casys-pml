import type { RssSubscription, ManageSubscriptionPort } from '@casys/core';
import type { RssFeedRepositoryPort } from '../../ports/out/rss-feed-repository.port';

export class ManageSubscriptionUseCase implements ManageSubscriptionPort {
  constructor(
    private readonly repository: RssFeedRepositoryPort
  ) {}

  async pause(
    tenantId: string,
    subscriptionId: string
  ): Promise<RssSubscription> {
    return this.repository.updateSubscription(tenantId, subscriptionId, {
      subscribed: false,
    });
  }

  async resume(
    tenantId: string,
    subscriptionId: string
  ): Promise<RssSubscription> {
    return this.repository.updateSubscription(tenantId, subscriptionId, {
      subscribed: true,
    });
  }

  async delete(tenantId: string, subscriptionId: string): Promise<void> {
    return this.repository.deleteSubscription(tenantId, subscriptionId);
  }

  async changeFrequency(
    tenantId: string,
    subscriptionId: string,
    frequency: string
  ): Promise<RssSubscription> {
    return this.repository.updateSubscription(tenantId, subscriptionId, {
      updateFrequency: frequency,
    });
  }
}
