# Deployment Architecture

## Overview

AgentCards est conçu comme un outil **local-first** sans dépendances cloud pour le MVP. L'architecture supporte néanmoins une évolution vers des déploiements edge/cloud.

## Architecture de Déploiement

```
┌─────────────────────────────────────────────────────────────────────┐
│                     USER MACHINE (Local-First)                       │
│                                                                     │
│  ┌─────────────────┐     ┌─────────────────┐     ┌───────────────┐ │
│  │  Claude Desktop │────►│   AgentCards    │────►│  MCP Servers  │ │
│  │  (Claude Code)  │     │    Gateway      │     │  (15+ types)  │ │
│  └─────────────────┘     └────────┬────────┘     └───────────────┘ │
│                                   │                                 │
│                          ┌────────▼────────┐                       │
│                          │    PGlite DB    │                       │
│                          │ ~/.agentcards/  │                       │
│                          └─────────────────┘                       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Dashboard (Optional)                                        │   │
│  │  Fresh @ localhost:8080 ──SSE──► Gateway @ localhost:3001   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Modes de Déploiement

### Mode 1: CLI Binary (Production)

```bash
# Installation via deno install
deno install -Agf -n agentcards jsr:@agentcards/cli

# Usage direct
agentcards init     # Migration config MCP
agentcards serve    # Démarrage gateway
```

**Caractéristiques :**
- Single binary compilé (~50MB avec Deno runtime)
- Zero dépendances externes
- Portable entre machines

### Mode 2: Development (Source)

```bash
# Clone + run depuis source
git clone https://github.com/Casys-AI/mcp-gateway.git
cd AgentCards
deno task serve:playground
```

**Caractéristiques :**
- Hot reload avec `deno task dev`
- Accès debug logs
- Tests et benchmarks disponibles

### Mode 3: Docker (Future)

```dockerfile
# Future: Dockerfile
FROM denoland/deno:2.5.0
WORKDIR /app
COPY . .
RUN deno cache src/main.ts
CMD ["deno", "run", "-A", "src/main.ts", "serve"]
```

---

## Plateformes Supportées

| Platform | Architecture | Status | Notes |
|----------|-------------|--------|-------|
| macOS | x64 (Intel) | ✅ Testé | Primary dev platform |
| macOS | ARM64 (M1/M2) | ✅ Testé | Full support |
| Linux | x64 | ✅ Testé | CI/CD environment |
| Linux | ARM64 | 🟡 Non testé | Should work (Deno support) |
| Windows | x64 | 🟡 Via WSL | Native Deno possible |
| Windows | ARM64 | ❌ Non supporté | Deno support limited |

---

## Exigences Système

### Minimum

| Resource | Valeur | Justification |
|----------|--------|---------------|
| RAM | 4 GB | BGE-M3 model (~2GB) + HNSW index |
| Disk | 1 GB | Database + logs + model cache |
| CPU | 2 cores | Parallel DAG execution |
| Deno | 2.2+ LTS | Minimum stable version |

### Recommandé

| Resource | Valeur | Bénéfice |
|----------|--------|----------|
| RAM | 8 GB | Marge pour MCP servers multiples |
| Disk | 5 GB | Historique exécutions, episodic memory |
| CPU | 4+ cores | Meilleur parallélisme DAG |
| Deno | 2.5+ | Dernières optimisations |

---

## Structure Fichiers Runtime

```
~/.agentcards/                    # User data directory
├── config.yaml                   # Configuration utilisateur
├── agentcards.db                 # PGlite database (single file)
├── logs/
│   └── agentcards.log            # Application logs (rotated)
├── cache/
│   ├── embeddings/               # Cached model weights
│   └── results/                  # Execution result cache
└── checkpoints/                  # Workflow checkpoints (resume)
```

---

## Communication Inter-Processus

### Claude Desktop ↔ AgentCards

```
┌──────────────────┐          ┌──────────────────┐
│  Claude Desktop  │  stdio   │   AgentCards     │
│                  │◄────────►│   Gateway        │
│  (JSON-RPC)      │          │   (MCP Server)   │
└──────────────────┘          └──────────────────┘
```

**Protocole :** JSON-RPC 2.0 over stdio
- Pas de port réseau exposé
- Communication bidirectionnelle synchrone
- Timeout: 30s par requête

### AgentCards ↔ MCP Servers

```
┌──────────────────┐          ┌──────────────────┐
│   AgentCards     │  stdio   │   MCP Server     │
│   Gateway        │◄────────►│   (filesystem)   │
│                  │          │   (github)       │
│                  │          │   (memory)       │
└──────────────────┘          └──────────────────┘
```

**Process Management :**
- `Deno.Command` pour spawning
- Pool de connexions persistantes
- Restart automatique si crash

### Dashboard ↔ Gateway

```
┌──────────────────┐   SSE    ┌──────────────────┐
│   Fresh Web      │◄─────────│   AgentCards     │
│   Dashboard      │   HTTP   │   Gateway        │
│   :8080          │─────────►│   :3001          │
└──────────────────┘          └──────────────────┘
```

**Protocole :**
- SSE (Server-Sent Events) pour streaming temps réel
- REST pour commands (approve, abort, replan)
- WebSocket future option pour bidirectionnel

---

## Observability

### Logs

```typescript
// Structured logging via @std/log
import { getLogger } from "@std/log";
const logger = getLogger();

logger.info("Tool call", {
  server: "filesystem",
  tool: "read_file",
  duration_ms: 42,
});
```

**Levels :** DEBUG, INFO, WARN, ERROR, CRITICAL

### Metrics (Future: Epic 6)

| Metric | Type | Description |
|--------|------|-------------|
| `dag_execution_duration_ms` | Histogram | Temps d'exécution workflow |
| `tool_call_latency_ms` | Histogram | Latence par tool |
| `speculation_success_rate` | Gauge | Taux succès spéculation |
| `context_usage_percent` | Gauge | % contexte LLM utilisé |

### Tracing (Sentry Optional)

```bash
# Enable Sentry tracing
SENTRY_DSN=https://...@sentry.io/...
SENTRY_TRACES_SAMPLE_RATE=0.1
```

---

## Scaling Considerations

### Horizontal Scaling (Out of Scope MVP)

AgentCards est single-instance par design (état local). Pour multi-instance :

```
Future: Shared PGlite via S3/GCS + PGlite-sync
       └── Requires: Connection pooling, conflict resolution
```

### Vertical Scaling

| Bottleneck | Solution |
|------------|----------|
| RAM (embeddings) | Quantized models (future) |
| CPU (DAG) | Increase `maxConcurrency` config |
| Disk I/O | SSD recommended, NVMe optimal |

---

## Distribution Future

### Option 1: JSR Package

```bash
deno install -Agf jsr:@agentcards/cli
```

### Option 2: Homebrew

```bash
brew tap casys-ai/agentcards
brew install agentcards
```

### Option 3: npm (via deno compile)

```bash
npx @agentcards/cli serve
```

### Option 4: Deno Deploy (Edge)

```typescript
// Future: Worker mode for edge deployment
Deno.serve(agentcardsHandler);
```

---

*Références :*
- [Development Environment](./development-environment.md) - Setup développeur
- [Performance Considerations](./performance-considerations.md) - Optimisations
