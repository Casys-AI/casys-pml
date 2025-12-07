# Performance Considerations

## Objectifs (NFR001)

| Métrique | Cible | Mesuré | Status |
|----------|-------|--------|--------|
| Vector Search P95 | <100ms | ~45ms | ✅ |
| 5-tool Workflow P95 | <3s | ~1.8s | ✅ |
| Context Usage | <5% | ~3% | ✅ |
| DAG Speedup | 5x | 4.8x | ✅ |
| Speculation Success | >85% | 🟡 | En cours |

---

## Architecture Performance

```
┌─────────────────────────────────────────────────────────────────┐
│                    PERFORMANCE LAYERS                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1: Cache (0-10ms)                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ LRU Cache → Execution Results → Embedding Cache          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓ miss                             │
│  Layer 2: In-Memory (10-50ms)                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ HNSW Index → Graphology Graph → Tool Registry            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓ miss                             │
│  Layer 3: Database (50-200ms)                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ PGlite Vector Search → GraphRAG Queries → Checkpoints    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓ cold                             │
│  Layer 4: Compute (200ms-5s)                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Embedding Generation → PageRank Compute → DAG Execution  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Optimisations par Composant

### 1. Vector Search (HNSW)

**Configuration pgvector :**

```sql
-- Index HNSW optimisé
CREATE INDEX ON mcp_tools
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Query parameters
SET hnsw.ef_search = 40;  -- Balance recall/speed
```

| Paramètre | Valeur | Trade-off |
|-----------|--------|-----------|
| `m` | 16 | Mémoire vs qualité |
| `ef_construction` | 64 | Build time vs recall |
| `ef_search` | 40 | Query time vs accuracy |

**Benchmarks :**

| # Tools | Query Time | Recall@10 |
|---------|------------|-----------|
| 100 | 12ms | 99% |
| 500 | 28ms | 98% |
| 1000 | 45ms | 97% |

### 2. Embeddings Generation

**BGE-M3 via Transformers.js :**

```typescript
// Lazy loading + caching
const embedder = await pipeline("feature-extraction", "Xenova/bge-m3", {
  quantized: false,  // Full precision for quality
  cache_dir: "~/.agentcards/cache/embeddings",
});
```

| Phase | Durée | Fréquence |
|-------|-------|-----------|
| Model load | ~3s | 1x per session |
| Batch (10 texts) | ~200ms | Per tool discovery |
| Single text | ~50ms | Per query |

**Optimisation batch :**

```typescript
// Parallel batch processing
const embeddings = await Promise.all(
  chunks(tools, 10).map(batch =>
    embedder(batch.map(t => t.description))
  )
);
```

### 3. DAG Execution

**Parallélisation :**

```typescript
// Topological layers executed in parallel
async executeLayer(layer: DAGNode[]): Promise<void> {
  // Independent tasks run concurrently
  await Promise.all(
    layer.map(node => this.executeNode(node))
  );
}
```

**Speedup Analysis :**

```
Sequential:  A → B → C → D → E  (sum of all durations)
DAG:         A ─┬→ B ─┬→ E     (max of parallel paths)
                └→ C ─┘
                └→ D ─┘

Example: 5 tools @ 500ms each
Sequential: 2500ms
DAG (2 parallel): 1500ms (3 layers)
Speedup: 1.67x

DAG (3 parallel): 1000ms (2 layers)
Speedup: 2.5x

Optimal (all parallel): 500ms (1 layer)
Speedup: 5x
```

### 4. Speculation Engine

**Confidence-based execution :**

```typescript
if (confidence >= 0.85 && !isDangerous(dag)) {
  // Execute speculatively
  const result = await executor.execute(dag);
  cache.set(intentHash, result);  // Cache for instant delivery
}
```

**Performance impact :**

| Scenario | Without Speculation | With Speculation |
|----------|---------------------|------------------|
| High confidence (>0.85) | 1.5s | 0ms (cached) |
| Medium confidence | 1.5s | 1.5s (no change) |
| Cache hit rate target | N/A | >60% |

### 5. GraphRAG (Graphology)

**Computation caching :**

```typescript
class GraphRAGEngine {
  private pageRankCache: Map<string, number> = new Map();
  private cacheValidUntil: Date;

