/**
 * Thompson Sampling Benchmarks
 *
 * Benchmarks for Intelligent Adaptive Thresholds (ADR-049).
 * Tests Thompson Sampling decision making for tool execution.
 *
 * Run: deno bench --allow-all tests/benchmarks/decision/thompson-sampling.bench.ts
 *
 * @module tests/benchmarks/decision/thompson-sampling
 */

import {
  loadScenario,
} from "../fixtures/scenario-loader.ts";

// ============================================================================
// Setup
// ============================================================================

const mediumScenario = await loadScenario("medium-graph");

// ============================================================================
// Thompson Sampling Implementation (inline for benchmarking)
// ============================================================================

interface BetaDistribution {
  alpha: number; // successes + 1
  beta: number; // failures + 1
}

interface ToolPrior {
  toolId: string;
  distribution: BetaDistribution;
  observations: number;
}

class ThompsonSampler {
  private priors: Map<string, ToolPrior> = new Map();

  /**
   * Sample from Beta distribution
   * Uses Joehnk's algorithm for efficiency
   */
  sampleBeta(alpha: number, beta: number): number {
    // Simple approximation for benchmarking
    // Real implementation would use proper Beta sampling
    let u1: number, u2: number, x: number, y: number;

    do {
      u1 = Math.random();
      u2 = Math.random();
      x = Math.pow(u1, 1 / alpha);
      y = Math.pow(u2, 1 / beta);
    } while (x + y > 1);

    return x / (x + y);
  }

  /**
   * Get or create prior for a tool
   */
  getPrior(toolId: string): ToolPrior {
    if (!this.priors.has(toolId)) {
      this.priors.set(toolId, {
        toolId,
        distribution: { alpha: 1, beta: 1 }, // Uniform prior
        observations: 0,
      });
    }
    return this.priors.get(toolId)!;
  }

  /**
   * Sample threshold for a tool
   */
  sampleThreshold(toolId: string): number {
    const prior = this.getPrior(toolId);
    const sample = this.sampleBeta(prior.distribution.alpha, prior.distribution.beta);
    // Convert sample to threshold (higher success rate = lower threshold)
    return 0.5 + (1 - sample) * 0.4; // Range: 0.5 to 0.9
  }

  /**
   * Update prior with observation
   */
  update(toolId: string, success: boolean): void {
    const prior = this.getPrior(toolId);
    if (success) {
      prior.distribution.alpha += 1;
    } else {
      prior.distribution.beta += 1;
    }
    prior.observations += 1;
  }

  /**
   * Batch sample thresholds for multiple tools
   */
  sampleBatch(toolIds: string[]): Map<string, number> {
    const thresholds = new Map<string, number>();
    for (const toolId of toolIds) {
      thresholds.set(toolId, this.sampleThreshold(toolId));
    }
    return thresholds;
  }

  /**
   * Get UCB (Upper Confidence Bound) bonus for exploration
   */
  getUCBBonus(toolId: string, totalObservations: number): number {
    const prior = this.getPrior(toolId);
    if (prior.observations === 0) return 1.0; // Maximum exploration for new tools

    // UCB formula: sqrt(2 * ln(total) / n_i)
    const bonus = Math.sqrt((2 * Math.log(totalObservations + 1)) / prior.observations);
    return Math.min(bonus, 1.0);
  }

  /**
   * Reset all priors
   */
  reset(): void {
    this.priors.clear();
  }
}

// Create sampler instances
const sampler = new ThompsonSampler();

// Pre-populate with some observations
const toolIds = mediumScenario.nodes.tools.map((t) => t.id);
for (let i = 0; i < 100; i++) {
  const toolId = toolIds[Math.floor(Math.random() * toolIds.length)];
  sampler.update(toolId, Math.random() > 0.3); // 70% success rate
}

// ============================================================================
// Benchmarks: Single Threshold Sampling
// ============================================================================

Deno.bench({
  name: "Thompson: sample single threshold",
  group: "thompson-single",
  baseline: true,
  fn: () => {
    sampler.sampleThreshold(toolIds[0]);
  },
});

Deno.bench({
  name: "Thompson: sample with cold start (new tool)",
  group: "thompson-single",
  fn: () => {
    sampler.sampleThreshold(`new_tool_${Math.random()}`);
  },
});

// ============================================================================
// Benchmarks: Batch Sampling
// ============================================================================

Deno.bench({
  name: "Thompson: batch sample 5 tools",
  group: "thompson-batch",
  baseline: true,
  fn: () => {
    sampler.sampleBatch(toolIds.slice(0, 5));
  },
});

Deno.bench({
  name: "Thompson: batch sample 10 tools",
  group: "thompson-batch",
  fn: () => {
    sampler.sampleBatch(toolIds.slice(0, 10));
  },
});

