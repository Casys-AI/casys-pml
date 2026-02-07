import type { AngleSelectionCommand, AngleSelectionResult } from '@casys/core';

/**
 * Port pour le workflow de sélection d'angle éditorial
 *
 * ⚠️ NOUVELLE ARCHITECTURE (séparation des responsabilités):
 * Ce workflow génère et valide un angle éditorial + cluster sémantique.
 * Le TopicSelectorWorkflow filtre ensuite les topics pour cet angle.
 */
export interface AngleSelectionWorkflowPort {
  /**
   * Exécute le workflow complet de sélection d'angle
   *
   * @param input - Commande avec articles candidats, seoBriefData, businessContext, existingBriefs
   * @param config - Configuration du workflow (templatePath)
   * @returns Angle sélectionné + cluster choisi + contentType + persona
   */
  execute(
    input: AngleSelectionCommand,
    config: { templatePath: string }
  ): Promise<AngleSelectionResult>;
}
