/**
 * Thompson Sampling for GRU Inference Weighting
 *
 * Bayesian approach: Beta(alpha, beta) per tool ID.
 * Used to weight predictions during inference for exploration/exploitation.
 *
 * Adapted from production `src/graphrag/algorithms/thompson.ts` — simplified
 * for the standalone GRU lib (no risk categories, no mode adjustments).
 *
 * @module gru/training/thompson-sampler
 */

// ============================================================================
// Types
// ============================================================================

/** Per-tool Beta distribution state. */
export interface ToolBetaState {
  toolId: string;
  /** Successes + prior. */
  alpha: number;
  /** Failures + prior. */
  beta: number;
  /** Total observations for this tool. */
  totalObservations: number;
}

/** Configuration for Thompson Sampler. */
export interface ThompsonSamplerConfig {
  /** Prior alpha for new tools. Default: 1 (uniform). */
  priorAlpha: number;
  /** Prior beta for new tools. Default: 1 (uniform). */
  priorBeta: number;
  /** Decay factor for non-stationary environments (0.95-0.99). Default: 0.99. */
  decayFactor: number;
}

/** Serialized state for persistence. */
export interface SerializedThompsonState {
  states: Array<{ toolId: string; alpha: number; beta: number; totalObservations: number }>;
  totalExecutions: number;
}

// ============================================================================
// Default Config
// ============================================================================

export const DEFAULT_THOMPSON_CONFIG: ThompsonSamplerConfig = {
  priorAlpha: 1,
  priorBeta: 1,
  decayFactor: 0.99,
};

// ============================================================================
// ThompsonSampler Class
// ============================================================================

/**
 * Thompson Sampling for per-tool exploration/exploitation during GRU inference.
 *
 * Each tool maintains a Beta(alpha, beta) distribution.
 * - `sample(toolId)` draws from Beta, yielding a stochastic confidence weight.
 * - `update(toolId, success)` increments alpha or beta.
 * - Decay prevents stale data from dominating.
 *
 * @example
 * ```typescript
 * const sampler = new ThompsonSampler();
 *
 * // During inference: sample exploration weight
 * const weight = sampler.sample("std:read_file");
 *
 * // After execution: update with outcome
 * sampler.update("std:read_file", true);   // success
 * sampler.update("std:psql_query", false);  // failure
 *
 * // Bulk: weight all predictions
 * const weights = sampler.sampleBatch(["std:read_file", "std:psql_query"]);
 * ```
 */
export class ThompsonSampler {
  readonly config: ThompsonSamplerConfig;

  private states = new Map<string, ToolBetaState>();
  private totalExecutions = 0;

  constructor(config: Partial<ThompsonSamplerConfig> = {}) {
    this.config = { ...DEFAULT_THOMPSON_CONFIG, ...config };
  }

  // ==========================================================================
  // Core API
  // ==========================================================================

  /**
   * Sample a success probability from the Beta distribution for a tool.
   *
   * Returns a value in [0, 1] — higher = more likely to succeed.
   * New/unseen tools start at Beta(1,1) = uniform, yielding max exploration.
   */
  sample(toolId: string): number {
    const state = this.getOrCreate(toolId);
    return this.sampleBeta(state.alpha, state.beta);
  }

  /**
   * Sample success probabilities for multiple tools.
   */
  sampleBatch(toolIds: string[]): Map<string, number> {
    const result = new Map<string, number>();
    for (const id of toolIds) {
      result.set(id, this.sample(id));
    }
    return result;
  }

  /**
   * Update a tool's Beta distribution after observing an outcome.
   *
   * @param toolId - Tool identifier.
   * @param success - Whether the execution succeeded.
   */
  update(toolId: string, success: boolean): void {
    const state = this.getOrCreate(toolId);

    if (success) {
      state.alpha += 1;
    } else {
      state.beta += 1;
    }
    state.totalObservations += 1;
    this.totalExecutions += 1;

    // Decay to handle non-stationary environments
    this.applyDecay(state);
  }

