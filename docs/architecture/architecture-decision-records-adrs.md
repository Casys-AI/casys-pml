# Architecture Decision Records (ADRs)

## ADR-001: PGlite over SQLite for Vector Search

**Decision:** Use PGlite (PostgreSQL WASM) with pgvector instead of SQLite + sqlite-vec

**Rationale:**

- sqlite-vec v0.1.0 lacks HNSW index (full-scan only)
- pgvector provides production-ready HNSW + IVFFlat
- PGlite is embedded (3MB WASM), preserves portability requirement
- Deno compatibility verified (npm:@electric-sql/pglite)
- Trade-off: 3MB overhead vs <1MB SQLite, acceptable for performance gain

**Consequences:**

- Enables <100ms P95 vector search (NFR001)
- Single-file portability maintained
- PostgreSQL ecosystem access (future extensions)

**Alternatives Considered:**

- sqlite-vec: Rejected (no HNSW, future-only)
- DuckDB VSS: Rejected (experimental persistence, Deno support unclear)
- Full PostgreSQL: Rejected (breaks zero-config requirement)

---

## ADR-002: Custom DAG Implementation (Zero External Dependencies)

**Decision:** Implement DAG builder and executor from scratch, no external graph libraries

**Rationale:**

- Story 2.1 AC explicitly requires "custom, zero external dependency"
- Topological sort is ~50 LOC (simple algorithm)
- Avoids dependency bloat for single-purpose feature
- Educational value for agents implementing this

**Consequences:**

- Full control over algorithm
- No security vulnerabilities from external deps
- More testing required (edge cases, cycles)

---

## ADR-003: BGE-M3 for Local Embeddings

**Decision:** Use BGE-M3 (Xenova/bge-m3) via @huggingface/transformers v3.7.6 (local inference)

**Rationale:**

- 1024-dim embeddings (good quality/size trade-off)
- Local inference = no API calls, no API keys, privacy preserved
- Deno compatible via npm: prefix
- Multi-lingual support (M3 = Multi-lingual, Multi-granularity, Multi-task)
- SOTA open model for semantic search

**Consequences:**

- 4GB RAM requirement (model in memory)
- ~60s initial embedding generation for 200 tools (acceptable per Story 1.4 AC)
- No usage costs (vs OpenAI embeddings API)

---

## ADR-004: stdio Transport Primary, SSE Optional

**Decision:** MCP gateway uses stdio transport as primary, SSE as optional enhancement

**Rationale:**

- MCP servers commonly use stdio (Claude Code default)
- SSE adds complexity (HTTP server required)
- Story 2.4 AC: "stdio mode primary"
- Local CLI tool doesn't need HTTP transport MVP

**Consequences:**

- Simpler architecture (no HTTP server MVP)
- SSE available for future remote deployment
- Gateway compatible with all stdio MCP servers

---

## ADR-005: Graphology for GraphRAG (True Graph Algorithms)

**Decision:** Use Graphology library for graph algorithms instead of pseudo-GraphRAG with recursive
CTEs in PostgreSQL

**Context:** User insight: "et networkx ou un truc comme ca?" (what about networkx or something like
that?)

**Rationale:**

- Graphology is the "NetworkX of JavaScript" (~100KB)
- True graph algorithms: Real PageRank, Louvain community detection, bidirectional search
- 90% simpler SQL schema (just storage, no recursive CTEs)
- 3-5x performance improvement vs pseudo-SQL approach
- Hybrid architecture: PGlite stores data, Graphology computes metrics
- Better separation of concerns: Storage vs computation

**Consequences:**

- Enables true GraphRAG capabilities for workflow suggestion
- Simplifies database schema dramatically
- Fast graph operations (<100ms PageRank, <1ms shortest path)
- Foundation for speculative execution (THE feature)
- Small dependency footprint (~100KB vs implementing algorithms in SQL)

**Alternatives Considered:**

- Recursive CTEs + pseudo-PageRank: Rejected (90% more complex SQL, 3-5x slower)
- NetworkX (Python): Rejected (language barrier, would need Python runtime)
- Full graph database (Neo4j): Rejected (breaks portability requirement)

