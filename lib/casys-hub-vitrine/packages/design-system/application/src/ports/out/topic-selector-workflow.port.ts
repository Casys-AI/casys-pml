import type { SelectTopicCommand, Topic, ChosenCluster } from '@casys/core';

/**
 * Résultat du TopicSelectorWorkflow (v2 refactoré)
 *
 * ⚠️ CHANGEMENT ARCHITECTURAL:
 * Le workflow ne génère PLUS l'angle ni le seoSummary.
 * Il reçoit un angle/cluster en INPUT et retourne seulement les topics filtrés.
 */
export interface TopicSelectorWorkflowResult {
  topics: Topic[];
}

/**
 * Port pour le workflow de filtrage de topics (v2 refactoré)
 *
 * ⚠️ CHANGEMENT ARCHITECTURAL:
 * L'angle et le cluster sont maintenant FOURNIS en input (déjà sélectionnés par AngleSelectionWorkflow).
 * Ce workflow se concentre uniquement sur le filtrage de topics pertinents.
 */
export interface TopicSelectorWorkflowPort {
  /**
   * Filtre les topics pertinents pour un angle/cluster FOURNI
   *
   * @param input - Commande avec articles candidats, seoBriefData, angle et chosenCluster (V3)
   * @param config - Configuration avec maxTopics et templatePath
   * @returns Topics filtrés et scorés pour cet angle/cluster
   */
  execute(
    input: SelectTopicCommand,
    config: {
      maxTopics: number;
      templatePath: string;
    }
  ): Promise<TopicSelectorWorkflowResult>;
}
