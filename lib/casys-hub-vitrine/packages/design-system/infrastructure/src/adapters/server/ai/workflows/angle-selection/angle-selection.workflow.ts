import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type { LoggerPort } from '@casys/shared';

// ✨ Type alias local pour compatibilité
type Logger = LoggerPort;
import type { AngleSelectionCommand, AngleSelectionResult } from '@casys/core';
import {
  type AITextModelPort,
  type EditorialBriefStorePort,
  type PromptTemplatePort,
} from '@casys/application';

import { generateAnglesNode } from './nodes/generate-angles-node';
import { selectAngleNode } from './nodes/select-angle-node';
import { validateAnglesNode } from './nodes/validate-angles-node';
import type {
  AngleSelectionNodeDeps,
  AngleSelectionState,
} from './angle-selection.types';

/**
 * Interface du port pour le workflow AngleSelection
 * Permet l'abstraction et l'injection dans les use cases
 */
export interface AngleSelectionWorkflowPort {
  execute(
    input: AngleSelectionCommand,
    config: { templatePath: string; maxAttempts?: number }
  ): Promise<AngleSelectionResult>;
}

/**
 * AngleSelection LangGraph Workflow
 * Génération et sélection d'angle éditorial avec validation anti-doublons
 *
 * Flow: START → generate → validate → select → END
 */
export class AngleSelectionWorkflow implements AngleSelectionWorkflowPort {
  constructor(
    private readonly briefStore: EditorialBriefStorePort,
    private readonly aiModel: AITextModelPort,
    private readonly promptTemplate: PromptTemplatePort,
    private readonly logger: Logger
  ) {}

  /**
   * Construit le graph LangGraph
   */
  private buildGraph() {
    // Définition du state via Annotation
    const StateAnn = Annotation.Root({
      // Input (immutables)
      tenantId: Annotation<AngleSelectionState['tenantId']>(),
      projectId: Annotation<AngleSelectionState['projectId']>(),
      language: Annotation<AngleSelectionState['language']>(),
      articles: Annotation<AngleSelectionState['articles']>(),
      seoBriefData: Annotation<AngleSelectionState['seoBriefData']>(),
      businessContext: Annotation<AngleSelectionState['businessContext']>(),
      existingBriefs: Annotation<AngleSelectionState['existingBriefs']>(),
      templatePath: Annotation<AngleSelectionState['templatePath']>(),

      // Generated (mutables)
      candidateAngles: Annotation<AngleSelectionState['candidateAngles']>(),
      validatedAngles: Annotation<AngleSelectionState['validatedAngles']>(),
      selectedAngle: Annotation<AngleSelectionState['selectedAngle']>(),
      chosenCluster: Annotation<AngleSelectionState['chosenCluster']>(),
      contentType: Annotation<AngleSelectionState['contentType']>(),
      targetPersona: Annotation<AngleSelectionState['targetPersona']>(),
      selectionMode: Annotation<AngleSelectionState['selectionMode']>(),

      // Validation state
      rejectedAngles: Annotation<AngleSelectionState['rejectedAngles']>(),

      // Control flow
      attempts: Annotation<AngleSelectionState['attempts']>(),
      maxAttempts: Annotation<AngleSelectionState['maxAttempts']>(),
      status: Annotation<AngleSelectionState['status']>(),
      failureReason: Annotation<AngleSelectionState['failureReason']>(),
    });

    type GraphState = typeof StateAnn.State;
    const builder = new StateGraph(StateAnn);

    // Bind dependencies to nodes
    const deps: AngleSelectionNodeDeps = {
      aiModel: this.aiModel,
      briefStore: this.briefStore,
      templateReader: this.promptTemplate,
      logger: this.logger,
    };

    // Build linear workflow: generate → validate → select
    const graph = builder
      .addNode('generate', (state: GraphState) =>
        generateAnglesNode(state as unknown as AngleSelectionState, {
          aiModel: deps.aiModel,
          templateReader: deps.templateReader,
          logger: deps.logger,
        })
      )
      .addNode('validate', (state: GraphState) =>
        validateAnglesNode(state as unknown as AngleSelectionState, {
          aiModel: deps.aiModel,
          logger: deps.logger,
        })
      )
      .addNode('select', (state: GraphState) =>
        selectAngleNode(state as unknown as AngleSelectionState, {
          logger: deps.logger,
        })
      )
      .addEdge(START, 'generate')
      .addEdge('generate', 'validate')
      .addEdge('validate', 'select')
      .addEdge('select', END)
      .compile();

    return graph;
  }

  /**
   * Exécute le workflow complet
   */
  async execute(
    input: AngleSelectionCommand,
    config: { templatePath: string; maxAttempts?: number }
  ): Promise<AngleSelectionResult> {
    const { templatePath, maxAttempts = 1 } = config;

    // Initialiser le state
    const initialState: AngleSelectionState = {
      tenantId: input.tenantId,
      projectId: input.projectId,
      language: input.language,
      articles: input.articles,
      seoBriefData: input.seoBriefData,
      businessContext: input.businessContext,
      existingBriefs: input.existingBriefs,
      templatePath,
      attempts: 0,
      maxAttempts,
      status: 'pending',
    };

    this.logger.log('[AngleSelectionWorkflow] 🚀 Démarrage', {
      articlesCount: input.articles.length,
      existingBriefsCount: input.existingBriefs.length,
      personasCount: input.businessContext.personas?.length ?? 0,
      maxAttempts,
    });

    // Construire et exécuter le graph
    const graph = this.buildGraph();
    const result = await graph.invoke(initialState);

    // Extraire le résultat final
    const finalState = result as unknown as AngleSelectionState;

    if (finalState.status === 'failed' || !finalState.selectedAngle || !finalState.chosenCluster) {
      throw new Error(
        `[AngleSelectionWorkflow] Échec: ${finalState.failureReason ?? 'Raison inconnue'}`
      );
    }

    this.logger.log('[AngleSelectionWorkflow] ✅ Terminé avec succès', {
      selectedAngle: finalState.selectedAngle,
      contentType: finalState.contentType,
      attempts: finalState.attempts,
    });

    // Retourner le résultat domain
    return {
      selectedAngle: finalState.selectedAngle,
      chosenCluster: finalState.chosenCluster,
      contentType: finalState.contentType!,
      targetPersona: finalState.targetPersona,
      selectionMode: finalState.selectionMode!,
    };
  }
}

/**
 * Factory pour créer le workflow
 */
export function createAngleSelectionWorkflow(
  briefStore: EditorialBriefStorePort,
  aiModel: AITextModelPort,
  promptTemplate: PromptTemplatePort,
  logger: Logger
): AngleSelectionWorkflow {
  return new AngleSelectionWorkflow(briefStore, aiModel, promptTemplate, logger);
}
