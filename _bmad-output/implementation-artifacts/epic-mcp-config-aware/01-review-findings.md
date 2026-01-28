# Review Findings - Tech-Spec 01: MCP Config Sync

**Date:** 2026-01-28
**Reviewer:** Adversarial Code Review (automated)
**Status:** Pending Resolution

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| Critical | 3 | 1 noise, 1 undecided, 1 documented |
| High | 4 | ✅ 4/4 (F6 was undecided, now fixed) |
| Medium | 5 | ✅ 4/5 |
| Low | 5 | ✅ 2/5 |

---

## Critical Issues

### F1: SQL Injection via Tool Names
**Severity:** Critical | **Validity:** Undecided
**Location:** `src/api/tools.ts:118-129`

Le `toolId` est construit par concaténation de `serverName` et `tool.name` provenant du client :
```typescript
const toolId = `${result.serverName}:${tool.name}`;
```

Les queries sont paramétrisées, donc pas d'injection SQL directe. Cependant, si `toolId` est utilisé ailleurs sans paramétrage, risque potentiel.

**Resolution:** Valider les caractères autorisés dans serverName et tool.name.

---

### F2: tool_schema Table Missing ❌ NOISE
**Severity:** Critical | **Validity:** Noise

La table `tool_schema` existe déjà dans migration 001_initial.sql. Faux positif.

---

### F3: Command Injection via MCP Server Config
**Severity:** Critical | **Validity:** Valid
**Location:** `packages/pml/src/config.ts:74-80`

Les `command` et `args` de la config sont passés directement à `Deno.Command`. Si `.pml.json` est compromis (package malveillant, CI), exécution de commandes arbitraires.

**Mitigation:** Config contrôlée par l'utilisateur local. Documenter le risque. Potentiellement valider les chemins de commandes.

---

## High Severity Issues

### F4: Race Condition in Crash Handler
**Severity:** High | **Validity:** Valid
**Location:** `packages/pml/src/loader/stdio-manager.ts:439-471`

Séquence problématique :
1. `this.processes.delete(name)` - process supprimé
2. `await new Promise(r => setTimeout(r, backoffMs))` - attente async
3. `await this.spawn(dep)` - respawn

Si `getOrSpawn(name)` est appelé pendant l'étape 2, un second spawn peut survenir.

**Resolution:** Ajouter un flag `restarting` ou mutex pour éviter les spawns concurrents.

---

### F5: DoS via Discovery Timeout Stacking
**Severity:** High | **Validity:** Valid
**Location:** `packages/pml/src/discovery/mcp-discovery.ts:207-232`

Discovery séquentielle : 100 serveurs × 10s timeout = 1000+ secondes de blocage.

**Resolution:**
- Ajouter un timeout global pour toute la discovery
- OU exécuter en parallèle avec limite de concurrence (e.g., 5 serveurs simultanés)

---

### ~~F6: Memory Leak - AJV Compiled Schemas~~ ✅ FIXED
**Severity:** High | **Validity:** Valid → Fixed
**Location:** `packages/pml/src/discovery/mcp-discovery.ts:122-127`

~~Le global `ajv` compile chaque schema sans éviction.~~

**Fix:** Utilise `ajv.validateSchema()` au lieu de `compile()`. `validateSchema()` vérifie que le schema est un JSON Schema valide sans le stocker en mémoire.

---

### F7: Resource Leak - Process Not Cleaned on Discovery Error
**Severity:** High | **Validity:** Valid
**Location:** `packages/pml/src/discovery/mcp-discovery.ts:137-193`

Quand discovery échoue (timeout), le process MCP spawné reste actif :
```typescript
try {
  await stdioManager.getOrSpawn(dep);  // Spawns process
  // timeout peut arriver ici
} catch (error) {
  // Process NOT shut down!
  return { serverName, tools: [], config, error };
}
```

**Resolution:** Appeler `stdioManager.shutdown(serverName)` dans le catch block.

---

## Medium Severity Issues

### F8: Environment Variable Leak via Placeholder
**Severity:** Medium | **Validity:** Valid
**Location:** `packages/pml/src/config.ts:37-39`

Quand une env var n'est pas définie, le placeholder est préservé :
```typescript
return `\${${varName}}`;  // Révèle le nom du secret attendu
```

**Resolution:** Logger le warning mais retourner une chaîne vide ou lever une erreur.

---

### F9: TEXT[] Type Mismatch
**Severity:** Medium | **Validity:** Undecided
**Location:** `src/api/tools.ts:142`

`args` est un `string[]` JavaScript, la colonne est `TEXT[]` PostgreSQL. La sérialisation dépend du driver.

**Resolution:** Vérifier avec le driver postgres.js utilisé. Potentiellement utiliser `array_to_string()` ou sérialiser explicitement.

---

### F10: Missing Tool Name Validation
**Severity:** Medium | **Validity:** Valid
**Location:** `packages/pml/src/discovery/mcp-discovery.ts:85-89`

Validation minimale :
```typescript
if (!tool.name || typeof tool.name !== "string") {
  return false;
}
```

Manque :
- Longueur max (DoS via noms gigantesques)
- Caractères interdits (newlines, null bytes)
- Pattern réservé (`:` casse le parsing `serverName:toolName`)

**Resolution:** Ajouter validation regex et longueur max.

---

### ~~F11: HTTP Servers Silently Skipped~~ ✅ FIXED
**Severity:** Medium | **Validity:** Valid → Fixed
**Location:** `packages/pml/src/cli/stdio-command.ts:709-718`

~~Viole la policy `.claude/rules/no-silent-fallbacks.md`~~

