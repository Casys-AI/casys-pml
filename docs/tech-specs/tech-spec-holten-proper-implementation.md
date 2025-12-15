# Tech-Spec: Implémentation Propre du Papier Holten (FDEB)

**Created:** 2025-12-12
**Status:** Completed
**Reference:** [Holten & van Wijk, 2009](docs/research/holten-edgebundling.pdf)

---

## Overview

### Problem Statement

L'implémentation actuelle du FDEB mélange:
1. **Drag dynamique** avec rebundling continu (`rebundleEdgesLight`) - complexe et instable
2. **Layout bipartite forcé** (Caps gauche, Tools droite) - inadapté car edges Cap↔Cap et Tool↔Tool
3. **Manque les features clés du papier** : heatmap, straightening, smoothing, inverse-quadratic

Le graph réel n'est pas bipartite : il y a des edges Cap↔Cap, Tool↔Tool, et Cap↔Tool.

### Solution

Simplifier et améliorer selon le papier Holten :
1. **Layout organique** - désactiver bipartiteMode, laisser les forces naturelles positionner
2. **Drag simplifié** - garder le drag, supprimer seulement `rebundleEdgesLight` (rebundle full au drag end)
3. **Gradient-based rendering** - GPU heatmap pour visualiser la densité des bundles
4. **Bundle straightening** - slider interactif `s ∈ [0,1]` pour déplier les bundles
5. **Gaussian smoothing** - lissage des subdivision points
6. **Inverse-quadratic model** - bundling plus localisé, moins de "webbing"

### Scope

**In Scope:**
- Désactiver bipartiteMode pour layout organique
- Simplifier le drag (supprimer `rebundleEdgesLight`, garder rebundle full au drag end)
- Ajouter slider de straightening dans GraphLegendPanel
- Ajouter slider de smoothing dans GraphLegendPanel
- Implémenter le modèle inverse-quadratic
- GPU heatmap pour edge density (WebGL)
- Composants atomiques (Slider, GradientBar)

**Out of Scope:**
- Rebundling continu pendant le drag (supprimé - trop instable)
- Animation de transition entre états
- Export de la heatmap
- Fallback CSS pour heatmap (WebGL only)

---

## Context for Development

### Codebase Patterns

**Atomic Design:**
```
atoms/     → Slider.tsx (NEW), GradientBar.tsx (NEW)
molecules/ → GraphLegendPanel.tsx (extend)
islands/   → D3GraphVisualization.tsx (simplify)
utils/     → fdeb-bundler.ts (add smoothing, quadratic)
           → edge-heatmap.ts (NEW - WebGL)
```

**Existing Atoms:** Badge, Button, Divider, Input, ProgressBar

### Files to Reference

- `src/web/components/ui/atoms/ProgressBar.tsx` - Pattern pour range input
- `src/web/components/ui/molecules/GraphLegendPanel.tsx` - Où ajouter les sliders
- `src/web/utils/graph/fdeb-bundler.ts` - Algorithme FDEB à modifier
- `src/web/islands/D3GraphVisualization.tsx` - Simplifier le drag handler

### Technical Decisions

**TD-1: Simplification du drag (pas suppression)**
- Rationale: Garder le drag pour l'exploration, supprimer seulement `rebundleEdgesLight`
- Behavior: Pendant drag → edges s'étirent élastiquement. Au drag end → rebundle full quality
- Impact: UX préservée, bundling stable

**TD-2: Désactiver bipartiteMode**
- Rationale: Le graph a des edges Cap↔Cap et Tool↔Tool, pas un vrai bipartite
- Change: `bipartiteMode: false` dans BoundedForceLayout
- Impact: Layout organique, bundles multidirectionnels naturels

**TD-3: Inverse-quadratic par défaut**
- Formula: `Fe = Ce / ||pi - qi||²` au lieu de `Ce / ||pi - qi||`
- Rationale: Bundling plus localisé, moins de "webbing" (Figure 7d vs 7b du papier)

