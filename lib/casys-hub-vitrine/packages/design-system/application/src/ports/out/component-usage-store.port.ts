import { type ComponentUsage } from '@casys/core';

/**
 * Port pour la gestion des ComponentUsage (liens Section ↔ Component)
 * Responsabilité focalisée sur les usages de composants uniquement
 */
export interface ComponentUsageStorePort {
  // === CREATE ===

  /**
   * Crée les ComponentUsage (liens composant ↔ section)
   * @param componentUsages Liste des usages à créer
   * @param tenantId ID du tenant (optionnel)
   */
  createComponentUsages(componentUsages: ComponentUsage[], tenantId?: string): Promise<void>;

  // === READ ===

  /**
   * Récupère un ComponentUsage par son ID
   * @param usageId ID de l'usage
   * @param tenantId ID du tenant (optionnel)
   */
  getComponentUsageById(usageId: string, tenantId?: string): Promise<ComponentUsage | null>;

  /**
   * Récupère tous les ComponentUsage d'une section
   * @param sectionId ID de la section
   * @param tenantId ID du tenant (optionnel)
   */
  getComponentUsagesBySectionId(sectionId: string, tenantId?: string): Promise<ComponentUsage[]>;

  /**
   * Récupère tous les ComponentUsage d'un article
   * @param articleId ID de l'article
   * @param tenantId ID du tenant (optionnel)
   */
  getComponentUsagesByArticleId(articleId: string, tenantId?: string): Promise<ComponentUsage[]>;

  /**
   * Récupère tous les ComponentUsage d'un composant spécifique
   * @param componentId ID du composant
   * @param tenantId ID du tenant (optionnel)
   */
  getComponentUsagesByComponentId(
    componentId: string,
    tenantId?: string
  ): Promise<ComponentUsage[]>;

  // === UPDATE ===

  /**
   * Met à jour un ComponentUsage
   * @param usageId ID de l'usage à modifier
   * @param updates Modifications partielles
   * @param tenantId ID du tenant (optionnel)
   */
  updateComponentUsage(
    usageId: string,
    updates: Partial<Omit<ComponentUsage, 'id'>>,
    tenantId?: string
  ): Promise<void>;

  /**
   * Met à jour les props d'un ComponentUsage
   * @param usageId ID de l'usage
   * @param props Nouvelles props
   * @param tenantId ID du tenant (optionnel)
   */
  updateComponentUsageProps(
    usageId: string,
    props: Record<string, unknown>,
    tenantId?: string
  ): Promise<void>;

  // === DELETE ===

  /**
   * Supprime un ComponentUsage par son ID
   * @param usageId ID de l'usage à supprimer
   * @param tenantId ID du tenant (optionnel)
   */
  deleteComponentUsageById(usageId: string, tenantId?: string): Promise<void>;

  /**
   * Supprime tous les ComponentUsage d'une section
   * @param sectionId ID de la section
   * @param tenantId ID du tenant (optionnel)
   */
  deleteComponentUsagesBySectionId(sectionId: string, tenantId?: string): Promise<void>;

  /**
   * Supprime tous les ComponentUsage d'un article
   * @param articleId ID de l'article
   * @param tenantId ID du tenant (optionnel)
   */
  deleteComponentUsagesByArticleId(articleId: string, tenantId?: string): Promise<void>;

  // === ANALYTICS ===

  /**
   * Compte le nombre d'usages d'un composant
   * @param componentId ID du composant
   * @param tenantId ID du tenant (optionnel)
   */
  countComponentUsages(componentId: string, tenantId?: string): Promise<number>;

  /**
   * Nettoie tous les ComponentUsage (utile pour les tests)
   * @param tenantId ID du tenant (optionnel, si omis nettoie tout)
   */
  clearComponentUsages(tenantId?: string): Promise<void>;
}
