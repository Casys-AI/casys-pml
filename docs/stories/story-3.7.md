# Story 3.7: Code Execution Caching & Optimization

**Epic:** 3 - Agent Code Execution & Local Processing
**Story ID:** 3.7
**Status:** drafted
**Estimated Effort:** 4-6 heures

---

## User Story

**As a** developer running repetitive workflows,
**I want** code execution results cached intelligently,
**So that** I don't re-execute identical code with identical inputs.

---

## Acceptance Criteria

1. ✅ Code execution cache implemented (in-memory LRU, max 100 entries)
2. ✅ Cache key: hash(code + context + tool_versions)
3. ✅ Cache hit: Return cached result without execution (<10ms)
4. ✅ Cache invalidation: Auto-invalidate on tool schema changes
5. ✅ Cache stats logged: hit_rate, avg_latency_saved_ms
6. ✅ Configurable: `--no-cache` flag to disable caching
7. ✅ TTL support: Cache entries expire after 5 minutes
8. ✅ Persistence optional: Save cache to PGlite for cross-session reuse
9. ✅ Performance: Cache hit rate >60% for typical workflows

---

## Tasks / Subtasks

### Phase 1: Cache Implementation (2-3h)

- [ ] **Task 1: Create cache module** (AC: #1)
  - [ ] Créer `src/sandbox/cache.ts` module
  - [ ] Implémenter LRU cache (max 100 entries)
  - [ ] Créer interface `CacheEntry` avec result + timestamp + metadata
  - [ ] Exporter module dans `mod.ts`

- [ ] **Task 2: Cache key generation** (AC: #2)
  - [ ] Générer hash from code + context + tool_versions
  - [ ] Utiliser crypto hash (SHA-256 ou xxhash pour performance)
  - [ ] Format: `${hash(code)}_${hash(context)}_${toolVersionsHash}`
  - [ ] Gérer ordering de context keys (stable hash)

### Phase 2: Cache Operations (1-2h)

- [ ] **Task 3: Cache hit path** (AC: #3)
  - [ ] Check cache avant exécution
  - [ ] Si hit: return cached result immédiatement
  - [ ] Target latency: <10ms pour cache hit
  - [ ] Logger cache hit pour telemetry

- [ ] **Task 4: Cache invalidation** (AC: #4)
  - [ ] Détecter tool schema changes (via MCP server version)
  - [ ] Invalider tous les entries utilisant tool modifié
  - [ ] Hook dans MCP discovery pour invalidation automatique
  - [ ] Logger invalidations pour debugging

### Phase 3: TTL & Configuration (1h)

- [ ] **Task 5: TTL support** (AC: #7)
  - [ ] Default TTL: 5 minutes (300 seconds)
  - [ ] Check TTL à chaque cache access
  - [ ] Purger expired entries automatiquement
  - [ ] Configurable TTL via config.yaml

- [ ] **Task 6: Configuration & opt-out** (AC: #6)
  - [ ] CLI flag: `--no-cache` pour désactiver
  - [ ] Config option: `code_execution_cache: false`
  - [ ] Environment variable: `AGENTCARDS_NO_CACHE=1`
  - [ ] Default: cache enabled

### Phase 4: Persistence & Metrics (1-2h)

- [ ] **Task 7: Optional persistence to PGlite** (AC: #8)
  - [ ] Créer table `code_execution_cache` dans PGlite
  - [ ] Schema: `(cache_key TEXT PRIMARY KEY, result JSONB, created_at TIMESTAMP, expires_at TIMESTAMP)`
  - [ ] Save cache entries to DB (async, non-blocking)
  - [ ] Load cache from DB au startup
  - [ ] Config option: `cache_persistence: true|false` (default: false)

- [ ] **Task 8: Cache metrics** (AC: #5, #9)
  - [ ] Logger cache hit rate: `hits / (hits + misses)`
  - [ ] Logger avg latency saved: `avg(execution_time - cache_latency)`
  - [ ] Track hit rate >60% target
  - [ ] Dashboard-ready metrics pour telemetry

---

## Dev Notes

### Cache Architecture

**Cache Flow:**
```
1. Request: execute_code(code, context)
2. Generate cache_key = hash(code + context + tool_versions)
3. Check cache:
   - Hit? → Return cached result (<10ms)
   - Miss? → Execute code → Store in cache → Return result
4. Log metrics (hit/miss, latency)
```

**LRU Eviction:**
- Max 100 entries in memory
- Least Recently Used evicted when full
- TTL-based expiration (5 minutes default)

### Cache Key Design

**Components:**
1. **Code hash**: SHA-256 of TypeScript code string
2. **Context hash**: SHA-256 of sorted JSON.stringify(context)
3. **Tool versions**: MCP server version hashes (from discovery)

**Example:**
```typescript
const cacheKey = generateCacheKey({
  code: "const x = await github.listCommits({ limit: 10 }); return x.length;",
  context: { limit: 10 },
  toolVersions: { github: "v1.2.3" }
});
// Result: "a3f8d92_b4e1c67_c9d2f34"
```

**Why this works:**
- Same code + same context + same tool versions = deterministic result
- Tool version changes → invalidate (schema might have changed)

### Performance Characteristics

**Cache Hit:**
- Latency: <10ms (in-memory lookup)
- Savings: Avoid sandbox spawn (~100ms) + code execution (~1-10s)
- Speedup: 10-1000x faster

**Cache Miss:**
- Overhead: ~1ms (hash generation + cache check)
- Still execute code normally

**Target Hit Rate:**
- >60% for typical workflows (repetitive queries)
- Example: "Analyze commits" run 10 times → 9 cache hits

### Project Structure Alignment

**New Module: `src/sandbox/cache.ts`**
```
src/sandbox/
├── executor.ts           # Story 3.1
├── context-builder.ts    # Story 3.2
├── data-pipeline.ts      # Story 3.3
├── pii-detector.ts       # Story 3.5
├── cache.ts              # Story 3.6 (NEW)
└── types.ts              # Shared types
```

**Integration Points:**
- `src/sandbox/executor.ts`: Check cache before execution
- `src/mcp/gateway-server.ts`: Tool version tracking
- `src/db/client.ts`: Optional cache persistence

### Cache Persistence Schema

**PGlite Table:**
```sql
CREATE TABLE IF NOT EXISTS code_execution_cache (
  cache_key TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  context JSONB,
  result JSONB NOT NULL,
  tool_versions JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  hit_count INTEGER DEFAULT 0
);

CREATE INDEX idx_expires_at ON code_execution_cache(expires_at);
```

**Persistence Strategy:**
- Write to DB async (non-blocking)
- Read from DB at startup (warm cache)
- Cleanup expired entries via cron job (future)

### Testing Strategy

**Test Organization:**
```
tests/unit/sandbox/
├── cache_test.ts              # Cache operations tests
├── cache_key_test.ts          # Hash generation tests
└── cache_invalidation_test.ts # Invalidation logic tests

tests/benchmarks/
└── cache_performance_bench.ts # Cache hit/miss performance
```

**Test Scenarios:**
1. Cache hit: Same code + context → return cached result
2. Cache miss: Different code → execute and cache
3. Cache invalidation: Tool version change → invalidate entries
4. TTL expiration: Expired entry → execute and refresh
5. LRU eviction: 101st entry → evict oldest
6. Persistence: Save to DB → restart → load from DB

### Learnings from Previous Stories

**From Story 3.1 (Sandbox):**
- Execution time varies: 100ms-10s
- Caching saves significant latency
[Source: stories/story-3.1.md]

**From Story 3.2 (Tools Injection):**
- Tool versions tracked via MCP discovery
- Tool schema changes require invalidation
[Source: stories/story-3.2.md]

**From Story 3.3 (Data Pipeline):**
- Large dataset processing takes seconds
- Cache hit saves processing time
[Source: stories/story-3.3.md]

**From Story 3.4 (execute_code Tool):**
- Gateway integration patterns
- Metrics logging infrastructure
[Source: stories/story-3.4.md]

**From Story 1.2 (PGlite):**
- Database schema management
- Table creation patterns
[Source: stories/story-1.2.md]

### Configuration Example

**config.yaml:**
```yaml
code_execution:
  cache:
    enabled: true
    max_entries: 100
    ttl_seconds: 300  # 5 minutes
    persistence: false  # Optional: save to PGlite
```

**CLI Usage:**
```bash
# Enable cache (default)
./agentcards serve

# Disable cache
./agentcards serve --no-cache

# Environment variable
AGENTCARDS_NO_CACHE=1 ./agentcards serve
```

### Cache Metrics Dashboard

**Metrics Tracked:**
```typescript
{
  cache_hits: 45,
  cache_misses: 10,
  hit_rate: 0.818,  // 81.8%
  avg_latency_saved_ms: 2340,
  total_saved_ms: 105300  // ~105 seconds saved
}
```

**Telemetry Integration:**
```typescript
await telemetry.logMetric("code_execution_cache_hit_rate", hitRate);
await telemetry.logMetric("code_execution_cache_latency_saved", avgLatencySaved);
```

### Performance Optimizations

**Hash Function Choice:**
- SHA-256: Cryptographically secure but slower (~1ms)
- xxHash: Fast non-crypto hash (~0.1ms)
- **Recommendation**: xxHash for cache keys (speed > crypto strength)

**Context Normalization:**
```typescript
// Ensure stable hash for same context
const normalizeContext = (ctx: Record<string, unknown>) => {
  const sorted = Object.keys(ctx).sort().reduce((acc, key) => {
    acc[key] = ctx[key];
    return acc;
  }, {} as Record<string, unknown>);
  return JSON.stringify(sorted);
};
```

### Security Considerations

**Cache Poisoning:**
- Not a concern (local-only, no user-controlled cache)
- Cache key includes tool versions (prevents version confusion)

**Memory Limits:**
- LRU cache max 100 entries (~10MB memory max)
- No risk of memory exhaustion

### Limitations & Future Work

**Current Scope:**
- In-memory LRU cache (simple, fast)
- Optional persistence to PGlite

**Future Enhancements (out of scope):**
- Distributed cache (Redis) for multi-instance
- Smarter eviction policy (LFU, ARC)
- Cache warming (pre-populate common queries)

### Out of Scope (Story 3.6)

- E2E documentation (Story 3.7)
- Distributed caching
- Cache analytics dashboard

### References

- [Epic 3 Overview](../epics.md#Epic-3-Agent-Code-Execution--Local-Processing)
- [Story 3.1 - Sandbox](./story-3.1.md)
- [Story 3.2 - Tools Injection](./story-3.2.md)
- [Story 3.3 - Data Pipeline](./story-3.3.md)
- [Story 3.4 - execute_code Tool](./story-3.4.md)
- [Story 1.2 - PGlite Database](./story-1.2.md)

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

_To be filled by Dev Agent_

### Debug Log References

_Dev implementation notes, challenges, and solutions go here_

### Completion Notes List

_Key completion notes for next story (patterns, services, deviations) go here_

### File List

**Files to be Created (NEW):**
- `src/sandbox/cache.ts`
- `src/db/migrations/005_code_execution_cache.ts`
- `tests/unit/sandbox/cache_test.ts`
- `tests/unit/sandbox/cache_key_test.ts`
- `tests/unit/sandbox/cache_invalidation_test.ts`
- `tests/benchmarks/cache_performance_bench.ts`

**Files to be Modified (MODIFIED):**
- `src/sandbox/executor.ts` (integrate cache check)
- `src/sandbox/types.ts` (add cache types)
- `src/mcp/gateway-server.ts` (add --no-cache flag)
- `src/config/loader.ts` (load cache config)
- `mod.ts` (export cache module)

**Files to be Deleted (DELETED):**
- None

---

## Change Log

- **2025-11-09**: Story drafted by BMM workflow, based on Epic 3 requirements
