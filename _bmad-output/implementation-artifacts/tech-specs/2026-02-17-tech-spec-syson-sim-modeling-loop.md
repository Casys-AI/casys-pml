# Tech Spec: Boucle de Modélisation SysON → Simulation → PLM

**Date**: 2026-02-17
**Statut**: Draft
**Scope**: lib/sim, lib/syson, lib/plm — intégration E2E

---

## 1. Contexte

On dispose de trois bibliothèques MCP qui couvrent le cycle d'ingénierie :

| Lib | Rôle | Tools |
|-----|------|-------|
| **lib/syson** | Modélisation SysML v2 (CRUD, AQL) | 24 tools (element, query, model, project, agent) |
| **lib/sim** | Validation de contraintes | `sim_validate`, `sim_constraint_extract`, `sim_constraint_evaluate` |
| **lib/plm** | BOM, coûts, changements, qualité | 14 tools (bom, change, quality, planning) |

La boucle cible :

```
Agent → Créer/modifier modèle SysON
      → Valider les contraintes (sim_validate)
      → Générer BOM + coûts (plm_bom_*)
      → Itérer (modifier paramètre → re-valider → comparer)
```

Aujourd'hui, `sim_validate` fonctionne **uniquement avec des valeurs manuelles** (`values: { totalMass: 2.86, ... }`). L'auto-résolution depuis SysON échoue → `resolvedValues: {}`. L'agent doit connaître et fournir toutes les valeurs, ce qui casse le principe "le modèle est la source de vérité".

## 2. Diagnostic du Resolver

### 2.1 Structure du modèle SysON (TCS Satellite)

```
ThermalControlSystem (Package)
├── HeaterAssembly (PartUsage)
├── RadiatorAssembly (PartUsage)
├── InsulationAssembly (PartUsage)
├── totalMass (AttributeUsage)
│   ├── FeatureValue
│   │   └── LiteralRational → value = 2.86
│   └── FeatureTyping
├── maxAllowedMass (AttributeUsage) → 5.0
├── operatingTempMin (AttributeUsage) → -40
├── operatingTempMax (AttributeUsage) → 80
├── designTemp (AttributeUsage) → 25
├── massConstraint (ConstraintUsage)
│   └── totalMass ≤ maxAllowedMass
└── tempRangeConstraint (ConstraintUsage)
    └── designTemp ≥ operatingTempMin and designTemp ≤ operatingTempMax
```

### 2.2 Bug identifié dans `resolver.ts`

Le resolver (`lib/sim/src/evaluator/resolver.ts`) fait 2 étapes :

1. **Trouver l'attribut** via AQL :
   ```
   aql:self.ownedElement->select(e | e.oclIsKindOf(sysml::AttributeUsage))
     ->select(e | e.declaredName = 'totalMass')
   ```
   → **FONCTIONNE** — retourne l'objet `totalMass` (id: `3c2d20ba-...`)

2. **Lire la valeur** de l'attribut (`readAttributeValue`) :
   ```
   aql:self.ownedElement->select(e | e.oclIsKindOf(kerml::LiteralExpression))->first()
   ```
   → **ÉCHOUE** — La valeur est un `sysml::LiteralRational`, pas un `kerml::LiteralExpression`

### 2.3 Cause racine

| Ce que le resolver cherche | Ce qui existe dans SysON |
|----------------------------|--------------------------|
| `kerml::LiteralExpression` | `sysml::LiteralRational` |
| Valeur dans `label` de l'objet | Valeur dans `.value` (primitif double) |

De plus, `.value` retourne un primitif Java (`double`), pas un objet EMF. Le GraphQL de SysON crashe avec `"objValue/id was non null but got null"` quand on fait `aql:self.value` parce que le résultat n'est pas un objet avec `id/kind/label`.

### 2.4 Solution validée

```
aql:self.oclAsType(sysml::LiteralRational).value.toString()
```
→ Retourne `"2.86"` comme `StringExpressionResult`. Le `.toString()` force la sérialisation en string, évitant le crash GraphQL.

Il faut aussi supporter `LiteralInteger` et `LiteralString` :

