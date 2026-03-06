# Migration DuckDB → Deno KV pour vault-exec

**Statut :** Implémenté avec convergence KV-only
**Date :** 2026-03-04
**Scope :** `lib/vault-exec/src/db/store.ts` (classe `VaultDB` → `VaultKV`)

---

## Résumé exécutif

Migration complète de DuckDB vers Deno KV. La limite de 64 KiB par valeur est contournée par [`@kitsonk/kv-toolbox`](https://jsr.io/@kitsonk/kv-toolbox) (v0.30.0) — librairie de référence dans l'écosystème Deno, maintenue par un core contributor. Son module `blob` gère le chunking transparent : `blob.set(kv, key, data)` découpe, `blob.get(kv, key)` réassemble. Zéro code de chunking maison.

**Décision** : migration complète — notes, edges, traces en KV natif, blobs GNN/GRU via kv-toolbox blob. Suppression de `@duckdb/node-api`.

---

## 0. Mise à jour d'implémentation (2026-03-06)

L'état réel du repo a convergé plus vite que le plan transitoire ci-dessous :

- `lib/vault-exec/src/db/store-kv.ts` est l'implémentation active du store.
- `lib/vault-exec/src/db/index.ts` expose `openVaultStore(path)` en mode KV-only.
- Les workflows principaux (`init`, `retrain`, `run`) passent déjà par `openVaultStore()`.
- Les blobs GNN/GRU sont persistés via `@kitsonk/kv-toolbox/blob`.
- La suite `src/db/store-kv_test.ts` couvre notes, edges, traces, virtual edges,
  GNN params, GRU weights et la factory.

Conséquence :

- Les étapes de coexistence DuckDB/KV de ce document sont désormais
  **superseded**.
- `store-parity_test.ts` n'a pas été ajouté : la migration a été validée par la
  suite KV ciblée et l'usage direct des workflows/tests runtime.
- Le feature flag `VAULT_BACKEND` n'existe pas dans l'état final : le repo a
  convergé vers une factory KV-only au lieu d'un mode dual-backend.

Ce document reste utile comme justification d'architecture et d'implémentation
du schéma KV, mais pas comme checklist littérale de migration restante.

---

## 1. Analyse des contraintes

### 1.1 Limites Deno KV

| Contrainte | Valeur | Source |
|---|---|---|
| Taille maximale d'une valeur | **64 KiB** (65 536 bytes) après sérialisation | [docs.deno.com](https://docs.deno.com/api/deno/~/Deno.Kv) |
| Taille maximale d'une clé | 2 048 bytes après sérialisation | [docs.deno.com](https://docs.deno.com/api/deno/~/Deno.KvKey) |
| Nombre de parts dans une clé | Non borné explicitement dans la doc |  |
| Transactions atomiques | Max 10 opérations par batch | doc Deno KV |
| Taille d'un batch atomique | Non spécifiée explicitement |  |

La limite des 64 KiB n'a pas évolué depuis 2023 malgré plusieurs issues ouvertes ([#19007](https://github.com/denoland/deno/issues/19007), [#21089](https://github.com/denoland/deno/issues/21089), [#22246](https://github.com/denoland/deno/issues/22246)).

### 1.2 Estimation des tailles de blobs actuels

**GRU weights** (sérialisé JSON + gzip) :

- 177 408 paramètres flottants
- Matrices dominantes : `W_input` (64×1024 = 65 536), `W_intent` (64×1024), `W_output` (1024×32)
- JSON brut : ~3 465 KB
- Après gzip : **~866 KB** (poids seuls, sans vocab)
- Vocab pour 100 notes (1 024 floats/note) : +501 KB gzip
- **Total blob gru_weights : ~1.4 MB pour 100 notes**
  - Croît linéairement avec la taille du vault
  - Un vault de 500 notes → ~3 MB

**GNN params** (config DEFAULT : numHeads=8, headDim=64, embDim=1024, shareLevelWeights=true) :

- Par niveau partagé : 1 050 624 paramètres (W_child + W_parent : 8×64×1024 chacun = ~1M)
- JSON brut : ~20 520 KB
- Après gzip : **~5 130 KB**
- **Total blob gnn_params : ~5 MB**

**Verdict** : Les deux blobs sont de 20× à 80× au-dessus de la limite KV de 64 KiB.

**Solution** : [`@kitsonk/kv-toolbox`](https://jsr.io/@kitsonk/kv-toolbox) (v0.30.0, JSR). Module `blob` dédié — chunking transparent, testé en production, maintenu par un core contributor Deno (kitsonk). API :

```typescript
import { set, get, remove } from "@kitsonk/kv-toolbox/blob";

await set(kv, ["vault", "gru_weights"], weightsBlob);           // chunk auto
const entry = await get(kv, ["vault", "gru_weights"]);           // réassemblage auto → Uint8Array
await remove(kv, ["vault", "gru_weights"]);                      // supprime clé + sub-keys
```

Consensus écosystème Deno : chunking via lib (kv-toolbox, kvdex, deno_kv_fs). Personne ne fait du fichier binaire à côté.

### 1.3 Les embeddings note, par contre

- `embedding` : 1 024 doubles × 8 bytes = 8 KB → **sous la limite**
- `gnnEmbedding` : idem, 8 KB → **sous la limite**
- `NoteRow` complet (name + path + bodyHash + level + deux embeddings) : ~17 KB → **sous la limite**

### 1.4 Compatibilité `deno compile`

Deno KV est natif dans le runtime Deno, y compris dans les binaires compilés avec `deno compile`. Il utilise SQLite sous le capot (via `libsqlite3` embarquée dans le binaire Deno). Aucune FFI externe, aucune dépendance native à packager.

DuckDB via `@duckdb/node-api` nécessite des binaires natifs (`.node` / `.so`) qui ne s'embarquent pas dans `deno compile`. C'est l'argument le plus fort en faveur de KV.

### 1.5 Performance de `kv.list()`

`kv.list()` est une lecture séquentielle de préfixe dans un B-tree SQLite. Pour `getAllNotes()` sur un vault de 500 notes, ça reste rapide (< 10ms). Pour `getAllTraces()` avec des milliers de traces, l'absence d'index secondaire peut devenir un sujet si on filtre par `targetNote` ou `synthetic` — mais l'API actuelle fait du scan complet de toute façon (aucun filtre côté DB).

---

## 2. Design du key schema

### Conventions

- Séparateur hiérarchique : tableaux de strings `["prefix", "key"]` (natif KV)
- Préfixe global : `["vault"]` pour isoler du KV global si la base est partagée
- Auto-increment pour `traces` : remplacé par timestamp ISO + UUID v4 suffixe

### Mapping des 5 tables

**`notes`** — clé par nom de note (PK naturelle)

```
["vault", "notes", <name>]  →  NoteRow
```

Exemples :
```
["vault", "notes", "README"]    → { name, path, bodyHash, level, embedding?, gnnEmbedding? }
["vault", "notes", "config"]    → { ... }
```

Scan complet : `kv.list({ prefix: ["vault", "notes"] })`

**`edges`** — clé par source, valeur = tableau des targets (dénormalisé)

```
["vault", "edges", <source>]  →  string[]
```

`setEdges("A", ["B", "C"])` → une seule écriture KV. `getEdges("A")` → une seule lecture. Pas de clé composite, pas de scan nécessaire. C'est plus simple qu'en SQL.

**`traces`** — clé composée d'un timestamp + identifiant unique pour ordre naturel

```
["vault", "traces", <executedAt_ISO>, <ulid_or_uuidv4>]  →  TraceRow
```

L'ordre lexicographique des timestamps ISO donne un tri chronologique correct. L'UUID v4 suffixe évite les collisions à la milliseconde.

Scan complet (tri par insertion) : `kv.list({ prefix: ["vault", "traces"] })`

Remarque : `TraceRow.id` (auto-increment DuckDB) perd son sens. Remplacé par la clé composite. Si le code consommateur utilise `trace.id` comme identifiant opaque, il faut faire `${executedAt}:${uuid}` comme équivalent.

**`gnn_params`** — singleton, clé fixe + métadonnées

```
["vault", "gnn_params"]              →  Uint8Array (via kv-toolbox blob, chunking transparent)
["vault", "gnn_params_meta"]         →  { epoch, accuracy }
```

**`gru_weights`** — singleton, clé fixe + métadonnées

```
["vault", "gru_weights"]             →  Uint8Array (via kv-toolbox blob, chunking transparent)
["vault", "gru_weights_meta"]        →  { vocabSize, epoch, accuracy }
```

Le blob (poids sérialisés gzip) est stocké via `blob.set()` qui gère les sub-keys automatiquement. Les métadonnées (epoch, accuracy, vocabSize) sont stockées dans une clé KV standard séparée car elles sont petites et on peut vouloir les lire sans charger le blob entier.

### Key schema résumé

```
vault/
├── notes/
│   └── <note_name>         →  NoteRow (≤ 17 KB, OK)
├── edges/
│   └── <source_name>       →  string[] (taille bornée par le vault, OK)
├── traces/
│   └── <iso_ts>/<uuid>     →  TraceRow (quelques KB, OK)
├── gnn_params              →  Uint8Array (kv-toolbox blob, chunking auto)
├── gnn_params_meta         →  { epoch, accuracy }
├── gru_weights             →  Uint8Array (kv-toolbox blob, chunking auto)
└── gru_weights_meta        →  { vocabSize, epoch, accuracy }
```

---

## 3. API de la nouvelle classe `VaultKV`

L'interface publique est identique à `VaultDB`. Le consommateur (`init.ts`, `retrain.ts`, etc.) ne change pas.

### Signature complète

```typescript
// lib/vault-exec/src/db/store-kv.ts

export class VaultKV {
  private constructor(private kv: Deno.Kv) {}

  static async open(path: string): Promise<VaultKV>;
  // path === ":memory:" → Deno.openKv() sans path (KV en mémoire via SQLite temp)
  // sinon → Deno.openKv(path + ".kv")

  close(): void;

  // Notes
  async upsertNote(note: NoteRow): Promise<void>;
  async getAllNotes(): Promise<NoteRow[]>;
  async updateNoteEmbedding(name: string, embedding: number[]): Promise<void>;
  async updateNoteGnnEmbedding(name: string, gnnEmbedding: number[]): Promise<void>;

  // Edges
  async setEdges(source: string, targets: string[]): Promise<void>;
  async getEdges(source: string): Promise<string[]>;

  // Traces
  async insertTrace(trace: TraceRow): Promise<void>;
  async getAllTraces(): Promise<TraceRow[]>;

  // GNN params (chunked)
  async saveGnnParams(params: Uint8Array, epoch: number, accuracy: number): Promise<void>;
  async getGnnParams(): Promise<{ params: Uint8Array; epoch: number; accuracy: number } | null>;

  // GRU weights (chunked)
  async saveGruWeights(weights: Uint8Array, vocabSize: number, epoch: number, accuracy: number): Promise<void>;
  async getLatestWeights(): Promise<{ blob: Uint8Array; vocabSize: number; epoch: number; accuracy: number } | null>;
}
```

### Implémentation des méthodes simples

**`upsertNote`** — lecture-modification-écriture atomique :

```typescript
async upsertNote(note: NoteRow): Promise<void> {
  const key = ["vault", "notes", note.name];
  // Atomic CAS pour conserver les embeddings existants si non fournis
  while (true) {
    const entry = await this.kv.get<NoteRow>(key);
    const existing = entry.value;
    const updated: NoteRow = {
      ...note,
      embedding: note.embedding ?? existing?.embedding,
      gnnEmbedding: note.gnnEmbedding ?? existing?.gnnEmbedding,
    };
    const res = await this.kv.atomic()
      .check(entry)
      .set(key, updated)
      .commit();
    if (res.ok) return;
    // Retry si le CAS échoue (conflit concurrent)
  }
}
```

**`setEdges`** — simple set (pas de CAS nécessaire, idempotent) :

```typescript
async setEdges(source: string, targets: string[]): Promise<void> {
  await this.kv.set(["vault", "edges", source], targets);
}
```

**`insertTrace`** — clé timestamp + uuid :

```typescript
async insertTrace(trace: TraceRow): Promise<void> {
  const ts = new Date().toISOString();
  const id = crypto.randomUUID();
  const row: TraceRow = {
    ...trace,
    executedAt: ts,
  };
  await this.kv.set(["vault", "traces", ts, id], row);
}
```

**`getAllTraces`** :

```typescript
async getAllTraces(): Promise<TraceRow[]> {
  const result: TraceRow[] = [];
  for await (const entry of this.kv.list<TraceRow>({ prefix: ["vault", "traces"] })) {
    result.push(entry.value);
  }
  return result;
}
```

### Implémentation du stockage blob via kv-toolbox

Le chunking des blobs GNN/GRU est délégué à [`@kitsonk/kv-toolbox/blob`](https://jsr.io/@kitsonk/kv-toolbox) (v0.30.0). Zéro code de chunking maison.

```typescript
import { set as setBlob, get as getBlob, remove as removeBlob } from "@kitsonk/kv-toolbox/blob";

// ── GRU weights ──

async saveGruWeights(weights: Uint8Array, vocabSize: number, epoch: number, accuracy: number): Promise<void> {
  await setBlob(this.kv, ["vault", "gru_weights"], weights);
  await this.kv.set(["vault", "gru_weights_meta"], { vocabSize, epoch, accuracy });
}

async getLatestWeights(): Promise<{ blob: Uint8Array; vocabSize: number; epoch: number; accuracy: number } | null> {
  const meta = await this.kv.get<{ vocabSize: number; epoch: number; accuracy: number }>(
    ["vault", "gru_weights_meta"]
  );
  if (!meta.value) return null;

  const entry = await getBlob(this.kv, ["vault", "gru_weights"]);
  if (!entry.value) return null;
  const blob = entry.value as Uint8Array;

  return { blob, ...meta.value };
}

// ── GNN params ── (même pattern)

async saveGnnParams(params: Uint8Array, epoch: number, accuracy: number): Promise<void> {
  await setBlob(this.kv, ["vault", "gnn_params"], params);
  await this.kv.set(["vault", "gnn_params_meta"], { epoch, accuracy });
}

async getGnnParams(): Promise<{ params: Uint8Array; epoch: number; accuracy: number } | null> {
  const meta = await this.kv.get<{ epoch: number; accuracy: number }>(["vault", "gnn_params_meta"]);
  if (!meta.value) return null;

  const entry = await getBlob(this.kv, ["vault", "gnn_params"]);
  if (!entry.value) return null;

  return { params: entry.value as Uint8Array, ...meta.value };
}
```

**Avantages par rapport au chunking maison** :
- Zéro code de gestion de chunks (pas de `setBlobChunked`/`getBlobChunked`, ~80 lignes évitées)
- Gestion des sub-keys, cleanup, et cohérence par la lib
- Testé en production par l'écosystème Deno
- `remove()` nettoie la clé + toutes les sub-keys en un appel

---

## 4. Plan de migration

### Prérequis

- Zéro JOIN dans le code actuel : confirmé à la lecture de `store.ts`. Migration structurellement propre.
- `VaultDB` est instanciée dans `init.ts`, `retrain.ts`, `traces/recorder.ts`, `embeddings/indexer.ts`.

### Étape 1 — Implémenter `VaultKV` en parallèle (sans toucher `VaultDB`)

1. Ajouter `@kitsonk/kv-toolbox` dans `deno.json` imports :
   ```json
   "@kitsonk/kv-toolbox/blob": "jsr:@kitsonk/kv-toolbox@0.30/blob"
   ```
2. Créer `lib/vault-exec/src/db/store-kv.ts` avec la classe `VaultKV` implémentant les mêmes méthodes publiques.
   - Notes, edges, traces : Deno KV natif (`kv.set()`, `kv.get()`, `kv.list()`)
   - GNN params, GRU weights : `@kitsonk/kv-toolbox/blob` pour le blob + KV natif pour les métadonnées
3. Dupliquer les tests `store_test.ts` en `store-kv_test.ts`, adaptés pour KV (`:memory:` → `await Deno.openKv()` sans path).

Durée estimée : 1 session.

### Étape 2 — Tests de parité

Écrire un test de parité `store-parity_test.ts` qui exécute les mêmes opérations sur `VaultDB` et `VaultKV` et compare les résultats. Focus sur les cas edge : upsert avec embedding null, setEdges vide, trace sans intent.

**Statut final : superseded.** La branche a convergé directement vers KV-only, donc
il n'y a plus de dual-run DuckDB/KV à maintenir. La confiance est portée par
`src/db/store-kv_test.ts` et les tests/workflows qui consomment `openVaultStore()`.

Durée estimée : 0.5 session.

### Étape 3 — Feature flag dans `VaultDB.open()` / factory

Introduire une factory `openVaultStore(path, { backend: "duckdb" | "kv" })` qui retourne une interface commune `IVaultStore`. Les deux implémentations coexistent. Le flag est contrôlé par variable d'environnement `VAULT_BACKEND=kv`.

```typescript
// lib/vault-exec/src/db/index.ts
export interface IVaultStore {
  close(): void;
  upsertNote(note: NoteRow): Promise<void>;
  getAllNotes(): Promise<NoteRow[]>;
  // ... (toutes les méthodes publiques de VaultDB)
}

export async function openVaultStore(
  path: string,
  backend: "duckdb" | "kv" = "duckdb",
): Promise<IVaultStore> {
  if (backend === "kv") return VaultKV.open(path);
  return VaultDB.open(path);
}
```

Durée estimée : 0.5 session.

**Statut final : implémenté partiellement puis simplifié.** La factory
`openVaultStore(path)` existe bien, mais en mode KV-only. Le backend DuckDB et
le flag `VAULT_BACKEND` n'ont pas été conservés dans l'état final.

### Étape 4 — Mise à jour des consommateurs

Remplacer tous les `VaultDB.open()` directs par `openVaultStore()`. Fichiers impactés :

- `src/init.ts`
- `src/retrain.ts` (si existant)
- `src/traces/recorder.ts`
- `src/embeddings/indexer.ts`
- Tests d'intégration `src/integration_test.ts`

Durée estimée : 0.5 session.

**Statut final : réalisé pour les workflows actifs.** `init`, `retrain` et
`run` passent par `openVaultStore()`. Les tests ciblés du store utilisent
encore `VaultKV.open(":memory:")` directement quand cela simplifie
l'initialisation isolée.

### Étape 5 — Tests en conditions réelles

Lancer `initVault()` avec `VAULT_BACKEND=kv` sur le demo-vault (`lib/vault-exec/demo-vault/`). Vérifier que les blobs GRU et GNN se lisent correctement après un cycle complet init → serialize → chunk → unchunk → deserialize.

**Statut final : adapté.** Le repo n'expose plus `VAULT_BACKEND`; la validation
réelle passe donc par les workflows/tests KV-only et non par un mode flaggé.

### Étape 6 — Suppression de DuckDB (optionnelle, différée)

Une fois la confiance établie sur KV, supprimer `@duckdb/node-api` de `deno.json` et `package.json`. Supprimer `VaultDB`. Renommer `VaultKV` en `VaultDB` pour minimiser le diff dans le reste du code.

**Statut final : absorbé par la convergence KV-only.** L'objectif de cette étape
est déjà reflété par l'API publique actuelle (`openVaultStore()` ouvre KV).

### Backward compatibility

- Le fichier DuckDB existant (`.duckdb`) et le fichier KV (`.kv`) coexistent. Pas de migration de données : `initVault` reconstruit tout depuis les fichiers markdown.
- Un vault initialisé en mode DuckDB ne peut pas être lu en mode KV sans ré-initialisation. C'est acceptable : vault-exec n'est pas encore en production.

---

## 5. Risques et mitigations

### Risque 1 : Taille des blobs → RÉSOLU par kv-toolbox

**Problème :** GNN ~5 MB, GRU ~1.4 MB+ sont 20×–80× au-dessus de la limite KV de 64 KiB.

**Solution retenue :** [`@kitsonk/kv-toolbox/blob`](https://jsr.io/@kitsonk/kv-toolbox) — chunking transparent, zéro code maison. La lib gère le découpage en sub-keys, le réassemblage, et le cleanup. C'est l'approche standard dans l'écosystème Deno (kv-toolbox, kvdex, deno_kv_fs utilisent tous le chunking).

Alternatives écartées :
- ~~Fichiers `.bin` à côté~~ — pas le pattern communautaire, casse le principe "tout dans KV"
- ~~Architecture hybride KV + DuckDB~~ — deux stores = double la surface d'erreur

### Risque 2 : CAS loop sur `upsertNote` sous contention

**Probabilité :** Faible (vault-exec est mono-processus pour l'instant).

**Impact :** Loop infinie théorique si le CAS échoue en boucle.

**Mitigation :** Cap à 5 tentatives, erreur explicite au-delà. Pas de silent retry infini.

### Risque 3 : Cohérence du chunking lors d'une écriture interrompue

**Probabilité :** Rare (crash mid-write), mais possible.

**Impact :** Blob corrompu — chunks partiels orphelins.

**Mitigation :** Déléguée à kv-toolbox qui gère la cohérence des sub-keys. En cas de corruption résiduelle : ré-initialiser le vault (`vault-exec init` reconstruit tout depuis les notes markdown). Fail-fast, pas de fallback silencieux.

### Risque 4 : Performance de `getAllTraces()` avec >10 000 traces

**Probabilité :** Moyenne sur le long terme.

**Impact :** `kv.list()` scanne séquentiellement tous les enregistrements. Pas d'index sur `synthetic`, `success`, `targetNote`.

**Mitigation :** Acceptable tant que le GRU training est local et que le vault ne dépasse pas quelques milliers de traces. Si le besoin d'analytics émerge, reconsidérer. En attendant, les filtres applicatifs actuels dans `init.ts` (filter sur `synthetic`, `path.length >= 2`) restent côté JS.

### Risque 5 : `":memory:"` en mode KV

**Problème :** Deno KV ne supporte pas exactement `":memory:"` comme DuckDB. `Deno.openKv()` sans argument ouvre une base KV liée au processus (SQLite en mémoire effective mais le comportement exact est non documenté pour les tests).

**Mitigation :** Dans les tests, utiliser `await Deno.openKv()` (sans path). En prod et pour les tests d'intégration, utiliser un path temporaire `await Deno.makeTempFile()` + nettoyage dans `finally`. Encoder ce pattern dans la factory.

---

## 6. Ce qu'on perd (honnêtement)

### 6.1 La capacité SQL future

DuckDB est un moteur analytique. Si dans 6 mois on veut :
- `SELECT targetNote, COUNT(*) FROM traces GROUP BY targetNote ORDER BY 2 DESC`
- Recherche par similarité d'embedding via `array_cosine_similarity`
- Jointure notes ↔ traces pour identifier les notes jamais atteintes

...KV ne peut pas. Avec KV, tout ça se fait en JS en mémoire. Pour 500 notes et 5 000 traces, c'est acceptable. Pour 10 000 notes et 100 000 traces, c'est une question ouverte.

### 6.2 Les transactions multi-tables

DuckDB permet des transactions ACID qui touchent plusieurs tables en un seul commit. KV offre des atomic operations mais limitées à 10 opérations et à des clés dont on connaît les versionstamps à l'avance. Un upsert note + insertion trace en un seul atomic est plus laborieux.

### 6.3 L'introspection

DuckDB peut être ouvert par un client SQL externe (DBeaver, CLI duckdb) pour debugger l'état du vault. Le fichier KV SQLite peut techniquement être ouvert par `sqlite3`, mais le format KV (clés sérialisées, valeurs en V8 serialization) n'est pas lisible directement.

### 6.4 Les embeddings vectoriels natifs

DuckDB a une extension VSS (Vector Similarity Search) expérimentale. KV n'a rien de tel. Recherche de similarité = scan complet en JS.

### 6.5 La complexité DuckDB vs KV + kv-toolbox

On élimine :
- `@duckdb/node-api` (dépendance npm FFI lourde, ~50 MB)
- `DuckDBBlobValue`, `DuckDBListValue` (types opaques nécessitant `extractBlob()`, `toArray()`, `toListOrNull()`)
- `blobValue()`, `listValue()` (wrappers à l'écriture)
- Fichiers `.duckdb` + `.duckdb.wal`

On ajoute :
- `@kitsonk/kv-toolbox` (dep JSR légère, ~20 KB)
- 3 appels `blob.set/get/remove` (pas de code maison)

Le delta net est **très favorable** — moins de code, moins de dépendances, types natifs.

---

## 7. Décision

### Migration complète vers Deno KV + kv-toolbox

1. **Notes, edges, traces** → Deno KV natif. Types natifs, zéro wrapper.
2. **GNN params, GRU weights** → `@kitsonk/kv-toolbox/blob` pour le chunking transparent. Métadonnées en KV natif.
3. **Supprimer `@duckdb/node-api`** une fois les tests verts. Supprimer aussi `package.json` / `package-lock.json` si DuckDB était la seule dep npm.
4. **`deno compile`** devient possible — zéro FFI externe.

---

## Appendice : Calcul des tailles de blobs

```
GRU weights (config DEFAULT_GRU_CONFIG):
  W_input    : 64 × 1024  = 65 536 params
  W_intent   : 64 × 1024  = 65 536 params
  W_output   : 1024 × 32  = 32 768 params
  Reste      :              14 568 params
  Total      :             177 408 params
  JSON ~20 chars/float → 3 465 KB
  gzip (ratio ~4:1)   → 866 KB

Vocab (N notes × 1024 floats):
  100 notes  → 501 KB gzip
  500 notes  → 2 505 KB gzip
  Total blob (100 notes) : ~1 367 KB

GNN params (DEFAULT_GNN_CONFIG, shared level):
  W_child    : 8 × 64 × 1024 = 524 288 params
  W_parent   : 8 × 64 × 1024 = 524 288 params
  a_upward   : 8 × 128       =   1 024 params
  a_downward : 8 × 128       =   1 024 params
  Total      :               1 050 624 params
  JSON → 20 520 KB, gzip → 5 130 KB

Limite KV : 64 KiB = 65 536 bytes
→ GRU blob / limite = ×21
→ GNN blob / limite = ×80
```
