# 2026-03-05 — Agent Experience Coding Rules (Machine-First)

Objectif : garder `vault-exec` lisible, stable et composable pour des agents
(pas seulement pour des humains).

## 1) Architecture (non négociable)

- **Feature-sliced strict** :
  - `src/ingest/*` = parsing, decomposition, markdown/reporting d’ingestion.
  - `src/core/*` = primitives réellement transverses et stables (types,
    interfaces, utilitaires purs).
- **Pas de logique métier d’ingestion dans `core`** sans preuve de réutilisation
  multi-features.
- **Dépendances unidirectionnelles** : `feature -> core`, jamais l’inverse.

## 2) Décomposition L1/L2/L3

- **L1 obligatoire** : clé par outil.
- **L2 prioritaire** : règles conservatrices par outil, fallback explicite.
- **L3 optionnel** : uniquement si signal suffisant + bénéfice démontré.
- Si ambiguïté : **rester au niveau inférieur** (éviter la sur-fragmentation).

## 3) Règles `exec`

- Ne pas perdre les wrappers (`cd`, `sleep`, `set -e`) : les garder comme
  **métadonnées de contexte**.
- La famille L2 principale doit refléter l’action métier
  (git/openclaw/python/http/etc.).
- Séparer :
  - `family` (dédup)
  - `context` (wrappers/flags)

## 4) Qualité de code

- Pas de code mort, pas de legacy silencieuse.
- Noms explicites, fonctions courtes, logique pure quand possible.
- Tests ciblés par couche : parser / decomposition / aggregation / rendering.
- Toute règle de décomposition doit avoir au moins un test de fallback.

## 5) Observabilité

- Générer un rapport de couverture L2 (hit/fallback) à chaque run d’ingestion.
- Versionner les règles de décomposition (id/version) pour reprocessing futur.

## 6) Documentation co-localisée (par défaut)

- Doc module-level à côté du code (même esprit que les tests) :
  - `README.md` (rôle du module)
  - `contract.md` (I/O, invariants, fallback) — minuscule recommandé
  - `examples.md` (cas d’entrée/sortie)
- Doc centrale (`docs/`) réservée aux plans d’implémentation, ADRs, architecture
  globale.

Conventions de nommage doc (préférence locale):

- éviter les MAJUSCULES agressives quand non nécessaires;
- privilégier `kebab-case` ou minuscules (`contract.md`, `event-model.md`).

## 7) Source de vérité

- Notebook = exploration.
- Production = règles et pipeline dans `src/` + tests.

## 8) Principe directeur

Le code doit être lisible et opérable par un agent en autonomie :

- peu d’implicite,
- points d’entrée clairs,
- sorties vérifiables,
- comportement déterministe par défaut.
