# Executive Summary

## Vision

AgentCards est un **MCP gateway intelligent** qui résout deux problèmes critiques des écosystèmes MCP :

1. **Saturation du contexte LLM** - Les schémas d'outils consomment 30-50% de la fenêtre de contexte → réduit à **<5%**
2. **Latence séquentielle** - Les workflows multi-outils s'exécutent en série → parallélisés via **DAG execution** (5x speedup)

## Différenciation Clé

| Problème | Solution AgentCards | Bénéfice |
|----------|---------------------|----------|
| 100+ tools = contexte saturé | Semantic vector search + chargement on-demand | <5% contexte utilisé |
| Workflows séquentiels | DAG avec détection automatique des dépendances | 5x speedup |
| Suggestions statiques | GraphRAG (PageRank, Louvain, Adamic-Adar) | Apprentissage continu |
| Exécution manuelle | Speculative Execution (confidence > 0.85) | 0ms latence perçue |
| Code isolé des tools | Sandbox avec injection MCP | Hybrid orchestration |

## Architecture en 3 Couches

> **Diagramme interactif :** [architecture-overview.excalidraw](../diagrams/architecture-overview.excalidraw)

```
┌─────────────────────────────────────────────────────────────┐
│  COUCHE 1: ORCHESTRATION (Claude / LLM)                     │
│  • Reçoit l'intent utilisateur                              │
│  • Appelle les meta-tools AgentCards                        │
│  • Voit uniquement les résultats agrégés                    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  COUCHE 2: GATEWAY INTELLIGENTE                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Vector Search│  │  DAG Engine  │  │  GraphRAG Engine │   │
│  │  (BGE-M3)    │  │  (Parallel)  │  │  (Graphology)    │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Speculation │  │   Learning   │  │    Sandbox       │   │
│  │   Engine     │  │   (Episodic) │  │   (Worker RPC)   │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  COUCHE 3: MCP SERVERS                                      │
│  filesystem, github, memory, slack, notion, etc.            │
└─────────────────────────────────────────────────────────────┘
```

## Stack Technologique

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| Runtime | Deno 2.5+ | TypeScript natif, sécurisé par défaut, npm compat |
| Database | PGlite (PostgreSQL WASM) | Portable single-file, pgvector intégré |
| Vector Search | pgvector HNSW | <100ms P95, 1024-dim embeddings |
| Embeddings | BGE-M3 (Transformers.js) | 100% local, multi-lingue, SOTA open |
| Graph Algorithms | Graphology | PageRank, Louvain, bidirectional search |
| MCP Protocol | @modelcontextprotocol/sdk | Official SDK, stdio + SSE transport |

## Métriques Cibles

| Métrique | Cible | Status |
|----------|-------|--------|
| Context usage | <5% | ✅ Atteint |
| Vector search P95 | <100ms | ✅ Atteint |
| 5-tool workflow P95 | <3s | ✅ Atteint |
| DAG speedup | 5x vs séquentiel | ✅ Atteint |
| Speculation success rate | >85% | 🟡 En cours |

## Roadmap Épics

```
Epic 1-3  ✅ DONE     Foundation + DAG + Sandbox
Epic 3.5  ✅ DONE     Speculative Execution
Epic 4    🟡 PARTIAL  Episodic Memory (Phase 1 done)
Epic 5    ✅ DONE     Intelligent Discovery
Epic 6    📋 DRAFTED  Real-time Dashboard
Epic 7    🟡 PROGRESS Emergent Capabilities
Epic 8    📋 PROPOSED Hypergraph Visualization
```

## Principes Directeurs

1. **Boring Technology** - Préférer les solutions éprouvées (PGlite, Deno) aux expérimentales
2. **Local-First** - Toutes les données restent sur la machine de l'utilisateur
3. **Zero-Config** - Auto-découverte des MCP servers, génération d'embeddings automatique
4. **Speculative by Default** - L'exécution spéculative est LA feature, pas une option

---

*Pour les détails techniques, voir les documents spécifiques :*
- [Novel Pattern Designs](./novel-pattern-designs.md) - Patterns architecturaux innovants
- [ADRs](./architecture-decision-records-adrs.md) - Décisions techniques documentées
- [Epic Mapping](./epic-to-architecture-mapping.md) - Traçabilité PRD → Architecture
