import type { RssSubscription, ListSubscriptionsPort } from '@casys/core';
import type { RssFeedRepositoryPort } from '../../ports/out/rss-feed-repository.port';

export class ListSubscriptionsUseCase implements ListSubscriptionsPort {
  constructor(
    private readonly repository: RssFeedRepositoryPort
  ) {}

  async execute(
    tenantId: string,
    projectId: string,
    includeInactive = true
  ): Promise<RssSubscription[]> {
    return this.repository.listSubscriptions(
      tenantId,
      projectId,
      includeInactive
    );
  }
}