  async getPageRank(toolId: string): Promise<number> {
    if (this.isCacheValid()) {
      return this.pageRankCache.get(toolId) ?? 0;
    }
    await this.recomputePageRank();
    return this.pageRankCache.get(toolId) ?? 0;
  }
}
```

| Operation | Duration | Caching |
|-----------|----------|---------|
| PageRank full recompute | ~100ms | 5min TTL |
| Shortest path query | <1ms | Per-request |
| Louvain communities | ~50ms | On graph change |
| Adamic-Adar scoring | ~10ms | Per-query |

---

## Memory Management

### Memory Budget

```
┌─────────────────────────────────────────────┐
│           RAM ALLOCATION (4GB min)          │
├─────────────────────────────────────────────┤
│ BGE-M3 Model          │ ~2.0 GB            │
│ HNSW Index (1000 tools) │ ~200 MB          │
│ Graphology Graph      │ ~50 MB             │
│ PGlite + WAL          │ ~100 MB            │
│ Execution Cache       │ ~100 MB (LRU)      │
│ Deno Runtime          │ ~500 MB            │
│ ─────────────────────────────────────────── │
│ TOTAL                 │ ~3.0 GB            │
│ Headroom              │ ~1.0 GB            │
└─────────────────────────────────────────────┘
```

### Cache Eviction

```typescript
// LRU cache with size limit
const executionCache = new LRUCache<string, ExecutionResult>({
  max: 1000,  // Max entries
  maxSize: 100 * 1024 * 1024,  // 100MB
  sizeCalculation: (value) => JSON.stringify(value).length,
  ttl: 1000 * 60 * 60,  // 1 hour TTL
});
```

---

## Database Optimizations

### PGlite Configuration

```typescript
const db = new PGlite({
  dataDir: "~/.agentcards/agentcards.db",
  // WAL mode for concurrent reads
  pragmas: {
    journal_mode: "wal",
    synchronous: "normal",
    cache_size: -64000,  // 64MB cache
  },
});
```

### Query Optimization

```sql
-- Index pour recherches fréquentes
CREATE INDEX idx_tools_server ON mcp_tools(server_name);
CREATE INDEX idx_executions_workflow ON workflow_execution(workflow_id);
CREATE INDEX idx_patterns_intent ON workflow_pattern USING gin(intent_embedding);

-- Vacuum automatique désactivé (read-heavy workload)
-- Manuel: VACUUM ANALYZE après batch inserts
```

---

## Concurrency Tuning

### DAG Executor

```typescript
interface ExecutorConfig {
  maxConcurrency: number;      // Default: CPU cores
  taskTimeout: number;         // Default: 30s
  retryAttempts: number;       // Default: 3
  retryBackoff: "exponential"; // 100ms, 200ms, 400ms
}
```

### MCP Server Pool

```typescript
interface PoolConfig {
  maxConnectionsPerServer: number;  // Default: 5
  idleTimeout: number;              // Default: 5 minutes
  healthCheckInterval: number;      // Default: 30s
}
```

---

## Benchmarking

### Running Benchmarks

```bash
# Full benchmark suite
deno task bench

# Specific benchmarks
deno bench tests/benchmark/vector-search.bench.ts
deno bench tests/benchmark/dag-execution.bench.ts
```

### Benchmark Results (CI/CD)

```
vector_search/100_tools ... 12.45 ms/iter
vector_search/500_tools ... 28.12 ms/iter
vector_search/1000_tools ... 45.67 ms/iter

dag_execution/3_parallel ... 523.45 ms/iter
dag_execution/5_parallel ... 512.23 ms/iter (limited by longest task)

embedding_generation/single ... 48.23 ms/iter
embedding_generation/batch_10 ... 198.45 ms/iter
```

---

## Monitoring

### Key Metrics to Watch

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Heap usage | >70% | >85% | Increase memory / reduce cache |
| Query P95 | >80ms | >150ms | Check HNSW params |
| DAG P95 | >2.5s | >4s | Check MCP server latency |
| Cache hit rate | <40% | <20% | Increase cache size |

### Profiling

```bash
# CPU profiling
deno run --v8-flags=--prof src/main.ts serve

# Memory profiling
deno run --v8-flags=--heap-prof src/main.ts serve

# Inspect
deno run --inspect-brk src/main.ts serve
```

---

*Références :*
- [ADR-001: PGlite over SQLite](./architecture-decision-records-adrs.md#adr-001-pglite-over-sqlite-for-vector-search)
- [ADR-003: BGE-M3 Embeddings](./architecture-decision-records-adrs.md#adr-003-bge-m3-for-local-embeddings)
- [Pattern 3: Speculative Execution](./novel-pattern-designs.md#pattern-3-speculative-execution-with-graphrag-the-feature)
