import type { ProjectConfig } from '@casys/shared';
import type {
  SelectTopicCommand,
  SelectTopicResult,
  Topic,
} from '@casys/core';

import type {
  SelectTopicExecutePort,
  UserProjectConfigPort,
  TopicSelectorWorkflowPort,
} from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

/**
 * Use Case de sélection de topics (v3 refactoré)
 *
 * ⚠️ V3 ARCHITECTURE (séparation claire):
 * 1. GenerateAngleUseCase → génère angle + cluster (EN AMONT, pas ici)
 * 2. SelectTopicUseCase → filtre topics pour l'angle fourni
 * 3. TopicSelectorWorkflow → workflow LangGraph interne
 *
 * Responsabilité: Filtrer les topics pertinents EN FONCTION de l'angle éditorial déjà choisi.
 */
export class SelectTopicUseCase implements SelectTopicExecutePort {
  constructor(
    private readonly configReader: UserProjectConfigPort,
    private readonly topicSelectorWorkflow: TopicSelectorWorkflowPort
  ) {}

  async execute(input: SelectTopicCommand): Promise<SelectTopicResult> {
    const { tenantId, projectId, angle, chosenCluster, contentType, selectionMode, targetPersona } = input;

    // V3: Fail-fast validations
    if (!tenantId?.trim() || !projectId?.trim()) {
      throw new Error('[SelectTopicUseCase] tenantId et projectId requis');
    }
    if (!angle?.trim()) {
      throw new Error('[SelectTopicUseCase] angle requis (fourni par GenerateAngleUseCase en amont)');
    }
    if (!chosenCluster) {
      throw new Error('[SelectTopicUseCase] chosenCluster requis (fourni par GenerateAngleUseCase)');
    }
    if (!contentType) {
      throw new Error('[SelectTopicUseCase] contentType requis (fourni par GenerateAngleUseCase)');
    }
    if (!selectionMode) {
      throw new Error('[SelectTopicUseCase] selectionMode requis (fourni par GenerateAngleUseCase)');
    }

    // Charger ProjectConfig pour template + maxTopics
    const projectConfig: ProjectConfig = await this.configReader.getProjectConfig(
      tenantId,
      projectId
    );

    if (!projectConfig.language?.trim()) {
      throw new Error('[SelectTopicUseCase] project.language requis dans ProjectConfig');
    }

    // Template requis pour TopicSelectorWorkflow
    const topicTemplatePathRaw = projectConfig?.generation?.topicSelector?.template;
    if (!topicTemplatePathRaw || topicTemplatePathRaw.trim().length === 0) {
      throw new Error(
        '[SelectTopicUseCase] generation.topicSelector.template requis dans la config projet'
      );
    }
    const topicTemplatePath = topicTemplatePathRaw;

    // maxTopics strictement config-driven (pas de fallback implicite)
    const cfgMaxTopicsRaw = projectConfig?.generation?.topicSelector?.maxTopics;
    if (
      typeof cfgMaxTopicsRaw !== 'number' ||
      !Number.isInteger(cfgMaxTopicsRaw) ||
      cfgMaxTopicsRaw <= 0
    ) {
      throw new Error('[SelectTopicUseCase] generation.topicSelector.maxTopics requis (>0)');
    }
    const cfgMaxTopics = cfgMaxTopicsRaw;

    logger.debug('[SelectTopicUseCase] Filtrage topics avec angle fourni', {
      angle,
      maxTopics: cfgMaxTopics,
      chosenClusterPillar: chosenCluster.pillarTag?.label,
      chosenClusterSatellites: chosenCluster.satelliteTags?.length,
      contentType,
      selectionMode,
    });

    // ✨ V3: Appeler TopicSelectorWorkflow (angle et chosenCluster sont dans input)
    const topicResult = await this.topicSelectorWorkflow.execute(input, {
      maxTopics: cfgMaxTopics,
      templatePath: topicTemplatePath,
    });

    // ✅ ALLOW EMPTY TOPICS: Si aucun topic ne matche, c'est une réponse valide
    // Le workflow amont peut décider quoi faire (retry, reangle, abandon)
    if (!topicResult.topics) {
      logger.warn('[SelectTopicUseCase] TopicSelector a retourné topics: undefined', {
        angle,
      });
      topicResult.topics = [];
    }

    if (topicResult.topics.length === 0) {
      logger.warn('[SelectTopicUseCase] ⚠️ TopicSelector a retourné 0 topics', {
        angle,
        reason: 'Aucun article ne matche l\'angle généré - cas valide, le workflow décidera du prochain pas',
      });
    } else {
      logger.log('[SelectTopicUseCase] ✅ Topics filtrés', {
        topicsCount: topicResult.topics.length,
      });
    }

    return {
      topics: topicResult.topics,
      angle,
      chosenCluster,
      contentType,
      selectionMode,
      targetPersona,
    };
  }

}