**Fix:** Les failures de discovery envoient une **notification MCP** (`notifications/message` level=warning). Le client (Claude Code) affiche ce warning à l'utilisateur. Les logs stderr sont invisibles en mode stdio, donc la notification MCP est la seule façon de communiquer avec l'utilisateur.

---

### F12: Missing FK tool_observations → tool_schema
**Severity:** Medium | **Validity:** Undecided
**Location:** `src/db/migrations/042_tool_observations.ts:29`

Pas de foreign key de `tool_observations.tool_id` vers `tool_schema.tool_id`.

**Consideration:** Peut être intentionnel - on peut observer des tools avant qu'ils soient dans tool_schema. À discuter.

---

## Low Severity Issues

### F13: Error Response Leaks Internal Details
**Severity:** Low | **Validity:** Valid
**Location:** `src/api/tools.ts:158`

```typescript
return errorResponse(`Sync failed: ${error}`, 500, corsHeaders);
```

Peut révéler stack traces ou erreurs SQL au client.

**Resolution:** Logger l'erreur complète côté serveur, retourner un message générique au client.

---

### F14: Missing Rate Limiting
**Severity:** Low | **Validity:** Undecided
**Location:** `src/api/tools.ts:79-160`

Pas de rate limiting sur `/api/tools/sync`. Un attaquant avec API key peut flood la DB.

**Consideration:** Peut être géré au niveau API gateway/nginx. À vérifier.

---

### F15: No Transaction for Multi-Table Inserts
**Severity:** Low | **Validity:** Valid
**Location:** `src/api/tools.ts:121-147`

Les inserts dans `tool_schema` et `tool_observations` ne sont pas dans une transaction. Si le second échoue, état incohérent.

**Resolution:** Wrapper dans `db.transaction()`.

---

### F16: Missing Tests
**Severity:** Low | **Validity:** Valid
**Location:** Tous les nouveaux fichiers

Aucun test pour :
- `packages/pml/src/config.ts`
- `packages/pml/src/discovery/mcp-discovery.ts`
- `packages/pml/src/discovery/tool-sync.ts`
- `src/api/tools.ts` (handleToolsSync)
- `src/db/migrations/042_tool_observations.ts`

**Resolution:** Écrire des tests unitaires.

---

### F17: Restart Count Reset Behavior
**Severity:** Low | **Validity:** Undecided
**Location:** `packages/pml/src/loader/stdio-manager.ts:466`

Le compteur de restart est effacé sur succès. Si le process crash plus tard, compteur repart à 0.

**Consideration:** Comportement peut être intentionnel (reset après stabilisation). À discuter.

---

## Fixed During Implementation

### ✅ F-ENV: Environment Variables Not Passed to MCP Servers
**Fixed:** 2026-01-28

Les variables `env` de `mcpServers[name].env` n'étaient pas passées aux processus spawned.

**Fix:**
1. Ajout de `env?: Record<string, string>` à `McpDependency`
2. `configToDependency()` passe `config.env`
3. `spawn()` fusionne `Deno.env.toObject()` + `dep.env`

---

### ✅ F4: Race Condition in Crash Handler
**Fixed:** 2026-01-28

**Fix:** Ajout de `restartingProcesses` Set et `restartPromises` Map pour bloquer les spawns concurrents pendant un restart.

---

### ✅ F5: DoS via Discovery Timeout Stacking
**Fixed:** 2026-01-28

**Fix:**
1. Parallélisation avec limite de concurrence (5 par défaut)
2. Timeout global (60s)
3. Discovery async (fire-and-forget) - ne bloque plus le démarrage

---

### ✅ F7: Resource Leak - Process Not Cleaned on Discovery Error
**Fixed:** 2026-01-28

**Fix:** Ajout de `stdioManager.shutdown(serverName)` dans le catch block.

---

### ✅ F8: Environment Variable Leak via Placeholder
**Fixed:** 2026-01-28

**Fix:** Retourne chaîne vide au lieu du placeholder quand env var non définie.

---

### ✅ F10: Missing Tool Name Validation
**Fixed:** 2026-01-28

**Fix:** Ajout de validation longueur max (256) et pattern regex (alphanumeric, _, -, .).

---

### ✅ F13: Error Response Leaks Internal Details
**Fixed:** 2026-01-28

**Fix:** Log stack trace côté serveur, retourne message générique au client.

---

### ✅ F15: No Transaction for Multi-Table Inserts
**Fixed:** 2026-01-28

**Fix:** Wrapper tool_schema + tool_observations dans `db.transaction()`.

---

### ✅ F11: HTTP Servers Silently Skipped
**Fixed:** 2026-01-28

**Fix:** Les failures de discovery envoient maintenant une **notification MCP** (`notifications/message` level=warning) via `sendNotification()` dans `stdio-command.ts:709-718`. Le client (Claude Code) affiche ce warning à l'utilisateur. Les logs stderr sont invisibles en mode stdio.

---

### ✅ F6: Memory Leak - AJV Compiled Schemas
**Fixed:** 2026-01-28

**Fix:** Remplacé `ajv.compile()` par `ajv.validateSchema()` dans `mcp-discovery.ts:122-127`. `validateSchema()` vérifie la validité du schema sans le stocker en mémoire, évitant ainsi la croissance non bornée.

---

## Prioritized Action Items

1. **F7** - Resource leak on discovery error (High, quick fix)
2. **F4** - Race condition in crash handler (High)
3. **F11** - HTTP servers silent skip (Medium, violates project policy)
4. **F5** - Discovery timeout stacking (High, but rare in practice)
5. **F15** - Transaction wrapping (Low, quick fix)
