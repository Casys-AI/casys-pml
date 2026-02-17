# Tech Spec: SHGAT Intent Diversity Training

**Date**: 2026-02-17
**Status**: Draft
**Impact**: Scoring quality — discover, execute-suggestion, capability ranking

---

## 1. Problem Statement

Le SHGAT K-head scoring produit des scores quasi-identiques pour des capabilities sémantiquement proches. Exemples concrets :

| Intent query | #1 retourné | Score | Correct | Score | Delta |
|---|---|---|---|---|---|
| "read a file" | exec_e7880cd1 (3-step, 2 usages) | 0.453 | fs:readJson (22 usages) | 0.445 | 0.008 |
| "docker containers" | exec_c594b00d (3 usages) | 0.448 | exec_ab1fea2a (15 usages) | 0.441 | 0.007 |
| "generate UUID" | crypto:uuidBatch (1 usage) | 0.439 | crypto:uuid (8 usages) | 0.432 | 0.007 |

Les deltas de 0.007-0.008 sont du bruit — le SHGAT ne discrimine pas.

## 2. Root Cause

### 2.1 Le training utilise le MÊME intent embedding pour toutes les traces d'une capability

```
execution-trace-store.ts:40-47
────────────────────────────────────────
const SELECT_TRACE_WITH_INTENT = `
  SELECT et.*,
    wp.description AS intent_text,
    wp.intent_embedding AS intent_embedding     ← TOUJOURS le même vecteur
  FROM execution_trace et
  LEFT JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
`;
```

```
per-training.ts:544-545
────────────────────────────────────────
// Use intentEmbedding from JOIN (comes from workflow_pattern.intent_embedding)
const intentEmbedding = trace.intentEmbedding;
```

**Conséquence** : `db:postgresQuery` (342 intents distincts) voit 342× le **même** vecteur intent au training. Le K-head apprend `description_cap ↔ cap` au lieu de `divers_user_intents ↔ cap`.

### 2.2 Les vrais intents existent mais ne sont pas exploités

```sql
SELECT COUNT(*) as total,
       COUNT(CASE WHEN initial_context->>'intent' IS NOT NULL THEN 1 END) as with_intent,
       COUNT(DISTINCT initial_context->>'intent') as distinct_intents
FROM execution_trace WHERE success = true;

 total | with_intent | distinct_intents
-------+-------------+------------------
  1365 |        1227 |              986
```

986 intents distincts pour 1227 traces. Exemples pour `db:postgresQuery` :
- "Check latest traces for layerIndex"
- "Analyze tool usage patterns"
- "List available capabilities"
- "query database for capabilities with UI"
- "Verify db:countAllUsers was renamed"

### 2.3 Historique — Migration 030

```
030_remove_trace_intent_duplication.ts
────────────────────────────────────────
Problem (docstring migration 030):
  "execution_trace was storing intent_text and intent_embedding directly.
   When renaming a capability, traces kept old values → training inconsistency"

Solution (migration 030):
  DROP COLUMN intent_embedding FROM execution_trace
  → JOIN workflow_pattern pour intent_embedding
```

La colonne `execution_trace.intent_embedding` **existait**, a été supprimée par migration 030.

**L'erreur de raisonnement** : la migration confond deux concepts :
- `workflow_pattern.intent_embedding` = embedding de la **description** de la cap (mutable, change au rename)
- `execution_trace.intent_embedding` = embedding du **vrai intent utilisateur** au moment de l'exécution (immutable)

Quand on renomme `fs:readJson` → `fs:readFile`, l'intent utilisateur "read deno.json" reste parfaitement valide. C'est la description qui change, pas l'intent.

### 2.4 Le pipeline jette l'embedding déjà calculé

L'intent embedding est calculé et transmis mais jamais persisté :

```
execute-direct.use-case.ts:654
  intentEmbedding = await embeddingModel.encode(intent)     ← CALCULÉ

capability-store.ts:552
  intentEmbedding: traceData.intentEmbedding               ← TRANSMIS

execution-trace-store.ts:131-132
  // Note: intent_text and intent_embedding are no longer stored
  // They are retrieved via JOIN on workflow_pattern                ← JETÉ
```

## 3. Données disponibles

### 3.1 Distribution usage/intents

