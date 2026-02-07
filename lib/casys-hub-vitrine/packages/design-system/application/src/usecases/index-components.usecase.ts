import { type ComponentDefinition } from '@casys/core';
import {
  type ComponentIndexingGlobal,
  type ComponentIndexingTenant,
} from '../services/component-indexing.service';

import type { ComponentIndexingUpsertPort } from '../ports/out';
import { createLogger } from '../utils/logger';

// Logger centralisé pour le use case
const logger = createLogger('IndexComponentsUseCase');

/**
 * Interface pour les paramètres d'entrée d'indexation des composants
 */
export interface IndexComponentsInput {
  components: ComponentDefinition[];
  tenantId?: string;
  projectId?: string;
}

/**
 * Interface pour le résultat d'indexation des composants
 */
export interface IndexComponentsOutput {
  success: boolean;
  indexedCount: number;
  failedCount: number;
  errors: Error[];
  indexedComponentIds: string[];
  message: string;
}

/**
 * Interface du use case d'indexation des composants
 */
export interface IndexComponentsUseCase {
  /**
   * Indexe une liste spécifique de composants
   */
  execute(input: IndexComponentsInput): Promise<IndexComponentsOutput>;

  /**
   * Indexe le catalogue complet des composants (catalogue de base)
   */
  indexBaseCatalog(): Promise<ComponentIndexingGlobal>;

  /**
   * Indexe le catalogue spécifique à un tenant
   */
  indexTenantCatalog(tenantId: string): Promise<ComponentIndexingTenant>;
}

/**
 * Dépendances du IndexComponentsUseCase
 */
export interface IndexComponentsUseCaseDeps {
  componentUsageStore: ComponentIndexingUpsertPort;
  componentVectorStore?: ComponentIndexingUpsertPort; // Optionnel pour l'instant
}

/**
 * Implémentation du use case d'indexation des composants
 */
export class IndexComponentsUseCaseImpl implements IndexComponentsUseCase {
  constructor(private readonly indexing: ComponentIndexingUpsertPort) {}

  /**
   * Exécute l'indexation des composants
   * @param input - Les paramètres d'indexation des composants
   * @returns Résultat de l'indexation
   */
  async execute(input: IndexComponentsInput): Promise<IndexComponentsOutput> {
    const { components, tenantId, projectId } = input;
    logger.log("Exécution du use case d'indexation de composants", { input });

    try {
      // Fail-fast validations
      if (!Array.isArray(components) || components.length === 0) {
        throw new Error('[IndexComponentsUseCase] components[] requis et non vide');
      }
      for (const c of components) {
        if (!c || typeof c !== 'object' || typeof c.id !== 'string' || c.id.trim() === '') {
          throw new Error('[IndexComponentsUseCase] chaque composant doit avoir un id non vide');
        }
      }

      // Déléguer au service du domaine
      const result = await this.indexing.indexComponents({
        components,
        tenantId,
        projectId,
      });

      logger.log("Use case d'indexation terminé", { result });
      return {
        success: result.success,
        indexedCount: result.indexedCount,
        failedCount: result.failedCount,
        errors: result.errors,
        indexedComponentIds: result.indexedComponentIds,
        message: result.message,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erreur inconnue lors de l'indexation des composants";
      logger.error(message, error);
      return {
        success: false,
        indexedCount: 0,
        failedCount: components.length,
        errors: [new Error(message)],
        indexedComponentIds: [],
        message,
      };
    }
  }

  /**
   * Indexe le catalogue complet des composants (catalogue de base)
   * @returns Résultat de l'indexation avec scope global
   */
  async indexBaseCatalog(): Promise<ComponentIndexingGlobal> {
    logger.log("Exécution du use case d'indexation du catalogue de base");

    try {
      // Déléguer au service du domaine
      return await this.indexing.indexBaseCatalog();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erreur inconnue lors de l'indexation du catalogue de base";
      logger.error(message, error);
      throw new Error(message);
    }
  }

  /**
   * Indexe le catalogue spécifique à un tenant
   * @param tenantId Identifiant du tenant
   * @returns Résultat de l'indexation avec scope tenant
   */
  async indexTenantCatalog(tenantId: string): Promise<ComponentIndexingTenant> {
    logger.log(`Exécution du use case d'indexation du catalogue pour le tenant ${tenantId}`);

    try {
      if (!tenantId || tenantId.trim().length === 0) {
        throw new Error('[IndexComponentsUseCase] tenantId requis');
      }
      // Déléguer au service du domaine
      return await this.indexing.indexTenantCatalog(tenantId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Erreur inconnue lors de l'indexation du catalogue pour le tenant ${tenantId}`;
      logger.error(message, error);
      throw new Error(message);
    }
  }
}
