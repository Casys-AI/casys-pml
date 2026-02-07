import { type ComponentDefinition } from '@casys/core/src/domain/entities/component.entity';

/**
 * Port pour accéder au catalogue de composants
 * Permet de découpler les sources du catalogue (fichier JSON, base de données, etc.)
 * de la logique métier qui l'utilise.
 */
export interface ComponentCatalogPort {
  /**
   * Récupère l'ensemble des composants du catalogue de base
   * @returns Liste des définitions de composants
   */
  getBaseCatalog(): Promise<ComponentDefinition[]>;

  /**
   * Récupère les composants filtrés pour un tenant spécifique
   * @param tenantId ID du tenant
   * @returns Liste des définitions de composants filtrée par tenant
   */
  getTenantCatalog(tenantId: string): Promise<ComponentDefinition[]>;

  /**
   * Récupère les composants filtrés pour un projet spécifique
   * @param tenantId ID du tenant
   * @param projectId ID du projet
   * @returns Liste des définitions de composants filtrée par projet
   */
  getProjectCatalog(tenantId: string, projectId: string): Promise<ComponentDefinition[]>;
}
