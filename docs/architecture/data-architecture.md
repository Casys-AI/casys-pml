# Data Architecture

_Status: Updated December 2025_

## 0. Vue d’ensemble

```
┌──────────────┐        ┌───────────────────┐        ┌───────────┐
│   Deno KV    │<──────►│ Auth Layer        │        │  Clients  │
│ (sessions)   │        │ (OAuth/API keys)  │        │ (CLI/UI)  │
└──────┬───────┘        └────────┬──────────┘        └────┬──────┘
       │                          │                        │ SSE/Web
       ▼                          ▼                        ▼
┌──────────────┐        ┌───────────────────┐        ┌─────────────┐
│  Drizzle ORM │        │  GraphRAG Engine  │        │ MCP Servers │
│  (users…)    │        │  + Sandbox        │        │ (stdio)     │
└──────┬───────┘        └────────┬──────────┘        └────┬────────┘
       │                          │                         │
       ▼                          ▼                         │
┌──────────────────────────────────────────────────────────────────┐
│                         PGlite (SQL + Vector)                    │
│ tool_schema • tool_embedding • tool_dependency • workflow_* ... │
└──────────────────────────────────────────────────────────────────┘
```

AgentCards manipule aujourd’hui **trois familles de stores** :

| Store                        | Rôle                                                      | Tech                                                                    |
| ---------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| **PGlite (SQL + vectors)**   | Index outils, GraphRAG learning, capabilities, télémétrie | `tool_*`, `workflow_*`, `episodic_*`, `adaptive_*`, `metrics`, `config` |
| **Drizzle ORM (sur PGlite)** | Données applicatives multi-tenant (users, API keys)       | `users`                                                                 |
| **Deno KV**                  | Sessions OAuth/API key, caches éphémères                  | `kv://auth/*`                                                           |

L’objectif à moyen terme est de basculer l’ensemble du schéma SQL sous Drizzle, mais tant que ce n’est pas fait **ce document sert d’inventaire de la réalité**.

---

## 1. PGlite – Stores persistants

### 1.1 Tool Index (Story 1.x)

| Table | Colonnes clés | Description | Notes |
| ----- | ------------- | ----------- | ----- |

### 1.2 GraphRAG Learning (Epic 2 → 6)

#### `tool_dependency`

| Colonne            | Type                      | Notes                      |
| ------------------ | ------------------------- | -------------------------- |
| `from_tool_id`     | `TEXT NOT NULL`           | Source edge.               |
| `to_tool_id`       | `TEXT NOT NULL`           | Destination edge.          |
| `observed_count`   | `INTEGER DEFAULT 1`       | Fréquence observée.        |
| `confidence_score` | `REAL DEFAULT 0.5`        | Score pondéré.             |
| `last_observed`    | `TIMESTAMP DEFAULT NOW()` | Dernière mise à jour.      |
| `source`           | `TEXT DEFAULT 'learned'`  | `learned`, `user`, `hint`. |

PK `(from_tool_id, to_tool_id)`. Index : `idx_tool_dependency_from`, `idx_tool_dependency_to`, `idx_tool_dependency_confidence`, `idx_tool_dependency_source`.

#### `workflow_execution`

| Colonne             | Type                                         | Notes                      |
| ------------------- | -------------------------------------------- | -------------------------- |
| `execution_id`      | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | —                          |
| `executed_at`       | `TIMESTAMP DEFAULT NOW()`                    | Timestamp.                 |
| `intent_text`       | `TEXT`                                       | Prompt utilisateur.        |
| `dag_structure`     | `JSONB NOT NULL`                             | DAG complet (tasks, deps). |
| `success`           | `BOOLEAN NOT NULL`                           | Résultat global.           |
| `execution_time_ms` | `INTEGER NOT NULL`                           | Durée totale.              |
| `error_message`     | `TEXT`                                       | Stack résumée si échec.    |
| `code_snippet`      | `TEXT` (migration 011)                       | Code exécuté.              |
| `code_hash`         | `TEXT` (migration 011)                       | SHA-256 normalisé.         |

