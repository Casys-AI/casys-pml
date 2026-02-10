/**
 * Prioritized Experience Replay (PER) Buffer
 *
 * Circular buffer of training examples weighted by TD error priority.
 * Implements proportional prioritization (Schaul et al. 2015) with
 * importance sampling weights for bias correction.
 *
 * Adapted from production `src/capabilities/per-priority.ts` and
 * `src/graphrag/learning/per-training.ts` for the standalone GRU lib.
 *
 * @module gru/training/per-buffer
 */

import type { TransitionExample } from "../transition/types.ts";

// ============================================================================
// Constants
// ============================================================================

/** Default PER alpha exponent (0 = uniform, 1 = fully prioritized) */
export const DEFAULT_PER_ALPHA = 0.6;

/** Default beta for importance sampling (annealed from 0.4 to 1.0) */
export const DEFAULT_BETA_START = 0.4;

/** Default minimum priority to avoid zero-probability sampling */
export const DEFAULT_MIN_PRIORITY = 0.01;

/** Default maximum priority */
export const DEFAULT_MAX_PRIORITY = 1.0;

/** Default buffer capacity */
export const DEFAULT_CAPACITY = 10_000;

// ============================================================================
// Types
// ============================================================================

/** A stored example with its priority and metadata. */
export interface PEREntry {
  /** The training example. */
  example: TransitionExample;
  /** Priority = |TD error| clamped to [MIN_PRIORITY, MAX_PRIORITY]. */
  priority: number;
  /** Index in the circular buffer. */
  index: number;
}

/** Configuration for the PER buffer. */
export interface PERBufferConfig {
  /** Maximum number of entries (circular — oldest evicted). Default: 10000. */
  capacity: number;
  /** Prioritization exponent: 0 = uniform, 1 = fully prioritized. Default: 0.6. */
  alpha: number;
  /** Initial importance sampling beta (annealed toward 1.0). Default: 0.4. */
  betaStart: number;
  /** Minimum priority floor. Default: 0.01. */
  minPriority: number;
  /** Maximum priority ceiling. Default: 1.0. */
  maxPriority: number;
}

/** Result of sampling a batch from the PER buffer. */
export interface PERSampleResult {
  /** Sampled entries with their priorities. */
  entries: PEREntry[];
  /** Importance sampling weights (one per entry, normalized to max=1). */
  weights: number[];
  /** Indices into the buffer (for priority updates after training). */
  indices: number[];
}

// ============================================================================
// PERBuffer Class
// ============================================================================

/**
 * Prioritized Experience Replay buffer.
 *
 * Stores training examples with TD-error-based priorities. Sampling is
 * proportional to priority^alpha. Importance sampling weights correct
 * the bias introduced by non-uniform sampling.
 *
 * @example
 * ```typescript
 * const buffer = new PERBuffer({ capacity: 5000 });
 *
 * // Add examples with initial priority
 * buffer.add(example, 0.5);
 *
 * // Sample a batch
 * const { entries, weights, indices } = buffer.sample(32, 0.6);
 *
 * // After training, update priorities with new TD errors
 * buffer.updatePriorities(indices, newTDErrors);
 * ```
 */
export class PERBuffer {
  readonly config: PERBufferConfig;

  private entries: (PEREntry | null)[];
  private writePos: number = 0;
  private count: number = 0;

  constructor(config: Partial<PERBufferConfig> = {}) {
    this.config = {
      capacity: config.capacity ?? DEFAULT_CAPACITY,
      alpha: config.alpha ?? DEFAULT_PER_ALPHA,
      betaStart: config.betaStart ?? DEFAULT_BETA_START,
      minPriority: config.minPriority ?? DEFAULT_MIN_PRIORITY,
      maxPriority: config.maxPriority ?? DEFAULT_MAX_PRIORITY,
    };
    this.entries = new Array(this.config.capacity).fill(null);
  }

  /** Number of entries currently in the buffer. */
  get size(): number {
    return this.count;
  }

  /** Whether the buffer is empty. */
  get isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Add an example with initial priority.
   *
   * If the buffer is full, the oldest entry is evicted (circular).
   */
  add(example: TransitionExample, priority?: number): void {
    const clampedPriority = this.clampPriority(priority ?? this.config.maxPriority);

    this.entries[this.writePos] = {
      example,
      priority: clampedPriority,
      index: this.writePos,
    };

    this.writePos = (this.writePos + 1) % this.config.capacity;
    if (this.count < this.config.capacity) {
      this.count++;
    }
  }

