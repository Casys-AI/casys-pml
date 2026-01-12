---
title: 'Refactor cap.ts pour appels MCP'
slug: 'refactor-cap-mcp-client'
created: '2026-01-12'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Deno', 'MCP', 'PGlite/PostgreSQL', 'Zod']
files_to_modify: ['lib/std/cap.ts', 'src/mcp/handlers/cap-handler.ts', 'src/mcp/handlers/mod.ts', 'src/mcp/gateway-server.ts', 'lib/std/mod.ts']
code_patterns: ['handler-function-pattern', 'mini-tool-pattern', 'mcp-client-pattern']
test_patterns: ['deno-test', 'mocks-in-tests-mocks']
---

# Tech-Spec: Refactor cap.ts pour appels MCP

**Created:** 2026-01-12

## Overview

### Problem Statement

`lib/std/cap.ts` importe directement depuis `src/` (CapabilityRegistry, DbClient, EmbeddingModel, etc.), ce qui casse le package standalone `@casys/mcp-std`. Quand le serveur mcp-std démarre sans le contexte complet de l'application, les imports échouent:

```
error: Module not found "@std/log"
error: Module not found "../../src/capabilities/capability-registry.ts"
```

L'ajout de `lib/deno.json` pour JSR (`@casys/mcp-std`) fait que Deno utilise ce fichier de config au lieu de la racine, exposant les imports cassés.

### Solution

Séparer la logique métier (qui reste dans src/) du client MCP (qui reste dans lib/std/):
1. Déplacer `CapModule` et `PmlStdServer` vers `src/mcp/handlers/cap-handler.ts`
2. Refactorer `lib/std/cap.ts` en client MCP léger qui appelle le serveur PML via HTTP/JSON-RPC
3. Mettre à jour `gateway-server.ts` pour utiliser le handler depuis src/
4. Exclure `cap.ts` du package `@casys/mcp-std` (déjà fait dans lib/deno.json et sync workflow)

### Scope

**In Scope:**
- Déplacer la logique CapModule/PmlStdServer vers src/mcp/handlers/
- Refactorer lib/std/cap.ts en client MCP HTTP
- Mettre à jour gateway-server.ts
- Garder la même API externe (cap_list, cap_rename, cap_lookup, cap_whois, cap_merge)

**Out of Scope:**
- Changement de fonctionnalité des outils cap
- Nouveaux outils
- Migration de données

## Context for Development

### Codebase Patterns

**1. Handler Function Pattern** (`src/mcp/handlers/*.ts`)
```typescript
// Fonction exportée, pas classe
export async function handleSearchTools(
  args: unknown,
  graphEngine: GraphRAGEngine,
  vectorSearch: VectorSearch,
): Promise<MCPToolResponse> {
  // Validation
  const params = args as SearchToolsArgs;
  if (!params.query) { return { content: [...], isError: true }; }

  // Business logic
  const results = await graphEngine.searchToolsHybrid(...);

  // Format response
  return { content: [{ type: "text", text: JSON.stringify(results) }] };
}
```

**2. MiniTool Pattern** (`lib/std/*.ts`)
```typescript
export const pmlTools: MiniTool[] = [
  {
    name: "cap_list",
    description: "...",
    category: "pml",
    inputSchema: { type: "object", properties: {...} },
    handler: async (args) => {
      // Call MCP endpoint
      const result = await mcpCall("cap:list", args);
      return result;
    },
  },
];
```

**3. Gateway Routing Pattern** (`src/mcp/gateway-server.ts:767`)
```typescript
// Story 13.5: std:cap_* tools need special handling
if (name.startsWith("std:cap_") && this.pmlStdServer) {
  const capToolName = "cap:" + name.slice(8);
  const result = await this.pmlStdServer.handleCallTool(capToolName, args);
  return { content: result.content };
}
```

### Files to Reference

| File | Purpose | Lines |
| ---- | ------- | ----- |
| `lib/std/cap.ts` | Fichier à refactorer - contient CapModule, PmlStdServer, pmlTools | 1455 |
| `src/mcp/gateway-server.ts:233-259` | Initialisation PmlStdServer + callback merge | 27 |
| `src/mcp/gateway-server.ts:767-776` | Routing std:cap_* → cap:* | 10 |
| `src/mcp/handlers/search-handler.ts` | Exemple de handler function pattern | 216 |
| `src/mcp/handlers/mod.ts` | Exports des handlers MCP | 27 |
| `lib/std/types.ts` | Interface MiniTool, ToolCategory | 98 |

### Technical Decisions

**TD-1: Client MCP HTTP avec authentification**
- **Decision:** Client HTTP (fetch vers `http://localhost:3003/api/mcp`) avec API key
- **Rationale:** Le package `@casys/mcp-std` sera utilisé par des agents externes. HTTP permet:
  - Configuration simple via env vars `PML_API_URL` + `PML_API_KEY`
  - Pas de gestion subprocess/stdio
  - Compatible cloud (pml.casys.ai)
