import { randomUUID } from 'crypto';

import { createLogger } from '../utils/logger';
import { type ComponentUsage } from '@casys/core/src/domain/entities/component.entity';
import type { ComponentUsageStorePort } from '../ports/out';

export interface ComponentUsageCreationParams {
  componentId: string;
  textFragmentId: string;
  props: Record<string, unknown>;
  position: number;
  isSectionHeader?: boolean;
  tenantId?: string;
}

export interface ComponentUsageResult {
  success: boolean;
  usage?: ComponentUsage;
  error?: string;
}

export interface ComponentUsageListResult {
  success: boolean;
  usages: ComponentUsage[];
  count: number;
}

/**
 * Service pour la gestion des usages de composants
 * Encapsule le port ComponentUsageStorePort
 */
export class ComponentUsageService {
  private readonly logger = createLogger('ComponentUsageService');

  constructor(private readonly componentUsageStore: ComponentUsageStorePort) {}

  /**
   * Crée un nouvel usage de composant
   */
  async createComponentUsage(params: ComponentUsageCreationParams): Promise<ComponentUsageResult> {
    try {
      this.logger.debug("Création d'un nouvel usage de composant", { params });

      // Créer l'objet ComponentUsage complet
      const usage: ComponentUsage = {
        id: randomUUID(),
        componentId: params.componentId,
        textFragmentId: params.textFragmentId,
        props: params.props,
        position: params.position,
        isSectionHeader: params.isSectionHeader ?? false,
      };

      // Utiliser l'API batch avec un seul élément
      await this.componentUsageStore.createComponentUsages([usage], params.tenantId);

      this.logger.debug('Usage de composant créé avec succès', { usageId: usage.id });

      return {
        success: true,
        usage,
      };
    } catch (error) {
      this.logger.error("Erreur lors de la création de l'usage de composant", { error, params });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      };
    }
  }

  /**
   * Récupère les usages d'un composant
   */
  async getComponentUsages(
    componentId: string,
    tenantId?: string
  ): Promise<ComponentUsageListResult> {
    try {
      this.logger.debug('Récupération des usages pour le composant', { componentId, tenantId });

      const usages = await this.componentUsageStore.getComponentUsagesByComponentId(
        componentId,
        tenantId
      );

      this.logger.debug('Usages récupérés avec succès', { count: usages.length, componentId });

      return {
        success: true,
        usages,
        count: usages.length,
      };
    } catch (error) {
      this.logger.error('Erreur lors de la récupération des usages', {
        error,
        componentId,
        tenantId,
      });
      return {
        success: false,
        usages: [],
        count: 0,
      };
    }
  }

  /**
   * Récupère les usages d'une section via ses fragments de texte
   */
  async getSectionUsages(sectionId: string, tenantId?: string): Promise<ComponentUsageListResult> {
    try {
      this.logger.debug('Récupération des usages pour la section via fragments', {
        sectionId,
        tenantId,
      });

      // Note: Cette méthode nécessitera une adaptation du store pour récupérer
      // les usages via les textFragments liés à la section
      const usages = await this.componentUsageStore.getComponentUsagesBySectionId(
        sectionId,
        tenantId
      );

      this.logger.debug('Usages de section récupérés avec succès', {
        count: usages.length,
        sectionId,
      });

      return {
        success: true,
        usages,
        count: usages.length,
      };
    } catch (error) {
      this.logger.error('Erreur lors de la récupération des usages de section', {
        error,
        sectionId,
        tenantId,
      });
      return {
        success: true, // Continuer même en cas d'erreur
        usages: [],
        count: 0,
      };
    }
  }
}
