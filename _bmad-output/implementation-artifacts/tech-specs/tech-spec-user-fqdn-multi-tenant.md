# Tech Spec: User FQDN Multi-Tenant

## Contexte

Les capabilities sont actuellement créées avec `org: "local", project: "default"` hardcodé, ce qui empêche:
1. Le client PML de trouver les capabilities (il cherche `pml.mcp.*`)
2. L'isolation multi-tenant (tout est dans le même namespace)

## Objectif

Permettre aux capabilities d'être associées à un user avec un FQDN de la forme:
```
{username}.default.{namespace}.{action}.{hash}
```

## Schema Actuel

### État actuel (confirmé via psql)

| Table | Colonnes | Nullable | Default | Action |
|-------|----------|----------|---------|--------|
| `capability_records` | `created_by`, `updated_by` | NO/YES | 'local' | Ajouter `user_id FK`, supprimer les deux |
| `workflow_pattern` | `created_by` | YES | 'local' | Ajouter `user_id FK`, supprimer |
| `execution_trace` | `user_id`, `created_by`, `updated_by` | YES | 'local' | Convertir `user_id` → FK, supprimer les autres |
| `workflow_execution` | `user_id`, `created_by`, `updated_by` | YES | - | Convertir `user_id` → FK, supprimer les autres |
| `algorithm_traces` | `user_id` | YES | - | Convertir → UUID FK |
| `entropy_history` | `user_id` | YES | - | Convertir → UUID FK |
| `shgat_params` | `user_id` | NO | 'local' | **Supprimer** (modèle global, pas par user) |

### Problèmes

1. `user_id` est `TEXT` partout, pas de FK vers `users`
2. Valeurs mixtes: `NULL`, `"local"`, UUIDs valides
3. `created_by` contient "local" ou "migration" - inutile en prod
4. `updated_by` existe sur 3 tables mais n'est jamais utilisé (toujours NULL)
5. `capability_records` n'a pas de `user_id`, seulement `created_by`

## Architecture

### Relations entre tables

```
workflow_pattern (le code, dédupliqué par hash)
  └─ user_id → créateur original du pattern
       │
       ├──► capability_records (registre, par user)
       │      └─ user_id → propriétaire de cette entrée
       │      └─ org = username (FQDN)
       │      └─ visibility = private/public
       │      └─ workflow_pattern_id → lien vers le code
       │
       └──► execution_trace (traces d'exécution)
              └─ user_id → celui qui exécute (peut être différent du créateur)
```

### Pourquoi duplication dans capability_records ?

**Scénario :** Alice crée une capability privée, Bob crée indépendamment la même.

```
workflow_pattern (pattern_123)
  └─ code_hash = abc123  (dédupliqué, même code)
       │
       ├──► capability_records (alice)
       │      org = alice, visibility = private
       │      → alice.default.startup.fullProfile
       │
       └──► capability_records (bob)
              org = bob, visibility = private
              → bob.default.startup.fullProfile
```

- **workflow_pattern** : dédupliqué par hash (pas de gaspillage stockage)
- **capability_records** : par user pour isolation (duplication justifiée pour ACL)

Bob ne peut pas voir celle d'Alice (private), donc il a besoin de sa propre entrée.

## Schema Proposé

### Convention

- **Remplacer `created_by TEXT` par `user_id UUID FK`** (pas ajouter à côté)
- Le context process ("pml_execute") n'est pas utile en prod, on le supprime

### Migration

#### Étape 0: Nettoyage des UUIDs orphelins

Avant d'ajouter les FK, nettoyer les UUIDs qui référencent des users supprimés:

