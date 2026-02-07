import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type { SelectTopicCommand } from '@casys/core';
import {
  type AITextModelPort,
  type PromptTemplatePort,
  type TopicSelectorWorkflowPort,
  type TopicSelectorWorkflowResult,
} from '@casys/application';

import type { Logger } from '../../../../utils/logger';
import { filterTopicsNode, type TopicSelectorNodeDeps } from './topic-selector.nodes';
import type { TopicSelectorState } from './topic-selector.types';

/**
 * TopicSelector LangGraph Workflow (REFACTORÉ v2)
 * Filtre et score les topics pertinents pour un angle/cluster FOURNI en INPUT
 *
 * ⚠️ CHANGEMENT ARCHITECTURAL :
 * L'angle et le cluster sont maintenant FOURNIS par AngleSelectionWorkflow.
 * Ce workflow se concentre uniquement sur le filtrage de topics.
 */
export class TopicSelectorWorkflow implements TopicSelectorWorkflowPort {
  constructor(
    private readonly aiModel: AITextModelPort,
    private readonly promptTemplate: PromptTemplatePort,
    private readonly logger: Logger
  ) {}

  /**
   * Construit le graph LangGraph simplifié
   */
  private buildGraph() {
    // Définition du state via Annotation (doc v0.2)
    const StateAnn = Annotation.Root({
      // Input (immutables) - FOURNIS par AngleSelectionWorkflow
      angle: Annotation<TopicSelectorState['angle']>(),
      chosenCluster: Annotation<TopicSelectorState['chosenCluster']>(),
      contentType: Annotation<TopicSelectorState['contentType']>(),
      selectionMode: Annotation<TopicSelectorState['selectionMode']>(),
      tags: Annotation<TopicSelectorState['tags']>(),
      targetPersona: Annotation<TopicSelectorState['targetPersona']>(),

      // Input (context)
      articles: Annotation<TopicSelectorState['articles']>(),
      seoBriefData: Annotation<TopicSelectorState['seoBriefData']>(),
      projectId: Annotation<TopicSelectorState['projectId']>(),
      tenantId: Annotation<TopicSelectorState['tenantId']>(),
      language: Annotation<TopicSelectorState['language']>(),
      maxTopics: Annotation<TopicSelectorState['maxTopics']>(),
      templatePath: Annotation<TopicSelectorState['templatePath']>(),

      // Generated (mutables)
      topics: Annotation<TopicSelectorState['topics']>(),

      // Control flow (simplifié)
      status: Annotation<TopicSelectorState['status']>(),
      failureReason: Annotation<TopicSelectorState['failureReason']>(),
    });

    type GraphState = typeof StateAnn.State;
    const builder = new StateGraph(StateAnn);

    // Bind dependencies to nodes
    const deps: TopicSelectorNodeDeps = {
      aiModel: this.aiModel,
      promptTemplate: this.promptTemplate,
      logger: this.logger,
    };

    // Build linear workflow: START → filterTopics → END
    const graph = builder
      .addNode('filterTopics', (state: GraphState) =>
        filterTopicsNode(state as unknown as TopicSelectorState, deps)
      )
      .addEdge(START, 'filterTopics')
      .addEdge('filterTopics', END)
      .compile();

    return graph;
  }

  /**
   * Exécute le workflow complet
   *
   * ✨ V3: angle et chosenCluster sont maintenant dans input (command), pas dans config
   */
  async execute(
    input: SelectTopicCommand,
    config: {
      maxTopics: number;
      templatePath: string;
    }
  ): Promise<TopicSelectorWorkflowResult> {
    const { maxTopics, templatePath } = config;
    const { angle, chosenCluster, contentType, selectionMode, tags, targetPersona } = input; // ✨ V3: Pris depuis command

    this.logger.debug('[TopicSelectorWorkflow] 🚀 Starting workflow (v3 - angle depuis command)', {
      projectId: input.projectId,
      articlesCount: input.articles.length,
      angle,
      chosenClusterPillar: chosenCluster?.pillarTag?.label,
      chosenClusterSatellites: chosenCluster?.satelliteTags?.length,
      contentType,
      selectionMode,
      tagsCount: tags?.length,
      maxTopics,
    });

    const graph = this.buildGraph();

    // État initial (angle et cluster FOURNIS via command)
    const initialState: TopicSelectorState = {
      // ✨ V3: Input depuis command (pas config!)
      angle,
      chosenCluster,
      contentType,
      selectionMode,
      tags,
      targetPersona,

      // Context
      articles: input.articles,
      seoBriefData: input.seoBriefData,
      projectId: input.projectId,
      tenantId: input.tenantId,
      language: input.language,
      maxTopics,
      templatePath,

      // Initial status
      status: 'pending',
    };

    try {
      // Invoke workflow
      const result = await graph.invoke(initialState);

      // Vérifier résultat
      if (!result.topics || result.topics.length === 0) {
        throw new Error('[TopicSelectorWorkflow] Workflow terminé sans topics valides');
      }

      this.logger.log('[TopicSelectorWorkflow] ✅ Workflow success', {
        topicsCount: result.topics.length,
        angle,
        status: result.status,
      });

      return {
        topics: result.topics,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : '';

      this.logger.error('[TopicSelectorWorkflow] Workflow failed - DETAILED ERROR', {
        errorMessage: errorMsg,
        errorStack: stack,
        angle: angle?.substring(0, 100),
        chosenClusterPillar: chosenCluster?.pillarTag?.label,
        articlesCount: input.articles.length,
        tagsCount: tags?.length,
        maxTopics,
      });

      throw new Error(`[TopicSelectorWorkflow] Échec du filtrage: ${errorMsg}`);
    }
  }
}

/**
 * Factory pour créer le workflow
 */
export function createTopicSelectorWorkflow(
  aiModel: AITextModelPort,
  promptTemplate: PromptTemplatePort,
  logger: Logger
): TopicSelectorWorkflow {
  return new TopicSelectorWorkflow(aiModel, promptTemplate, logger);
}
