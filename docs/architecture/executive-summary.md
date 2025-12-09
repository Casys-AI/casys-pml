# Executive Summary

_Updated: December 2025_

## Vision

**Casys Intelligence** (CAI) est un **MCP gateway intelligent** qui résout deux problèmes critiques
des écosystèmes MCP :

1. **Saturation du contexte LLM** — Les schémas d'outils consomment 30-50% de la fenêtre de contexte
   → réduit à **<5%**
2. **Latence séquentielle** — Les workflows multi-outils s'exécutent en série → parallélisés via
   **DAG execution** (5x speedup)

## Différenciation Clé

| Problème                  | Solution CAI                                | Bénéfice              |
| ------------------------- | ------------------------------------------- | --------------------- |
| 100+ tools = contexte saturé | Meta-tools only + semantic search on-demand | <5% contexte utilisé  |
| Workflows séquentiels     | DAG avec détection automatique des dépendances | 5x speedup            |
| Suggestions statiques     | GraphRAG (PageRank, Louvain, Adamic-Adar)   | Apprentissage continu |
| Exécution manuelle        | Speculative Execution (confidence > 0.85)   | 0ms latence perçue    |
| Code isolé des tools      | Sandbox avec injection MCP                  | Hybrid orchestration  |

## Architecture en 3 Couches

> **Diagramme interactif :** [architecture-overview.excalidraw](../diagrams/architecture-overview.excalidraw)

```
┌─────────────────────────────────────────────────────────────┐
│  COUCHE 1: ORCHESTRATION (Claude / LLM)                     │
│  • Reçoit l'intent utilisateur                              │
│  • Appelle les meta-tools CAI (cai:execute_dag, etc.)       │
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
│  filesystem, github, memory, slack, notion, tavily, etc.    │
└─────────────────────────────────────────────────────────────┘
```

## Stack Technologique

| Composant      | Technologie                  | Justification                                |
| -------------- | ---------------------------- | -------------------------------------------- |
| Runtime        | Deno 2.x                     | TypeScript natif, sécurisé par défaut        |
| Database       | PGlite (PostgreSQL WASM)     | Portable single-file, pgvector intégré       |
| ORM            | Drizzle ORM                  | Type-safe, migrations, users table           |
| Vector Search  | pgvector HNSW                | <100ms P95, 1024-dim embeddings              |
| Embeddings     | BGE-M3 (Transformers.js)     | 100% local, multi-lingue, SOTA open          |
| Graph Algorithms | Graphology                 | PageRank, Louvain, bidirectional search      |
| MCP Protocol   | @modelcontextprotocol/sdk    | Official SDK, stdio + HTTP transport         |
| Web UI         | Fresh 2 + Vite + Preact      | SSR, islands architecture, Tailwind 4        |
| Auth           | GitHub OAuth + API Keys      | Deno KV sessions, Argon2id hashing           |

## Métriques Cibles

| Métrique                   | Cible          | Status     |
| -------------------------- | -------------- | ---------- |
| Context usage              | <5%            | ✅ Atteint |
| Vector search P95          | <100ms         | ✅ Atteint |
| 5-tool workflow P95        | <3s            | ✅ Atteint |
| DAG speedup                | 5x vs séquentiel | ✅ Atteint |
| Speculation success rate   | >85%           | 🟡 En cours |

## Roadmap Épics

```
Epic 1-3   ✅ DONE      Foundation + DAG + Sandbox
Epic 3.5   ✅ DONE      Speculative Execution
Epic 4     🟡 PARTIAL   Episodic Memory (Phase 1 done)
Epic 5     ✅ DONE      Intelligent Discovery
Epic 6     ✅ DONE      Real-time Dashboard
Epic 7     🟡 PROGRESS  Emergent Capabilities
Epic 8     📋 PROPOSED  Hypergraph Visualization
Epic 9     🟡 PROGRESS  Authentication & Multi-tenancy (4/5 stories done)
```

### Epic 9 - Authentication (Current Focus)

| Story | Description                              | Status |
| ----- | ---------------------------------------- | ------ |
| 9.1   | Infrastructure Auth - Schema & Helpers   | ✅ Done |
| 9.2   | GitHub OAuth & Auth Routes               | ✅ Done |
| 9.3   | Auth Middleware & Mode Detection         | ✅ Done |
| 9.4   | Landing Page & Dashboard UI Auth         | ✅ Done |
| 9.5   | Rate Limiting & Data Isolation           | 📋 Backlog |

## Architecture d'Authentification

```
┌─────────────────────────────────┐     ┌──────────────────────────┐
│ Fresh Dashboard                 │     │ API Server (MCP Gateway) │
│ (prod:8080 / dev:8081)          │     │ (prod:3001 / dev:3003)   │
│                                 │     │                          │
│ Auth: Session Cookie            │     │ Auth: API Key Header     │
│ Protected: /dashboard, /settings│     │ Protected: All endpoints │
│ Public: /, /auth/*              │     │ Public: /health          │
└─────────────────────────────────┘     └──────────────────────────┘

Mode Detection: GITHUB_CLIENT_ID env var
  - Cloud Mode: OAuth required
  - Local Mode: Zero auth (bypass all checks)
```

## Principes Directeurs

1. **Boring Technology** — Préférer les solutions éprouvées (PGlite, Deno) aux expérimentales
2. **Local-First** — Toutes les données restent sur la machine de l'utilisateur (mode local)
3. **Zero-Config** — Auto-découverte des MCP servers, génération d'embeddings automatique
4. **Speculative by Default** — L'exécution spéculative est LA feature, pas une option
5. **Meta-Tools Only** — Expose des meta-tools intelligents, pas de proxying transparent

---

_Pour les détails techniques, voir les documents spécifiques :_

- [Project Structure](./project-structure.md) — Structure du projet
- [Novel Pattern Designs](./novel-pattern-designs.md) — Patterns architecturaux innovants
- [Technology Stack Details](./technology-stack-details.md) — Stack technique détaillé
- [ADRs](./architecture-decision-records-adrs.md) — Décisions techniques documentées
- [Epic Mapping](./epic-to-architecture-mapping.md) — Traçabilité PRD → Architecture