| Type SysON | AQL pour lire la valeur |
|------------|------------------------|
| `LiteralRational` | `aql:self.oclAsType(sysml::LiteralRational).value.toString()` |
| `LiteralInteger` | `aql:self.oclAsType(sysml::LiteralInteger).value.toString()` |
| `LiteralString` | `aql:self.oclAsType(sysml::LiteralString).value` |

La structure sous un `AttributeUsage` est :
```
AttributeUsage
└── FeatureValue
    └── LiteralRational / LiteralInteger (la valeur)
```

Donc l'AQL pour aller directement de l'attribut à la valeur :
```
aql:self.eAllContents()
  ->select(e | e.oclIsKindOf(sysml::LiteralRational) or e.oclIsKindOf(sysml::LiteralInteger))
  ->first()
```
Puis sur le noeud trouvé : `.value.toString()` pour obtenir le string parsable.

## 3. Changements à Implémenter

### 3.1 Fix du resolver (`lib/sim/src/evaluator/resolver.ts`)

**Fonction `readAttributeValue`** — remplacer la recherche `kerml::LiteralExpression` par :

```typescript
async function readAttributeValue(
  ecId: string,
  attributeId: string,
): Promise<number | undefined> {
  // Step 1: Find the literal node (LiteralRational or LiteralInteger)
  const findLiteral = `aql:self.eAllContents()->select(e |
    e.oclIsKindOf(sysml::LiteralRational) or
    e.oclIsKindOf(sysml::LiteralInteger)
  )->first()`;

  const literalResult = await evalAql(ecId, attributeId, findLiteral);
  if (literalResult.__typename === "ErrorPayload") return undefined;
  if (literalResult.result.__typename !== "ObjectExpressionResult") return undefined;

  const literalId = literalResult.result.objValue.id;
  const kind = literalResult.result.objValue.kind; // contains "LiteralRational" or "LiteralInteger"

  // Step 2: Read the value via .value.toString() (avoids GraphQL primitive crash)
  const readValue = await evalAql(ecId, literalId,
    kind.includes("LiteralRational")
      ? "aql:self.oclAsType(sysml::LiteralRational).value.toString()"
      : "aql:self.oclAsType(sysml::LiteralInteger).value.toString()"
  );

  if (readValue.__typename === "ErrorPayload") return undefined;
  if (readValue.result.__typename === "StringExpressionResult") {
    return parseFloat(readValue.result.strValue);
  }
  if (readValue.result.__typename === "IntExpressionResult") {
    return readValue.result.intValue;
  }

  return undefined;
}
```

**Impact** : 1 fonction modifiée, ~30 lignes. Zero changement d'API.

**Résultat attendu** : `sim_validate` sans `values` paramètre retourne `resolvedValues: { totalMass: 2.86, maxAllowedMass: 5.0, ... }` et des contraintes PASS/FAIL au lieu de "unresolved".

### 3.2 Boucle de démonstration E2E

Avec le resolver fixé, la boucle complète devient :

```
1. Agent: "Valide le ThermalControlSystem"
   → sim_validate(ecId, elementId)  // PAS de values manuelles
   → Viewer: PASS, totalMass=2.86 ≤ maxAllowedMass=5.0 (marge 42.8%)

2. Agent: "Change totalMass à 6 kg"
   → syson_query_eval(ecId, totalMassId, "aql:self.eAllContents()
       ->select(e|e.oclIsKindOf(sysml::LiteralRational))->first()
       .eSet('value', '6.0')")
   // OU: syson_element_insert_sysml pour recréer l'attribut

3. Agent: "Revalide"
   → sim_validate(ecId, elementId)
   → Viewer: FAIL, totalMass=6.0 > maxAllowedMass=5.0 (marge -20%)

4. Agent: "Génère le BOM"
   → plm_bom_generate(ecId, elementId)
   → Viewer: arbre BOM

5. Agent: "Coûte le BOM"
   → plm_bom_flatten → plm_bom_cost
   → Viewer: breakdown coûts
```

### 3.3 Modification de valeurs dans SysON (étape 2)

Deux approches possibles :

**Option A : AQL eSet** (mutation directe)
```
aql:self.eAllContents()
  ->select(e|e.oclIsKindOf(sysml::LiteralRational))->first()
  .eSet('value', '6.0')
```
À valider — `eSet` sur un primitif double peut nécessiter un cast.