Index : `idx_execution_timestamp`, `idx_workflow_execution_code_hash` (partial, non-null).

#### `workflow_pattern`

| Colonne             | Type                                                  | Notes                      |
| ------------------- | ----------------------------------------------------- | -------------------------- |
| `pattern_id`        | `UUID PRIMARY KEY DEFAULT gen_random_uuid()`          | —                          |
| `pattern_hash`      | `TEXT UNIQUE NOT NULL`                                | Hash DAG.                  |
| `dag_structure`     | `JSONB NOT NULL`                                      | Snapshot du workflow.      |
| `intent_embedding`  | `vector(1024) NOT NULL`                               | Pour recherche sémantique. |
| `usage_count`       | `INTEGER DEFAULT 1`                                   | Observations totales.      |
| `success_count`     | `INTEGER DEFAULT 0`                                   | Succès.                    |
| `last_used`         | `TIMESTAMP DEFAULT NOW()`                             | Dernier usage.             |
| `code_snippet`      | `TEXT`                                                | Capability code.           |
| `code_hash`         | `TEXT`                                                | Unique (partial index).    |
| `parameters_schema` | `JSONB`                                               | Description des inputs.    |
| `cache_config`      | `JSONB DEFAULT '{"ttl_ms":3600000,"cacheable":true}'` | TTL / invalidation.        |
| `name`              | `TEXT`                                                | Nom humain.                |
| `description`       | `TEXT`                                                | Description.               |
| `success_rate`      | `REAL DEFAULT 1.0`                                    | Ratio.                     |
| `avg_duration_ms`   | `INTEGER DEFAULT 0`                                   | Temps moyen.               |
| `created_at`        | `TIMESTAMPTZ DEFAULT NOW()`                           | Date de promotion.         |
| `source`            | `TEXT DEFAULT 'emergent'`                             | `emergent` ou `manual`.    |

Index : `idx_pattern_intent_embedding` (HNSW), `idx_workflow_pattern_code_hash` (partial).

#### `adaptive_config`

| Colonne         | Type                      | Notes                         |
| --------------- | ------------------------- | ----------------------------- |
| `config_key`    | `TEXT PRIMARY KEY`        | `threshold_speculative`, etc. |
| `config_value`  | `REAL NOT NULL`           | Valeur actuelle.              |
| `last_updated`  | `TIMESTAMP DEFAULT NOW()` | —                             |
| `total_samples` | `INTEGER DEFAULT 0`       | Compteur d’apprentissage.     |

### 1.3 Adaptive Intelligence (ADR-008 / Episodic Memory)

#### `episodic_events`