**User Confirmation:** "Ouai cest mieux je pense non?" (Yes it's better right?)

---

## ADR-006: Speculative Execution as Default Mode

**Decision:** Make speculative execution the default mode for high-confidence workflows (>0.85), not
an optional feature

**Context:** User insight: "et donc les algo graph aident la gateway a performer l action avant meme
l appel de claude non ? cetait l idee" (so the graph algorithms help the gateway perform the action
even before Claude's call, right? That was the idea)

**Rationale:**

- **THE feature** - core differentiator of AgentCards
- 0ms perceived latency (results ready when user confirms)
- Even with Claude confirmation dialogs, provides instant results vs 2-5s wait
- Context savings ($5-10/day) >> waste from occasional misspeculation ($0.50)
- GraphRAG provides confidence scores for safe speculation
- Multiple safety guardrails prevent dangerous operations

**Consequences:**

- Dramatic improvement in perceived performance
- Requires adaptive threshold learning (start conservative at 0.92)
- Need comprehensive safety checks for dangerous operations
- Metrics tracking for success/acceptance/waste rates
- Graceful fallback to suggestion mode on failure

**Safety Measures:**

- Never speculate on: delete, deploy, payment, send_email operations
- Cost limits: <$0.10 per speculative execution
- Resource limits: <5s execution time
- Confidence threshold: >0.85 minimum (adaptive learning from user feedback)

**User Confirmation:** "Ouai on peut essayer sans speculative mais on va pas se mentir, speculative
c est THE feature" (Yeah we can try without speculative but let's be honest, speculative IS THE
feature)

**Design Philosophy:** Optimistic execution with smart safeguards > Conservative suggestion-only
mode

---

## ADR-007: DAG Adaptatif avec Feedback Loops AIL/HIL et Re-planification Dynamique

**Decision:** Étendre ParallelExecutor avec architecture hybride: Event Stream + Command Queue +
MessagesState-inspired Reducers

**Context:** Le DAG executor actuel s'exécute de manière linéaire sans feedback loops, sans points
de décision agent/humain, sans multi-turn, et sans capacité de re-planification.

**Rationale:**

- Architecture hybride combine best practices de LangGraph MessagesState (reducers automatiques) +
  Event Stream (observability)
- Score 95/100 après analyse comparative de 8 options (vs 80/100 pour State Machine, 68/100 pour
  Sync Checkpoints)
- 15% code reduction grâce aux reducers automatiques (add_messages, add_tasks, add_decisions)
- Zero breaking changes - extension compatible de ParallelExecutor
- Time to market: 9-13h vs 20-30h pour alternatives (State Machine full refactoring)
- Performance préservée: Speedup 5x maintenu, speculation 23-30% gain

**Architecture:**

```typescript
// State avec reducers MessagesState-inspired
interface WorkflowState {
  messages: Message[]; // Reducer: append
  tasks: TaskResult[]; // Reducer: append
  decisions: Decision[]; // Reducer: append
  context: Record<string, any>; // Reducer: merge
}

// Event Stream + Command Queue + State Management
class ControlledExecutor extends ParallelExecutor {
  private state: WorkflowState;
  private commandQueue: AsyncQueue<Command>;
  private eventStream: TransformStream<ExecutionEvent>;

  async *executeStream(dag: DAGStructure, config: ExecutionConfig) {
    // Non-blocking, observable, avec state management robuste
  }
}
```

**Consequences:**

- ✅ 100% requirements: AIL, HIL, multi-turn, dynamic DAG, GraphRAG re-trigger
- ✅ Modern patterns: LangGraph v1.0 MessagesState best practices (2025)
- ✅ Observability: Event stream pour monitoring temps réel
- ✅ Production-ready: Patterns éprouvés (LangGraph + Prefect + Event-Driven.io)
- ✅ Un seul agent: Conversation continue, pas de filtering contexte
- ⚠️ Complexité moyenne: Event-driven + reducers (patterns standards)

**Checkpoint Architecture:**

- Sauvegarde: WorkflowState complet (tasks, decisions, messages, context)
- Ne sauvegarde PAS: Filesystem state, external side-effects
- Epic 2.5 = orchestration primarily → Checkpoints suffisants
- Epic 3 (Sandbox) gérera isolation complète des modifications de code

**Context Management:**

- Un seul agent Claude en conversation continue
- Agent voit tous les MCP results (comportement normal de Claude)
- Pas de pruning/summary pour agent (décisions informées)
- Summary seulement pour HIL (affichage UI humain)
- Coût AIL: Minimal (conversation continue)
- Coût HIL: ~500-1000 tokens (generation summary UI)

**Implementation:** 4 sprints progressifs (9-13h total)

1. Sprint 1: State Management & Checkpoints avec reducers (2-3h)
2. Sprint 2: Command Queue & Agent Control (2-3h)
3. Sprint 3: Event-Driven + Human Loop (2-3h)
4. Sprint 4: Speculative Execution (3-4h)

**3-Loop Learning Architecture:**

- **Loop 1 (Execution):** Event stream, state management, checkpoints (milliseconds)
- **Loop 2 (Adaptation):** AIL/HIL, dynamic replanning, GraphRAG re-queries (seconds-minutes)
- **Loop 3 (Meta-Learning):** Knowledge graph updates, pattern learning (per-workflow)

**References:**

