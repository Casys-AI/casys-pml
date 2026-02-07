import {
  type ComponentDefinition,
  type ComponentOperationResult,
} from '@casys/core/src/domain/entities/component.entity';

import { type ComponentCatalogPort, type ComponentVectorStorePort } from '../ports/out';
import { createLogger, type Logger } from '../utils/logger';

// Logger injecté (fallback local)

/**
 * Paramètres pour l'indexation des composants
 */
export interface ComponentIndexingParams {
  components: ComponentDefinition[];
  tenantId?: string;
  projectId?: string;
}

/**
 * Résultat de base de l'indexation des composants
 */
export interface ComponentIndexingResult extends ComponentOperationResult {
  indexedCount: number;
  failedCount: number;
  errors: Error[];
  indexedComponentIds: string[];
}

/**
 * Résultat d'indexation avec scope global
 */
export interface ComponentIndexingGlobal extends ComponentIndexingResult {
  scope: 'global';
}

/**
 * Résultat d'indexation avec scope tenant
 */
export interface ComponentIndexingTenant extends ComponentIndexingResult {
  scope: 'tenant';
  tenantId: string;
}

/**
 * Résultat d'indexation avec scope projet
 */
export interface ComponentIndexingProject extends ComponentIndexingResult {
  scope: 'project';
  tenantId: string;
  projectId: string;
}

/**
 * Service du domaine pour l'indexation de composants
 * Encapsule la logique métier d'indexation et gestion des erreurs
 */
export class ComponentIndexingService {
  private readonly logger: Logger;

  constructor(
    private readonly componentStore: ComponentVectorStorePort,
    private readonly componentCatalog?: ComponentCatalogPort,
    logger?: Logger
  ) {
    this.logger = logger ?? createLogger('ComponentIndexingService');
  }

