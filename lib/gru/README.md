# @pml/gru — CompactInformedGRU

Sequence prediction model for PML tool orchestration. Given an intent and previously executed tools, predicts the next tool and termination.

## Architecture

- **~258K trainable** params, **660K frozen** (similarity_head from SHGAT)
- **5 inputs**: intentEmbedding (1024D), contextEmbeddings, positionEncoding, prevPrediction, compositeFeatures (from SHGAT scoreNodes)
- **GRU(64)** recurrent cell → emb_proj → similarity_head (frozen cosine scoring)
- **Separate termination head**: `[gruOutput, intentProj]=128D → Dense(32,relu) → Dense(1,sigmoid)`
- **VocabNode**: unified vocabulary (L0=leaf tools, L1+=capabilities)

## Quick Start

```bash
cd lib/gru
npm install

# Train on production traces only
npm run train -- --seed=42

# Train with n8n augmentation (recommended)
npm run train:n8n -- --seed=42 --n8n-weight=0.3 --oversample=3 --epochs=30

# Run E2E benchmark
node --max-old-space-size=4096 npx tsx src/benchmark-e2e.ts
```

## n8n Data Augmentation Pipeline

Uses n8n public workflow templates as training data augmentation.
No hard mapping n8n→PML needed — cosine similarity distributions are the training signal.

```bash
# Full pipeline (scrape → embed → build targets → export for SHGAT)
npm run n8n:pipeline

# Or step by step:
npm run n8n:scrape          # Scrape ~7800 workflows (name + description)
npm run n8n:embed           # BGE-M3 embeddings for n8n nodes + workflow intents
npx tsx src/n8n/embed-mcp-tools.ts  # BGE-M3 embeddings for 17K Smithery MCP tools (schema-enriched)
npm run n8n:targets -- --schema-alpha 0.8  # Soft targets with schema similarity blending
# Then for SHGAT training:
cd ../shgat-tf && DATABASE_URL=... npx tsx tools/export-dataset.ts  # Export Parquet for train-ob.ts
```

### Pipeline steps

| Step | Script | Output | Time |
|------|--------|--------|------|
| 1. Scrape | `scrape-n8n.ts` | `data/n8n-workflows.json` | ~15 min |
| 2. Embed n8n | `embed-n8n-nodes.ts` | `data/n8n-node-embeddings.json` + workflow desc embeddings | ~12 min |
| 3. Embed MCP | `embed-mcp-tools.ts` | `data/smithery-mcp-embeddings.json` (.parquet) | ~45 min |
| 4. Targets | `build-soft-targets.ts` | `data/n8n-training-examples.parquet` + expanded-vocab.json | ~5 min |
| 5. Export | `shgat-tf/tools/export-dataset.ts` | `data/bench-*.parquet` + bench-metadata.json | ~1 min |

### How soft targets work

1. Each n8n node type gets a BGE-M3 embedding (structured template: tool name, type, operation, params)
2. Each MCP tool gets a schema-enriched embedding (name + description + param names/types/enums)
3. `final_sim = α * cosine_sim(n8n_emb, mcp_emb) + (1-α) * jaccard_schema_sim` (default α=0.8)
4. `softmax(similarities / T=0.005)` → probability distribution over expanded vocab (PML + Smithery)
5. Top-K=10 sparse format, re-normalized → training target
6. GRU trains with KL divergence on these distributions (weighted by `--n8n-weight`)

Workflow description embeddings (name + description) serve as `intentEmbedding` — much better than the node embedding fallback.

### Scraper flags

```bash
npx tsx src/n8n/scrape-n8n.ts --max=10000 --min-views=0 --resume
```

### Embedder flags

```bash
npx tsx src/n8n/embed-n8n-nodes.ts              # Full (Phase 1 nodes + Phase 2 workflows)
npx tsx src/n8n/embed-n8n-nodes.ts --phase2-only # Only workflow intent embeddings
```

## Data files (gitignored)

| File | Size | Description |
|------|------|-------------|
| `n8n-workflows.json` | ~26 MB | Scraped workflows with nodes, edges, descriptions |
| `n8n-node-embeddings.json` | ~45 MB | BGE-M3 1024D embeddings per unique n8n node type |
| `n8n-workflow-description-embeddings.json` | ~155 MB | BGE-M3 1024D per workflow (name + description) |
| `smithery-mcp-tools.json` | ~300 MB | 17K+ Smithery MCP tools with schemas |
| `smithery-mcp-embeddings.json` | ~358 MB | BGE-M3 1024D schema-enriched embeddings |
| `n8n-training-examples.parquet` | ~104 MB | Sparse soft target examples (primary format) |
| `expanded-vocab.json` | ~27 MB | Combined PML + Smithery vocab with embeddings |
| `bench-*.parquet` + `bench-metadata.json` | ~135 MB | Exported dataset for SHGAT train-ob.ts |
| `n8n-shgat-contrastive-pairs.json` | ~160 MB | Contrastive pairs for SHGAT training |

## Environment

Requires `DATABASE_URL` in `.env` for `build-soft-targets.ts` (loads PML tool embeddings from PostgreSQL).

```
DATABASE_URL=postgres://user:pass@localhost:5432/casys
```

## Docs

- `docs/2026-02-09-n8n-augmentation-results.md` — Experiment results + reproduction
- `docs/2026-02-10-benchmark-e2e-results.md` — E2E benchmark (GRU-first vs SHGAT-first)
- `docs/2026-02-10-world-model-evaluation.md` — World model evaluation framework
