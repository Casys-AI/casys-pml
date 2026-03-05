---
node_type: value
compiled_at: "2026-03-04T16:42:00.000Z"
value:
  name: "Revenue Operating System (Demo Vault)"
  layers:
    - "modules/revenue/*"
    - "modules/crm/*"
    - "shared/*"
outputs:
  - vaultBlueprint
---

Objectif: construire un graphe exécutable qui scale (20k+ nœuds) sans casser l'UX de notes.

Règles: un nœud = une responsabilité, inputs/outputs explicites, primitives pures, composites réutilisables, nommage stable.

Arborescence:
- `modules/revenue/` : module principal Revenue OS
  - `00-Schema/`, `01-Entities/`, `02-Relations/`, `10-Primitives/`, `20-Composites/`, `30-Outputs/`
- `modules/crm/` : module CRM
  - `00-Schema/`, `01-Entities/`, `10-Primitives/`, `30-Outputs/`
- `shared/` : policies, mappings et conventions transverses (réutilisables par tous les modules)
- `_drafts/` : brouillons non exécutés

Note: `vault-exec` lit les notes récursivement et ignore les dossiers techniques (`.obsidian`, `.vault-exec`, etc.) ainsi que `_drafts/`.

Réutilisation inter-modules:
- Les dépendances en double crochets (wikilinks) sont globales (nom de note), pas limitées au dossier.
- Les règles/policies communes doivent vivre dans `shared/` (ex: `SHARED - Segment Owner Routing`) pour être consommées par plusieurs modules.
