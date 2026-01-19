---
title: 'MCP Tools Auto-Sync at Stdio Startup'
slug: 'mcp-tools-auto-sync'
created: '2026-01-16'
status: 'complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Deno/TypeScript
  - MCP Protocol (stdio)
  - PML Package
files_to_modify:
  - packages/pml/src/cli/stdio-command.ts
  - packages/pml/src/types.ts
code_patterns: []
test_patterns: []
---

# Tech-Spec: MCP Tools Auto-Sync at Stdio Startup

**Created:** 2026-01-16

## Overview

### Problem Statement

Les tools des MCP servers configurés par l'utilisateur ne sont pas découverts automatiquement. Actuellement, l'user doit soit utiliser un script de sync séparé (`tools:sync`), soit les tools ne sont jamais indexés côté cloud. Cela empêche le moteur de routing/discovery de connaître les capabilities disponibles.

### Solution

Au démarrage de `pml stdio`, lire les serveurs MCP configurés dans `.pml.json`, les spawner temporairement, récupérer leurs tools via `list_tools`, et envoyer les schemas au cloud API pour stockage et génération d'embeddings.

### Configuration Utilisateur

L'utilisateur ajoute ses serveurs MCP personnalisés dans `.pml.json` :

```json
{
  "version": "0.3.0",
  "workspace": "/home/user/my-project",
  "cloud": {
    "url": "https://pml.casys.ai"
  },
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "notion": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-notion"],
      "env": {
        "NOTION_API_KEY": "${NOTION_API_KEY}"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    },
    "custom-local": {
      "command": "/usr/local/bin/my-custom-mcp",
      "args": ["--config", "./config.json"]
    }
  }
}
```

**Notes:**
- Les variables `${VAR}` sont résolues depuis `.env` ou l'environnement
- Supporte les serveurs npm (`npx -y @org/server`) et binaires locaux
- Chaque serveur a un `command` obligatoire, `args` et `env` optionnels

### Scope

**In Scope:**
- Nouvelle section `mcpServers` dans `.pml.json` pour que l'user configure ses serveurs
- Logique de sync au startup de `pml stdio`
- Spawn des serveurs → `list_tools` → collect schemas
- Endpoint cloud `/api/v1/tools/sync` pour recevoir et stocker les schemas
- Gestion des erreurs (timeout, serveurs indisponibles)

**Out of Scope:**
- Génération d'embeddings côté client (le cloud le fait)
- UI de configuration des serveurs
- Hot-reload si config change pendant que stdio tourne

## Context for Development

### Codebase Patterns

**1. Startup Flow in stdio-command.ts (lines 598-707)**
```typescript
// Current startup sequence:
1. resolveWorkspaceWithDetails() → workspace path
2. reloadEnv(workspace) → load .env for PML_API_KEY
3. Load config from .pml.json (exists check + JSON.parse)
4. loadUserPermissions(workspace) → permissions
5. syncRoutingConfig(cloudUrl) → tool routing rules  // ← INSERT MCP TOOLS SYNC HERE
6. SessionClient.register() → session with cloud
7. CapabilityLoader.create() → local tool execution
8. TraceSyncer init → execution traces
9. runStdioLoop() → stdin/stdout JSON-RPC
```

**2. Cloud Sync Pattern (routing/sync.ts)**
- Uses ETag/version for conditional fetch (304 Not Modified)
- 5s timeout with AbortController
- Graceful fallback to cache if offline
- Returns `{ success, updated, version, fromCache }`
- Pattern: fetch → validate → save cache → return config

**3. MCP Client Pattern (src/mcp/client.ts)**
- `MCPClient.extractSchemas()`: connect → listTools → close in finally
- Spawns process, waits for stdio, sends JSON-RPC
- Process is killed after extraction (`this.process.kill()`)
- Concurrent extraction with `Promise.all()` in SchemaExtractor

**4. Schema Extractor Pattern (src/mcp/schema-extractor.ts)**
- `extractAndStore()`: orchestrates full discovery workflow
- Iterates over server configs, spawns each, collects tools
- Stores in DB with `ON CONFLICT DO UPDATE`
- Returns `{ totalServers, successfulServers, failedServers, totalToolsExtracted, failures, duration }`

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `packages/pml/src/cli/stdio-command.ts` | Point d'entrée stdio, insert sync after routing config sync (line ~655) |
| `packages/pml/src/routing/sync.ts` | Pattern existant pour sync avec cloud (ETag, timeout, cache) |
| `packages/pml/src/types.ts` | Types PmlConfig à étendre avec `mcpServers` |
| `src/mcp/schema-extractor.ts` | Pattern pour extraction de schemas (concurrent, error handling) |
| `src/mcp/client.ts` | MCPClient.extractSchemas() pour spawn et list_tools |
| `tools/sync-tools.ts` | Référence standalone script (mais pour local DB, pas cloud) |
| `packages/pml/src/loader/stdio-manager.ts` | StdioManager pour process pooling |