**Option B : Nouveau tool `sim_set_value`** (recommandé)
```typescript
// lib/sim ou lib/syson
sim_set_value({
  editing_context_id: string,
  attribute_id: string,     // ID de l'AttributeUsage
  value: number             // Nouvelle valeur
})
```
Encapsule la logique AQL, gère LiteralRational vs LiteralInteger, retourne la confirmation.

**Option C : SysML v2 textual** (recréation)
```
syson_element_insert_sysml(ecId, parentId, "attribute totalMass : Real = 6.0;")
```
Nécessite de supprimer l'ancien attribut d'abord — plus lourd.

**Recommandation** : Option B pour la démo (tool dédié, simple, safe). Option A en fallback si `eSet` fonctionne.

## 4. Viewers et Feed

### 4.1 État actuel des viewers

| Viewer | Lib | Statut |
|--------|-----|--------|
| `validation-viewer` | lib/sim | **Enrichi** — affiche `resolvedValues` + `expression` (2026-02-17) |
| `bom-tree-viewer` | lib/plm | Done |
| `bom-cost-viewer` | lib/plm | Done |
| `bom-diff-viewer` | lib/plm | Done |
| + 7 viewers PLM | lib/plm | Done |

### 4.2 Broadcast sim → feed

Le serveur PLM HTTP (`lib/plm/server.ts`) sert les viewers des deux libs (path search `lib/plm/src/ui/dist/` puis `lib/sim/src/ui/dist/`). Le broadcast des résultats sim nécessite un POST externe (`curl` ou `fetch`) car le sandbox PML bloque `fetch("http://localhost:3011/broadcast")`.

**Amélioration potentielle** : ajouter un hook `onToolResult` dans le serveur sim qui auto-broadcast au feed PLM. Ou bien un flag `--broadcast-url` au lancement du serveur sim.

## 5. Spike : API Diagramme SysON (2026-02-17)

### 5.1 Introspection GraphQL — Mutations disponibles

L'instance SysON (`localhost:8180`) expose les mutations suivantes pour la manipulation de diagrammes :

| Mutation | Input | Description |
|----------|-------|-------------|
| `createRepresentation` | `editingContextId, objectId, representationDescriptionId, representationName` | Créer un nouveau diagramme |
| `dropOnDiagram` | `editingContextId, representationId, objectIds[], diagramTargetElementId, startingPositionX/Y` | Ajouter des éléments sémantiques sur un diagramme |
| `arrangeAll` | `editingContextId, representationId` | Auto-layout du diagramme entier |
| `layoutDiagram` | `editingContextId, representationId` + layout data | Layout personnalisé |
| `deleteFromDiagram` | | Retirer un élément du diagramme (sans supprimer du modèle) |
| `invokeSingleClickOnDiagramElementTool` | | Exécuter un outil de diagramme sur un élément |
| `fadeDiagramElement` / `hideDiagramElement` / `pinDiagramElement` | | Contrôle visuel |

### 5.2 Lister les diagrammes existants

```graphql
query {
  viewer {
    editingContext(editingContextId: "...") {
      representations {
        edges {
          node { id label kind }
        }
      }
    }
  }
}
```

Résultat confirmé sur le TCS :
```json
{
  "id": "f3d2f191-6dee-4de7-b486-49155725517a",
  "label": "view1",
  "kind": "siriusComponents://representation?type=Diagram"
}
```

### 5.3 Récupérer les données du diagramme

