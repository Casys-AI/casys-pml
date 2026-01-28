# Review Findings - Tech-Spec 01: MCP Config Sync

**Date:** 2026-01-28
**Reviewer:** Adversarial Code Review (automated)
**Status:** Pending Resolution

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| Critical | 3 | 1 noise, 1 fixed, 1 accepted |
| High | 4 | ✅ 4/4 (F6 was undecided, now fixed) |
| Medium | 5 | ✅ 5/5 |
| Low | 5 | ✅ 3/5 + 1 accepted |

---

## Critical Issues

### ~~F1: SQL Injection via Tool Names~~ ✅ FIXED
**Severity:** Critical | **Validity:** Valid → Fixed
**Location:** `src/api/tools.ts:40-55, 135-145`

~~Le `toolId` est construit par concaténation de `serverName` et `tool.name` provenant du client.~~

**Fix:** Ajout de validation serveur-side avec `isValidName()`:
- Max 256 caractères
- Pattern regex: alphanumeric, `_`, `-`, `.` uniquement
- Pas de `:` (réservé pour format `serverName:toolName`)
- Pas de control characters, newlines, null bytes
- Skip et log warning si invalide

---

### F2: tool_schema Table Missing ❌ NOISE
**Severity:** Critical | **Validity:** Noise

La table `tool_schema` existe déjà dans migration 001_initial.sql. Faux positif.

---

### F3: Command Injection via MCP Server Config ✅ ACCEPTED RISK
**Severity:** Critical | **Validity:** Valid but Accepted
**Location:** `packages/pml/src/config.ts`

Les `command` et `args` de la config sont passés directement à `Deno.Command`.

**Risk Assessment:**
- La config MCP (`.pml.json`) est **locale sur la machine du client**
- Les commandes ne sont **jamais envoyées au serveur cloud** - seuls les tools découverts (name, description, schema) sont sync
- Si un attaquant peut modifier `.pml.json`, il a déjà accès local à la machine
- Même modèle de sécurité que la config MCP de Claude Code

**Decision:** Risque accepté. La config est sous contrôle de l'utilisateur local.

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

### ~~F9: TEXT[] Type Mismatch~~ ✅ FIXED
**Severity:** Medium | **Validity:** Valid → Fixed
**Location:** `src/api/tools.ts:40-57, 180`

~~`args` est un `string[]` JavaScript, la colonne est `TEXT[]` PostgreSQL.~~

**Fix:** Ajout de `toPostgresArray()` qui sérialise explicitement en format PostgreSQL array littéral (`{val1,val2}`). Fonctionne avec postgres.js (`.unsafe()`) et PGlite (`.exec()`). Cast explicite `$4::text[]` pour plus de sécurité.

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

### ~~F12: Missing FK tool_observations → tool_schema~~ ✅ FIXED
**Severity:** Medium | **Validity:** Valid → Fixed
**Location:** `src/db/migrations/043_tool_observations_fk.ts`

~~Pas de foreign key de `tool_observations.tool_id` vers `tool_schema.tool_id`.~~

**Fix:** Nouvelle migration 043 ajoute la FK avec `ON DELETE CASCADE`. L'ordre d'insertion (tool_schema avant tool_observations) dans la transaction F15 garantit que la FK ne bloque pas.

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

### ~~F16: Missing Tests~~ ✅ FIXED
**Severity:** Low | **Validity:** Valid → Fixed
**Location:** Nouveaux fichiers de test

~~Aucun test pour les nouveaux fichiers.~~

**Fix:** Tests ajoutés :
- `packages/pml/tests/config_test.ts` — 15 tests pour loadMcpServers, getMcpServersList, getMissingEnvVars
- `packages/pml/tests/discovery_test.ts` — 6 tests pour summarizeDiscovery
- `packages/pml/tests/tool_sync_test.ts` — 4 tests pour syncDiscoveredTools
- `tests/unit/api/tools_api_test.ts` — 19 tests pour toPostgresArray, isValidName

---

### F17: Restart Count Reset Behavior ✅ ACCEPTED
**Severity:** Low | **Validity:** Intentional
**Location:** `packages/pml/src/loader/stdio-manager.ts:466`

Le compteur de restart est effacé après un restart réussi.

**Decision:** Comportement voulu. Après stabilisation du process, on considère que le crash précédent était isolé. Le max 3 restarts protège contre les crash loops rapides.

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

### ✅ F1: SQL Injection via Tool Names
**Fixed:** 2026-01-28

**Fix:** Ajout de validation serveur-side `isValidName()` dans `src/api/tools.ts`. Valide `serverName` et `tool.name` avant construction du `toolId`. Même pattern que F10 côté client (max 256 chars, regex alphanumeric + `_-.`).

---

### ✅ F12: Missing FK tool_observations → tool_schema
**Fixed:** 2026-01-28

**Fix:** Nouvelle migration `043_tool_observations_fk.ts` ajoute la FK `fk_tool_observations_tool_schema` avec `ON DELETE CASCADE`. Garantit l'intégrité référentielle au niveau DB.

---

### ✅ F9: TEXT[] Type Mismatch
**Fixed:** 2026-01-28

**Fix:** Ajout de `toPostgresArray()` dans `src/api/tools.ts` pour sérialiser `string[]` → PostgreSQL array littéral. Compatible postgres.js et PGlite.

---

### ✅ F16: Missing Tests
**Fixed:** 2026-01-28

**Fix:** Ajout de 44 tests unitaires couvrant :
- Config loader (15 tests)
- MCP Discovery (6 tests)
- Tool Sync (4 tests)
- Tools API utils (19 tests)

---

## Prioritized Action Items

1. **F7** - Resource leak on discovery error (High, quick fix)
2. **F4** - Race condition in crash handler (High)
3. **F11** - HTTP servers silent skip (Medium, violates project policy)
4. **F5** - Discovery timeout stacking (High, but rare in practice)
5. **F15** - Transaction wrapping (Low, quick fix)