- Technical Research: `docs/research-technical-2025-11-13.md`
- Spike: `docs/spikes/spike-agent-human-dag-feedback-loop.md`
- ADR Detail: `docs/adrs/ADR-007-dag-adaptive-feedback-loops.md`
- ADR-008: `docs/adrs/ADR-008-episodic-memory-adaptive-thresholds.md` (Extension Loop 3)

**User Insight:** "maintenant dans langgraph ya le message state je crois qui est plus flexible" -
Analysis révèle que MessagesState + Event Stream sont complémentaires, pas opposés.

**Status:** ✅ Approved v2.0 (2025-11-14) - Implemented

---

## ADR-008: Episodic Memory & Adaptive Thresholds for Meta-Learning

**Decision:** Extend Loop 3 (Meta-Learning) with episodic memory storage and adaptive threshold
learning

**Status:** 🟡 Partially Implemented (Phase 1 Done 2025-11-25)

**Rationale:**

- Complete the 3-loop learning architecture (ADR-007)
- Persist learning between sessions (thresholds survive restarts)
- Enable context-aware predictions via historical episode retrieval
- Implement sliding window algorithm (50 executions) for adaptive thresholds

**Implementation:**

- ✅ Phase 1: `EpisodicMemoryStore` (280 LOC), `AdaptiveThresholdManager` persistence (+100 LOC)
- 🔴 Phase 2: ControlledExecutor + DAGSuggester integrations (after Epic 2.5/3.5)

**Consequences:**

- Self-improving system targeting 85% success rate
- Thresholds adapt based on false positive/negative detection
- Historical context improves prediction accuracy

---

## ADR-017: Gateway Exposure Modes

**Decision:** Support multiple gateway exposure modes (meta-tools only, transparent proxy, hybrid)

**Status:** Proposed (2025-11-24)

**Rationale:**

- Resolves tension between PRD vision ("transparent gateway") and ADR-013 ("meta-tools only")
- Provides flexibility for different user mental models
- Addresses competitive positioning (drop-in replacement vs intent-based paradigm)

**Consequences:**

- Users can choose exposure mode based on preference
- Documentation aligned with actual behavior
- Broader addressable market

---

## ADR-022: Hybrid Search Integration in DAG Suggester

**Decision:** Make Hybrid Search (Semantic + Adamic-Adar + Graph Neighbors) the default for tool
discovery

**Status:** Accepted (2025-11-27)

**Rationale:**

- Pure semantic search misses intermediate/related tools not explicitly in prompt
- Story 5.1's hybrid search logic was trapped in `GatewayServer`, not reusable
- Hybrid approach finds "hidden gems" (e.g., `npm_install` between `git_clone` and `deploy`)

**Implementation:**

- Extract hybrid search into `GraphRAGEngine.searchToolsHybrid()`
- Update `DAGSuggester.suggestDAG()` to use hybrid search
- Deprecate direct `VectorSearch` for high-level discovery

**Consequences:**

- More robust DAGs with fewer missing intermediate steps
- Graph intelligence leveraged during candidate selection

---

## ADR-023: Dynamic Candidate Expansion for Hybrid Search

**Decision:** Implement dynamic expansion multiplier based on graph maturity (density)

**Status:** Proposed

**Rationale:**

- Static `limit * 2` is suboptimal for both cold start and mature graph scenarios
- Cold start: Extra candidates wasteful (no graph signal)
- Mature graph: Valuable tools might be semantically distant

**Implementation:**

- `expansion_multiplier` based on graph density:
  - Cold start (<0.01 density): 1.5x
  - Growing (0.01-0.10): 2.0x
  - Mature (>0.10): 3.0x

**Consequences:**

- Efficient resource usage in cold start
- Better serendipitous discovery in mature systems

---

## ADR-024: Full Adjacency Matrix for Dependency Resolution

**Decision:** Replace triangular loop with full adjacency matrix in `buildDAG`

**Status:** Proposed

**Rationale:**

- Current greedy triangular approach creates ordering bias
- If Parent appears after Child in list, dependency is missed
- Risk increases with Hybrid Search injecting graph-related tools

**Implementation:**

- Check dependencies in both directions (N*N instead of N*(N-1)/2)
- Add cycle detection and breaking (keep edge with higher confidence)

**Consequences:**

- Order-independent dependency detection
- More robust DAG construction

---

## ADR-027: Execute Code Graph Learning

**Decision:** Track all tool calls from code execution and persist patterns to GraphRAG for capability learning

**Status:** Proposed (2025-12-03)

**Rationale:**

- Code execution generates valuable tool usage patterns
- Patterns should feed back into GraphRAG for improved suggestions
- Foundation for emergent capabilities system

**Consequences:**

- Every code execution contributes to system knowledge
- Improved tool suggestions based on real usage patterns
- Enables capability crystallization (Epic 7)