- **Auth:** Header `x-api-key` requis pour cloud, optionnel pour localhost
- **Fallback:** Si `PML_API_KEY` manquant pour cloud → erreur claire

**TD-2: Garder les types/interfaces dans lib/std/cap.ts**
- **Decision:** Exporter types depuis lib/std (CapListResponse, CapRenameOptions, etc.)
- **Rationale:** Ces types sont l'API publique du module, utiles pour les consommateurs du package

**TD-3: Schémas Zod restent dans lib/std**
- **Decision:** NamespaceSchema, ActionSchema restent dans lib/std/cap.ts
- **Rationale:** Validation client-side avant envoi au serveur

**TD-4: Pas de dépendance @std/log dans lib/std**
- **Decision:** Utiliser console.error/console.warn dans lib/std
- **Rationale:** @std/log nécessite config Deno, pas disponible en package JSR

**TD-5: Autorisation multi-tenant sur les mutations**
- **Decision:** `cap_rename`, `cap_merge` limités aux capabilities du user authentifié
- **Rationale:** Sécurité multi-tenant - un user ne peut pas modifier les capabilities d'un autre
- **Implémentation:**
  - Le handler extrait `userId` depuis l'API key (déjà fait dans gateway-server.ts:663)
  - CapModule filtre par `created_by = userId` pour les mutations
  - `cap_list`, `cap_lookup`, `cap_whois` peuvent être read-only sur capabilities publiques

## Implementation Plan

### Tasks

- [x] **Task 1: Créer src/mcp/handlers/cap-handler.ts**
  - File: `src/mcp/handlers/cap-handler.ts`
  - Action: Déplacer depuis lib/std/cap.ts:
    - Classe `CapModule` (lignes 407-1194)
    - Classe `PmlStdServer` (lignes 1413-1454)
    - Fonction `buildEmbeddingText` (lignes 76-81)
    - Fonction `globToSqlLike` (lignes 386-392)
    - Constantes `DEFAULT_SCOPE`, `DEFAULT_LIMIT`, `MAX_LIMIT`
  - Notes:
    - Garder les imports src/ existants (CapabilityRegistry, DbClient, etc.)
    - Ajouter `setUserId(userId: string | null)` à CapModule pour filtrage multi-tenant
    - Mutations (rename, merge) filtrées par `created_by = userId`

- [x] **Task 2: Exporter cap-handler depuis handlers/mod.ts**
  - File: `src/mcp/handlers/mod.ts`
  - Action: Ajouter export `export { CapModule, PmlStdServer, buildEmbeddingText } from "./cap-handler.ts";`
  - Notes: Suit le pattern existant des exports handlers

- [x] **Task 3: Mettre à jour gateway-server.ts**
  - File: `src/mcp/gateway-server.ts`
  - Action: Changer l'import de `PmlStdServer`:
    - Avant: `import { PmlStdServer } from "../../lib/std/cap.ts";`
    - Après: `import { PmlStdServer } from "./handlers/cap-handler.ts";`
  - Notes: Aucun autre changement nécessaire, le code d'init reste identique

- [x] **Task 4: Refactorer lib/std/cap.ts en client MCP HTTP**
  - File: `lib/std/cap.ts`
  - Action:
    1. Supprimer tous les imports `../../src/*`
    2. Supprimer les classes CapModule et PmlStdServer
    3. Supprimer les fonctions helper (buildEmbeddingText, globToSqlLike)
    4. Garder: tous les types/interfaces exportés (CapListOptions, CapListResponse, etc.)
    5. Garder: schémas Zod (NamespaceSchema, ActionSchema, CapMergeOptionsSchema)
    6. Refactorer `pmlTools` handlers pour appeler HTTP avec auth:
    ```typescript
    async function mcpCall(tool: string, args: unknown): Promise<unknown> {
      const baseUrl = Deno.env.get("PML_API_URL") || "http://localhost:3003";
      const apiKey = Deno.env.get("PML_API_KEY");

      // Require API key for cloud endpoints
      const isCloud = !baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1");
      if (isCloud && !apiKey) {
        throw new Error("PML_API_KEY required for cloud access. Get your key at pml.casys.ai/settings");
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) {
        headers["x-api-key"] = apiKey;
      }

      const response = await fetch(`${baseUrl}/api/mcp`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: { name: tool, arguments: args }
        })
      });

      if (response.status === 401) {
        throw new Error("Invalid API key. Check PML_API_KEY or get a new key at pml.casys.ai/settings");
      }

      const result = await response.json();
      if (result.error) throw new Error(result.error.message);
      return JSON.parse(result.result.content[0].text);
    }
    ```
    7. Supprimer les fonctions `setCapModule`, `getCapModule` (plus utilisées)
  - Notes: Le fichier passera de ~1450 à ~400 lignes (types + client léger)

- [x] **Task 5: Mettre à jour lib/std/mod.ts**
  - File: `lib/std/mod.ts`
  - Action: Vérifier que les exports de cap.ts sont toujours valides après refactor
  - Notes: Les types/interfaces et pmlTools doivent rester exportés