| Colonne        | Type                        | Notes                                                                                                        |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`           | `TEXT PRIMARY KEY`          | UUID v4.                                                                                                     |
| `workflow_id`  | `TEXT NOT NULL`             | Regroupe les événements.                                                                                     |
| `event_type`   | `TEXT NOT NULL`             | `speculation_start`, `task_complete`, `ail_decision`, `hil_decision`, `workflow_start`, `workflow_complete`. |
| `task_id`      | `TEXT`                      | Optionnel.                                                                                                   |
| `timestamp`    | `TIMESTAMPTZ DEFAULT NOW()` | Ordonnancement.                                                                                              |
| `context_hash` | `TEXT`                      | Hash des dimensions contextuelles.                                                                           |
| `data`         | `JSONB NOT NULL`            | Payload libre (prediction/result).                                                                           |

Index : `idx_episodic_workflow`, `idx_episodic_type`, `idx_episodic_timestamp`, `idx_episodic_context_hash`, `idx_episodic_data` (GIN). Rétention : 30 jours ou 10k events.

#### `adaptive_thresholds`

| Colonne                | Type                         | Notes                              |
| ---------------------- | ---------------------------- | ---------------------------------- |
| `context_hash`         | `TEXT PRIMARY KEY`           | Lookup clé.                        |
| `context_keys`         | `JSONB NOT NULL`             | Détails (workflowType, domain...). |
| `suggestion_threshold` | `REAL NOT NULL DEFAULT 0.70` | Bounded 0.40–0.90.                 |
| `explicit_threshold`   | `REAL NOT NULL DEFAULT 0.50` | Bounded 0.30–0.80.                 |
| `success_rate`         | `REAL`                       | 0.0–1.0 nullable.                  |
| `sample_count`         | `INTEGER DEFAULT 0`          | #observations.                     |
| `created_at`           | `TIMESTAMPTZ DEFAULT NOW()`  | —                                  |
| `updated_at`           | `TIMESTAMPTZ DEFAULT NOW()`  | —                                  |

Index : `idx_adaptive_updated`, `idx_adaptive_context_keys` (GIN).

### 1.4 Workflow Continuity & DAG State

#### `workflow_checkpoint`

| Colonne       | Type                        | Notes                      |
| ------------- | --------------------------- | -------------------------- |
| `id`          | `TEXT PRIMARY KEY`          | UUID v4.                   |
| `workflow_id` | `TEXT NOT NULL`             | Identifiant commun.        |
| `timestamp`   | `TIMESTAMPTZ DEFAULT NOW()` | Pour pruning.              |
| `layer`       | `INTEGER NOT NULL`          | DAG layer courant (>=0).   |
| `state`       | `JSONB NOT NULL`            | `WorkflowState` sérialisé. |

Index : `idx_checkpoint_workflow_ts`, `idx_checkpoint_workflow_id`. Retention : 5 checkpoints / workflow.

#### `workflow_dags`

| Colonne       | Type                                            | Notes                   |
| ------------- | ----------------------------------------------- | ----------------------- |
| `workflow_id` | `TEXT PRIMARY KEY`                              | Aligné sur checkpoints. |
| `dag`         | `JSONB NOT NULL`                                | `DAGStructure`.         |
| `intent`      | `TEXT`                                          | Pour debug.             |
| `created_at`  | `TIMESTAMPTZ DEFAULT NOW()`                     | —                       |
| `expires_at`  | `TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'` | Auto cleanup.           |

Index : `idx_workflow_dags_expires`.

### 1.5 Capabilities (Epic 7)

Les colonnes supplémentaires de `workflow_pattern` (cf. §1.2) servent de stockage principal des capabilities (code, paramètres, TTL, stats). Pas de table dédiée supplémentaire tant qu’ADR-038 n’impose pas `capabilities`.

### 1.6 Telemetry & Operational Logging

#### `metrics`

| Colonne       | Type                        | Notes                                         |
| ------------- | --------------------------- | --------------------------------------------- |
| `id`          | `SERIAL PRIMARY KEY`        | —                                             |
| `metric_name` | `TEXT NOT NULL`             | `context_usage_pct`, `query_latency_ms`, etc. |
| `value`       | `REAL NOT NULL`             | Valeur numérique.                             |
| `timestamp`   | `TIMESTAMPTZ DEFAULT NOW()` | Série temporelle.                             |
| `metadata`    | `JSONB`                     | Contexte (tool ids, intent).                  |

Index : `idx_metrics_name_timestamp`, `idx_metrics_timestamp`. Retention cible: 90 jours.

#### `error_log`

| Colonne      | Type                      | Notes                                    |
| ------------ | ------------------------- | ---------------------------------------- |
| `id`         | `SERIAL PRIMARY KEY`      | —                                        |
| `error_type` | `TEXT NOT NULL`           | Catégorie (`GraphRAG`, `Sandbox`, etc.). |
| `message`    | `TEXT NOT NULL`           | Message principal.                       |
| `stack`      | `TEXT`                    | Stack trace.                             |
| `context`    | `JSONB`                   | Extra data.                              |
| `timestamp`  | `TIMESTAMP DEFAULT NOW()` | —                                        |

