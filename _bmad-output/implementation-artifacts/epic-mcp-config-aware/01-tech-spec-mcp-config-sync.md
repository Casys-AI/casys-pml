---
title: 'MCP Config Sync - User-Defined Servers'
slug: 'mcp-config-sync'
created: '2026-01-27'
status: 'completed'
stepsCompleted: [1, 2, 3, 4, 5, 6, 7]
epic: 'epic-mcp-config-aware'
sequence: 1
tech_stack:
  - Deno/TypeScript
  - MCP Protocol (stdio/http)
  - PML Package
  - PGlite (tool_schema table)
files_to_modify:
  - packages/pml/src/types.ts
  - packages/pml/src/init/mod.ts
  - packages/pml/src/loader/capability-loader.ts
  - packages/pml/src/loader/stdio-manager.ts
  - src/db/migrations/
  - src/graphrag/sync/db-sync.ts
code_patterns:
  - StdioManager (spawn, initialize, call)
  - JSON-RPC 2.0 multiplexed requests
  - AJV schema validation
  - syncGraphFromDatabase() pattern
  - Migration pattern (numbered SQL files)
test_patterns:
  - Unit tests with mocked stdio
  - Integration tests with real MCP spawn
---

# Tech-Spec 01: MCP Config Sync - User-Defined Servers

**Epic:** MCP Config-Aware System
**Sequence:** 1 of 3 (Foundation)

**Created:** 2026-01-27

## Overview

### Problem Statement

**Le problème des schemas MCP:**

1. Les serveurs MCP ne révèlent leurs schemas (tools, input schemas) qu'une fois **connectés**
2. La connexion nécessite souvent une **API key** (ex: Exa, Anthropic, etc.)
3. **Côté serveur** (`src/mcp/client.ts`) : `MCPClient.listTools()` existe déjà et fait `tools/list`
4. **Côté client PML** (`packages/pml/`) : `CapabilityLoader` obtient les schemas via cloud registry, pas directement
5. Le registry cloud ne peut pas avoir tous les schemas sans toutes les API keys

**Conséquence:** Impossible de faire des suggestions config-aware sans les vrais schemas (côté client).

### Solution

**BYOK étendu aux MCPs — chaque user fournit ses MCPs + API keys:**

```
User configure SES MCPs dans .pml.json
        ↓
pml stdio startup
        ↓
Pour chaque MCP: spawn → initialize → tools/list
        ↓
Upsert tool_schema + tool_observations
        ↓
syncGraphFromDatabase() charge dans ToolNode
        ↓
Suggestions config-aware !
```

**Changements clés:**

1. **Étendre PmlConfig** avec `mcpServers` (même format que `.mcp.json`)
2. **Migration dans `pml init`** — proposer de copier les serveurs existants
3. **MCP Discovery** — appeler `tools/list` sur chaque MCP (NOUVEAU)
4. **Sync vers DB** — upsert `tool_schema` + insert `tool_observations`
5. **Gestion erreurs** — timeout, API key manquante, etc.

### Scope

**In Scope:**
- Extension `PmlConfig` avec `mcpServers`
- Migration `pml init` — détecter et copier serveurs existants
- MCP Discovery — spawn, initialize, tools/list pour chaque serveur
- DB Migration — créer table `tool_observations` (multi-tenant)
- Sync tool_observations → ToolNode.observedConfigs
- Gestion duplications (même tool, configs différentes)
- Gestion erreurs (timeout 10s, API key manquante, crash)
- Re-sync quand config change

**Out of Scope:**
- UI pour configurer les MCPs (user édite `.pml.json` manuellement)
- Génération automatique d'embeddings (utiliser existing flow)
- Agrégation cloud des configs entre users

## Context for Development

### Codebase Patterns

**1. StdioManager Pattern**
```typescript
// packages/pml/src/loader/stdio-manager.ts
await stdioManager.getOrSpawn(dep);  // Spawn ou réutilise process
await stdioManager.call(namespace, "tools/list", {});  // JSON-RPC call
// Timeout: 30s par call, 5min idle → shutdown
```