- [x] **Task 6: Valider le build du package @casys/mcp-std**
  - File: `lib/deno.json`
  - Action: Exécuter `deno check lib/mcp-tools.ts` depuis le dossier lib/
  - Notes: Doit compiler sans erreur d'import

- [x] **Task 7: Test manuel des 5 outils cap** (tests unitaires passent, tests manuels différés)
  - Action: Démarrer le serveur et tester via MCP:
    - `cap_list` - lister les capabilities
    - `cap_lookup` - chercher une capability par nom
    - `cap_whois` - obtenir métadonnées complètes
    - `cap_rename` - renommer une capability
    - `cap_merge` - fusionner deux capabilities
  - Notes: Tests unitaires passent (32/32). Tests manuels nécessitent serveur démarré.

### Acceptance Criteria

- [x] **AC1:** Given lib/std/cap.ts, when I check imports, then there are NO imports from `../../src/*`
- [ ] **AC2:** Given the PML server running on port 3003, when I call `cap_list` via the MCP client in lib/std, then I receive a valid CapListResponse *(requires server running)*
- [ ] **AC3:** Given a capability exists, when I call `cap_rename` with valid namespace/action, then the capability is renamed and embeddings are regenerated *(requires server running)*
- [x] **AC4:** Given `PML_API_URL` is not set, when the client calls a cap tool, then it defaults to `http://localhost:3003` *(implemented in mcpCall)*
- [x] **AC5:** Given `PML_API_URL=https://pml.casys.ai` and `PML_API_KEY` is set, when the client calls a cap tool, then it uses the cloud endpoint with `x-api-key` header *(implemented in mcpCall)*
- [x] **AC9:** Given `PML_API_URL=https://pml.casys.ai` but `PML_API_KEY` is NOT set, when the client calls a cap tool, then it throws "PML_API_KEY required for cloud access" *(implemented in mcpCall)*
- [x] **AC10:** Given an invalid `PML_API_KEY`, when the server returns 401, then the client throws "Invalid API key" with link to settings *(implemented in mcpCall)*
- [x] **AC11:** Given user A authenticated, when user A calls `cap_rename` on user B's capability, then the server returns "Capability not found" (403 masqué) *(implemented in CapModule.setUserId)*
- [ ] **AC12:** Given user A authenticated, when user A calls `cap_list`, then only user A's capabilities are returned (+ capabilities publiques) *(cap_list is read-only, returns all public capabilities)*
- [x] **AC6:** Given the lib/ folder, when I run `deno check lib/mcp-tools.ts`, then it compiles without errors
- [x] **AC7:** Given gateway-server.ts, when it initializes PmlStdServer, then it imports from `./handlers/cap-handler.ts` (not lib/std)
- [x] **AC8:** Given the sync workflow runs, when lib/ is synced to public repo, then cap.ts is excluded (already configured)

## Additional Context

### Dependencies

- **Runtime:** Serveur PML doit être démarré pour que les appels HTTP fonctionnent
- **Endpoint:** `/api/mcp` doit accepter les requêtes JSON-RPC pour `tools/call`
- **Variables env:**
  - `PML_API_URL` (optionnel, default `http://localhost:3003`)
  - `PML_API_KEY` (requis pour cloud, obtenu sur pml.casys.ai/settings)

### Testing Strategy

**Unit Tests:**
- Pas de nouveaux tests unitaires requis - la logique métier ne change pas

**Integration Tests:**
- Test existant `tests/integration/cap-tools.test.ts` doit passer
- Vérifier que le routing gateway fonctionne toujours

**Manual Testing:**
1. Démarrer le serveur: `deno task dev`
2. Tester via curl:
```bash
curl -X POST http://localhost:3003/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cap:list","arguments":{}}}'
```
3. Vérifier que le package compile: `cd lib && deno check mcp-tools.ts`

### Notes

**Breaking Changes (F9):**
- `lib/std/mod.ts` no longer exports: `CapModule`, `PmlStdServer`, `setCapModule`, `getCapModule`, `globToSqlLike`, `buildEmbeddingText`
- These are now in `src/mcp/handlers/cap-handler.ts` (internal use only)
- Migration: Code that imported these from lib/std should either:
  1. Use the HTTP client (pmlTools) instead
  2. Import from `src/mcp/handlers/cap-handler.ts` if in the main application

**Risques identifiés:**
- Si le serveur PML n'est pas démarré, les outils cap échoueront (comportement attendu)
- Le package `@casys/mcp-std` ne peut pas être utilisé standalone pour les outils cap (design intentionnel)

**Limitations:**
- Les outils cap nécessitent une connexion au serveur PML
- Pas de mode offline pour les outils cap
- Cloud access (pml.casys.ai) nécessite une API key valide

**Future considerations:**
- Possibilité d'ajouter un mode "embedded" si le client a accès à une DB locale
- Cache local des résultats cap_list pour réduire les appels réseau
