/**
 * RSS Discovery Use Case Factory (v2 Architecture)
 * Creates RSS feed discovery use case with:
 * - DataForSEO adapter for raw feed discovery
 * - AI Agent adapter for parallel feed qualification
 */

import { DiscoverRssFeedsUseCase, type AITextModelPort } from '@casys/application';
import {
  createDataForSeoRssDiscoveryAdapter,
  createRssFeedQualificationAdapter,
} from '@casys/infrastructure';

import type { Logger } from '../../utils/logger';
import { optionalFactory } from './factory-helpers';

export function buildDiscoverRssFeedsUseCase(
  infraServices: Record<string, unknown>,
  logger?: Logger
) {
  return optionalFactory('discoverRssFeedsUseCase', () => {
    // Check DataForSEO credentials
    const dataForSeoApiKey = process.env.DATAFORSEO_API_KEY;
    const dataForSeoLogin = process.env.DATAFORSEO_LOGIN;
    const dataForSeoPassword = process.env.DATAFORSEO_PASSWORD;

    if (!dataForSeoApiKey && !(dataForSeoLogin && dataForSeoPassword)) {
      logger?.debug?.(
        '[FeatureGate] OFF discoverRssFeedsUseCase: DATAFORSEO credentials missing'
      );
      return undefined;
    }

    // Get AI model (required for query generation and qualification)
    const aiTextModel = infraServices.aiTextModel as AITextModelPort | undefined;
    if (!aiTextModel) {
      logger?.debug?.(
        '[FeatureGate] OFF discoverRssFeedsUseCase: aiTextModel missing'
      );
      return undefined;
    }

    // Get RSS feed repository (required for persistence)
    const rssFeedRepository = infraServices.rssFeedRepository as import('@casys/application').RssFeedRepositoryPort | undefined;
    if (!rssFeedRepository) {
      logger?.debug?.(
        '[FeatureGate] OFF discoverRssFeedsUseCase: rssFeedRepository missing'
      );
      return undefined;
    }

    // Create discovery adapter (DataForSEO + AI query generation)
    const discoveryAdapter = createDataForSeoRssDiscoveryAdapter(aiTextModel);

    // Create qualification adapter (AI-powered feed scoring)
    const qualificationAdapter = createRssFeedQualificationAdapter(aiTextModel);

    // Create and return use case (v2 architecture with 3 dependencies)
    return new DiscoverRssFeedsUseCase(discoveryAdapter, qualificationAdapter, rssFeedRepository);
  }, logger);
}