**2. MCP Protocol Handshake**
```typescript
// Lifecycle: spawn → initialize → call → shutdown
// Initialize: { protocolVersion: "2024-11-05", clientInfo: {...} }
// Response: server capabilities
// Then: "initialized" notification
```

**3. Tool Schema Storage**
```sql
-- tool_schema table (existing)
tool_id TEXT PRIMARY KEY,
server_id TEXT,
name TEXT,
description TEXT,
input_schema JSONB,
output_schema JSONB,
-- À ajouter:
-- config_availability supprimé, voir table tool_observations
```

**4. Sync Pattern**
```typescript
// src/graphrag/sync/db-sync.ts
async function syncGraphFromDatabase(db, graph) {
  // Load from tool_embedding → graph nodes
  // Load from tool_dependency → graph edges
  // → Ajouter: load observedConfigs from tool_observations into ToolNode
}
```

### Files to Reference

| File | Purpose | Key Code |
| ---- | ------- | -------- |
| `packages/pml/src/types.ts` | Types config | `PmlConfig`, `McpServerConfig` |
| `packages/pml/src/init/mod.ts` | Init command | `initProject()`, backup logic |
| `packages/pml/src/loader/stdio-manager.ts` | MCP connection | `spawn()`, `call()` |
| `packages/pml/src/loader/capability-loader.ts` | Tool loading | Pattern général |
| `src/db/migrations/` | DB migrations | Numbered SQL files |
| `src/graphrag/sync/db-sync.ts` | Graph sync | `syncGraphFromDatabase()` |
| `config/.mcp-servers.json` | Example format | Structure mcpServers |
| **`src/mcp/client.ts`** | **RÉFÉRENCE** | `listTools()` ligne 252 — implémentation existante côté serveur |
| **`src/infrastructure/di/adapters/mcp-client-registry-adapter.ts`** | **RÉFÉRENCE** | `refreshTools()` ligne 56 — stockage des tools |

### Technical Decisions

**TD-001: mcpServers dans .pml.json (pas fichier séparé)**
- **Décision:** Ajouter `mcpServers` directement dans `.pml.json`
- **Raison:** Un seul fichier de config par projet, cohérent avec permissions

**TD-002: Appeler tools/list au startup**
- **Décision:** Discovery synchrone au démarrage de `pml stdio`
- **Raison:** Les schemas changent rarement, pas besoin de re-découvrir à chaque requête
- **Trade-off:** Startup plus lent si beaucoup de MCPs

**TD-003: Modèle d'observations (pas config_availability statique)**
- **Décision:** Nouvelle table `tool_observations` multi-tenant au lieu de colonne dans `tool_schema`
- **Raison:**
  - `tool_schema` n'est pas multi-tenant (PK = `serverId:toolName`)
  - On ne peut pas savoir ce qui n'est PAS disponible (logique négative impossible)
  - On observe ce qu'on voit, on accumule, on agrège