| Capability | usage_count | distinct_intents | Ratio unique |
|---|---|---|---|
| db:postgresQuery | 381 | 342 | 90% |
| admin:renameCapability | 29 | 29 | 100% |
| db:queryLatestTrace | 27 | 26 | 96% |
| fs:readJson | 22 | 22 | 100% |
| system:countAll | 17 | 17 | 100% |
| db:pgliteQuery | 16 | 16 | 100% |

Presque tous les intents sont uniques. La diversité est massive.

### 3.2 Volume de données

- 1365 traces réussies, 1227 avec intent text, 986 intents distincts
- 394 capabilities distinctes
- **73% des caps n'ont que 1 usage** (289/397)

### 3.3 Embeddings dans le schéma actuel

| Donnée | Table.colonne | Format |
|---|---|---|
| Cap description embedding | `workflow_pattern.intent_embedding` | vector(1024) |
| Tool embedding | `tool_embedding.embedding` | vector(1024) |
| User intent text | `execution_trace.initial_context->>'intent'` | TEXT |
| User intent embedding | **supprimé par migration 030** | — |

## 4. Solution : Restaurer `execution_trace.intent_embedding`

### 4.1 Migration — Restaurer la colonne

Nouvelle migration (revert partiel de 030, mais avec une sémantique différente) :

```sql
ALTER TABLE execution_trace
  ADD COLUMN intent_embedding vector(1024);

-- IVFFlat pour ANN search (optionnel, utile si on veut chercher par similarité)
-- HNSW serait mieux mais plus lourd pour 1365 rows
CREATE INDEX idx_exec_trace_intent_emb
  ON execution_trace USING ivfflat (intent_embedding vector_cosine_ops)
  WITH (lists = 20);

COMMENT ON COLUMN execution_trace.intent_embedding IS
  'BGE-M3 embedding of the actual user intent at execution time (NOT the capability description)';
```

### 4.2 Persister l'embedding à l'exécution

**`execution-trace-store.ts` — `saveTrace()`** :

Ajouter `intent_embedding` dans l'INSERT (l'embedding arrive déjà en paramètre via `trace.intentEmbedding`, il suffit de ne plus le jeter) :

```typescript
// AVANT (ligne 137-144)
INSERT INTO execution_trace (
  id, capability_id, initial_context, success, duration_ms,
  error_message, user_id, executed_path, decisions,
  task_results, priority, parent_trace_id
) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12)

// APRÈS
INSERT INTO execution_trace (
  id, capability_id, initial_context, success, duration_ms,
  error_message, user_id, executed_path, decisions,
  task_results, priority, parent_trace_id, intent_embedding
) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12,
          $13::vector)
```

Ajouter le paramètre :
```typescript
trace.intentEmbedding
  ? `[${(trace.intentEmbedding as number[]).join(",")}]`
  : null,
```

### 4.3 Modifier la query de lecture

**`execution-trace-store.ts` — `SELECT_TRACE_WITH_INTENT`** :

```typescript
// AVANT
const SELECT_TRACE_WITH_INTENT = `
  SELECT et.*,
    wp.description AS intent_text,
    wp.intent_embedding AS intent_embedding
  FROM execution_trace et
  LEFT JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
`;

// APRÈS
const SELECT_TRACE_WITH_INTENT = `
  SELECT et.*,
    COALESCE(et.initial_context->>'intent', wp.description) AS intent_text,
    COALESCE(et.intent_embedding, wp.intent_embedding) AS intent_embedding
  FROM execution_trace et
  LEFT JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
`;
```

**Logique COALESCE** :
1. Si la trace a son propre `intent_embedding` → utiliser (vrai intent user)
2. Sinon fallback sur `workflow_pattern.intent_embedding` (description cap, comme avant)

Backward compatible : les traces existantes (sans embedding) continuent de fonctionner exactement comme avant.

### 4.4 Backfill des traces existantes

Script one-shot pour encoder les 1227 intents texte historiques :

```typescript
const traces = await db.query(`
  SELECT id, initial_context->>'intent' as intent
  FROM execution_trace
  WHERE initial_context->>'intent' IS NOT NULL
    AND intent_embedding IS NULL