```sql
-- Identifier les orphelins (user supprimé)
-- Trouvé: 27e4dc88-5a92-44bd-87ba-e9c694a9e757 (41 rows dans entropy_history)

-- Mettre à NULL les UUIDs orphelins dans toutes les tables
UPDATE execution_trace SET user_id = NULL
WHERE user_id ~ '^[0-9a-f]{8}-' AND user_id::uuid NOT IN (SELECT id FROM users);

UPDATE algorithm_traces SET user_id = NULL
WHERE user_id ~ '^[0-9a-f]{8}-' AND user_id::uuid NOT IN (SELECT id FROM users);

UPDATE entropy_history SET user_id = NULL
WHERE user_id ~ '^[0-9a-f]{8}-' AND user_id::uuid NOT IN (SELECT id FROM users);

UPDATE workflow_execution SET user_id = NULL
WHERE user_id IS NOT NULL
AND user_id ~ '^[0-9a-f]{8}-'
AND user_id::uuid NOT IN (SELECT id FROM users);
```

#### Étape 1: capability_records

```sql
-- Ajouter user_id
ALTER TABLE capability_records
ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Migrer les données si created_by contient des UUIDs valides
UPDATE capability_records
SET user_id = created_by::uuid
WHERE created_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Supprimer created_by et updated_by
ALTER TABLE capability_records DROP COLUMN created_by;
ALTER TABLE capability_records DROP COLUMN updated_by;

-- Index
CREATE INDEX idx_capability_records_user ON capability_records(user_id);
```

#### Étape 2: workflow_pattern

```sql
ALTER TABLE workflow_pattern
ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE workflow_pattern
SET user_id = created_by::uuid
WHERE created_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

ALTER TABLE workflow_pattern DROP COLUMN created_by;

CREATE INDEX idx_workflow_pattern_user ON workflow_pattern(user_id);
```

#### Étape 3: execution_trace

```sql
-- Supprimer created_by et updated_by (inutiles)
ALTER TABLE execution_trace DROP COLUMN created_by;
ALTER TABLE execution_trace DROP COLUMN updated_by;

-- Convertir user_id TEXT → UUID
ALTER TABLE execution_trace ADD COLUMN user_id_new UUID;

UPDATE execution_trace
SET user_id_new = user_id::uuid
WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

ALTER TABLE execution_trace DROP COLUMN user_id;
ALTER TABLE execution_trace RENAME COLUMN user_id_new TO user_id;

ALTER TABLE execution_trace
ADD CONSTRAINT fk_execution_trace_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_execution_trace_user ON execution_trace(user_id);
```

#### Étape 4: workflow_execution

```sql
-- Supprimer created_by et updated_by
ALTER TABLE workflow_execution DROP COLUMN created_by;
ALTER TABLE workflow_execution DROP COLUMN updated_by;

-- Convertir user_id TEXT → UUID
ALTER TABLE workflow_execution ADD COLUMN user_id_new UUID;

UPDATE workflow_execution
SET user_id_new = user_id::uuid
WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

ALTER TABLE workflow_execution DROP COLUMN user_id;
ALTER TABLE workflow_execution RENAME COLUMN user_id_new TO user_id;

ALTER TABLE workflow_execution
ADD CONSTRAINT fk_workflow_execution_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_workflow_execution_user ON workflow_execution(user_id);
```

#### Étape 5: algorithm_traces, entropy_history, shgat_params

Pour chaque table:

```sql
-- Convertir user_id TEXT → UUID
ALTER TABLE {table} ADD COLUMN user_id_new UUID;

UPDATE {table}
SET user_id_new = user_id::uuid
WHERE user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

ALTER TABLE {table} DROP COLUMN user_id;
ALTER TABLE {table} RENAME COLUMN user_id_new TO user_id;

ALTER TABLE {table}
ADD CONSTRAINT fk_{table}_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_{table}_user ON {table}(user_id);
```

Note: Pour `shgat_params`, **supprimer** la colonne `user_id` (modèle global entraîné sur les traces de tous les users).

## Code Changes

### 1. Server: Utiliser userId pour construire le scope

Le `userId` est **déjà passé** aux handlers. Le travail est d'utiliser ce userId pour construire un scope dynamique au lieu du `DEFAULT_SCOPE` hardcodé.

**Fichiers à modifier:**
- `src/mcp/handlers/cap-handler.ts` (ligne 292: `DEFAULT_SCOPE`)
- `src/mcp/handlers/workflow-execution-handler.ts` (lignes 735, 746-747)
- `src/application/use-cases/execute/execute-direct.use-case.ts` (lignes 191, 568, 584-585)
- `src/mcp/handlers/shared/tool-definitions.ts` (ligne 123)