Le type `Diagram` contient `nodes`, `edges`, `layoutData`. Chaque `Node` a :
- `id`, `insideLabel.text`, `targetObjectId` (lien vers l'élément sémantique)
- `type`, `style` (INodeStyle), `childNodes`, `borderNodes`
- `defaultWidth`, `defaultHeight`

Chaque `Edge` a :
- `sourceId`, `targetId`, `targetObjectId`, `centerLabel.text`

**IMPORTANT** : Les données du diagramme ne sont accessibles que via la **subscription WebSocket** `diagramEvent`, pas via une query standard. La query `representation()` retourne uniquement `RepresentationMetadata` (id, label, kind).

### 5.4 Export SVG

**Non disponible** dans l'API GraphQL. Pas de mutation ni de query d'export.

**Alternatives pour obtenir un rendu visuel :**

| Option | Approche | Complexité | Qualité |
|--------|----------|-----------|---------|
| A | **WebSocket subscription** → récupérer nodes/edges → renderer SVG nous-mêmes | Élevée | Moyenne (pas le vrai rendu SysON) |
| B | **Playwright screenshot** de SysON dans le navigateur | Moyenne | Haute (vrai rendu) |
| C | **Iframe SysON** directement dans le feed/viewer | Faible | Haute (interactif !) |

**Option C recommandée** pour la démo : un viewer MCP App qui embed un iframe vers `http://localhost:8180/projects/{projectId}/edit/{ecId}`. L'ingénieur voit le vrai SysON interactif directement dans le feed. Zéro rendering custom.

### 5.5 Flow complet avec diagrammes

```
1. Agent crée des éléments via API (syson_element_create)
   → Éléments existent dans le modèle sémantique

2. Agent les ajoute au diagramme via dropOnDiagram(representationId, objectIds, x, y)
   → Éléments apparaissent sur le diagramme

3. Agent fait arrangeAll(representationId)
   → Layout propre automatique

4. Agent affiche le diagramme dans le feed
   → Option C : iframe SysON
   → OU : Playwright screenshot → image dans le viewer

5. Agent valide → sim_validate (resolver lit depuis le modèle)
   → validation-viewer avec paramètres résolus
```

### 5.6 Nouveaux tools `lib/syson` nécessaires

| Tool | Mutation GraphQL | Description |
|------|-----------------|-------------|
| `syson_diagram_list` | `viewer.editingContext.representations` | Lister les diagrammes |
| `syson_diagram_create` | `createRepresentation` | Créer un diagramme |
| `syson_diagram_drop` | `dropOnDiagram` | Ajouter des éléments au diagramme |
| `syson_diagram_arrange` | `arrangeAll` | Auto-layout |
| `syson_diagram_remove` | `deleteFromDiagram` | Retirer un élément du diagramme |

## 6. Résumé des tâches

| # | Tâche | Effort | Priorité | Statut |
|---|-------|--------|----------|--------|
| 1 | Fix `readAttributeValue` dans resolver.ts | ~30 min | P0 | **DONE** |
| 2 | Tester résolution auto E2E (sans valeurs manuelles) | ~15 min | P0 | **DONE** (sauf bug signe `-40`) |
| 3 | Fix signe négatif (OperatorExpression `-` unaire) | ~15 min | P0 | **DONE** (à tester) |
| 4 | Créer `sim_set_value` tool (ou valider eSet AQL) | ~1h | P1 | TODO |
| 5 | Implémenter tools `syson_diagram_*` (list, create, drop, arrange) | ~2h | P1 | TODO |
| 6 | Créer viewer diagramme (iframe SysON ou screenshot) | ~1h | P1 | TODO |
| 7 | Auto-broadcast sim results au feed | ~30 min | P2 | TODO |
| 8 | Scripter la démo E2E complète | ~1h | P1 | TODO |

## 7. Risques

- **`eSet` sur primitif double** : pas testé sur SysON. Si ça ne marche pas, fallback sur supprimer + recréer l'attribut via SysML v2 textual.
- **Attributs imbriqués** (e.g., `propulsion.thrust`) : le resolver gère déjà les paths multi-niveaux via `buildNestedAql`, mais non testé avec le nouveau `readAttributeValue`.
- **Types non-numériques** : si un attribut est un `LiteralString` ou un `LiteralBoolean`, le resolver retourne `undefined`. OK pour la démo (que des numériques), mais à gérer long terme.
- **Performance resolver** : chaque attribut = 3 appels AQL (find + check operator + read value). Pour N attributs = 3N appels parallélisés. Acceptable pour <20 attributs.
- **WebSocket subscription** : récupérer les données du diagramme nécessite une connexion WebSocket persistante — plus complexe qu'une simple query. L'option iframe SysON évite ce problème.
- **`dropOnDiagram` nécessite un `representationDescriptionId`** pour `createRepresentation` : il faut trouver l'ID du type de diagramme "General View" dans SysON. À investiguer via l'API `representationDescriptions`.
