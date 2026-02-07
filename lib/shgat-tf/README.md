# SHGAT-TF

SuperHyperGraph Attention Networks with TensorFlow FFI for Deno.

Multi-level message passing on hypergraphs with K-head attention scoring,
designed for tool/capability selection in agentic systems.

## Features

- **Multi-level message passing**: V→E→...→V across hierarchy levels
- **K-head attention**: 4-16 adaptive heads with InfoNCE contrastive loss
- **Sparse message passing**: ~10x faster training on large graphs
- **PER training**: Prioritized Experience Replay for sample efficiency
- **Curriculum learning**: Easy→hard negative sampling with temperature annealing
- **libtensorflow FFI**: Native C performance via `Deno.dlopen` (no WASM overhead)

## Requirements

- Deno 2.x+
- libtensorflow 2.x (see [installation](#tensorflow-installation))

## Installation

```bash
deno add jsr:@casys/shgat-tf
```

### TensorFlow Installation

SHGAT-TF uses libtensorflow via Deno FFI. Install the shared library:

```bash
# Linux (x86_64)
curl -L https://storage.googleapis.com/tensorflow/libtensorflow/libtensorflow-cpu-linux-x86_64-2.16.1.tar.gz | \
  sudo tar -xz -C /usr/local
sudo ldconfig

# macOS (arm64)
curl -L https://storage.googleapis.com/tensorflow/libtensorflow/libtensorflow-cpu-darwin-arm64-2.16.1.tar.gz | \
  sudo tar -xz -C /usr/local
```

## Quick Start

```typescript
import { createSHGAT, generateDefaultToolEmbedding, type Node } from "@casys/shgat-tf";

// Create nodes (leaves have children: [], composites list their children)
const nodes: Node[] = [
  { id: "tool-a", embedding: generateDefaultToolEmbedding("tool-a", 1024), children: [], level: 0 },
  { id: "tool-b", embedding: generateDefaultToolEmbedding("tool-b", 1024), children: [], level: 0 },
  {
    id: "cap-1",
    embedding: new Array(1024).fill(0).map(() => Math.random()),
    children: ["tool-a", "tool-b"],
    level: 0, // computed automatically by createSHGAT
  },
];

const shgat = createSHGAT(nodes);

// Score composite nodes for an intent
const intentEmbedding = new Array(1024).fill(0).map(() => Math.random());
const scores = shgat.scoreNodes(intentEmbedding, 1); // 1 = composites only
console.log(scores[0]); // { nodeId: "cap-1", score: 0.73, ... }
```

## Training

Use `AutogradTrainer` for training with TensorFlow.js automatic differentiation:

```typescript
import { AutogradTrainer, type TrainingExample } from "@casys/shgat-tf";

const trainer = new AutogradTrainer({
  numHeads: 16,
  embeddingDim: 1024,
  learningRate: 0.05,
});

const examples: TrainingExample[] = [
  {
    intentEmbedding: new Array(1024).fill(0),
    contextTools: ["tool-a"],
    candidateId: "cap-1",
    outcome: 1,
    negativeCapIds: ["cap-2", "cap-3"],
  },
];

const metrics = trainer.trainBatch(examples);
console.log(`Loss: ${metrics.loss}, Accuracy: ${metrics.accuracy}`);
```

### Prioritized Experience Replay (PER)

```typescript
import { PERBuffer } from "@casys/shgat-tf";

const buffer = new PERBuffer(examples, { alpha: 0.6, beta: 0.4 });
const { items, weights, indices } = buffer.sample(batchSize, beta);
```

## Persistence

SHGAT params are plain objects:

```typescript
// Export
const params = shgat.exportParams();
await Deno.writeTextFile("model.json", JSON.stringify(params));

// Import
const loaded = JSON.parse(await Deno.readTextFile("model.json"));
shgat.importParams(loaded);
```

## Configuration

```typescript
import { SHGAT, DEFAULT_SHGAT_CONFIG } from "@casys/shgat-tf";

const shgat = new SHGAT({
  ...DEFAULT_SHGAT_CONFIG,
  embeddingDim: 1024,    // BGE-M3 embeddings
  numHeads: 16,          // K-head attention
  headDim: 64,           // Per-head dimension
  numLayers: 2,          // Message passing layers
  dropout: 0.1,          // Dropout rate
  learningRate: 0.05,    // SGD learning rate
});
```

## Architecture

```
Intent embedding (1024-dim)
        |
        v
  K-head Attention Scoring (16 heads x 64D)
        |
        v
  Multi-level Message Passing
     UPWARD:   Tools(H) → E^0 → E^1 → ... → E^L
     DOWNWARD: E^L → ... → E^1 → E^0 → Tools(H_enriched)
        |
        v
  InfoNCE Contrastive Loss (with temperature annealing)
        |
        v
  Ranked capability/tool scores
```

## API Reference

### Core

| Export | Description |
|--------|------------|
| `SHGAT` | Main class with scoring, training, persistence |
| `createSHGAT()` | Factory from unified `Node[]` (recommended) |
| `DEFAULT_SHGAT_CONFIG` | Default configuration |

### Training

| Export | Description |
|--------|------------|
| `AutogradTrainer` | TF autograd-based trainer |
| `sparseMPForward()` | Sparse message passing forward |
| `sparseMPBackward()` | Sparse message passing backward |
| `PERBuffer` | Prioritized Experience Replay |
| `annealTemperature()` | Temperature scheduling |

### Graph

| Export | Description |
|--------|------------|
| `GraphBuilder` | Hypergraph construction |
| `computeHierarchyLevels()` | Hierarchy level computation |
| `buildMultiLevelIncidence()` | Incidence matrix construction |

### TensorFlow FFI

| Export | Description |
|--------|------------|
| `initTensorFlow()` | Initialize libtensorflow backend |
| `tff.*` | Low-level FFI tensor operations |
| `tensor()`, `matMul()`, `softmax()` | High-level tensor ops |

## License

MIT