  /**
   * Add multiple examples at once with the same priority.
   */
  addBatch(examples: TransitionExample[], priority?: number): void {
    for (const ex of examples) {
      this.add(ex, priority);
    }
  }

  /**
   * Sample a batch of entries proportional to priority^alpha.
   *
   * Returns importance sampling weights (beta-annealed, normalized to max=1).
   *
   * @param batchSize - Number of entries to sample.
   * @param beta - Importance sampling exponent (0.4 → 1.0 over training).
   *   Higher beta = stronger correction for sampling bias.
   */
  sample(batchSize: number, beta?: number): PERSampleResult {
    if (this.count === 0) {
      throw new Error("[PERBuffer] Cannot sample from empty buffer.");
    }

    const actualBatch = Math.min(batchSize, this.count);
    const effectiveBeta = beta ?? this.config.betaStart;
    const alpha = this.config.alpha;

    // Compute priority^alpha for all entries
    const priorities: number[] = [];
    const validIndices: number[] = [];
    let totalPriority = 0;

    for (let i = 0; i < this.config.capacity; i++) {
      const entry = this.entries[i];
      if (entry === null) continue;
      const pAlpha = Math.pow(entry.priority, alpha);
      priorities.push(pAlpha);
      validIndices.push(i);
      totalPriority += pAlpha;
    }

    // Proportional sampling (without replacement)
    const sampledIndices: number[] = [];
    const sampledProbabilities: number[] = [];
    const used = new Set<number>();

    for (let s = 0; s < actualBatch; s++) {
      let r = Math.random() * totalPriority;
      let chosen = -1;

      for (let j = 0; j < validIndices.length; j++) {
        if (used.has(j)) continue;
        r -= priorities[j];
        if (r <= 0) {
          chosen = j;
          break;
        }
      }

      // Fallback: pick first unused
      if (chosen === -1) {
        for (let j = 0; j < validIndices.length; j++) {
          if (!used.has(j)) {
            chosen = j;
            break;
          }
        }
      }

      if (chosen === -1) break;

      used.add(chosen);
      sampledIndices.push(validIndices[chosen]);
      sampledProbabilities.push(priorities[chosen] / totalPriority);
    }

    // Compute importance sampling weights: w_i = (N * P(i))^(-beta)
    const N = this.count;
    const rawWeights = sampledProbabilities.map(
      (p) => Math.pow(N * p, -effectiveBeta),
    );
    const maxWeight = Math.max(...rawWeights);
    const normalizedWeights = rawWeights.map((w) => w / maxWeight);

    const entries = sampledIndices.map((i) => this.entries[i]!);

    return {
      entries,
      weights: normalizedWeights,
      indices: sampledIndices,
    };
  }

  /**
   * Update priorities for sampled entries after training.
   *
   * Typically called with new |TD errors| computed from the training step.
   *
   * @param indices - Buffer indices (from sample().indices).
   * @param tdErrors - New TD errors (absolute values used as priorities).
   */
  updatePriorities(indices: number[], tdErrors: number[]): void {
    for (let i = 0; i < indices.length; i++) {
      const entry = this.entries[indices[i]];
      if (entry) {
        entry.priority = this.clampPriority(Math.abs(tdErrors[i]));
      }
    }
  }

  /**
   * Compute the annealed beta for a given training progress.
   *
   * Linearly anneals from betaStart to 1.0 over training.
   *
   * @param progress - Training progress in [0, 1] (0 = start, 1 = end).
   */
  annealBeta(progress: number): number {
    const p = Math.max(0, Math.min(1, progress));
    return this.config.betaStart + p * (1.0 - this.config.betaStart);
  }

  /**
   * Get all entries as a flat array (for debugging/serialization).
   */
  getAllEntries(): PEREntry[] {
    return this.entries.filter((e): e is PEREntry => e !== null);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries = new Array(this.config.capacity).fill(null);
    this.writePos = 0;
    this.count = 0;
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private clampPriority(p: number): number {
    return Math.max(this.config.minPriority, Math.min(this.config.maxPriority, p));
  }
}
