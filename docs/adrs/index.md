# Architecture Decision Records

Index des décisions d'architecture du projet Casys Intelligence.

## Status Legend

| Status       | Description                                       |
| ------------ | ------------------------------------------------- |
| `draft`      | ADR en cours de rédaction (non encore proposée)   |
| `proposed`   | Proposé, en attente de validation d’équipe        |
| `accepted`   | Décision actée et faisant autorité                |
| `deprecated` | Obsolète, ne doit plus être utilisée              |
| `superseded` | Remplacé par une autre ADR (voir `superseded_by`) |
| `rejected`   | Proposée mais explicitement refusée               |

### Implementation Status

| Implementation | Description                                                       |
| -------------- | ----------------------------------------------------------------- |
| `not_started`  | Implémentation non commencée                                      |
| `in_progress`  | Implémentation en cours                                           |
| `done`         | Implémentation complète au niveau code                            |
| `partial`      | Implémentée partiellement (feature flags, périmètre réduit, etc.) |

---

## ADR Index

| #    | ADR                                                                                         | Status     | Implementation | Decision                                        |
| ---- | ------------------------------------------------------------------------------------------- | ---------- | -------------- | ----------------------------------------------- |
| 007  | [DAG Adaptive Feedback Loops](./ADR-007-dag-adaptive-feedback-loops.md)                     | accepted   | -              | 3-loop learning architecture AIL/HIL            |
| 008  | [Episodic Memory & Adaptive Thresholds](./ADR-008-episodic-memory-adaptive-thresholds.md)   | accepted   | -              | Meta-learning avec mémoire épisodique           |
| 009  | [JSON Configuration Format](./ADR-009-json-config-format.md)                                | accepted   | -              | JSON pour config MCP ecosystem                  |
| 010  | [Hybrid DAG Architecture](./ADR-010-hybrid-dag-architecture.md)                             | accepted   | -              | Nœuds externes vs logique interne               |
| 011  | [Sentry Integration](./ADR-011-sentry-integration.md)                                       | accepted   | -              | Error tracking & performance                    |
| 012  | [MCP STDIO Logging](./ADR-012-mcp-stdio-logging.md)                                         | accepted   | -              | Stratégie logging stdio MCP                     |
| 013  | [Tools/List Semantic Filtering](./ADR-013-tools-list-semantic-filtering.md)                 | accepted   | -              | Filtrage sémantique tools/list                  |
| 014  | [HTTP/SSE Transport](./ADR-014-http-sse-transport.md)                                       | accepted   | -              | Transport SSE pour gateway                      |
| 015  | [Dynamic Alpha Graph Density](./ADR-015-dynamic-alpha-graph-density.md)                     | accepted   | -              | Alpha dynamique selon densité                   |
| 016  | [REPL-Style Auto-Return](./ADR-016-repl-style-auto-return.md)                               | accepted   | -              | Auto-return code execution                      |
| 017  | [Gateway Exposure Modes](./ADR-017-gateway-exposure-modes.md)                               | accepted   | -              | Modes d'exposition gateway                      |
| 018  | [Command Handlers Minimalism](./ADR-018-command-handlers-minimalism.md)                     | accepted   | -              | Unified control plane                           |
| 019  | [Three-Level AIL Architecture](./ADR-019-three-level-ail-architecture.md)                   | superseded | -              | → ADR-020                                       |
| 020  | [AIL Control Protocol](./ADR-020-ail-control-protocol.md)                                   | accepted   | -              | Unified command architecture                    |
| 020b | [Graceful Shutdown Timeout](./ADR-020-graceful-shutdown-timeout.md)                         | accepted   | -              | Timeout guard shutdown                          |
| 021  | [Configurable Database Path](./ADR-021-configurable-database-path.md)                       | accepted   | -              | CAI_DB_PATH env var                      |
| 021b | [Workflow Sync Missing Nodes](./ADR-021-workflow-sync-missing-nodes.md)                     | accepted   | -              | Création nœuds manquants                        |
| 022  | [Hybrid Search Integration](./ADR-022-hybrid-search-integration.md)                         | accepted   | -              | Hybrid search DAG suggester                     |
| 023  | [Dynamic Candidate Expansion](./ADR-023-dynamic-candidate-expansion.md)                     | accepted   | -              | Expansion candidats hybrid                      |
| 024  | [Full Adjacency Matrix](./ADR-024-adjacency-matrix-dependencies.md)                         | accepted   | -              | Matrice dépendances complète                    |
| 025  | [MCP Streamable HTTP](./ADR-025-mcp-streamable-http-transport.md)                           | accepted   | -              | Transport HTTP streamable                       |
| 026  | [Cold Start Confidence](./ADR-026-cold-start-confidence-formula.md)                         | accepted   | -              | Formule confiance cold start                    |
| 027  | [Execute Code Graph Learning](./ADR-027-execute-code-graph-learning.md)                     | draft      | -              | Apprentissage graph code exec                   |
| 028  | [Emergent Capabilities System](./ADR-028-emergent-capabilities-system.md)                   | draft      | -              | Système capacités émergentes                    |
| 029  | [Hypergraph Visualization](./ADR-029-hypergraph-capabilities-visualization.md)              | draft      | -              | Visualisation hypergraph                        |
| 030  | [Gateway Real Execution](./ADR-030-gateway-real-execution.md)                               | draft      | -              | Implémentation exécution réelle                 |
| 031  | [Intelligent Dry-Run](./ADR-031-intelligent-dry-run.md)                                     | draft      | -              | Dry-run avec mocking MCP                        |
| 032  | [Sandbox Worker RPC Bridge](./ADR-032-sandbox-worker-rpc-bridge.md)                         | draft      | -              | Bridge RPC workers sandboxés                    |
| 033  | [Capability Code Deduplication](./ADR-033-capability-code-deduplication.md)                 | proposed   | -              | Déduplication code capacités                    |
| 034  | [Native OpenTelemetry](./ADR-034-native-opentelemetry-deno.md)                              | proposed   | -              | OTel natif Deno 2.2+                            |
| 035  | [Permission Sets Sandbox](./ADR-035-permission-sets-sandbox-security.md)                    | proposed   | -              | Permission sets Deno 2.5+                       |
| 036  | [BroadcastChannel Events](./ADR-036-broadcast-channel-event-distribution.md)                | proposed   | -              | Distribution events broadcast                   |
| 037  | [Deno KV Cache Layer](./ADR-037-deno-kv-cache-layer.md)                                     | proposed   | -              | Cache layer Deno KV                             |
| 038  | [Scoring Algorithms & Formulas Reference](./ADR-038-scoring-algorithms-reference.md)        | draft      | -              | Référence des algorithmes de scoring            |
| 039  | [Algorithm Observability & Adaptive Weights](./ADR-039-algorithm-observability-tracking.md) | proposed   | -              | Observabilité des algos & préparation des poids |

---

## By Status

### Accepted (20)

ADR-007 → ADR-026 (sauf ADR-019 superseded)

### Draft (7)

ADR-027, ADR-028, ADR-029, ADR-030, ADR-031, ADR-032, ADR-038

### Proposed (6)

ADR-033, ADR-034, ADR-035, ADR-036, ADR-037, ADR-039

### Superseded (1)

ADR-019 → remplacé par ADR-020

---

## Notes

- **Numérotation dupliquée** : ADR-020 et ADR-021 ont des doublons (020b, 021b) - à renommer
- **Status source** : Basé sur l'ancien dossier `accepted/` vs racine
- Pour changer un status, éditer ce fichier ET ajouter frontmatter YAML dans l'ADR
