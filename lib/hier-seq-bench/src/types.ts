export type Level = 0 | 1 | 2 | 3 | 4;

/**
 * A node in the hierarchy.
 * L0 = atomic action (leaf)
 * L1 = operation group
 * L2 = workflow
 * L3 = process
 * L4 = cross-domain scenario
 */
export interface VocabNode {
  id: string;         // "{domain}:{name}"  e.g. "data:read_file", "cross:customer-onboarding"
  level: Level;
  domain: string;
  name: string;
  description: string; // natural language — the intent that targets this node
  childIds: string[];  // direct children (one level below)
  parentIds: string[]; // filled by buildVocabulary()
}

/**
 * One step in an expansion rule.
 * required=false means the step is included stochastically (with `probability`).
 */
export interface ExpansionStep {
  nodeId: string;
  required: boolean;
  probability: number; // if !required: included with this prob
}

export interface ExpansionRule {
  parentId: string;
  steps: ExpansionStep[];
}

/**
 * A generated execution trace.
 *
 * The intent targets `intentNodeId` at any level.
 * The sequence is the resulting execution — a mix of levels,
 * because some sub-tasks are covered by existing parent nodes
 * (and stay at their level) while others are expanded into primitives.
 */
export interface Trace {
  id: string;
  intentNodeId: string;
  intentText: string;
  intentLevel: Level;
  /**
   * Index of the paraphrase used (0–4).
   * -1 means the node had no paraphrase list (fallback to description).
   * Used for paraphrase-aware train/test split:
   *   train → indices 0, 1, 2
   *   test  → indices 3, 4  (formulations never seen during training)
   */
  intentParaphraseIdx: number;
  sequence: string[]; // node IDs, mixed levels
}

export interface GeneratorConfig {
  /**
   * Probability that a non-L0 node stays as-is in the trace (not expanded).
   * L0 is always 1.0 (leaf).
   * A lower value = more expansion = more L0 in the trace (flatter).
   * A higher value = more compression = more parent nodes in the trace (hierarchical).
   */
  keepProbByLevel: Record<Level, number>;

  /**
   * Relative weight for choosing the intent level.
   * e.g. { 1: 1, 2: 3, 3: 2, 4: 1 } = L2 intents are 3× more likely than L1.
   */
  intentLevelWeights: Partial<Record<Level, number>>;

  minSequenceLength: number;
  maxSequenceLength: number;
  seed: number;
}

/** One training example for the GRU: (intent, history) → next node */
export interface PredictionStep {
  history: string[];    // sequence so far (from the trace start)
  target: string;       // next node ID to predict
  targetLevel: Level;
}

export interface TrainingExample {
  intent: string;
  intentNodeId: string;
  intentLevel: Level;
  sequence: string[];   // full sequence (for reference)
  steps: PredictionStep[];
}
