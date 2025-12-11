# Tech-Spec: Mini Hulls for Toolless Capabilities

**Created:** 2025-12-11
**Status:** Completed
**Story:** 8.3 continuation

## Overview

### Problem Statement

Les capabilities créées par `code_execution` sans MCP tools ne sont pas visibles dans le graph :
- Le code actuel retourne un path vide quand `toolIds.length === 0`
- Ces capabilities "code pur" disparaissent visuellement
- On perd l'information sur l'existence de ces patterns appris

### Solution

**V1 - Simple (cette spec) :**
- Créer des **noeuds capability** dans la simulation D3 (comme les tools)
- Le hull se dessine autour du noeud (cercle min = 50px)
- Voir le résultat et itérer

**V2 - Améliorations futures (si besoin) :**
- Force de gravité pour regrouper les capabilities sans tools
- Rendre le noeud invisible (hull seul)
- Ajuster le style

### Scope

**In Scope (V1) :**
- Noeuds capability pour zones sans tools
- Mini hulls autour de ces noeuds

**Out of Scope :**
- Force de gravité (V2)
- AIL/HIL comme types de tâches (spike séparé)

## Context for Development

### Codebase Patterns

**Existant dans `hypergraph-builder.ts` :**
- `ZONE_COLORS` - Palette de 8 couleurs (violet, blue, emerald, amber, red, pink, cyan, lime)
- `CapabilityZone` - Interface avec color, opacity (0.3), padding (20), minRadius (50)
- Les zones sont DÉJÀ créées même pour `toolsUsed.length === 0`

**Existant dans `D3GraphVisualization.tsx` :**
- `nodesRef.current: SimNode[]` pour les noeuds tools
- `drawCapabilityHulls()` gère déjà 1 point → cercle (ligne 1393-1396)
- Simulation de force avec `d3.forceSimulation()`

### Files to Reference

- `src/web/islands/D3GraphVisualization.tsx:1386-1401` - Rendu des hulls (0/1/2/3+ points)
- `src/capabilities/hypergraph-builder.ts:71-80` - ZONE_COLORS
- `src/capabilities/hypergraph-builder.ts:175-184` - Création des zones

### Technical Decisions

1. **Noeuds capability visibles** - Approche simple V1, itérer ensuite si besoin
2. **Réutilisation design existant** - ZONE_COLORS, opacity (0.3), minRadius (50px)
3. **nodeType pour distinguer** - `"tool"` vs `"capability"` pour style futur

## Implementation Plan

### Tasks

- [x] Task 1: Ajouter `nodeType: "capability"` au type SimNode
- [x] Task 2: Dans `loadHypergraphData`, créer un noeud capability pour chaque zone sans tools
- [x] Task 3: Modifier `drawCapabilityHulls` pour trouver le noeud capability si 0 tools
- [x] Task 4: Mettre à jour `handleZoneCreated` pour créer le noeud capability si 0 tools
- [x] Task 5: Style distinct pour noeuds capability (optionnel - voir rendu d'abord)
- [x] Task 6: Tester avec capabilities sans tools

### Acceptance Criteria

- [x] AC 1: Une capability sans tools apparaît comme un mini hull (cercle coloré)
- [x] AC 2: Le noeud capability est visible à l'intérieur du hull
- [x] AC 3: Le label de la capability s'affiche au-dessus du mini hull
- [x] AC 4: Les events zone.created/updated fonctionnent pour capabilities sans tools

## Additional Context

### Implementation Details

#### Task 1: Type SimNode

```typescript
interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  server?: string;              // Pour tools
  nodeType?: "tool" | "capability";  // ← Nouveau
  parents?: string[];
  // ...
}
```

#### Task 2: Noeuds capability dans loadHypergraphData

```typescript
// Après avoir créé les noeuds tools
for (const zone of data.capability_zones || []) {
  if (zone.toolIds.length === 0) {
    // Capability sans tools → créer un noeud capability
    nodes.push({
      id: zone.id,  // "cap-xxx"
      label: zone.label,
      nodeType: "capability",
      x: Math.random() * 800,
      y: Math.random() * 600,
    });
  }
}
```

#### Task 3: drawCapabilityHulls avec noeud capability

```typescript
// Dans la préparation des données pour les hulls
const hullData = zones.map(zone => {
  let points: [number, number][];

  if (zone.toolIds.length === 0) {
    // Utiliser le noeud capability comme point
    const capNode = nodes.find(n => n.id === zone.id);
    points = capNode ? [[capNode.x, capNode.y]] : [];
  } else {
    // Utiliser les positions des tools (existant)
    points = zone.toolIds
      .map(id => nodes.find(n => n.id === id))
      .filter(Boolean)
      .map(n => [n.x, n.y]);
  }

  return { zone, points, hull: points.length >= 3 ? d3.polygonHull(points) : null };
});
```

#### Task 4: handleZoneCreated avec noeud capability

```typescript
const handleZoneCreated = (event: any) => {
  const data = JSON.parse(event.data);

  // Si 0 tools, créer un noeud capability
  if (!data.toolIds || data.toolIds.length === 0) {
    const capNode: SimNode = {
      id: data.capabilityId,
      label: data.label,
      nodeType: "capability",
      x: Math.random() * 800,
      y: Math.random() * 600,
    };
    nodesRef.current = [...nodesRef.current, capNode];
    updateGraph();
  }

  // Créer la zone comme avant...
};
```

### Dependencies

- D3.js (déjà utilisé)
- Preact/Fresh (déjà utilisé)

### Testing Strategy

1. Créer une capability via execute_code sans appeler de MCP tools
2. Vérifier que le mini hull (cercle coloré) apparaît avec un noeud dedans
3. Vérifier que le label s'affiche
4. Tester les events SSE zone.created pour capabilities sans tools

### Notes

- Le code existant `drawCapabilityHulls` gère déjà le cas 1 point → cercle de rayon `minRadius` (50px)
- Les couleurs sont déjà assignées par `ZONE_COLORS[i % 8]`
- L'opacity est déjà à 0.3 pour tous les hulls
- Le label s'affiche déjà au-dessus du hull

### V2 Améliorations (futur)

- Force de gravité pour regrouper les capabilities sans tools
- Rendre le noeud invisible si le hull suffit visuellement
- Style distinct (forme, icône) pour les noeuds capability