### Technical Decisions

**TD-001: Config Location**
- Add `mcpServers` section to `.pml.json` (not separate file)
- Same structure as `mcp-servers.json` used server-side
- User can add their own servers to be indexed

**TD-002: Sync Timing**
- Sync happens at `pml stdio` startup, after routing config sync
- Non-blocking with timeout (5s per server, 30s total)
- Failure logs warning but doesn't block stdio startup

**TD-003: Cloud API Endpoint**
- New endpoint: `POST /api/v1/tools/sync`
- Accepts: `{ tools: ToolSchema[], serverId: string }`
- Cloud stores schemas and generates embeddings asynchronously
- Returns: `{ success: boolean, toolsReceived: number }`

**TD-004: Versioning & Change Detection**
- Hash MCP config to detect changes since last sync
- Store hash in cloud per session/user
- Skip sync if config unchanged (like routing ETag pattern)

**TD-005: Error Handling**
- Per-server timeout (5s) - if one hangs, others continue
- Collect successful servers, log failures
- Partial success is acceptable (3/5 servers OK = proceed)
- No retry on startup - user can run `pml tools:sync` manually

## Plan d'Implémentation

### Tâches

#### Phase 1: Types et Configuration (packages/pml)

**T1.1: Étendre PmlConfig avec mcpServers**
```typescript
// packages/pml/src/types.ts
interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;  // Supporte ${VAR} syntax
}

interface PmlConfig {
  // ... existing fields
  mcpServers?: Record<string, McpServerConfig>;
}
```

**T1.1b: Résolution des variables d'environnement**
```typescript
// packages/pml/src/tools-sync/env-resolver.ts
export function resolveEnvVars(
  env: Record<string, string> | undefined
): Record<string, string> {
  // Remplace ${VAR} par Deno.env.get("VAR") ou valeur du .env
}
```

**T1.2: Créer le module tools-sync**
- Nouveau fichier: `packages/pml/src/tools-sync/mod.ts`
- Exporter: `syncMcpTools()`, `McpToolsSyncResult`

#### Phase 2: Extraction des Schemas (packages/pml)

**T2.1: Lightweight MCP Client pour extraction**
```typescript
// packages/pml/src/tools-sync/mcp-extractor.ts
export async function extractToolsFromServer(
  serverId: string,
  config: McpServerConfig,
  timeoutMs: number = 5000
): Promise<{ tools: ToolSchema[]; error?: string }>
```

- Spawn le process MCP via stdio
- Envoie `initialize` + `tools/list`
- Kill après réponse (ou timeout)
- Pas de dépendance sur `src/mcp/client.ts` (package léger)

**T2.2: Orchestrateur de sync**
```typescript
// packages/pml/src/tools-sync/sync.ts
export async function syncMcpTools(
  config: PmlConfig,
  cloudUrl: string,
  apiKey: string,
  logger?: SyncLogger
): Promise<McpToolsSyncResult>
```

- Itère sur `config.mcpServers`
- Extraction concurrente avec `Promise.allSettled()`
- Timeout global 30s
- Retourne stats: `{ synced, failed, skipped, duration }`

#### Phase 3: Cloud Sync (packages/pml + cloud)

**T3.1: Hash de config pour change detection**
```typescript
// packages/pml/src/tools-sync/hash.ts
export function hashMcpConfig(servers: Record<string, McpServerConfig>): string
```

- SHA-256 de la config JSON canonique
- Stocké côté cloud par user/session

**T3.2: Appel API cloud**
```typescript
// packages/pml/src/tools-sync/cloud.ts
export async function sendToolsToCloud(
  tools: ToolSchema[],
  serverId: string,
  configHash: string,
  cloudUrl: string,
  apiKey: string
): Promise<{ success: boolean; cached: boolean }>
```

- `POST /api/v1/tools/sync`
- Header `If-None-Match: {configHash}` pour skip si inchangé
- Cloud répond 304 si déjà synced

**T3.3: Endpoint cloud (src/server)**
- Nouveau handler: `src/server/routes/api/v1/tools-sync.ts`
- Stockage dans `tool_schema` table
- Génération embeddings asynchrone (queue)

#### Phase 4: Intégration Stdio (packages/pml)