**TD-4: GPU Heatmap avec WebGL**
- Rationale: Le papier utilise "floating-point accumulation buffer"
- Implementation: Canvas WebGL overlay, count edge overdraw per pixel
- No fallback: WebGL only (standard moderne)

**TD-5: Smoothing Gaussian comme post-processing**
- Formula: Convolution avec kernel gaussien sur subdivision points
- Rationale: Paper Section 3.3 - "less jagged bundles"

---

## Implementation Plan

### Tasks

#### Phase 1: Simplification (layout + drag)

- [x] **Task 1.1:** Désactiver bipartiteMode dans D3GraphVisualization.tsx
  ```typescript
  // ~ligne 522
  const boundedLayout = new BoundedForceLayout({
    // ...
    bipartiteMode: false,  // ← CHANGEMENT
    // bipartiteStrength: 0.4,  // ← SUPPRIMER
  });
  ```

- [x] **Task 1.2:** Simplifier le drag handler
  - Supprimer `dragThrottleTimer` et `rebundleEdgesLight`
  - Garder le drag avec interpolation élastique pendant le mouvement
  - Garder `rebundleEdges()` full quality au drag end
  - Supprimer la fonction `rebundleEdgesLight()` (~ligne 744-788)

- [x] **Task 1.3:** Nettoyer les refs inutiles
  - Supprimer `(window as any).__d3Graph.rebundleEdgesLight`

#### Phase 2: Composants Atomiques

- [x] **Task 2.1:** Créer `Slider.tsx` atom
  ```typescript
  interface SliderProps {
    value: number;          // Current value
    min?: number;           // Default 0
    max?: number;           // Default 1
    step?: number;          // Default 0.01
    label?: string;         // Optional label
    onChange: (v: number) => void;
  }
  ```

- [x] **Task 2.2:** Créer `GradientBar.tsx` atom
  ```typescript
  interface GradientBarProps {
    colors: string[];       // Array of colors low → high
    labels?: [string, string]; // ["low", "high"]
  }
  ```

- [x] **Task 2.3:** Exporter dans `atoms/mod.ts`

#### Phase 3: Améliorer le Bundler (fdeb-bundler.ts)

- [x] **Task 3.1:** Ajouter option `useQuadratic: boolean` (default: true)
  ```typescript
  // Line ~309: Change force calculation
  const force = this.config.useQuadratic
    ? Ce / (dist * dist)  // Inverse-quadratic
    : Ce / dist;          // Inverse-linear
  ```

- [x] **Task 3.2:** Ajouter `applyStraightening(edges, s)` method
  ```typescript
  // Paper formula Section 4.3:
  // p'_i = (1-s)*p_i + s*(P0 + (i+1)/(N+1)*(P1-P0))
  applyStraightening(edges: BundledEdge[], s: number): BundledEdge[]
  ```

- [x] **Task 3.3:** Ajouter `applySmoothing(edges, amount)` method
  ```typescript
  // Gaussian kernel convolution on subdivision points
  // amount ∈ [0, 1] controls kernel width
  applySmoothing(edges: BundledEdge[], amount: number): BundledEdge[]
  ```

#### Phase 4: GPU Heatmap (WebGL)

- [x] **Task 4.1:** Créer `src/web/utils/graph/edge-heatmap.ts`
  ```typescript
  export class EdgeHeatmap {
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext;

    constructor(width: number, height: number);

    // Draw all edges to accumulation buffer
    renderEdges(edges: BundledEdge[]): void;

    // Apply color gradient based on overdraw count
    applyGradient(colors: string[]): void;

    // Get canvas for overlay
    getCanvas(): HTMLCanvasElement;
  }
  ```

- [x] **Task 4.2:** Shader programs pour edge rendering
  - Vertex shader: Draw edge segments as lines
  - Fragment shader: Increment accumulation value

- [x] **Task 4.3:** Color mapping shader
  - Map accumulation values to color gradient
  - Linear or logarithmic scale option

