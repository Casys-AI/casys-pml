---
compiled_at: "2026-03-04T16:42:00.000Z"
value:
  name: "Revenue Operating System (Demo Vault)"
  layers:
    - "00-Schema"
    - "01-Entities"
    - "02-Relations"
    - "10-Primitives"
    - "20-Composites"
    - "30-Outputs"
outputs:
  - vaultBlueprint
---

Objectif: construire un graphe exécutable qui scale (20k+ nœuds) sans casser l'UX de notes.

Règles: un nœud = une responsabilité, inputs/outputs explicites, primitives pures, composites réutilisables, nommage stable.
