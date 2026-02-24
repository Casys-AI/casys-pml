/**
 * DAG Suggester Adapter
 *
 * Suggests tool DAGs from natural language intent.
 * Strategy: GRU path prediction only. No fallback.
 *
 * @module infrastructure/di/adapters/execute/dag-suggester-adapter
 */

import * as log from "@std/log";
import type {
  IDAGSuggester,
  SuggestionResult,
  DAGSuggestion,
} from "../../../../domain/interfaces/dag-suggester.ts";
import type { IGRUInference } from "../../../../graphrag/algorithms/gru/types.ts";

/**
 * Embedding model interface
 */
export interface EmbeddingModelInfra {
  encode(text: string): Promise<number[]>;
}

/**
 * Dependencies for DAGSuggesterAdapter
 */
export interface DAGSuggesterAdapterDeps {
  embeddingModel?: EmbeddingModelInfra;
  gru?: IGRUInference;
}

/** Minimum GRU confidence to use its prediction */
const GRU_CONFIDENCE_THRESHOLD = 0.15;

/**
 * Suggests tool DAGs from intent.
 *
 * GRU only. If GRU is not ready or confidence is too low, returns confidence: 0.
 */
export class DAGSuggesterAdapter implements IDAGSuggester {
  private deps: DAGSuggesterAdapterDeps;

  constructor(deps: DAGSuggesterAdapterDeps) {
    this.deps = deps;
  }

  setEmbeddingModel(embeddingModel: EmbeddingModelInfra): void {
    this.deps = { ...this.deps, embeddingModel };
  }

  setGRU(gru: IGRUInference): void {
    this.deps = { ...this.deps, gru };
  }

  /**
   * Generate DAG suggestion from natural language intent.
   *
   * GRU only. No fallback. If GRU is not ready or not confident, returns confidence: 0.
   */
  async suggest(intent: string, correlationId?: string, precomputedEmbedding?: number[]): Promise<SuggestionResult> {
    if (!this.deps.gru?.isReady()) {
      return { confidence: 0 };
    }

    try {
      const intentEmbedding = await this.resolveEmbedding(intent, precomputedEmbedding);
      if (!intentEmbedding) {
        return { confidence: 0 };
      }

      const gru = this.deps.gru;
      const first = gru.predictFirstTool(intentEmbedding);

      if (first.score < GRU_CONFIDENCE_THRESHOLD) {
        log.debug("[DAGSuggesterAdapter] GRU confidence too low", {
          correlationId,
          gruScore: first.score,
          threshold: GRU_CONFIDENCE_THRESHOLD,
        });
        return { confidence: 0 };
      }

      const beamResults = gru.buildPathBeam(intentEmbedding, first.toolId, 3);
      const bestBeam = beamResults[0];
      if (!bestBeam || bestBeam.path.length === 0) {
        return { confidence: 0 };
      }

      log.info("[DAGSuggesterAdapter] GRU prediction", {
        correlationId,
        firstTool: first.toolId,
        firstScore: first.score,
        pathLength: bestBeam.path.length,
        beamScore: bestBeam.score,
      });

      return {
        suggestedDag: this.pathToDAG(bestBeam.path),
        confidence: first.score,
        canSpeculate: first.score >= 0.5,
      };
    } catch (error) {
      log.error(`[DAGSuggesterAdapter] GRU prediction failed: ${error}`);
      return { confidence: 0 };
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private pathToDAG(path: string[]): DAGSuggestion {
    return {
      tasks: path.map((toolId, index) => ({
        id: `task_${index}`,
        callName: toolId,
        type: "tool" as const,
        inputSchema: undefined,
        dependsOn: index > 0 ? [`task_${index - 1}`] : [],
      })),
    };
  }

  private async resolveEmbedding(intent: string, precomputed?: number[]): Promise<number[] | null> {
    if (precomputed && precomputed.length > 0) {
      return precomputed;
    }
    if (!this.deps.embeddingModel) {
      return null;
    }
    const embedding = await this.deps.embeddingModel.encode(intent);
    return embedding && embedding.length > 0 ? embedding : null;
  }

}
