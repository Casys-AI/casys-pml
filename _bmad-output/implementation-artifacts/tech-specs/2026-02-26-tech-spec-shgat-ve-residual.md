# Tech-Spec: SHGAT V→E Residual Connection

**Date**: 2026-02-26
**Status**: Draft
**Priority**: P1
**Scope**: `vertex-to-edge-phase.ts`, `multi-level-orchestrator.ts`, autograd backward

## 1. Probleme

La phase V→E (tool→cap) du SHGAT effectue un **remplacement pur** :

```
E_new[c] = ELU(Σ_t α_tc · H'_t)
```

L'intent embedding de la cap est utilisee pour l'attention mais **disparait du resultat**. Ceci detruit l'information semantique de la cap (son but, sa description).

### Evidence (NB14, 2026-02-26)

| Config | Cap Hit@1 | Rang median |
|--------|-----------|-------------|
| γ=0 (prod actuel, remplacement pur) | **2.6%** | 37 |
| γ=0.6 (blend intent+shgat) | **37.3%** | 4 |
| inverse γ=1/(1+n) | **37.7%** | 3 |
| log_sigmoid(a=-1, b=0.5) | **37.9%** | 3 |

**14x d'amelioration** en preservant l'intent.

### Asymetrie des 4 phases

| Phase | Residuel actuel |
|-------|----------------|
| V2V (tool→tool) | `H + β·Σα·H_j`, β=sigmoid(logit)≈0.3 |
| **V→E (tool→cap)** | **AUCUN** — remplacement pur |
| E→E downward (cap→cap) | Addition 1:1 (orchestrateur) |
| E→V (cap→tool) | Addition 1:1 (orchestrateur) |

V→E est la **seule phase sans residuel**.

### E→V est utile independamment (NB15, 2026-02-26)

| Config | Tool Hit@1 | Δ vs baseline |
|--------|-----------|---------------|
| Prod (pas de E→V sim) | 4.9% | — |
| + E→V α=0.4, caps broken (γ=0) | **17.4%** | +12.5pp |
| + E→V α=0.5, caps fixed (inverse) | 15.5% | +10.6pp |

E→V ameliore massivement les tools (+12.5pp), mais paradoxalement les caps broken (moyennes de tools) sont **legerement meilleures** pour le E→V que les caps fixees. Les deux mecanismes (V→E residuel pour caps, E→V pour tools) sont **orthogonaux**.

## 2. Solution

Ajouter un residuel learnable dans la phase V→E :

```
E_new[c] = ELU(Σ_t α_tc · H'_t) + γ(n_c) · E[c]
```

Ou `γ(n_c) = sigmoid(a · log(n_children + 1) + b)` avec `a` et `b` **deux params learnable** stockes dans les SHGAT params.

### Pourquoi cette formule

- **2 params seulement** (a, b) — pas de buckets fixes
- **Scale a L3, L4, ...** automatiquement via `n_children`
- Grid search NB14 : best a=-1.0, b=0.5 → γ de 0.45 (n=1) a 0.07 (n=20)
- La formule `inverse` (0 params, γ=1/(1+n)) est quasi-equivalente → bon init

### Valeurs optimales de γ par n_children

| n_children | log_sigmoid(a=-1,b=0.5) | inverse 1/(1+n) |
|-----------|------------------------|-----------------|
| 1 | 0.452 | 0.500 |
| 2 | 0.355 | 0.333 |
| 3 | 0.292 | 0.250 |
| 5 | 0.216 | 0.167 |
| 10 | 0.130 | 0.091 |
| 20 | 0.073 | 0.048 |

## 3. Fichiers a modifier

### 3.1 `vertex-to-edge-phase.ts` (forward)

**Ligne 172-192** — ajouter le residuel apres aggregation :

```typescript
// AVANT (ligne 190):
E_new.push(agg.map((x) => math.elu(x)));

// APRES:
const gamma = computeVEResidualGamma(nChildrenForCap[c], config.veResidualA, config.veResidualB);
E_new.push(agg.map((x, d) => math.elu(x) + gamma * E[c][d]));
```

Ajouter helper :

```typescript
function computeVEResidualGamma(nChildren: number, a: number, b: number): number {
  return math.sigmoid(a * Math.log(nChildren + 1) + b);
}
```