**T4.1: Appeler sync au startup**
```typescript
// packages/pml/src/cli/stdio-command.ts (après ligne ~655)
// Sync MCP tools to cloud (non-blocking)
if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
  syncMcpTools(config, cloudUrl, apiKey, stdioLogger)
    .then((result) => {
      if (result.synced > 0) {
        stdioLog.debug(`MCP tools synced: ${result.synced} tools from ${result.servers} servers`);
      }
    })
    .catch((err) => stdioLog.debug(`MCP tools sync failed: ${err}`));
}
```

- Non-bloquant (fire-and-forget avec .then/.catch)
- Log debug uniquement

**T4.2: Notification MCP optionnelle**
- Si sync réussit avec nouveaux tools → `sendNotification("info", "X new tools indexed")`
- Silencieux si rien de nouveau

### Critères d'Acceptation

| ID | Critère | Vérification |
|----|---------|--------------|
| AC1 | User peut ajouter `mcpServers` dans `.pml.json` | Config parsée sans erreur |
| AC2 | Au démarrage `pml stdio`, les serveurs sont spawnés | Logs debug montrent extraction |
| AC3 | Tools extraits sont envoyés au cloud | Endpoint reçoit les schemas |
| AC4 | Timeout 5s par serveur, 30s global | Pas de hang au startup |
| AC5 | Si un serveur fail, les autres continuent | Partial success logged |
| AC6 | Si config inchangée, skip sync (304) | Pas de re-upload inutile |
| AC7 | Cloud génère embeddings après réception | Tools cherchables via discover |
| AC8 | Startup stdio non bloqué par sync | Sync en background |

### Diagramme de Séquence

```
┌─────────┐     ┌──────────┐     ┌───────────┐     ┌─────────┐
│ pml     │     │ MCP      │     │ Cloud     │     │ DB +    │
│ stdio   │     │ Servers  │     │ API       │     │ Embed   │
└────┬────┘     └────┬─────┘     └─────┬─────┘     └────┬────┘
     │               │                 │                │
     │ spawn+init    │                 │                │
     ├──────────────►│                 │                │
     │ tools/list    │                 │                │
     ├──────────────►│                 │                │
     │◄──────────────┤ tools[]        │                │
     │ kill          │                 │                │
     ├──────────────►│                 │                │
     │               │                 │                │
     │ POST /tools/sync (hash, tools) │                │
     ├────────────────────────────────►│                │
     │               │                 │ store schemas │
     │               │                 ├───────────────►│
     │               │                 │ queue embed   │
     │               │                 ├───────────────►│
     │◄────────────────────────────────┤ {success}     │
     │               │                 │                │
```

## Additional Context

### Edge Cases à Considérer

- **Versioning**: Comment détecter si la config a changé depuis le dernier sync?
- **MCPs locaux vs remote**: Les MCPs locaux (filesystem, memory) n'ont pas besoin d'API keys
- **Timeouts**: Que faire si un serveur met trop de temps à répondre?
- **Partial success**: Si 3/5 serveurs réussissent, on continue avec ceux-là?

### Dependencies

- Cloud API doit exposer endpoint `/api/v1/tools/sync`
- `pml stdio` doit pouvoir spawner des processus MCP temporairement

### Impact sur le Serveur

**`config/.mcp-servers.json` sera supprimé au profit de `.pml.json` :**

- Les tool schemas viennent de la DB (synced par clients via `/api/v1/tools/sync`)
- Le serveur garde uniquement `std` (MiniTools internes, chargé différemment)
- `connectToMCPServers()` est déjà désactivé (code commenté)
- **Format unifié** : `.pml.json` avec section `mcpServers` pour client ET serveur
- À terme : supprimer `MCPServerDiscovery`, `findConfigFile()`, et toute la logique `.mcp-servers.json`

### Stratégie de Tests

**Tests Unitaires:**
- `mcp-extractor.ts`: Mock process spawn, vérifier JSON-RPC
- `hash.ts`: Déterminisme du hash, ordre des clés
- `cloud.ts`: Mock fetch, tester 200/304/500

**Tests d'Intégration:**
- Spawn vrai serveur MCP mock (`tests/mocks/mcp-server-mock.ts`)
- Vérifier extraction + envoi cloud
- Timeout handling

**Tests E2E (manuel):**
1. Ajouter `mcpServers` dans `.pml.json`
2. Lancer `pml stdio`
3. Vérifier logs debug
4. Appeler `pml:discover` pour confirmer tools indexés

### Notes

- Le cloud génère les embeddings, pas le client
- On spawn les serveurs juste pour `list_tools`, puis on les kill
- Similar à ce que fait `pml serve` avec `autoInitIfConfigChanged`
