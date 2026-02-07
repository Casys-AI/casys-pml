/**
 * Adapter: Feed Qualification using RSS Discovery Agent
 * Implements FeedQualificationPort by wrapping RssDiscoveryAgent.qualifyFeed()
 */

import type {
  RssFeedDiscoveryContext,
  RawFeed,
  FeedQualification
} from '@casys/core';
import type { FeedQualificationPort, AITextModelPort } from '@casys/application';

import { RssDiscoveryAgent, type RssDiscoveryAgentOptions } from './rss-discovery.agent';
import { createLogger } from '../../../../utils/logger';

const logger = createLogger('RssFeedQualificationAdapter');

/**
 * Adapter implementing FeedQualificationPort
 * Uses RssDiscoveryAgent for AI-powered feed qualification
 */
export class RssFeedQualificationAdapter implements FeedQualificationPort {
  constructor(
    private readonly aiTextModel: AITextModelPort,
    private readonly agentOptions?: Partial<RssDiscoveryAgentOptions>
  ) {}

  async qualifyFeed(
    feed: RawFeed,
    context: RssFeedDiscoveryContext
  ): Promise<FeedQualification> {
    logger.debug(`🔍 Qualifying feed: ${feed.title}`);

    // Create agent with provided options
    const agent = new RssDiscoveryAgent(this.aiTextModel, this.agentOptions);

    // Qualify using agent
    const qualification = await agent.qualifyFeed(feed, context);

    logger.debug(`✅ Feed qualified: ${feed.title} → ${qualification.status} (${qualification.score})`);

    return qualification;
  }
}

/**
 * Factory function to create the adapter
 */
export function createRssFeedQualificationAdapter(
  aiTextModel: AITextModelPort,
  agentOptions?: Partial<RssDiscoveryAgentOptions>
): RssFeedQualificationAdapter {
  return new RssFeedQualificationAdapter(aiTextModel, agentOptions);
}
