import { type ComponentDefinition } from '@casys/core';
/**
 * Port pour la gestion des composants Astro dans un graph store
 * Support pour Kuzu avec capacités de requêtes graphe et multi-tenant unifié
 */
export interface ComponentVectorStorePort {
  /**
   * Indexe un composant avec ses métadonnées et son embedding
   * @param componentId Identifiant unique du composant
   * @param embedding Vecteur d'embedding (optionnel)
   * @param metadata Métadonnées du composant
   */
  indexComponent(
    componentId: string,
    embedding: number[],
    metadata: Partial<ComponentDefinition>
  ): Promise<void>;

  // NOTE: Les méthodes clearComponents et removeComponentById ont été retirées
  // car elles ne sont pas implémentées dans l'adaptateur KuzuComponentStoreAdapter

  /**
   * Récupère un composant par son ID
   *
   * @param componentId - Identifiant unique du composant
   * @returns Composant complet ou null si non trouvé
   */
  getComponentById(componentId: string): Promise<ComponentDefinition | null>;

  // ===== MÉTHODES CROSS-TENANT (Kuzu uniquement) =====

  // ========================================
  // MÉTHODES ANALYTICS/MÉTIER SUPPRIMÉES
  // ========================================
  // getComponentUsageAcrossTenants() → ComponentAnalyticsService (futur)
  // getPopularComponentsByTenant() → ComponentAnalyticsService (futur)
  // getCompatibleComponents() → Service métier dédié

  // NOTE: La méthode getComponentRecommendations a été retirée
  // car elle n'est pas implémentée dans l'adaptateur KuzuComponentStoreAdapter

  // NOTE: La méthode getComponentsByTenant a été retirée
  // car elle n'est pas implémentée dans l'adaptateur KuzuComponentStoreAdapter

  // NOTE: La méthode getAllComponents a été retirée car elle appartient à
  // ComponentListingReadPort (responsabilité de listing, pas d'indexation vectorielle)

  // ========================================
  // ComponentUsage methods MOVED to ComponentUsageStore
  // ========================================
  // Les méthodes createComponentUsages, getComponentUsagesBySectionId,
  // et deleteComponentUsagesByArticleId ont été déplacées vers
  // le port dédié ComponentUsageStore pour une meilleure séparation des responsabilités.
}