  /**
   * Indexe le catalogue complet des composants
   * @returns Résultat de l'indexation avec scope global
   */
  async indexBaseCatalog(): Promise<ComponentIndexingGlobal> {
    if (!this.componentCatalog) {
      const error = new Error(
        "ComponentCatalog non disponible, impossible d'indexer le catalogue de base"
      );
      this.logger.error(error.message);
      return {
        success: false,
        indexedCount: 0,
        failedCount: 0,
        errors: [error],
        indexedComponentIds: [],
        message: error.message,
        scope: 'global',
      };
    }

    this.logger.log('Indexation du catalogue de base en cours...');

    try {
      // Récupérer le catalogue de base via le port
      const components = await this.componentCatalog.getBaseCatalog();
      this.logger.log(`Catalogue récupéré: ${components.length} composants`);

      // Utiliser la méthode existante pour indexer les composants
      const result = await this.indexComponents({ components });

      // Transformer le résultat en ComponentIndexingGlobal
      return {
        ...result,
        scope: 'global',
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Erreur lors de la récupération du catalogue de base:', err);

      return {
        success: false,
        indexedCount: 0,
        failedCount: 1,
        errors: [err],
        indexedComponentIds: [],
        message: `Échec de récupération du catalogue: ${err.message}`,
        scope: 'global',
      };
    }
  }

  /**
   * Indexe le catalogue d'un tenant spécifique
   * @param tenantId - ID du tenant
   * @returns Résultat de l'indexation avec scope tenant
   */
  async indexTenantCatalog(tenantId: string): Promise<ComponentIndexingTenant> {
    if (!this.componentCatalog) {
      const error = new Error(
        "ComponentCatalog non disponible, impossible d'indexer le catalogue tenant"
      );
      this.logger.error(error.message);
      return {
        success: false,
        indexedCount: 0,
        failedCount: 0,
        errors: [error],
        indexedComponentIds: [],
        message: error.message,
        scope: 'tenant',
        tenantId,
      };
    }

    this.logger.log(`Indexation du catalogue pour le tenant ${tenantId} en cours...`);

    try {
      // Récupérer le catalogue tenant via le port
      const components = await this.componentCatalog.getTenantCatalog(tenantId);
      this.logger.log(`Catalogue tenant récupéré: ${components.length} composants`);

      // Utiliser la méthode existante pour indexer les composants
      const result = await this.indexComponents({ components, tenantId });

      // Transformer le résultat en ComponentIndexingTenant
      return {
        ...result,
        scope: 'tenant',
        tenantId,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Erreur lors de la récupération du catalogue tenant ${tenantId}:`, err);

      return {
        success: false,
        indexedCount: 0,
        failedCount: 1,
        errors: [err],
        indexedComponentIds: [],
        message: `Échec de récupération du catalogue tenant: ${err.message}`,
        scope: 'tenant',
        tenantId,
      };
    }
  }

  /**
   * Indexe le catalogue d'un projet spécifique
   * @param tenantId - ID du tenant
   * @param projectId - ID du projet
   * @returns Résultat de l'indexation avec scope projet
   */
  async indexProjectCatalog(
    tenantId: string,
    projectId: string
  ): Promise<ComponentIndexingProject> {
    if (!this.componentCatalog) {
      const error = new Error(
        "ComponentCatalog non disponible, impossible d'indexer le catalogue projet"
      );
      this.logger.error(error.message);
      return {
        success: false,
        indexedCount: 0,
        failedCount: 0,
        errors: [error],
        indexedComponentIds: [],
        message: error.message,
        scope: 'project',
        tenantId,
        projectId,
      };
    }

    this.logger.log(
      `Indexation du catalogue pour le projet ${projectId} (tenant: ${tenantId}) en cours...`
    );

    try {
      // Récupérer le catalogue projet via le port
      const components = await this.componentCatalog.getProjectCatalog(tenantId, projectId);
      this.logger.log(`Catalogue projet récupéré: ${components.length} composants`);

      // Utiliser la méthode existante pour indexer les composants
      const result = await this.indexComponents({ components, tenantId, projectId });

      // Transformer le résultat en ComponentIndexingProject
      return {
        ...result,
        scope: 'project',
        tenantId,
        projectId,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Erreur lors de la récupération du catalogue projet ${projectId}:`, err);

      return {
        success: false,
        indexedCount: 0,
        failedCount: 1,
        errors: [err],
        indexedComponentIds: [],
        message: `Échec de récupération du catalogue projet: ${err.message}`,
        scope: 'project',
        tenantId,
        projectId,
      };
    }
  }

  /**
   * Indexe une liste de composants
   * @param params - Paramètres d'indexation
   * @returns Résultat de l'indexation
   */
  async indexComponents(params: ComponentIndexingParams): Promise<ComponentIndexingResult> {
    const { components, tenantId, projectId } = params;
    const errors: Error[] = [];
    const indexedComponentIds: string[] = [];

    this.logger.log(
      `Début de l'indexation de ${components.length} composants (tenant: ${tenantId}, projet: ${projectId})`
    );

    try {
      for (const component of components) {
        try {
          // Valider les données du composant
          if (!component.id || !component.name) {
            throw new Error('Composant invalide: ID ou nom manquant');
          }

          // Stocker le composant avec la méthode du port
          this.logger.log(`[DEBUG IndexingService] Appel indexComponent pour ${component.id}`);
          await this.componentStore.indexComponent(
            component.id,
            [], // TODO: Vérifier si y'a bien les embeddings et corriger si nécessaire ce com
            {
              name: component.name,
              description: component.description,
              category: component.category,
              subcategory: component.subcategory,
              filePath: component.filePath,
              props: component.props,
              tags: component.tags,
              useCases: component.useCases,
              metadata: component.metadata,
              // Ne passer tenantId que s'il est défini
              ...(component.tenantId || tenantId
                ? { tenantId: component.tenantId ?? tenantId }
                : {}),
              // Ne passer projectId que s'il est défini
              ...(component.projectId || projectId
                ? { projectId: component.projectId ?? projectId }
                : {}),
            }
          );

          indexedComponentIds.push(component.id);
          this.logger.log(`Composant ${component.id} indexé avec succès`);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          errors.push(err);
          this.logger.error(`Erreur lors de l'indexation du composant ${component.id}:`, err);
        }
      }

      const indexedCount = indexedComponentIds.length;
      const failedCount = errors.length;
      const success = indexedCount > 0;

      const message = success
        ? `${indexedCount} composants indexés avec succès${failedCount > 0 ? `, ${failedCount} échecs` : ''}`
        : `Échec de l'indexation: ${failedCount} erreurs`;

      this.logger.log(message);

      return {
        success,
        indexedCount,
        failedCount,
        errors,
        indexedComponentIds,
        message,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Erreur critique lors de l'indexation:", err);

      return {
        success: false,
        indexedCount: 0,
        failedCount: components.length,
        errors: [err],
        indexedComponentIds: [],
        message: `Erreur critique: ${err.message}`,
      };
    }
  }
}
