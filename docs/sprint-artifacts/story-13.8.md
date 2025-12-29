# Story 13.8: Unified PML Registry (MCP + Capabilities)

**Epic:** 13 - Capability Naming & Curation **Story ID:** 13.8 **Status:** ready-for-dev **Estimated
Effort:** 4-6 heures

---

## User Story

**As a** platform developer, **I want** a unified registry for MCP servers and capabilities, **So
that** I can manage both types uniformly and support cloud/local routing decisions.

---

## Context

Aujourd'hui :

- **Capabilities** → stockées dans `capability_records`
- **MCP servers** → configurés dans `mcp-permissions.yaml` (pas de table)

Problème : incohérence. On veut gérer les deux de manière uniforme.

Solution : Renommer `capability_records` → `pml_registry` et ajouter `record_type` pour distinguer
capabilities des MCP servers.

---

## Acceptance Criteria

1. **AC1: Table renommée**
   - `capability_records` → `pml_registry`
   - Tous les index et contraintes migrés

2. **AC2: Colonnes ajoutées**
   - `record_type TEXT DEFAULT 'capability' CHECK (record_type IN ('capability', 'mcp-server'))`
   - `code_url TEXT` (optionnel, pour futur téléchargement dynamique)

3. **AC3: Code mis à jour**
   - Tous les fichiers référençant `capability_records` mis à jour vers `pml_registry`
   - Tests passent

4. __AC4: cap:_ tools fonctionnent_*
   - `cap:list`, `cap:lookup`, `cap:whois`, `cap:rename` fonctionnent avec la nouvelle table
   - Réponses incluent `record_type` dans les métadonnées

---

## Out of Scope (Différé)

- ❌ Seeding des MCP servers (sera fait quand on voudra gérer via API)
- ❌ Versioning `@v1.2.0` (Story 13.6)
- ❌ Visibility enforcement cross-org (Epic 14)
- ❌ Installation dynamique de MCPs via `code_url`

---

## Tasks / Subtasks

### Phase 1: Migration DB (1-2h)

- [ ] **Task 1: Créer migration 029** (AC: #1, #2)
  - [ ] `ALTER TABLE capability_records RENAME TO pml_registry`
  - [ ] Ajouter colonne `record_type`
  - [ ] Ajouter colonne `code_url`
  - [ ] Mettre à jour les index si nécessaire
  - [ ] Rollback: rename inverse + drop colonnes

### Phase 2: Mise à jour du code (2-3h)

- [ ] **Task 2: Mettre à jour capability-registry.ts** (AC: #3)
  - [ ] Remplacer toutes les références `capability_records` → `pml_registry`
  - [ ] Tests unitaires passent

- [ ] **Task 3: Mettre à jour capability-store.ts** (AC: #3)
  - [ ] Remplacer les requêtes SQL
  - [ ] Tests unitaires passent

- [ ] **Task 4: Mettre à jour lib/std/cap.ts** (AC: #3, #4)
  - [ ] Remplacer les requêtes SQL
  - [ ] Ajouter `recordType` dans les réponses de cap:whois
  - [ ] Tests unitaires passent

- [ ] **Task 5: Mettre à jour les autres fichiers** (AC: #3)
  - [ ] `execute-handler.ts`
  - [ ] `discover-handler.ts`
  - [ ] `capability-executor.ts`
  - [ ] `capability-server.ts`
  - [ ] `types.ts`
  - [ ] `data-service.ts`

- [ ] **Task 6: Mettre à jour les migrations existantes** (AC: #3)
  - [ ] Vérifier que les migrations 021-028 référencent le bon nom
  - [ ] Note: Les anciennes migrations gardent `capability_records` (c'était le nom à l'époque)

### Phase 3: Tests (1h)

- [ ] **Task 7: Tests d'intégration** (AC: #4)
  - [ ] Tester cap:list avec la nouvelle table
  - [ ] Tester cap:lookup
  - [ ] Tester cap:whois (vérifier recordType dans réponse)
  - [ ] Tester cap:rename

- [ ] **Task 8: Validation manuelle**
  - [ ] Lancer le serveur
  - [ ] Exécuter des requêtes via pml:execute
  - [ ] Vérifier les 107 capabilities existantes sont accessibles

---

## Files to Update

```
src/capabilities/capability-registry.ts
src/capabilities/capability-store.ts
src/capabilities/types.ts
src/capabilities/data-service.ts
src/mcp/handlers/execute-handler.ts
src/mcp/handlers/discover-handler.ts
src/mcp/capability-server/services/capability-executor.ts
src/mcp/capability-server/server.ts
lib/std/cap.ts
tests/unit/lib/std/cap_test.ts
```

---

## Technical Notes

### Nouvelle structure de `pml_registry`

```sql
CREATE TABLE pml_registry (
  -- Identity (inchangé)
  id UUID PRIMARY KEY,
  org TEXT NOT NULL,
  project TEXT NOT NULL,
  namespace TEXT NOT NULL,
  action TEXT NOT NULL,
  hash TEXT NOT NULL,

  -- Type discrimination (NOUVEAU)
  record_type TEXT DEFAULT 'capability'
    CHECK (record_type IN ('capability', 'mcp-server')),
  code_url TEXT,  -- URL pour MCP servers (futur)

  -- Provenance (inchangé)
  created_by TEXT NOT NULL DEFAULT 'local',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  updated_at TIMESTAMPTZ,

  -- Versioning (inchangé)
  version INTEGER NOT NULL DEFAULT 1,
  version_tag TEXT,

  -- Trust (inchangé)
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  signature TEXT,

  -- Metrics (inchangé)
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  total_latency_ms BIGINT NOT NULL DEFAULT 0,

  -- Metadata (inchangé)
  tags TEXT[] DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'project', 'org', 'public')),
  routing TEXT NOT NULL DEFAULT 'local'
    CHECK (routing IN ('local', 'cloud')),
  tools_used TEXT[] DEFAULT '{}',

  -- FK (inchangé)
  workflow_pattern_id UUID REFERENCES workflow_pattern(pattern_id)
);
```

### Exemples après migration

```
-- Capability existante
namespace="fs", action="read_json", record_type="capability", routing="local"

-- Futur MCP server (après seeding)
namespace="mcp", action="filesystem", record_type="mcp-server", routing="local"
namespace="mcp", action="tavily", record_type="mcp-server", routing="cloud"
```

---

## Definition of Done

- [ ] Migration 029 créée et testée (up + down)
- [ ] Tous les fichiers mis à jour
- [ ] `deno task test` passe
- [ ] `deno task check` passe
- [ ] cap:list, cap:lookup, cap:whois fonctionnent
- [ ] Les 107 capabilities existantes accessibles
