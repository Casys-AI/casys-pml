import type {
  RssSubscription,
  SubscribeToFeedPort,
  SubscribeToFeedInput,
} from '@casys/core';
import type { RssFeedRepositoryPort } from '../../ports/out/rss-feed-repository.port';

export class SubscribeToFeedUseCase implements SubscribeToFeedPort {
  constructor(
    private readonly repository: RssFeedRepositoryPort
  ) {}

  async execute(
    tenantId: string,
    input: SubscribeToFeedInput
  ): Promise<RssSubscription> {
    // Validation
    if (!input.feedUrl || !input.projectId) {
      throw new Error('Feed URL and Project ID are required');
    }

    // Check if already subscribed
    const exists = await this.repository.isAlreadySubscribed(
      tenantId,
      input.projectId,
      input.feedUrl
    );

    if (exists) {
      throw new Error('Already subscribed to this feed');
    }

    // Create subscription
    return this.repository.createSubscription(tenantId, input);
  }
}