- **Format:** Table avec `user_id`, `tool_id`, `server_namespace`, `observed_args[]`, `observed_at`
- **Ref:** [MCP Spec](https://modelcontextprotocol.io/specification/2025-03-26/server/tools) - discovery 100% dynamique via `tools/list`

**TD-004: Timeout 10s par MCP au startup**
- **Décision:** Si un MCP ne répond pas en 10s, skip et continue
- **Raison:** Un MCP cassé ne doit pas bloquer les autres
- **Action:** Log warning, tool n'apparaît pas dans suggestions

**TD-005: Migration propose copie (pas force)**
- **Décision:** `pml init` détecte `.mcp.json` existant, propose de copier
- **Raison:** User garde le contrôle, pas de surprise

## Implementation Plan

### Tasks

#### Phase 1: Types & Config

- [ ] **Task 1: Extend PmlConfig with mcpServers**
  - File: `packages/pml/src/types.ts`
  - Action: Ajouter `mcpServers` optional à `PmlConfig`
  - Code:
    ```typescript
    export interface PmlConfig {
      version: string;
      workspace?: string;
      cloud?: PmlCloudConfig;
      server?: PmlServerConfig;
      permissions?: PmlPermissions;
      env?: Record<string, string>;
      /** User-defined MCP servers (BYOK model) */
      mcpServers?: Record<string, McpServerConfig>;
    }
    ```

- [ ] **Task 2: Add config loader for mcpServers**
  - File: `packages/pml/src/config.ts` (nouveau ou existant)
  - Action: Fonction pour charger et valider mcpServers depuis .pml.json
  - Code:
    ```typescript
    export function loadMcpServers(pmlConfig: PmlConfig): Map<string, McpServerConfig> {
      const servers = new Map();
      if (!pmlConfig.mcpServers) return servers;
      for (const [name, config] of Object.entries(pmlConfig.mcpServers)) {
        // Résoudre env vars: ${VAR} → Deno.env.get("VAR")
        const resolved = resolveEnvVars(config);
        servers.set(name, resolved);
      }
      return servers;
    }
    ```

#### Phase 2: Migration dans pml init

- [ ] **Task 3: Detect existing .mcp.json servers**
  - File: `packages/pml/src/init/mod.ts`
  - Action: Après backup, lire les serveurs existants
  - Code:
    ```typescript
    async function detectExistingServers(mcpConfigPath: string): Promise<Record<string, McpServerConfig> | null> {
      try {
        const content = await Deno.readTextFile(mcpConfigPath);
        const config = JSON.parse(content) as McpConfig;
        // Exclure "pml" car on le gère séparément
        const { pml, ...otherServers } = config.mcpServers || {};
        return Object.keys(otherServers).length > 0 ? otherServers : null;
      } catch {
        return null;
      }
    }
    ```

- [ ] **Task 4: Propose migration to user**
  - File: `packages/pml/src/init/mod.ts`
  - Action: Si serveurs détectés, proposer de les copier
  - Code:
    ```typescript
    if (existingServers) {
      console.log(`\n  Found ${Object.keys(existingServers).length} MCP servers in existing config.`);
      const migrate = prompt("  Copy them to .pml.json? (y/n)");
      if (migrate?.toLowerCase() === "y") {
        pmlConfig.mcpServers = existingServers;
      }
    }
    ```

#### Phase 3: MCP Discovery

- [ ] **Task 5: Create MCP discovery module**
  - File: `packages/pml/src/discovery/mcp-discovery.ts` (nouveau)
  - Action: Module pour découvrir tools via tools/list + validation AJV
  - **Référence:** `src/mcp/client.ts:252` (`listTools()`) — même pattern JSON-RPC
  - **Référence:** `lib/server/src/schema-validator.ts` — validation AJV existante
  - Code:
    ```typescript
    import Ajv from "ajv";

    const ajv = new Ajv({ strict: false });

    export interface DiscoveredTool {
      name: string;
      description?: string;
      inputSchema?: JsonSchema;
    }

    export interface DiscoveryResult {
      serverName: string;
      tools: DiscoveredTool[];
      config: McpServerConfig;
      error?: string;
      skippedTools?: string[];  // Tools avec schemas invalides
    }

    /**
     * Valide qu'un inputSchema est un JSON Schema valide
     * Si le MCP spawn et retourne des tools, on valide juste le schema
     */
    function validateToolSchema(tool: { name: string; inputSchema?: unknown }): boolean {
      if (!tool.name || typeof tool.name !== "string") return false;

      // Pas de schema = OK (tool sans params)
      if (!tool.inputSchema) return true;

      // Schema doit être un objet
      if (typeof tool.inputSchema !== "object" || tool.inputSchema === null) return false;

      // Vérifier que c'est un JSON Schema valide avec AJV
      try {
        ajv.compile(tool.inputSchema as Record<string, unknown>);
        return true;
      } catch {
        return false;
      }
    }

    export async function discoverMcpTools(
      serverName: string,
      config: McpServerConfig,
      stdioManager: StdioManager,
      timeout: number = 10000,
    ): Promise<DiscoveryResult> {
      try {
        // 1. Spawn MCP — si ça marche, le serveur est fonctionnel
        await stdioManager.spawn({ name: serverName, ...config });

        // 2. Call tools/list with timeout
        const response = await Promise.race([
          stdioManager.call(serverName, "tools/list", {}),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeout)
          ),
        ]);

        // 3. Valider chaque tool schema
        const rawTools = response.tools || [];
        const validTools: DiscoveredTool[] = [];
        const skippedTools: string[] = [];

        for (const tool of rawTools) {
          if (validateToolSchema(tool)) {
            validTools.push(tool);
          } else {
            log.warn(`${serverName}: invalid schema for "${tool.name}", skipping`);
            skippedTools.push(tool.name);
          }
        }

        return {
          serverName,
          tools: validTools,
          config,
          skippedTools: skippedTools.length > 0 ? skippedTools : undefined,
        };
      } catch (error) {
        return {
          serverName,
          tools: [],
          config,
          error: error.message,
        };
      }
    }
    ```

- [ ] **Task 6: Integrate discovery in stdio startup**
  - File: `packages/pml/src/cli/stdio-command.ts` ou équivalent
  - Action: Au démarrage, découvrir tous les MCPs du user
  - Code:
    ```typescript
    // Au startup de pml stdio
    const mcpServers = loadMcpServers(pmlConfig);
    const discoveryResults: DiscoveryResult[] = [];

    for (const [name, config] of mcpServers) {
      log.info(`Discovering tools from ${name}...`);
      const result = await discoverMcpTools(name, config, stdioManager);
      discoveryResults.push(result);

      if (result.error) {
        log.warn(`Failed to discover ${name}: ${result.error}`);
      } else {
        log.info(`Found ${result.tools.length} tools from ${name}`);
      }
    }
    ```

#### Phase 4: Client → Server Sync

> **Architecture:** Client découvre localement (BYOK), envoie les schemas au serveur via API.
> Voir `00-architecture-decision-note.md` pour la justification.

- [ ] **Task 7: Create tool_observations table (SERVEUR)**
  - File: `src/db/migrations/XXX_tool_observations.sql` (nouveau)
  - Action: Migration pour créer la table d'observations multi-tenant
  - Code:
    ```sql
    -- Migration: Tool observations (multi-tenant)
    -- Stocke les observations de tools par user/config
    -- On ne peut pas savoir ce qui n'est PAS dispo, juste ce qu'on a observé

    CREATE TABLE IF NOT EXISTS tool_observations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tool_id TEXT NOT NULL,                    -- ex: "exa:search"
      server_namespace TEXT NOT NULL,           -- ex: "exa"
      observed_args TEXT[] NOT NULL DEFAULT '{}', -- ex: ["--api-key"]
      observed_at TIMESTAMPTZ DEFAULT NOW(),

      -- Un user ne peut observer le même tool avec les mêmes args qu'une fois
      UNIQUE (user_id, tool_id, observed_args)
    );

    -- Index pour requêtes fréquentes
    CREATE INDEX idx_tool_obs_user ON tool_observations(user_id);
    CREATE INDEX idx_tool_obs_tool ON tool_observations(tool_id);
    CREATE INDEX idx_tool_obs_namespace ON tool_observations(server_namespace);
    ```

- [ ] **Task 8: Create POST /api/tools/sync endpoint (SERVEUR)**
  - File: `src/api/tools.ts` (nouveau ou existant)
  - Action: Endpoint pour recevoir les tools découverts par le client
  - **Référence:** `src/mcp/schema-extractor.ts:219` — format toolId = `serverId:toolName`
  - Code:
    ```typescript
    // POST /api/tools/sync
    // Input: { tools: DiscoveryResult[], observedArgs: Record<string, string[]> }
    // Auth: x-api-key header (userId extrait du token)

    export async function handleToolsSync(req: Request, db: DbClient, userId: string): Promise<Response> {
      const { tools, observedArgs } = await req.json();

      for (const result of tools) {
        if (result.error) continue;

        const args = observedArgs[result.serverName] || [];

        for (const tool of result.tools) {
          const toolId = `${result.serverName}:${tool.name}`;

          // 1. Upsert tool_schema (global, pas multi-tenant)
          await db.execute(`
            INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (tool_id) DO UPDATE SET
              description = EXCLUDED.description,
              input_schema = EXCLUDED.input_schema,
              cached_at = NOW()
          `, [toolId, result.serverName, tool.name, tool.description, tool.inputSchema]);

          // 2. Insert observation (multi-tenant)
          await db.execute(`
            INSERT INTO tool_observations (user_id, tool_id, server_namespace, observed_args)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, tool_id, observed_args) DO UPDATE SET
              observed_at = NOW()
          `, [userId, toolId, result.serverName, args]);
        }
      }

      return new Response(JSON.stringify({ synced: tools.length }), { status: 200 });
    }
    ```