Index : `idx_error_log_timestamp`, `idx_error_log_type`.

### 1.4 Capabilities & Future Epic 7

| Table                                 | Colonnes clés                                                           | Description                                                      |
| ------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `workflow_pattern` (extension Epic 7) | + `code_snippet TEXT`, `parameters JSONB`, `cache_config JSONB`, `name` | Stocke les capabilities matérialisées (code, TTL, invalidation). |
| `workflow_dags`                       | `workflow_id`, `dag JSONB`, `status`, `created_at`                      | Planification DAG côté gateway (Story 6.x).                      |
| `workflow_checkpoints`                | `workflow_id`, `checkpoint_index`, `state JSONB`, `created_at`          | Permet la reprise/resume (Story 6.4).                            |

### 1.5 Telemetry / Observability

| Table                              | Colonnes clés                                         | Description                                                                                                |
| ---------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `metrics` (ex-`telemetry_metrics`) | `metric_name`, `value`, `metadata JSONB`, `timestamp` | Time-series simple (counts, latence). Index `(metric_name, timestamp DESC)`. Export futur vers ClickHouse. |

---

## 2. Drizzle ORM (PGlite driver)

| Table   | Description                                    | Source                   |
| ------- | ---------------------------------------------- | ------------------------ |
| `users` | Comptes multi-tenant (GitHub OAuth + API keys) | `src/db/schema/users.ts` |

### 2.1 `users` (Drizzle schema)

| Colonne           | Type                                     | Notes                                               |
| ----------------- | ---------------------------------------- | --------------------------------------------------- |
| `id`              | `uuid("id").primaryKey()`                | UUID v4 généré côté DB (Drizzle `defaultRandom()`). |
| `githubId`        | `text("github_id").unique()`             | ID GitHub (string). Nullable si API key only.       |
| `username`        | `text("username").notNull()`             | Handle affiché (GitHub login ou alias).             |
| `email`           | `text("email")`                          | Peut être `NULL` si non fourni.                     |
| `avatarUrl`       | `text("avatar_url")`                     | URL de l’avatar GitHub.                             |
| `role`            | `text("role").default("user")`           | `user`, `admin`, `ops` (RBAC futur).                |
| `apiKeyHash`      | `text("api_key_hash")`                   | Hash Argon2id (`hashApiKey`).                       |
| `apiKeyPrefix`    | `text("api_key_prefix").unique()`        | Prefix `ac_xxxxxx` pour lookup rapide (11 chars).   |
| `apiKeyCreatedAt` | `timestamp(..., { withTimezone: true })` | Timestamp de génération.                            |
| `createdAt`       | `timestamp(...).defaultNow()`            | Création compte.                                    |
| `updatedAt`       | `timestamp(...).defaultNow()`            | `DEFAULT NOW()` + trigger à venir.                  |

Contraintes :

- `apiKeyPrefix` unique (collisions détectées).
- `githubId` unique.
- `username` `NOT NULL` (sert d’identifiant CLI).

Roadmap Drizzle :

- Tables futures (`sessions`, `user_secrets`, `user_mcp_configs`) seront ajoutées dans `src/db/schema/` lors d’Epic 9.

> ✅ Décision : on migre progressivement les autres tables SQL vers Drizzle (Epic 9), mais tant que ce n’est pas fait, `users` reste la seule table exposée via `src/db/schema`.

---

## 3. Deno KV

`src/server/auth/kv.ts` expose un singleton `getKv()` utilisé par les modules auth/session. Les clés suivent une convention `namespace:key`.