  /**
   * Batch update multiple tools.
   */
  updateBatch(outcomes: Array<{ toolId: string; success: boolean }>): void {
    for (const { toolId, success } of outcomes) {
      this.update(toolId, success);
    }
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /** Mean success rate for a tool: alpha / (alpha + beta). */
  getMean(toolId: string): number {
    const state = this.getOrCreate(toolId);
    return state.alpha / (state.alpha + state.beta);
  }

  /** Variance of the Beta distribution. */
  getVariance(toolId: string): number {
    const state = this.getOrCreate(toolId);
    const a = state.alpha;
    const b = state.beta;
    return (a * b) / ((a + b) ** 2 * (a + b + 1));
  }

  /** 95% confidence interval for success rate. */
  getConfidenceInterval(toolId: string): [number, number] {
    const mean = this.getMean(toolId);
    const stdDev = Math.sqrt(this.getVariance(toolId));
    const z = 1.96;
    return [Math.max(0, mean - z * stdDev), Math.min(1, mean + z * stdDev)];
  }

  /** Get state for a single tool. */
  getState(toolId: string): ToolBetaState | undefined {
    return this.states.get(toolId);
  }

  /** Total executions observed. */
  getTotalExecutions(): number {
    return this.totalExecutions;
  }

  /** Number of distinct tools tracked. */
  getToolCount(): number {
    return this.states.size;
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  /** Export state for persistence. */
  serialize(): SerializedThompsonState {
    return {
      states: Array.from(this.states.values()).map((s) => ({
        toolId: s.toolId,
        alpha: s.alpha,
        beta: s.beta,
        totalObservations: s.totalObservations,
      })),
      totalExecutions: this.totalExecutions,
    };
  }

  /** Restore from serialized state. */
  static deserialize(
    data: SerializedThompsonState,
    config: Partial<ThompsonSamplerConfig> = {},
  ): ThompsonSampler {
    const sampler = new ThompsonSampler(config);
    sampler.totalExecutions = data.totalExecutions;
    for (const s of data.states) {
      sampler.states.set(s.toolId, {
        toolId: s.toolId,
        alpha: s.alpha,
        beta: s.beta,
        totalObservations: s.totalObservations,
      });
    }
    return sampler;
  }

  /** Reset all state. */
  reset(): void {
    this.states.clear();
    this.totalExecutions = 0;
  }

  // ==========================================================================
  // Beta Distribution Sampling (Marsaglia-Tsang + Joehnk)
  // ==========================================================================

  /**
   * Sample from Beta(alpha, beta) distribution.
   *
   * Uses Joehnk's algorithm for small params, Gamma-ratio for larger.
   */
  private sampleBeta(alpha: number, beta: number): number {
    if (alpha <= 1 && beta <= 1) {
      // Joehnk's algorithm
      let u1: number, u2: number, x: number, y: number;
      do {
        u1 = Math.random();
        u2 = Math.random();
        x = Math.pow(u1, 1 / alpha);
        y = Math.pow(u2, 1 / beta);
      } while (x + y > 1);
      return x / (x + y);
    }

    // Gamma-based method
    const gammaA = this.sampleGamma(alpha);
    const gammaB = this.sampleGamma(beta);
    return gammaA / (gammaA + gammaB);
  }

  /** Marsaglia-Tsang method for Gamma(shape, 1). */
  private sampleGamma(shape: number): number {
    if (shape < 1) {
      return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number, v: number;
      do {
        x = this.gaussianRandom();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  /** Standard normal via Box-Muller. */
  private gaussianRandom(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private getOrCreate(toolId: string): ToolBetaState {
    let state = this.states.get(toolId);
    if (!state) {
      state = {
        toolId,
        alpha: this.config.priorAlpha,
        beta: this.config.priorBeta,
        totalObservations: 0,
      };
      this.states.set(toolId, state);
    }
    return state;
  }

  private applyDecay(state: ToolBetaState): void {
    state.alpha = Math.max(
      this.config.priorAlpha,
      state.alpha * this.config.decayFactor,
    );
    state.beta = Math.max(
      this.config.priorBeta,
      state.beta * this.config.decayFactor,
    );
  }
}