**Pattern:**
```typescript
// Avant
const DEFAULT_SCOPE = { org: "local", project: "default" };
// ... utilisé partout avec org: DEFAULT_SCOPE.org

// Après
const username = await getUsernameById(userId);
const scope = {
  org: username ?? "local",
  project: "default",
};
```

### 2. Lookup username depuis userId

```typescript
// Nouveau helper dans src/lib/user.ts
export async function getUsernameById(userId: string): Promise<string | null> {
  const db = await getDb();
  const result = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result[0]?.username ?? null;
}
```

### 3. Register Response: Retourner org/project

**Fichier:** `src/mcp/server/app.ts` (route `/pml/register`)

```typescript
// Ajouter au response
const response = {
  sessionId,
  expiresAt,
  heartbeatIntervalMs,
  features: { ... },
  // Nouveau
  scope: {
    org: user.username,
    project: "default"
  }
};
```

### 4. Client: Utiliser org/project du register

**Fichier:** `packages/pml/src/session/client.ts`

```typescript
interface RegisterResponse {
  sessionId: string;
  expiresAt: string;
  heartbeatIntervalMs: number;
  features: { ... };
  // Nouveau
  scope: {
    org: string;
    project: string;
  };
}

// Stocker le scope
private _scope: { org: string; project: string } | null = null;

get scope() { return this._scope; }
```

### 5. Client: Modifier toolNameToFqdn

**Fichier:** `packages/pml/src/loader/registry-client.ts`

```typescript
export function toolNameToFqdn(
  toolName: string,
  scope?: { org: string; project: string }
): string {
  if (toolName.split(".").length > 2) {
    return toolName;
  }

  const normalized = toolName.replace(/:/g, ".");

  // MCP tools (std:*, filesystem:*, etc.)
  if (isMcpTool(normalized)) {
    return `pml.mcp.${normalized}`;
  }

  // User capabilities
  const org = scope?.org ?? "local";
  const project = scope?.project ?? "default";
  return `${org}.${project}.${normalized}`;
}

function isMcpTool(name: string): boolean {
  const mcpPrefixes = ["std", "filesystem", "memory", "fetch", "github", ...];
  const prefix = name.split(".")[0];
  return mcpPrefixes.includes(prefix);
}
```

## Fallback / Backward Compatibility

1. Si pas de user authentifié → `local.default.*` (mode local)
2. Si user authentifié → `{username}.default.*`
3. Les records existants avec `local.default` restent accessibles

## Tests

1. Créer capability en mode local → `local.default.namespace.action`
2. Créer capability avec user → `username.default.namespace.action`
3. Client PML résout correctement les FQDNs
4. FK constraints fonctionnent
5. Pas de régression sur les données existantes

## Estimation

| Tâche | Effort |
|-------|--------|
| Migration SQL | 1h |
| Server: passer user_id | 2h |
| Server: register response | 30min |
| Client: scope storage | 30min |
| Client: toolNameToFqdn | 1h |
| Tests | 1h |
| **Total** | ~6h |

## Risques

1. **Migration données existantes**: Les records avec `user_id = "local"` ou `created_by = "pml_execute"` seront NULL après migration
2. **Orphaned capabilities**: Avec `ON DELETE SET NULL`, les capabilities d'un user supprimé auront `user_id = NULL` mais resteront en base
3. **Performance**: Lookup username à chaque création de capability (mitigé par cache)

## Décisions prises

1. ✅ `ON DELETE SET NULL` pour les FK (préserve les données même si user supprimé)
2. ✅ Supprimer `created_by` et le remplacer par `user_id UUID FK`
3. ⏳ À décider: Migrer les données existantes vers un user "system" ou laisser NULL?

---

## Implementation Status (2026-01-13)

### ✅ Fait