Le `nChildren` doit etre fourni par l'appelant (orchestrateur) qui a acces au graphe de hierarchie.

**Config a etendre** :

```typescript
config: {
  leakyReluSlope: number;
  attentionType?: "gat_concat" | "dot_product";
  aggregationActivation?: "elu" | "none";
  // NOUVEAU:
  veResidualA?: number;      // default -1.0
  veResidualB?: number;      // default 0.5
  nChildrenPerCap?: number[]; // [numCaps] children count
}
```

### 3.2 `VEForwardCache` — ajouter le gamma

```typescript
export interface VEForwardCache {
  // ... existant ...
  /** Per-cap residual gamma for backward pass */
  veResidualGamma?: number[];
}
```

### 3.3 Backward pass (autograd)

Le gradient du residuel est trivial :

```
∂L/∂E[c][d] += gamma_c · ∂L/∂E_new[c][d]
∂L/∂a += Σ_c Σ_d (∂L/∂E_new[c][d] · E[c][d] · γ'(n_c) · log(n_c+1))
∂L/∂b += Σ_c Σ_d (∂L/∂E_new[c][d] · E[c][d] · γ'(n_c))
```

Ou `γ'(n) = γ(n) · (1 - γ(n))` (derivee de sigmoid).

### 3.4 `multi-level-orchestrator.ts`

Passer `nChildrenPerCap` au config de V→E forward. L'orchestrateur a deja le graphe via `buildIncidenceMatrix`.

### 3.5 Params DB (shgat_params)

Ajouter dans le blob msgpack :

```
{
  ...existant,
  veResidualA: number,  // init -1.0
  veResidualB: number,  // init 0.5
}
```

Backward-compatible : si absent, comportement = pas de residuel (prod actuel).

## 4. Plan d'implementation

### Step 1: Forward pass (vertex-to-edge-phase.ts)
- Ajouter `nChildrenPerCap` et `veResidualA/B` au config
- Calculer γ par cap
- Ajouter `+ γ * E[c][d]` a la ligne 190
- Stocker γ dans le cache pour backward
- Si `veResidualA` et `veResidualB` sont `undefined` → skip (backward-compatible)

### Step 2: Orchestrateur (multi-level-orchestrator.ts)
- Calculer `nChildrenPerCap` a partir de `capChildren`
- Passer au config V→E
- Lire a/b depuis les SHGAT params

### Step 3: Backward pass
- Propager gradient a travers le residuel
- Ajouter gradient pour a et b

### Step 4: Training init
- Initialiser a=-1.0, b=0.5 dans le trainer SHGAT
- Stocker dans shgat_params apres training

### Step 5: Test
- Unit test : V→E forward avec residuel vs sans
- Integration : re-train SHGAT, comparer Hit@1 cap et tool

## 5. Ce qui n'est PAS dans cette spec

- **E→V alpha tuning** : NB15 montre que E→V aide les tools massivement (+12.5pp) mais cet effet est **deja en prod** (l'orchestrateur fait H_new = H_pre + H_concat). L'alpha n'est pas learnable actuellement — possible future spec.
- **E→E downward tuning** : seulement 1 L2 cap avec tools resolus → pas assez de donnees.
- **Modification du V2V** : β=0.3 learnable fonctionne deja.

## 6. Risques

1. **Gradient vanishing via γ** : si a et b convergent vers des valeurs qui donnent γ≈0, on revient au comportement actuel. Mitigation : monitorer γ moyen dans MLflow.
2. **Interference avec E→V** : NB15 montre que les caps fixees (avec intent) donnent un E→V legerement moins bon que les caps broken. Le residuel V→E pourrait legerement degrader le E→V tool Hit@1. Monitorer les deux metriques.
3. **Backward-compat** : si `veResidualA` absent des params DB, le code skip le residuel → production actuelle inchangee.

## 7. Metriques de succes

| Metrique | Baseline (prod) | Cible |
|----------|-----------------|-------|
| Cap Hit@1 (rank proxy) | 2.6% | > 30% |
| Cap Hit@1 (GRU real) | ~41.6% | > 42% |
| Tool Hit@1 (GRU real) | ~48.1% | >= 48% (pas de regression) |
| E2E Beam First-N | ~70.8% | >= 70% |