Deno.bench({
  name: "Thompson: batch sample 20 tools",
  group: "thompson-batch",
  fn: () => {
    sampler.sampleBatch(toolIds.slice(0, 20));
  },
});

// ============================================================================
// Benchmarks: Update Operations
// ============================================================================

Deno.bench({
  name: "Thompson: single update (success)",
  group: "thompson-update",
  baseline: true,
  fn: () => {
    sampler.update(toolIds[0], true);
  },
});

Deno.bench({
  name: "Thompson: single update (failure)",
  group: "thompson-update",
  fn: () => {
    sampler.update(toolIds[0], false);
  },
});

Deno.bench({
  name: "Thompson: batch update (10 observations)",
  group: "thompson-update",
  fn: () => {
    for (let i = 0; i < 10; i++) {
      sampler.update(toolIds[i % toolIds.length], Math.random() > 0.3);
    }
  },
});

// ============================================================================
// Benchmarks: UCB Bonus Calculation
// ============================================================================

Deno.bench({
  name: "Thompson: UCB bonus (established tool)",
  group: "thompson-ucb",
  baseline: true,
  fn: () => {
    sampler.getUCBBonus(toolIds[0], 1000);
  },
});

Deno.bench({
  name: "Thompson: UCB bonus (new tool)",
  group: "thompson-ucb",
  fn: () => {
    sampler.getUCBBonus(`new_tool_${Math.random()}`, 1000);
  },
});

Deno.bench({
  name: "Thompson: UCB bonus batch (10 tools)",
  group: "thompson-ucb",
  fn: () => {
    for (const toolId of toolIds.slice(0, 10)) {
      sampler.getUCBBonus(toolId, 1000);
    }
  },
});

// ============================================================================
// Benchmarks: Beta Distribution Sampling
// ============================================================================

Deno.bench({
  name: "Beta: sample uniform (1, 1)",
  group: "beta-sampling",
  baseline: true,
  fn: () => {
    sampler.sampleBeta(1, 1);
  },
});

Deno.bench({
  name: "Beta: sample skewed success (10, 2)",
  group: "beta-sampling",
  fn: () => {
    sampler.sampleBeta(10, 2);
  },
});

Deno.bench({
  name: "Beta: sample skewed failure (2, 10)",
  group: "beta-sampling",
  fn: () => {
    sampler.sampleBeta(2, 10);
  },
});

Deno.bench({
  name: "Beta: sample high observations (100, 30)",
  group: "beta-sampling",
  fn: () => {
    sampler.sampleBeta(100, 30);
  },
});

// ============================================================================
// Benchmarks: Decision Making (Full Pipeline)
// ============================================================================

function makeDecision(
  toolId: string,
  score: number,
  sampler: ThompsonSampler,
  totalObs: number,
): boolean {
  const threshold = sampler.sampleThreshold(toolId);
  const ucbBonus = sampler.getUCBBonus(toolId, totalObs);
  const adjustedScore = score + ucbBonus * 0.1; // Small exploration bonus
  return adjustedScore >= threshold;
}

Deno.bench({
  name: "Thompson: full decision (single tool)",
  group: "thompson-decision",
  baseline: true,
  fn: () => {
    makeDecision(toolIds[0], 0.75, sampler, 1000);
  },
});

Deno.bench({
  name: "Thompson: full decision (5 tools)",
  group: "thompson-decision",
  fn: () => {
    for (const toolId of toolIds.slice(0, 5)) {
      makeDecision(toolId, 0.75, sampler, 1000);
    }
  },
});

Deno.bench({
  name: "Thompson: full decision (10 tools)",
  group: "thompson-decision",
  fn: () => {
    for (const toolId of toolIds.slice(0, 10)) {
      makeDecision(toolId, 0.75, sampler, 1000);
    }
  },
});

// ============================================================================
// Benchmarks: Comparison with Static Threshold
// ============================================================================

function staticDecision(score: number, threshold: number = 0.7): boolean {
  return score >= threshold;
}

Deno.bench({
  name: "Static threshold: single decision",
  group: "thompson-vs-static",
  baseline: true,
  fn: () => {
    staticDecision(0.75);
  },
});

Deno.bench({
  name: "Thompson: single decision",
  group: "thompson-vs-static",
  fn: () => {
    makeDecision(toolIds[0], 0.75, sampler, 1000);
  },
});

// ============================================================================
// Cleanup
// ============================================================================

globalThis.addEventListener("unload", () => {
  console.log("\nThompson Sampling Benchmark Summary:");
  console.log(`- Tools tested: ${toolIds.length}`);
  console.log(`- Pre-populated observations: ~100`);
  console.log("");
  console.log("Thompson Sampling (ADR-049) provides:");
  console.log("- Per-tool adaptive thresholds");
  console.log("- UCB exploration bonus for new tools");
  console.log("- Bayesian updating with each observation");
});
