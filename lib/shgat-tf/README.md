# SHGAT-TF

SuperHyperGraph Attention Networks with TensorFlow.js.

Multi-level message passing on hypergraphs with K-head attention scoring,
designed for tool/capability selection in agentic systems.

## Features

- **Multi-level message passing**: V→E→...→V across hierarchy levels
- **K-head attention**: 4-16 adaptive heads with InfoNCE contrastive loss
- **Dense TF.js autograd**: Automatic differentiation for training
- **PER training**: Prioritized Experience Replay for sample efficiency
- **Curriculum learning**: Easy→hard negative sampling with temperature annealing
- **Dual runtime**: Deno (WebGPU/WASM/CPU) + Node.js (tfjs-node C++ binding)

## Requirements

- Deno 2.x+ or Node.js 20+

## Quick Start

```typescript
import { SHGATBuilder } from "@casys/shgat-tf";

const nodes = [
  { id: "tool-a", embedding: toolAEmb, children: [] },
  { id: "tool-b", embedding: toolBEmb, children: [] },
  { id: "cap-1",  embedding: capEmb,   children: ["tool-a", "tool-b"] },
];

const shgat = await SHGATBuilder.create()
  .nodes(nodes)
  .training({ learningRate: 0.05, temperature: 0.10 })
  .build();

// Score nodes
const scores = shgat.score(intentEmbedding, ["cap-1"]);

// Train
const metrics = await shgat.trainBatch(examples);

// Cleanup
shgat.dispose();
```

## Training

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

```typescript
const params = shgat.exportParams();
await Deno.writeTextFile("model.json", JSON.stringify(params));

const loaded = JSON.parse(await Deno.readTextFile("model.json"));
shgat.importParams(loaded);
```

## Node.js Support

For Node.js, use the build script to generate a distribution with `@tensorflow/tfjs-node`:

```bash
cd lib/shgat-tf && ./scripts/build-node.sh
cd dist-node && npm install && npm test
```

This swaps `backend.ts` (Deno: WebGPU/WASM/CPU) with `backend.node.ts` (tfjs-node C++ binding).

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

### Recommended: Builder + Ports

| Export | Description |
|--------|------------|
| `SHGATBuilder` | Fluent builder for SHGAT instances |
| `SHGATScorer` | Scoring-only port interface |
| `SHGATTrainer` | Training-only port interface |
| `SHGATTrainerScorer` | Combined training + scoring port |

### Core

| Export | Description |
|--------|------------|
| `SHGAT` | Main class with scoring, training, persistence |
| `createSHGAT()` | Factory from unified `Node[]` |
| `DEFAULT_SHGAT_CONFIG` | Default configuration |

### Training

| Export | Description |
|--------|------------|
| `AutogradTrainer` | TF.js autograd-based trainer |
| `PERBuffer` | Prioritized Experience Replay |
| `annealTemperature()` | Temperature scheduling |

### Backend

| Export | Description |
|--------|------------|
| `initTensorFlow()` | Initialize backend (auto on import) |
| `switchBackend()` | Switch training/inference mode |
| `supportsAutograd()` | Check backend kernel support |

## License

MIT
