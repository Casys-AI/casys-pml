# SHGAT - SuperHyperGraph Attention Networks

A TypeScript implementation of SuperHyperGraph Attention Networks for learning relationships in hypergraphs with multi-level message passing.

## Features

- **Multi-level message passing**: V→E→...→V across hierarchy levels
- **K-head attention**: Adaptive head count (4-16) based on graph size
- **InfoNCE contrastive loss**: Temperature-annealed for stable training
- **PER training**: Prioritized Experience Replay for sample efficiency
- **Curriculum learning**: Easy→hard negative sampling
- **Zero dependencies**: Pure TypeScript, no external packages

## Installation

```bash
# Deno
deno add @pml/shgat

# npm (coming soon)
npm install @pml/shgat
```

## Quick Start

```typescript
import { createSHGATFromCapabilities, type TrainingExample } from "@pml/shgat";

// Create model from capabilities
const capabilities = [
  {
    id: "cap-1",
    embedding: new Array(1024).fill(0).map(() => Math.random()),
    toolsUsed: ["tool-a", "tool-b"],
    successRate: 0.85,
  },
  // ... more capabilities
];

const shgat = createSHGATFromCapabilities(capabilities);

// Score capabilities for an intent
const intentEmbedding = new Array(1024).fill(0).map(() => Math.random());
const scores = shgat.scoreAllCapabilities(intentEmbedding, ["tool-a"]);

console.log(scores[0]); // { capabilityId: "cap-1", score: 0.73, ... }
```

## Training

```typescript
// Prepare training examples
const examples: TrainingExample[] = [
  {
    intentEmbedding: [...],      // 1024-dim intent vector
    contextTools: ["tool-a"],    // Tools already used in context
    candidateId: "cap-1",        // Correct capability
    outcome: 1,                  // 1 = success, 0 = failure
    negativeCapIds: ["cap-2", "cap-3"], // Hard negatives
  },
];

// Train with K-head attention
const result = shgat.trainBatchV1KHeadBatched(
  examples,
  examples.map(() => 1.0), // IS weights (for PER)
  false,                   // evaluateOnly
  0.08,                    // temperature
);

console.log(`Loss: ${result.loss}, Accuracy: ${result.accuracy}`);
```

## Persistence

SHGAT params are plain objects - save them anywhere:

```typescript
// Export params
const params = shgat.exportParams();

// Save to file
await Deno.writeTextFile("model.json", JSON.stringify(params));

// Save to database
await db.query("UPDATE shgat_params SET params = $1", [JSON.stringify(params)]);

// Load later
const loaded = JSON.parse(await Deno.readTextFile("model.json"));
shgat.importParams(loaded);
```

## Configuration

```typescript
import { SHGAT, DEFAULT_SHGAT_CONFIG } from "@pml/shgat";

const shgat = new SHGAT({
  ...DEFAULT_SHGAT_CONFIG,
  embeddingDim: 1024,      // BGE-M3 embeddings
  numHeads: 8,             // K-head attention (auto-adaptive)
  numLayers: 2,            // Message passing layers
  dropout: 0.1,            // Dropout rate
  learningRate: 0.05,      // SGD learning rate
});
```

## API Reference

### Core Class

```typescript
class SHGAT {
  // Graph management
  registerCapability(cap: CapabilityNode): void;
  registerTool(tool: ToolNode): void;

  // Scoring
  scoreAllCapabilities(intent: number[], context: string[]): AttentionResult[];
  scoreCapability(intent: number[], capId: string, context: string[]): number;

  // Training
  trainBatchV1KHeadBatched(
    examples: TrainingExample[],
    weights?: number[],
    evaluateOnly?: boolean,
    temperature?: number,
  ): { loss: number; accuracy: number; tdErrors: number[]; gradNorm: number };

  // Persistence
  exportParams(): Record<string, unknown>;
  importParams(params: Record<string, unknown>): void;

  // Configuration
  setLearningRate(lr: number): void;
}
```

### Factory Functions

```typescript
// Create from capability list (recommended)
function createSHGATFromCapabilities(
  capabilities: Array<{
    id: string;
    embedding: number[];
    toolsUsed: string[];
    successRate: number;
  }>,
): SHGAT;
```

### Types

```typescript
interface TrainingExample {
  intentEmbedding: number[];
  contextTools: string[];
  candidateId: string;
  outcome: 0 | 1;
  negativeCapIds: string[];
  allNegativesSorted?: string[]; // For curriculum learning
}

interface AttentionResult {
  capabilityId: string;
  score: number;
  headScores: number[];
  headWeights: number[];
}
```

## Training Tips

### PER (Prioritized Experience Replay)

For sample-efficient training, use TD errors as priorities:

```typescript
import { PERBuffer } from "@pml/shgat";

const buffer = new PERBuffer(examples, { alpha: 0.6, beta: 0.4 });
const { items, weights, indices } = buffer.sample(batchSize, beta);

const result = shgat.trainBatchV1KHeadBatched(items, weights);
buffer.updatePriorities(indices, result.tdErrors);
```

### Curriculum Learning

Sort negatives by similarity, sample from easy→hard tiers:

```typescript
// allNegativesSorted: hardest first (most similar to positive)
const example = {
  ...baseExample,
  allNegativesSorted: sortedByCosineSimilarity,
  negativeCapIds: [], // Will be filled from tier
};
```

### Temperature Annealing

Start warm (0.10), cool down (0.06) for sharper predictions:

```typescript
for (let epoch = 0; epoch < 25; epoch++) {
  const temp = 0.10 - (0.10 - 0.06) * (epoch / 24);
  shgat.trainBatchV1KHeadBatched(examples, weights, false, temp);
}
```

## License

MIT