`);

for (const batch of chunk(traces, 32)) {
  const texts = batch.map(t => t.intent).filter(Boolean);
  const embeddings = await embeddingModel.encodeBatch(texts);
  for (let i = 0; i < batch.length; i++) {
    const embStr = `[${embeddings[i].join(",")}]`;
    await db.query(
      `UPDATE execution_trace SET intent_embedding = $1::vector WHERE id = $2`,
      [embStr, batch[i].id]
    );
  }
}
```

**Temps estimé** : 1227 / ~14/s ≈ 90 secondes.

### 4.5 Mettre à jour le commentaire dans per-training.ts

```typescript
// AVANT (ligne 539-540)
// Note: Since migration 030, intentEmbedding comes from capability via JOIN.
// No need to regenerate embeddings - use trace.intentEmbedding directly.

// APRÈS
// Intent embeddings: COALESCE(trace.intent_embedding, workflow_pattern.intent_embedding)
// - trace.intent_embedding = real user intent at execution time (diverse, per-trace)
// - wp.intent_embedding = capability description embedding (fallback for old traces)
```

## 5. Impact attendu

### 5.1 Sur le training

| Métrique | Avant (description only) | Après (diverse intents) |
|---|---|---|
| Vecteurs intent distincts | ~394 (= nb caps) | ~986 |
| Exemples effectifs pour db:postgresQuery | 342× même vecteur | 342 vecteurs uniques |
| Couverture sémantique | Description seule | Requêtes utilisateur réelles |

### 5.2 Sur le scoring discover

Le K-head apprendra des associations réelles :
- "list all users" → `db:postgresQuery` (vu en training)
- "read deno.json" → `fs:readJson` (vu en training)
- "generate a UUID" → `crypto:uuid` (vu en training)

### 5.3 Cercle vertueux

Caps populaires → plus de traces → plus de diversité d'intent → meilleur scoring → plus utilisées. Les caps avec 1 usage restent comme avant (1 embedding = description fallback).

### 5.4 Live training

Le live training post-exécution (1 epoch sur la trace fraîche) bénéficie immédiatement : le K-head s'ajuste sur le vrai intent utilisateur, pas sur la description figée.

## 6. Fichiers modifiés

| Fichier | Changement | Lignes |
|---|---|---|
| `src/db/migrations/04X_restore_trace_intent_embedding.ts` | Nouvelle migration : ADD COLUMN + index | ~25 |
| `src/capabilities/execution-trace-store.ts` | INSERT + SELECT COALESCE + rowToTrace | ~15 |
| `src/graphrag/learning/per-training.ts` | Commentaire mis à jour | ~3 |
| `scripts/backfill-intent-embeddings.ts` | Script one-shot backfill | ~40 |

**Total : ~85 lignes.**

## 7. Risques

| Risque | Probabilité | Mitigation |
|---|---|---|
| Intents bruités ("test", "debug XYZ") | Moyenne | Le training contrastif les traite comme noise — ils ne matchent rien d'autre. PER downweight naturellement les cas easy. |
| Régression au rename | Nulle | L'intent trace est immutable (correct). La description cap (mutable) reste via fallback COALESCE. |
| Stockage supplémentaire | Négligeable | 1227 × 4KB = ~5MB. Croissance ~4KB/trace. |
| BGE-M3 backfill échoue | Faible | Fallback COALESCE = identique à aujourd'hui. |

## 8. Métriques de succès

Après backfill + re-training :

1. **Score delta entre caps similaires** : > 0.03 (vs 0.007 actuel)
2. **Discover "read a file"** : `fs:readJson` en #1 (vs #4 actuel)
3. **Discover "generate UUID"** : `crypto:uuid` en #1 (vs #4 actuel)
4. **Training accuracy held-out** : > 80% (vs actuel inconnu avec descriptions dupliquées)

## 9. Plan d'exécution

| Step | Action | Durée |
|---|---|---|
| 1 | Migration + colonne intent_embedding | 15 min |
| 2 | Modifier saveTrace() — INSERT la colonne | 15 min |
| 3 | Modifier SELECT_TRACE_WITH_INTENT — COALESCE | 10 min |
| 4 | Script backfill + exécution | 20 min |
| 5 | Re-training SHGAT batch | 5-10 min |
| 6 | Validation discover (3 queries test) | 10 min |
| **Total** | | **~1h15** |