#### Phase 5: Intégration UI

- [x] **Task 5.1:** Étendre `GraphLegendPanel.tsx`
  ```typescript
  interface GraphLegendPanelProps {
    // ... existing props ...

    // NEW: Holten controls
    straightening: number;
    onStraighteningChange: (s: number) => void;
    smoothing: number;
    onSmoothingChange: (s: number) => void;
    showHeatmap: boolean;
    onToggleHeatmap: () => void;
  }
  ```

- [x] **Task 5.2:** Ajouter section "Bundle Controls" dans le panel
  ```
  ──────────────
  Bundle Controls
  ──────────────
  Straightening [=====○=====] 0.00
  Smoothing     [=====○=====] 0.25
  □ Show Heatmap
  [low ████████ high]
  ```

- [x] **Task 5.3:** Connecter dans D3GraphVisualization.tsx
  - State pour `straightening`, `smoothing`, `showHeatmap`
  - Re-render edges quand les valeurs changent
  - Overlay heatmap canvas quand activé

#### Phase 6: Tests & Polish

- [x] **Task 6.1:** Type check OK (deno check)
- [ ] **Task 6.2:** Tests unitaires pour Slider, GradientBar atoms
- [ ] **Task 6.3:** Tests pour applyStraightening, applySmoothing
- [ ] **Task 6.4:** Test visuel du heatmap avec différentes densités

---

## Acceptance Criteria

- [x] **AC 1:** Le layout est organique (pas de séparation bipartite forcée) - `bipartiteMode: false`
- [x] **AC 2:** Le drag fonctionne avec interpolation élastique, rebundle full au release - `rebundleEdgesLight` supprimé
- [x] **AC 3:** Le slider Straightening `s=0` montre les bundles, `s=1` montre les edges droites - `applyStraightening`
- [x] **AC 4:** Le slider Smoothing lisse visiblement les bundles (moins dentelés) - `applySmoothing`
- [x] **AC 5:** Le toggle Heatmap affiche une vraie heatmap GPU avec gradient de couleur - `EdgeHeatmap` WebGL
- [x] **AC 6:** Les bundles sont plus "localisés" (moins de webbing) avec inverse-quadratic - `useQuadratic: true`
- [ ] **AC 7:** Performance < 100ms pour re-render avec straightening/smoothing changes - À valider visuellement

---

## Additional Context

### Dependencies

- **WebGL** pour le heatmap (standard dans les browsers modernes)
- **D3.js** déjà utilisé (CDN)
- Pas de nouvelles dépendances npm

### Testing Strategy

1. **Unit tests:** Slider, GradientBar, smoothing/straightening functions
2. **Visual tests:** Screenshots comparatifs avant/après
3. **Performance:** Mesurer le temps de render pour 100, 500, 1000 edges

### Notes

- Le heatmap est un **overlay** sur le SVG existant, pas un remplacement
- Les edges SVG restent pour les interactions (hover, click)
- Le heatmap montre la "densité visuelle" des bundles

### Gradient Colors (Paper Default)

```
low                                    high
█ #2E4A62 █ #4A7C8E █ #6BAF73 █ #FFB86F █
  blue      cyan      green     orange
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    D3GraphVisualization                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                     SVG Layer                         │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐              │  │
│  │  │  Nodes  │  │  Edges  │  │ Markers │              │  │
│  │  └─────────┘  └─────────┘  └─────────┘              │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              WebGL Heatmap Canvas (overlay)           │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │  Accumulation Buffer → Color Gradient         │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              GraphLegendPanel                         │  │
│  │  ┌─────────────────┐  ┌─────────────────────────┐   │  │
│  │  │   MCP Servers   │  │    Bundle Controls       │   │  │
│  │  │   Edge Types    │  │    ○ Straightening       │   │  │
│  │  │   Confidence    │  │    ○ Smoothing           │   │  │
│  │  │   Export        │  │    □ Heatmap             │   │  │
│  │  └─────────────────┘  └─────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```
