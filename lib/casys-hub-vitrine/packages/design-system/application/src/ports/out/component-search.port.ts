import { type ComponentDefinition } from '@casys/core';

/**
 * Port pour la recherche vectorielle sémantique des composants
 * Séparé du CRUD pour respecter le principe de responsabilité unique
 * Utilise uniquement la recherche sémantique avancée (pas de mots-clés)
 */
export interface ComponentSearchPort {
  /**
   * Recherche sémantique avancée avec filtres contextuels
   */
  searchComponentsWithContext(
    query: string,
    context: {
      tenantId?: string;
      projectId?: string;
      categories?: string[];
      tags?: string[];
      minSimilarity?: number;
    },
    limit?: number
  ): Promise<{ id: string; score: number; metadata: Partial<ComponentDefinition> }[]>;
}
