import { type ComponentDefinition } from '@casys/core';

import type { ComponentSearchPort } from '../ports/out';
import { createLogger, type Logger } from '../utils/logger';

/**
 * Requête pour recherche contextuelle de composants
 */
export interface ComponentSearchRequest {
  query: string;
  tenantId?: string;
  projectId?: string;
  categories?: string[];
  tags?: string[];
  minSimilarity?: number;
  searchLimit?: number;
}

/**
 * Résultat enrichi de recherche de composant
 */
export interface ComponentSearchResult {
  id: string;
  score: number;
  metadata: Partial<ComponentDefinition>;
  relevanceScore: number;
  contextMatch?: {
    categoryMatch: boolean;
    tagMatch: boolean;
    projectMatch: boolean;
  };
}

/**
 * Service de recherche vectorielle sémantique des composants
 * Utilise ComponentSearchPort pour fournir des capacités de recherche avancées
 * Équivalent à ArticleStructureSearchService mais pour les composants
 */
export class ComponentVectorSearchService {
  private readonly logger: Logger;

  constructor(
    private readonly componentSearchPort: ComponentSearchPort,
    logger?: Logger
  ) {
    this.logger = logger ?? createLogger('ComponentVectorSearchService');
  }

  // ========================================
  // MÉTHODES CRUD SIMPLES DÉPLACÉES vers GetComponentService
  // ========================================
  // getComponentById() → GetComponentService.getById()
  // getComponentsByCategory() → GetComponentService.getByCategory()

  /**
   * Recherche sémantique avancée avec filtres contextuels
   * Utilise la recherche vectorielle pure (pas de mots-clés)
   */
  async searchComponentsWithContext(
    query: string,
    context: {
      tenantId?: string;
      projectId?: string;
      categories?: string[];
      tags?: string[];
    } = {},
    limit = 10
  ): Promise<
    {
      id: string;
      score: number;
      metadata: Partial<ComponentDefinition>;
    }[]
  > {
    this.logger.log(`Searching components with context: ${query}`);

    return this.componentSearchPort.searchComponentsWithContext(query, context, limit);
  }

  // ========================================
  // MÉTHODES ANALYTICS/MÉTIER SUPPRIMÉES (peuvent être dans un service dédié)
  // ========================================
  // getCompatibleComponents() → Service métier dédié
  // getComponentUsageAcrossTenants() → ComponentAnalyticsService (futur)
  // getPopularComponentsByTenant() → ComponentAnalyticsService (futur)
}
