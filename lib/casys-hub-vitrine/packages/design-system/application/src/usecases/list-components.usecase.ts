import type { ComponentListResponseDTO, ComponentMetadataDTO } from '@casys/shared';
import type {
  ComponentDefinition,
  ComponentIdentifiers,
  ComponentListingArticle,
  ComponentListingGlobal,
  ComponentListingProject,
  ComponentListingTenant,
} from '@casys/core';

import type { ComponentListingReadPort } from '../ports/out';
import { createLogger } from '../utils/logger';

// Logger centralisé pour le use case
const logger = createLogger('ListComponentsUseCase');

/**
 * Interface pour les paramètres d'entrée de récupération d'un composant
 * Les composants sont des ressources partagées, contrairement aux articles
 */
export interface GetComponentInput {
  componentId: string;
  tenantId?: string;
  projectId?: string;
}

/**
 * Interface pour le résultat de récupération d'un composant
 */
export interface GetComponentOutput {
  component: ComponentDefinition | null;
  found: boolean;
  message?: string;
}

/**
 * Interface pour les paramètres d'entrée de listing des composants
 * Support des filtres basés sur les propriétés de ComponentDefinition
 */
export interface ListComponentsInput extends Partial<ComponentIdentifiers> {
  articleId?: string;
  tenantId?: string;
  projectId?: string;
  limit?: number;
  offset?: number;

  // Filtres basés sur l'entité ComponentDefinition
  search?: string; // Recherche dans name, description
  category?: string; // Filtrage par catégorie
  subcategory?: string; // Filtrage par sous-catégorie
  tags?: string[]; // Filtrage par tags
  useCases?: string[]; // Filtrage par cas d'utilisation
}

/**
 * Type union pour le résultat de listing des composants
 * Utilise les types utilitaires du domaine selon la granularité
 */
export type ListComponentsOutput =
  | ComponentListingGlobal
  | ComponentListingTenant
  | ComponentListingProject
  | ComponentListingArticle;

/**
 * Dépendances du ListComponentsUseCase
 */
export interface ListComponentsUseCaseDeps {
  componentListing: ComponentListingReadPort;
}

/**
 * Implémentation du use case de listing des composants
 */
export class ListComponentsUseCaseImpl {
  constructor(private readonly components: ComponentListingReadPort) {}

  /**
   * Exécute le listing des composants selon la granularité demandée
   * @param input - Les paramètres de listing
   * @returns Résultat du listing avec métadonnées
   */
  async execute(input: ListComponentsInput): Promise<ComponentListResponseDTO> {
    const { tenantId, projectId, articleId, limit } = input;

    try {
      let result;

      // Fail-fast par scope
      if (articleId && projectId && tenantId) {
        if (!tenantId.trim() || !projectId.trim() || !articleId.trim()) {
          throw new Error(
            '[ListComponentsUseCase] tenantId, projectId et articleId requis pour le scope article'
          );
        }
        // Listing au niveau article
        result = await this.components.getComponentsByArticle(
          tenantId,
          projectId,
          articleId,
          limit
        );
        logger.log(
          `Listing des composants pour l'article ${articleId} (projet ${projectId}, tenant ${tenantId})`
        );
      } else if (projectId && tenantId) {
        if (!tenantId.trim() || !projectId.trim()) {
          throw new Error(
            '[ListComponentsUseCase] tenantId et projectId requis pour le scope projet'
          );
        }
        // Listing au niveau projet
        result = await this.components.getComponentsByProject(tenantId, projectId, limit);
        logger.log(`Listing des composants pour le projet ${projectId} (tenant ${tenantId})`);
      } else if (tenantId) {
        if (!tenantId.trim()) {
          throw new Error('[ListComponentsUseCase] tenantId requis pour le scope tenant');
        }
        // Listing au niveau tenant
        result = await this.components.getComponentsByTenant(tenantId, limit);
        logger.log(`Listing des composants pour le tenant ${tenantId}`);
      } else {
        // Listing global
        result = await this.components.getAllComponents(limit);
        logger.log('Listing global des composants');
      }

      logger.log(
        `${result.components.length} composants récupérés avec succès (scope: ${result.scope})`
      );

      // Mapper les ComponentDefinition vers ComponentMetadataDTO (inline comme dans list-articles)
      const componentsWithMeta: ComponentMetadataDTO[] = result.components.map(
        (component: ComponentDefinition) => ({
          id: component.id,
          name: component.name,
          category: component.category,
          subcategory: component.subcategory,
          description: component.description,
          tags: component.tags,
          useCases: component.useCases,
          tenantId: component.tenantId,
          projectId: component.projectId,
          // Nous pourrions ajouter usageCount ici si disponible depuis le service
          usageCount: undefined,
        })
      );

      // Retourner le DTO standard comme dans list-articles
      return {
        components: componentsWithMeta,
        count: result.components.length,
        scope: result.scope,
        message: `${result.components.length} composants trouvés`,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Erreur lors du listing des composants:', err);
      throw err;
    }
  }

  /**
   * Récupère un composant par son ID
   * @param input - Les paramètres de récupération
   * @returns Résultat de la récupération
   */
  async getComponent(input: GetComponentInput): Promise<GetComponentOutput> {
    logger.log('Exécution du use case de récupération de composant', { input });

    try {
      // Fail-fast: id requis
      if (!input?.componentId || input.componentId.trim().length === 0) {
        throw new Error('[ListComponentsUseCase] componentId requis');
      }
      // Déléguer au service du domaine
      const result = await this.components.getComponent({
        componentId: input.componentId,
        // Les composants sont des ressources partagées - pas de contexte tenant/project requis
      });

      if (!result.success || !result.component) {
        logger.log('Composant non trouvé', { componentId: input.componentId });
        return {
          component: null,
          found: false,
        };
      }

      // Le port retourne directement un ComponentDefinition
      const component: ComponentDefinition = result.component;

      logger.log('Composant récupéré avec succès', { componentId: input.componentId });

      return {
        component,
        found: true,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Erreur lors de la récupération du composant:', err);
      throw err;
    }
  }
}
