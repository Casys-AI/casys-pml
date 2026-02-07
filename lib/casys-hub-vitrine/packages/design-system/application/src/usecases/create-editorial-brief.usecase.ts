import {
  type BusinessContext,
  type CreateEditorialBriefInput,
  type CreateEditorialBriefPort,
  EditorialBrief,
} from '@casys/core';

import type { EditorialBriefAgentPort } from '../ports/out';
import { applicationLogger as logger } from '../utils/logger';

/**
 * Use case de création d'un EditorialBrief (Port IN implementation).
 *
 * V3 Architecture:
 * - Si params agent fournis: appelle EditorialBriefAgent → génère enrichedData
 * - Si params agent absents: reverse engineering, enrichedData = undefined
 * - Retourne l'aggregate EditorialBrief (pas d'effets de bord, persistance en aval)
 */

export class CreateEditorialBriefUseCase implements CreateEditorialBriefPort {
  constructor(private readonly editorialBriefAgent?: EditorialBriefAgentPort) {}

  async execute(input: CreateEditorialBriefInput): Promise<EditorialBrief> {
    // Fail-fast minimal (les invariants seront revalidés par l'aggregate)
    if (!input.tenantId?.trim()) throw new Error('[CreateEditorialBriefUseCase] tenantId requis');
    if (!input.projectId?.trim()) throw new Error('[CreateEditorialBriefUseCase] projectId requis');
    if (!input.language?.trim()) throw new Error('[CreateEditorialBriefUseCase] language requis');
    if (!input.angle?.trim()) throw new Error('[CreateEditorialBriefUseCase] angle requis');
    if (!Array.isArray(input.corpusTopicIds))
      throw new Error('[CreateEditorialBriefUseCase] corpusTopicIds requis (tableau)');
    if (!input.businessContext)
      throw new Error('[CreateEditorialBriefUseCase] businessContext requis');

    // Appeler EditorialBriefAgent si params fournis (génération complète)
    let agentData;
    const hasAgentParams =
      input.chosenCluster && input.contentType && input.seoBriefData && input.selectedTopics;

    logger.log('[CreateEditorialBriefUseCase] Démarrage', {
      tenantId: input.tenantId,
      projectId: input.projectId,
      angle: input.angle.substring(0, 80),
      corpusTopicsCount: input.corpusTopicIds.length,
      hasAgentParams,
      mode: hasAgentParams ? 'génération complète' : 'reverse engineering',
    });

    if (hasAgentParams) {
      if (!this.editorialBriefAgent) {
        throw new Error('[CreateEditorialBriefUseCase] EditorialBriefAgent requis pour génération complète');
      }

      const startAgent = Date.now();
      logger.log('[CreateEditorialBriefUseCase] 🤖 Appel EditorialBriefAgent', {
        angle: input.angle.substring(0, 80),
        cluster: input.chosenCluster?.pillarTag?.label,
        contentType: input.contentType,
        selectedTopicsCount: input.selectedTopics?.length,
        sourceArticlesCount: input.sourceArticles?.length,
      });

      agentData = await this.editorialBriefAgent.generateBrief({
        angle: input.angle,
        chosenCluster: input.chosenCluster!,
        contentType: input.contentType!,
        targetPersona: input.targetPersona,
        selectionMode: input.selectionMode ?? 'pillar',
        seoBriefData: input.seoBriefData!,
        businessContext: input.businessContext,
        selectedTopics: input.selectedTopics!.map(t => ({
          id: t.id,
          title: t.title,
          sourceUrl: t.sourceUrl ?? '',
          createdAt: t.createdAt ?? new Date().toISOString(),
          language: t.language ?? input.language,
        })),
        sourceArticles: input.sourceArticles ?? [],
        language: input.language,
      });

      const agentDuration = Date.now() - startAgent;
      logger.log('[CreateEditorialBriefUseCase] ✅ EditorialBriefAgent terminé', {
        duration: `${agentDuration}ms`,
        keywordTagsCount: agentData?.keywordTags?.length ?? 0,
        questionsCount: agentData?.relevantQuestions?.length ?? 0,
        gapsCount: agentData?.priorityGaps?.length ?? 0,
        hasRecommendations: !!agentData?.guidingRecommendations,
        hasSummary: !!agentData?.corpusSummary,
        competitorAnglesCount: agentData?.competitorAngles?.length ?? 0,
      });
    }

    // Valider businessContext (requis par l'aggregate)
    if (!input.businessContext.targetAudience?.trim()) {
      throw new Error('[CreateEditorialBriefUseCase] businessContext.targetAudience requis');
    }
    if (!input.businessContext.industry?.trim()) {
      throw new Error('[CreateEditorialBriefUseCase] businessContext.industry requis');
    }
    if (!input.businessContext.businessDescription?.trim()) {
      throw new Error('[CreateEditorialBriefUseCase] businessContext.businessDescription requis');
    }

    // Créer l'aggregate EditorialBrief avec spread des données agent
    const brief = EditorialBrief.create({
      tenantId: input.tenantId,
      projectId: input.projectId,
      language: input.language,
      angle: input.angle,
      // V3: Spread direct des données agent (ou undefined)
      ...agentData,
      // V3: BusinessContext complet (targetAudience, industry, businessDescription, contentType, siteType, personas)
      businessContext: input.businessContext,
      corpusTopicIds: input.corpusTopicIds,
    });

    logger.log('[CreateEditorialBriefUseCase] ✅ EditorialBrief créé', {
      briefId: brief.id,
      enriched: !!agentData,
      corpusSize: input.corpusTopicIds.length,
    });

    return brief;
  }
}
