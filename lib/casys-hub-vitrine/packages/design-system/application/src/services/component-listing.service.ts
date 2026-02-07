import {
  type ComponentDefinition,
  type ComponentIdentifiers,
  type ComponentListingArticle,
  type ComponentListingGlobal,
  type ComponentListingProject,
  type ComponentListingTenant,
} from '@casys/core';

import type { ComponentListingReadPort } from '../ports/out';
import type { ComponentVectorStorePort } from '../ports/out';
import { createLogger, type Logger } from '../utils/logger';

// Types pour la récupération d'un composant unique
export type GetComponentParams = ComponentIdentifiers;

export interface GetComponentResult {
  success: boolean;
  component?: ComponentDefinition;
  message: string;
}

/**
 * Service pour lister et récupérer les composants selon différents niveaux de granularité
 * Applique l'architecture hexagonale en orchestrant les appels au port
 */
export class ComponentListingService {
  private readonly logger: Logger;

  constructor(
    private readonly componentListingStore: ComponentListingReadPort,
    private readonly componentVectorStore: ComponentVectorStorePort,
    logger?: Logger
  ) {
    this.logger = logger ?? createLogger('ComponentListingService');
  }

  /**
   * Liste tous les composants indexés (global)
   */
  async getAllComponents(limit?: number): Promise<ComponentListingGlobal> {
    return this.componentListingStore.getAllComponents(limit);
  }

  /**
   * Liste tous les composants d'un tenant spécifique
   * Note: Utilise getAllComponents et filtre par tenantId car getComponentsByTenant n'est plus disponible
   */
  async getComponentsByTenant(tenantId: string, limit?: number): Promise<ComponentListingTenant> {
    return this.componentListingStore.getComponentsByTenant(tenantId, limit);
  }

  /**
   * Liste tous les composants d'un projet spécifique
   */
  async getComponentsByProject(
    tenantId: string,
    projectId: string,
    limit?: number
  ): Promise<ComponentListingProject> {
    return this.componentListingStore.getComponentsByProject(tenantId, projectId, limit);
  }

  /**
   * Liste les composants utilisés dans un article spécifique
   */
  async getComponentsByArticle(
    tenantId: string,
    projectId: string,
    articleId: string,
    limit?: number
  ): Promise<ComponentListingArticle> {
    return this.componentListingStore.getComponentsByArticle(tenantId, projectId, articleId, limit);
  }

  /**
   * Récupère un composant par son ID
   * @param params - Paramètres de récupération
   * @returns Résultat de la récupération
   */
  async getComponent(params: GetComponentParams): Promise<GetComponentResult> {
    const result = await this.componentListingStore.getComponent(params);

    return {
      ...result,
      message: result.success
        ? `Composant ${params.componentId} récupéré avec succès`
        : `Composant ${params.componentId} non trouvé`,
    };
  }
}