---

## ADR-028: Emergent Capabilities System

**Decision:** Implement eager learning where capabilities are stored after first successful execution, with lazy filtering for suggestions

**Status:** Proposed (2025-12-03)

**Rationale:**

- Storage is cheap (~2KB/capability), keep everything
- Filtering happens at suggestion time, not storage time
- Enables immediate discoverability of learned patterns
- Adaptive thresholds (from Epic 4) control suggestion quality

**Philosophy:**

- **Eager Learning:** Store immediately on first success (ON CONFLICT → UPDATE usage_count++)
- **Lazy Suggestions:** Filter by success_rate, usage_count, and adaptive thresholds

**Consequences:**

- Zero-latency capability availability
- No waiting for "3+ executions" pattern detection
- Quality control via suggestion filtering, not storage gating

---

## ADR-029: Hypergraph Capabilities Visualization

**Decision:** Use Cytoscape.js compound graphs to visualize capabilities as N-ary relationships containing multiple tools

**Status:** Proposed (2025-12-04)

**Rationale:**

- Capabilities connect N tools, not just 2 (N-ary relationships)
- Standard edge-based visualization fails to represent this
- Compound nodes (parent = capability, children = tools) accurately model the relationship
- Cytoscape.js supports compound layouts (fcose, cola)

**Consequences:**

- Accurate visual representation of capability structure
- Users can expand/collapse capabilities to explore tool composition
- Code panel integration for direct code reuse

---

## ADR-032: Sandbox Worker RPC Bridge

**Decision:** Replace subprocess-based sandbox with Deno Worker + RPC bridge for MCP tool execution

**Status:** Proposed (2025-12-05)

**Rationale:**

- `JSON.stringify(function) → undefined` - MCP client functions cannot be serialized to subprocess
- Original `wrapMCPClient()` silently failed in subprocess sandbox
- Worker RPC Bridge provides native tracing (no stdout parsing)
- `postMessage` API enables reliable function-like calls across isolation boundary

**Architecture:**

```
Main Process (WorkerBridge)     Worker (permissions: "none")
├── MCPClients                  ├── Tool proxies (__rpcCall)
├── traces[] (native)           ├── Capabilities (inline functions)
└── callTool() routing          └── User code execution
```

**Consequences:**

- MCP tools actually work in isolated sandbox
- Native tracing without stdout parsing fragility
- Foundation for capability injection (Option B - inline functions)
- Enables emergent capabilities learning

---

## ADR-038: Scoring Algorithms & Formulas Reference

**Decision:** Centraliser toutes les formules de scoring (Hybrid Search, Next Step Prediction, Capability Match, Strategic Discovery) dans un ADR unique et les relier explicitement aux composants (`graph-engine`, `dag-suggester`, capabilities).

**Status:** Draft (2025-12-08)

**Highlights:**

- Clarifie la matrice « Tool vs Capability / Active vs Passive ».
- Documente l’usage de Louvain, Adamic-Adar, PageRank, Spectral Clustering.
- Introduit un inventaire de « magic numbers » (poids, boosts) à monitorer via observabilité.

---

## ADR-039: Algorithm Observability & Adaptive Weight Preparation

**Decision:** Ajouter une couche d’observabilité dédiée aux algorithmes de scoring (ADR-038) via une table `algorithm_traces` et une structure de trace unifiée (`AlgorithmTraceRecord`).

**Status:** Proposed (2025-12-08)

**Highlights:**

- Log des signaux bruts (semantic_score, success_rate, spectral_cluster_match, etc.).
- Stockage des paramètres utilisés (alpha, reliability_factor, structural_boost).
- Suivi des décisions (accepted/rejected) et des outcomes (selected/ignored, succès d’exécution).
- Prépare le terrain pour un futur « learning to rank » (ajustement automatique des poids).

---

_Generated by BMAD Decision Architecture Workflow v1.3.2_ _Date: 2025-11-03_ _Updated: 2025-11-14
(ADR-007 Approved - Pattern 4: 3-Loop Learning Architecture with Checkpoint & Context Management
clarifications)_ _Updated: 2025-11-24 (ADR-019 - Two-Level AIL Architecture, MCP compatibility
corrections)_ _Updated: 2025-11-28 (Sync with PRD: BGE-M3 model, Epics 3.5-6 mapping, ADRs
008/017/022-024, modules learning/speculation)_ _Updated: 2025-12-06 (Epic 7 & 8 alignment, ADRs
027/028/029/032, Pattern 6 Worker RPC Bridge, Pattern 7 Hypergraph Visualization)_ _Updated:
2025-12-08 (ADR-038 Scoring Algorithms Reference, ADR-039 Algorithm Observability)_ _For: BMad_