| Namespace KV        | Contenu                                                | Retention                 | Product Owner |
| ------------------- | ------------------------------------------------------ | ------------------------- | ------------- |
| `auth/session:*`    | Sessions OAuth GitHub (access_token + profile minimal) | TTL 24h, invalidé logout  | Platform      |
| `auth/pending:*`    | PKCE/verifier state pendant l’OAuth dance              | TTL 15 min                | Platform      |
| `auth/api-key:*`    | Preuve d’API key (ratelimiting)                        | TTL 1h                    | Platform      |
| (futur) `secrets/*` | Cache chiffré de secrets utilisateurs (enveloppe KMS)  | TTL 10 min + eviction LRU | Capabilities  |

### 3.1 Détails KV

| Namespace                                    | Key format              | Valeur                                                 |
| -------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| `auth/session:${sessionId}`                  | `sessionId` = UUID v4   | `{ userId, githubToken, expiresAt }` (JSON serialisé)  |
| `auth/pending:${state}`                      | `state` = string random | `{ verifier, createdAt, redirectUri }`                 |
| `auth/api-key:${prefix}`                     | `prefix` = `ac_xxxxx`   | `{ userId, lastUsedAt, windowCount }` pour limiter --> |
| `secrets:${userId}:${secretName}` (planifié) | user-scoped             | `{ ciphertext, expiresAt }` (cache de `user_secrets`)  |

Politique :

- KV utilisé uniquement pour données volatiles (24h max). Les données persistantes doivent aller en SQL (`users`, futur `user_secrets`).

> KV est idéal pour les données volatiles. Pour les secrets persistants on prévoit une table SQL chiffrée (`user_secrets` + KMS envelope encryption).

---

## 4. Flux principaux

### 4.1 Séquences détaillées

1. **Discovery d’outils (Story 1.x / 2.x)**

   - `mcp-tool-sync` invoque chaque MCP → `tool_schema`.
   - Embedding pipeline (`vector/embed.ts`) → `tool_embedding` + HNSW.
   - `vectorSearch.searchTools()` combine :
     - Cosine similarity (pgvector)
     - Graph score (Adamic-Adar) via `tool_dependency`
     - Adaptive alpha (density-based)

2. **Exécution workflow / Learning (Stories 3-6)**

   - Sandbox instrumenté ➜ JSON traces.
   - `workflow_execution` reçoit la DAG réelle + outcome.
   - `GraphRAGEngine.updateFromExecution()` :
     - Incrémente `tool_dependency`.
     - Recompute PageRank + Louvain en mémoire.
   - `episodic_events` stocke les événements clés (speculation, decisions, results).
   - `AdaptiveThresholdManager` écrit dans `adaptive_thresholds`.

3. **Capabilities (Epic 7)**

   - `workflow_pattern` détecte intent embedding récurrents.
   - Pipeline promotion → écrit `code_snippet`, `parameters`, `cache_config`.
   - Cache TTL dans `workflow_pattern.cache_config`.

4. **Auth & Secrets (Cloud)**
   - OAuth GitHub : `users` + `kv://auth/session`.
   - API keys : Argon2id (`apiKeyHash`, `apiKeyPrefix`).
   - (Planned) Secrets clients : `user_secrets` (AES-256-GCM + KMS), `user_mcp_configs`.

---

## 5. Roadmap Data

| Item                    | Description                                                              | Statut             |
| ----------------------- | ------------------------------------------------------------------------ | ------------------ |
| Drizzle full adoption   | Générer toutes les tables SQL via Drizzle (GraphRAG, episodic, metrics…) | 🚧 Epic 9          |
| Secrets chiffrés        | `user_secrets` + `user_mcp_configs` (KMS envelope encryption, cache KV)  | 📝 Design en cours |
| Unified observability   | Export `metrics` + `workflow_execution` vers ClickHouse/Prometheus       | 🧊 Backlog         |
| Data retention policies | Formaliser prune jobs (episodic 30d, metrics 90d, workflows 6m)          | 📝 À documenter    |

---

### Références

- `src/graphrag/graph-engine.ts`, `dag-suggester.ts`
- `docs/adrs/ADR-038-scoring-algorithms-reference.md`
- `docs/spikes/2025-12-03-dynamic-mcp-composition.md`
