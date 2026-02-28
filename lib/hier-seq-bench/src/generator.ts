import type { ExpansionRule, GeneratorConfig, Level, Trace, VocabNode } from "./types.ts";
import { PARAPHRASES } from "./paraphrases.ts";

// Seeded PRNG — mulberry32 (same as used across the project)
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class TraceGenerator {
  private rng: () => number;
  private traceCounter = 0;

  constructor(
    private readonly nodes: Map<string, VocabNode>,
    private readonly grammar: Map<string, ExpansionRule>,
    private readonly config: GeneratorConfig,
  ) {
    this.rng = mulberry32(config.seed);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Generate a single trace from a given intent node. Returns null if too short/long. */
  generateTrace(intentNodeId: string): Trace | null {
    const intentNode = this.nodes.get(intentNodeId);
    if (!intentNode) throw new Error(`Unknown node: ${intentNodeId}`);

    const sequence: string[] = [];
    // Intent node itself never appears — only its children do
    this.expandChildren(intentNode, sequence);

    if (sequence.length < this.config.minSequenceLength) return null;
    if (sequence.length > this.config.maxSequenceLength) return null;

    const { text, idx } = this.sampleIntent(intentNode);
    return {
      id: `t${String(++this.traceCounter).padStart(6, "0")}`,
      intentNodeId,
      intentText: text,
      intentParaphraseIdx: idx,
      intentLevel: intentNode.level,
      sequence,
    };
  }

  /** Generate `n` valid traces by sampling intent nodes according to level weights. */
  generateDataset(n: number): Trace[] {
    const traces: Trace[] = [];
    const maxAttempts = n * 20;
    let attempts = 0;

    while (traces.length < n && attempts < maxAttempts) {
      attempts++;
      const intentNode = this.sampleIntentNode();
      const trace = this.generateTrace(intentNode.id);
      if (trace) traces.push(trace);
    }

    if (traces.length < n) {
      console.warn(`[hier-seq-bench] Only generated ${traces.length}/${n} traces after ${attempts} attempts`);
    }

    return traces;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  /**
   * A node ALWAYS appears in the sequence (it was triggered).
   * keepProbByLevel controls whether its sub-steps are ALSO shown inline.
   *
   * Semantics:
   *   keepProb=1.0  → opaque unit   (node appears, no sub-steps)
   *   keepProb=0.0  → transparent   (node appears, sub-steps follow immediately)
   *
   * The intent node itself never appears — only its children do (via expandChildren).
   * This guarantees: L4 intent → L3 children always visible in sequence.
   */
  private expandNode(node: VocabNode, sequence: string[]): void {
    // Always record this node — it was triggered
    sequence.push(node.id);

    // L0 = leaf, no sub-steps possible
    if (node.level === 0) return;

    // Roll: do we also show the internal sub-steps?
    const keepProb = this.config.keepProbByLevel[node.level as Level] ?? 0.5;
    if (this.rng() < keepProb) return; // opaque — node appears but no detail

    this.expandChildren(node, sequence);
  }

  /** Expand a node's children without adding the node itself (used for the intent root). */
  private expandChildren(node: VocabNode, sequence: string[]): void {
    const rule = this.grammar.get(node.id);
    if (!rule || rule.steps.length === 0) return;

    for (const step of rule.steps) {
      if (!step.required && this.rng() >= step.probability) continue;

      const child = this.nodes.get(step.nodeId);
      if (!child) {
        console.warn(`[hier-seq-bench] Missing child: ${step.nodeId} in rule for ${node.id}`);
        continue;
      }

      this.expandNode(child, sequence);
    }
  }

  private sampleIntent(node: VocabNode): { text: string; idx: number } {
    const options = PARAPHRASES[node.id];
    if (!options || options.length === 0) return { text: node.description, idx: -1 };
    const idx = Math.floor(this.rng() * options.length);
    return { text: options[idx], idx };
  }

  private sampleIntentNode(): VocabNode {
    const weights = this.config.intentLevelWeights;
    const candidates = Array.from(this.nodes.values())
      .map(n => ({ node: n, w: weights[n.level as Level] ?? 0 }))
      .filter(x => x.w > 0);

    const total = candidates.reduce((s, x) => s + x.w, 0);
    let r = this.rng() * total;

    for (const { node, w } of candidates) {
      r -= w;
      if (r <= 0) return node;
    }

    return candidates[candidates.length - 1].node;
  }
}
