import { type ComponentDefinition } from '@casys/core';
import { type ComponentCatalogPort } from '@casys/application';

import { createLogger } from '../utils/logger';
import { loadComponentBaseCatalog, loadTenantComponentConfig } from './config.loader';

const logger = createLogger('ComponentCatalogAdapter');

/**
 * Adaptateur qui implémente le port ComponentCatalogPort
 * Utilise les fichiers JSON comme source de données pour le catalogue
 */
export class FileComponentCatalogAdapter implements ComponentCatalogPort {
  /**
   * Récupère l'ensemble des composants du catalogue de base
   */
  async getBaseCatalog(): Promise<ComponentDefinition[]> {
    try {
      const catalogData = loadComponentBaseCatalog();
      logger.log(
        `Catalogue de base chargé : ${Object.keys(catalogData.available_components).length} composants trouvés`
      );

      // Transformation du format de catalogue vers ComponentDefinition[]
      const components = Object.entries(catalogData.available_components).map(
        ([id, component]) => ({
          id,
          name: id,
          description: component.description || '',
          category: component.category || '',
          subcategory: component.subcategory || '',
          filePath: component.file_path || '',
          props: component.props || {},
          tags: component.tags || [],
          useCases: component.useCases || [],
          // Métadonnées AI par défaut conformes à la structure ComponentDefinition
          metadata: {
            ai_metadata: {
              semantic_purpose: '',
              input_requirements: '',
              output_format: '',
              complexity: 'medium' as 'low' | 'medium' | 'high',
            },
          },
          related: component.related || [],
        })
      );
      return Promise.resolve(components);
    } catch (error) {
      logger.error('Erreur lors du chargement du catalogue de base:', error);
      throw new Error(
        `Impossible de charger le catalogue de base: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    }
  }

  /**
   * Récupère les composants filtrés pour un tenant spécifique
   * @param tenantId ID du tenant
   */
  async getTenantCatalog(tenantId: string): Promise<ComponentDefinition[]> {
    try {
      // Chargement du catalogue de base
      const baseCatalog = await this.getBaseCatalog();

      // Chargement de la configuration tenant
      const tenantConfig = loadTenantComponentConfig(tenantId);
      logger.log(`Configuration tenant chargée pour ${tenantId}`);

      // Si selected_components est "default", retourner tout le catalogue
      if (tenantConfig.selected_components === 'default') {
        logger.log(`Tenant ${tenantId} utilise le catalogue complet par défaut`);
        // Ajout du tenantId à tous les composants
        return baseCatalog.map(component => ({
          ...component,
          tenantId,
        }));
      }

      // Sinon, filtrer selon les composants sélectionnés
      const selectedIds = new Set(tenantConfig.selected_components);
      const excludedIds = new Set(tenantConfig.excluded_components ?? []);

      logger.log(
        `Tenant ${tenantId} utilise un catalogue filtré: ${selectedIds.size} composants sélectionnés, ${excludedIds.size} exclus`
      );

      return baseCatalog
        .filter(component => selectedIds.has(component.id) && !excludedIds.has(component.id))
        .map(component => ({
          ...component,
          tenantId,
        }));
    } catch (error) {
      logger.error(`Erreur lors du chargement du catalogue tenant ${tenantId}:`, error);
      return [];
    }
  }

  /**
   * Récupère les composants filtrés pour un projet spécifique
   * @param tenantId ID du tenant
   * @param projectId ID du projet
   */
  async getProjectCatalog(tenantId: string, projectId: string): Promise<ComponentDefinition[]> {
    try {
      // Pour l'instant, on retourne le catalogue tenant complet
      // Dans une version plus avancée, on pourrait avoir des configurations spécifiques par projet
      const tenantCatalog = await this.getTenantCatalog(tenantId);

      logger.log(
        `Catalogue projet récupéré pour tenant ${tenantId}, projet ${projectId}: ${tenantCatalog.length} composants`
      );

      // Ajout du projectId à tous les composants
      return tenantCatalog.map(component => ({
        ...component,
        projectId,
      }));
    } catch (error) {
      logger.error(
        `Erreur lors du chargement du catalogue projet ${projectId} (tenant ${tenantId}):`,
        error
      );
      return [];
    }
  }
}