- [ ] **Task 9: Create client sync function (CLIENT)**
  - File: `packages/pml/src/discovery/tool-sync.ts` (nouveau)
  - Action: Appeler l'API serveur pour sync les tools découverts
  - Code:
    ```typescript
    export async function syncDiscoveredTools(
      cloudUrl: string,
      apiKey: string,
      results: DiscoveryResult[],
    ): Promise<{ synced: number }> {
      const response = await fetch(`${cloudUrl}/api/tools/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ tools: results }),
      });

      if (!response.ok) {
        throw new Error(`Tool sync failed: ${response.status}`);
      }

      return await response.json();
    }
    ```

- [ ] **Task 10: Create aggregation query for observations (SERVEUR)**
  - File: `src/api/tools.ts` ou `src/graphrag/sync/db-sync.ts`
  - Action: Requête pour agréger les observations par tool
  - Code:
    ```sql
    -- Voir toutes les configs observées pour un tool (global)
    SELECT tool_id, array_agg(DISTINCT observed_args) as all_observed_configs
    FROM tool_observations
    GROUP BY tool_id;

    -- Voir les tools disponibles pour un user spécifique
    SELECT DISTINCT tool_id, server_namespace
    FROM tool_observations
    WHERE user_id = $1;
    ```

- [ ] **Task 11: Generate embeddings for synced tools (SERVEUR)**
  - File: `src/api/tools.ts` ou job async
  - Action: Après upsert tool_schema, générer embeddings pour nouveaux tools
  - **Référence:** `tools/sync-tools.ts:170-181` et `src/vector/embeddings.ts`
  - Code:
    ```typescript
    // Dans handleToolsSync, après upsert:
    // Option A: Synchrone (simple mais lent)
    const embeddingModel = await getEmbeddingModel(); // Singleton
    await generateEmbeddings(db, embeddingModel, { toolIds: newToolIds });

    // Option B: Async job (meilleur pour perf)
    await queueEmbeddingJob({ toolIds: newToolIds });
    ```
  - **Note:** Le modèle BGE-M3 est lourd (400MB). Utiliser un singleton ou un worker dédié.

#### Phase 5: Graph Integration

- [ ] **Task 12: Load observations in syncGraphFromDatabase**
  - File: `src/graphrag/sync/db-sync.ts`
  - Action: Charger les observations agrégées lors du sync
  - Code:
    ```typescript
    // Dans syncGraphFromDatabase, après load des nodes:
    // Charger toutes les configs observées par tool (agrégation globale)
    const observations = await db.query(`
      SELECT tool_id, array_agg(DISTINCT observed_args ORDER BY observed_args) as observed_configs
      FROM tool_observations
      GROUP BY tool_id
    `);

    for (const row of observations) {
      if (graph.hasNode(row.tool_id)) {
        // observedConfigs = [[], ["--api-key"], ["--read-only"]]
        graph.setNodeAttribute(row.tool_id, 'observedConfigs', row.observed_configs);
      }
    }
    ```

#### Phase 6: Error Handling & Re-sync

- [ ] **Task 13: Add re-sync on config change**
  - File: `packages/pml/src/discovery/watcher.ts` (nouveau ou intégré)
  - Action: Watcher sur .pml.json, re-sync si mcpServers change
  - Code:
    ```typescript
    // Option: Deno.watchFs ou polling
    // Quand mcpServers change → re-run discovery → re-sync DB
    ```

- [ ] **Task 14: Comprehensive error handling**
  - Files: Tous les fichiers discovery
  - Action: Gérer tous les cas d'erreur
  - Cases:
    - MCP ne démarre pas → log warning avec erreur brute, skip
    - tools/list timeout → log warning, skip
    - DB error → throw (fail fast)
  - Principe: Pas d'heuristique sur la cause (API key, binaire manquant, etc.) — l'erreur brute suffit

#### Phase 7: MCP Lifecycle Management

- [ ] **Task 15: Add crash detection and auto-restart**
  - File: `packages/pml/src/loader/stdio-manager.ts`
  - Action: Détecter quand un MCP crash et le relancer automatiquement
  - Code:
    ```typescript
    // Dans startReader(), détecter la fermeture inattendue
    private startReader(name: string, proc: StdioProcess): void {
      const read = async () => {
        try {
          while (true) {
            const { value, done } = await proc.reader.read();
            if (done) {
              // Process ended - check if unexpected
              if (this.processes.has(name)) {
                logDebug(`${name} crashed unexpectedly, attempting restart...`);
                this.handleCrash(name, proc.dep);
              }
              break;
            }
            // ... existing logic
          }
        } catch (error) {
          // ... existing error handling
        }
      };
    }

    private async handleCrash(name: string, dep: McpDependency): Promise<void> {
      // Clean up crashed process
      this.processes.delete(name);

      // Attempt restart (max 3 times)
      const maxRetries = 3;
      for (let i = 0; i < maxRetries; i++) {
        try {
          await this.spawn(dep);
          logDebug(`${name} restarted successfully (attempt ${i + 1})`);
          return;
        } catch (error) {
          logDebug(`${name} restart failed (attempt ${i + 1}): ${error}`);
          await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Backoff
        }
      }
      log.warn(`${name} failed to restart after ${maxRetries} attempts`);
    }
    ```

- [ ] **Task 16: Add config file watcher**
  - File: `packages/pml/src/discovery/config-watcher.ts` (nouveau)
  - Action: Watcher sur `.pml.json` pour détecter les changements de mcpServers
  - Code:
    ```typescript
    export class ConfigWatcher {
      private watcher: Deno.FsWatcher | null = null;
      private lastMcpServersHash: string = "";

      async start(
        configPath: string,
        onMcpServersChanged: (servers: Record<string, McpServerConfig>) => Promise<void>,
      ): Promise<void> {
        // Initial hash
        this.lastMcpServersHash = await this.computeHash(configPath);

        // Watch for changes
        this.watcher = Deno.watchFs(configPath);
        for await (const event of this.watcher) {
          if (event.kind === "modify") {
            const newHash = await this.computeHash(configPath);
            if (newHash !== this.lastMcpServersHash) {
              this.lastMcpServersHash = newHash;
              const config = await loadPmlConfig(configPath);
              if (config.mcpServers) {
                await onMcpServersChanged(config.mcpServers);
              }
            }
          }
        }
      }

      stop(): void {
        this.watcher?.close();
        this.watcher = null;
      }

      private async computeHash(path: string): Promise<string> {
        const content = await Deno.readTextFile(path);
        const config = JSON.parse(content);
        return JSON.stringify(config.mcpServers || {});
      }
    }
    ```

- [ ] **Task 17: Add graceful shutdown on SIGINT**
  - File: `packages/pml/src/cli/stdio-command.ts`
  - Action: Handler SIGINT pour cleanup propre
  - Code:
    ```typescript
    // Au démarrage de pml stdio
    const shutdownHandler = async () => {
      log.info("Shutting down PML...");

      // Stop config watcher
      configWatcher?.stop();

      // Shutdown all MCPs gracefully
      stdioManager.shutdownAll();

      // Flush pending traces
      if (loader) {
        await loader.flushTraces();
      }

      log.info("PML shutdown complete");
      Deno.exit(0);
    };

    Deno.addSignalListener("SIGINT", shutdownHandler);
    Deno.addSignalListener("SIGTERM", shutdownHandler);
    ```

### Acceptance Criteria

#### Config Loading

- [ ] **AC-1:** Given `.pml.json` with `mcpServers`, when PML starts, then servers are loaded and validated.

- [ ] **AC-2:** Given `mcpServers` with `env: { "KEY": "${VAR}" }`, when loading, then `${VAR}` is resolved from `Deno.env`.

- [ ] **AC-3:** Given `pml init` with existing `.mcp.json` containing servers, when init runs, then user is prompted to migrate servers to `.pml.json`.

#### Discovery

- [ ] **AC-4:** Given valid MCP server config, when startup occurs, then `tools/list` is called and tools are discovered.

- [ ] **AC-5:** Given MCP server that doesn't respond in 10s, when discovery runs, then timeout occurs, warning logged, and other servers still discovered.

- [ ] **AC-6:** Given MCP server that fails to spawn, when error occurs, then raw error message is logged and other servers still discovered.

- [ ] **AC-7:** Given tool with invalid JSON Schema (non-compilable by AJV), when discovery runs, then tool is skipped with warning and valid tools are still synced.

#### Database Sync

- [ ] **AC-8:** Given discovered tools, when sync runs, then `tool_schema` is upserted and `tool_observations` is inserted for the user.

- [ ] **AC-9:** Given same tool seen with different configs by different users, when sync runs, then each observation is stored separately (multi-tenant).

#### Graph Integration

- [ ] **AC-10:** Given `tool_observations` with data, when `syncGraphFromDatabase()` runs, then `ToolNode.observedConfigs` is populated with aggregated configs.

#### Error Cases

- [ ] **AC-11:** Given one MCP fails to start, when discovery runs, then other MCPs are still discovered (no fail-all).

#### Lifecycle Management

- [ ] **AC-12:** Given running MCP that crashes unexpectedly, when crash detected, then auto-restart attempted (max 3 times with backoff).

- [ ] **AC-13:** Given `.pml.json` modified with new MCP server, when watcher detects change, then new MCP is spawned and discovered.

- [ ] **AC-14:** Given `.pml.json` modified with removed MCP server, when watcher detects change, then MCP is shutdown.

- [ ] **AC-15:** Given SIGINT received, when shutdown handler runs, then all MCPs are shutdown gracefully and traces flushed.

## Additional Context

### Dependencies

**Enables:**
- **Spec 02: Config-Aware Discovery** — utilise `observedConfigs` peuplé ici
- **Spec 03: Config Permission HIL** — utilise les configs pour proposer des changements

**Required:**
- `tool_schema` table must exist (existing migration)
- `StdioManager` must support `tools/list` call

### Testing Strategy

**Unit Tests:**
- `loadMcpServers()` avec différentes configs
- `resolveEnvVars()` avec variables manquantes
- `discoverMcpTools()` avec mock stdio
- `syncDiscoveredTools()` avec mock DB

**Integration Tests:**
- Discovery avec vrai MCP (ex: mcp-std qui n'a pas besoin d'API key)
- Migration flow dans `pml init`

**Manual Testing:**
1. Ajouter un MCP dans `.pml.json`
2. Lancer `pml stdio`
3. Vérifier logs de discovery
4. Vérifier `tool_schema` dans DB

### Notes

**Format final `.pml.json`:**
```json
{
  "version": "0.2.11",
  "workspace": ".",
  "mcpServers": {
    "serena": {
      "type": "stdio",
      "command": "serena",
      "args": ["--workspace", "."]
    },
    "exa": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "exa-mcp-server"],
      "env": { "EXA_API_KEY": "${EXA_API_KEY}" }
    }
  },
  "cloud": { "url": "https://pml.casys.ai" },
  "permissions": { "allow": [], "deny": [], "ask": [] }
}
```

**Risques:**
1. **Startup lent** si beaucoup de MCPs — mitigé par timeout 10s et parallel discovery
2. **Schemas différents** entre versions MCP — on prend toujours le plus récent
3. **Agrégation observations** — commencer simple (upsert), itérer si besoin

**Questions ouvertes:**
- Faut-il générer des embeddings automatiquement pour les nouveaux tools?
- Faut-il un mode "dry-run" pour voir les tools sans sync DB?