| Tâche | Fichiers | Notes |
|-------|----------|-------|
| Migration SQL (039) | `src/db/migrations/039_user_fqdn_multi_tenant.ts` | Toutes les étapes 0-7 implémentées |
| Helper `getUsernameById` | `src/lib/user.ts` | + `getUserScope()` et `buildFqdn()` + `DEFAULT_SCOPE` exporté |
| Register Response avec scope | `src/mcp/sessions/types.ts`, `src/mcp/sessions/session-store.ts` | `UserScope` interface + `scope` dans response |
| App: résoudre scope | `src/mcp/server/app.ts` | Route `/pml/register` appelle `getUserScope(userId)` |
| Client: stocker scope | `packages/pml/src/session/client.ts` | `_scope` stocké, getter `scope` |
| Tests TDD | `tests/unit/db/migrations/user_fqdn_multi_tenant_test.ts`, `tests/unit/lib/user_test.ts`, `tests/unit/mcp/sessions/register_scope_test.ts` | 20 tests passent |
| **Server: Utiliser userId pour construire le scope** | `cap-handler.ts`, `workflow-execution-handler.ts`, `execute-direct.use-case.ts` | Scope dynamique via `getUserScope(userId)` |
| **Types: createdBy → userId** | `fqdn.ts`, `capability-registry.ts`, `cap-handler.ts` | `createdBy` et `updatedBy` supprimés, remplacés par `userId UUID FK` |
| **SQL: created_by → user_id** | `execution-trace-store.ts`, `capability-store.ts`, `data-service.ts`, `user-usage.ts`, `db-sync.ts`, `api/traces.ts` | Toutes les requêtes SQL mises à jour, `updated_by` supprimé de `updatePriority()` |
| **Scopes dynamiques services** | `capability-executor.ts`, `capability-server/server.ts`, `gateway-server.ts`, `rpc-router.ts`, `worker-bridge.ts` | Passage de `userId` à travers la chaîne d'appels |
| **Code transformer** | `code-transformer.ts`, `capability-store.ts` | Import `DEFAULT_SCOPE` centralisé, passage du scope dynamique à `transformCapabilityRefs()` |
| **API user delete** | `src/web/routes/api/user/delete.ts` | `SET user_id = NULL` au lieu de `created_by = $1, updated_by = $1` |
| **lib/std types** | `lib/std/cap.ts` | `CapWhoisResponse.userId` au lieu de `createdBy`/`updatedBy` |

### ✅ Tests migrés

| Fichier | Correction |
|---------|-----------|
| `tests/unit/capabilities/capability-store-edge-cases.test.ts` | `created_by` → `user_id` |
| `tests/integration/multi_tenant_isolation_test.ts` | SQL + assertions mis à jour |
| `tests/integration/capability_server_e2e_test.ts` | `created_by` → `user_id`, `display_name` supprimé |

### ❌ Pas fait

| Tâche | Raison |
|-------|--------|
| **Client: Modifier `toolNameToFqdn`** | **Abandonné**. La distinction MCP tool vs user capability doit se faire côté serveur, pas client. Le client ne peut pas savoir si un tool name est un MCP tool sans liste hardcodée de namespaces. |

### Notes d'implémentation

1. La migration 039 n'est pas encore exécutée sur la DB prod - sera appliquée au prochain démarrage serveur
2. Le scope retourné par `/pml/register` est `{ org: username, project: "default" }` ou `{ org: "local", project: "default" }` en mode local
3. **Changement de schema API**: `CapabilityRecord.createdBy` → `CapabilityRecord.userId` (UUID FK), `updatedBy` supprimé
4. `CreateCapabilityRecordInput.createdBy` → `CreateCapabilityRecordInput.userId`
5. SQL: `INSERT INTO capability_records ... user_id` au lieu de `created_by`
6. **Chaîne d'appels multi-tenant**: Gateway → CapabilityMCPServer → CapabilityExecutor, tous passent `userId`
7. **RpcRouter et WorkerBridge**: Ajout de `userId` dans les configs pour scope dynamique
8. **DEFAULT_SCOPE centralisé**: Importé depuis `lib/user.ts` au lieu de définitions locales
