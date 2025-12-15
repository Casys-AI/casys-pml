# Tech-Spec: Force-Directed Edge Bundling (FDEB) Visualization

**Created:** 2025-12-12
**Updated:** 2025-12-12
**Status:** Completed
**Author:** Erwan + Claude (Spec Engineering)
**Reference:** [Holten & van Wijk, 2009](docs/research/holten-edgebundling.pdf)

---

## Overview

### Problem Statement

La visualisation actuelle du graphe souffre de plusieurs problèmes:

1. **Visual clutter**: Avec 100+ edges, le graphe devient illisible
2. **Pas de patterns émergents**: On ne voit pas les groupes de tools/capabilities liés
3. **Canvas infini**: Les nodes peuvent déborder hors du viewport
4. **Layout statique**: Positions fixes au lieu d'un layout dynamique qui respire

### Solution

Implémenter le **Force-Directed Edge Bundling (FDEB)** de Holten & van Wijk (2009):

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     ○ cap1                              ○ tool1            │
│        \                               /                    │
│         \      ════════════════      /                     │
│          \    /                \    /                      │
│     ○ cap2 ══╳══════════════════╳══ ○ tool2               │
│          /    \                /    \                      │
│         /      ════════════════      \                     │
│        /                               \                    │
│     ○ cap3                              ○ tool3            │
│                                                             │
│   (edges bundled where compatible)                          │
│   (nodes in force layout with bounds)                       │
└─────────────────────────────────────────────────────────────┘
```

**Avantages:**
- Réduction significative du clutter visuel
- Patterns high-level émergents (edges similaires se bundlent)
- Layout dynamique qui se stabilise
- Canvas borné (nodes restent dans le viewport)

### Scope

**In Scope:**
- Algorithme FDEB complet avec 4 edge compatibility metrics
- Force layout D3 avec bounding box
- Intégration dans D3GraphVisualization existant
- Click sur capability → CodePanel

**Out of Scope:**
- Toggle hulls/bundling (on supprime les hulls)
- GPU acceleration
- Radial layout

---

## Architecture Atomique

### Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                  D3GraphVisualization.tsx                   │
│                         (island)                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ uses
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
┌─────────────────┐ ┌───────────┐ ┌─────────────────┐
│ BoundedForce    │ │   FDEB    │ │  EdgeRenderer   │
│ Layout.ts       │ │ Bundler.ts│ │  .ts            │
│                 │ │           │ │                 │
│ - D3 simulation │ │ - bundle()│ │ - drawEdges()   │
│ - bounds forces │ │ - cycles  │ │ - SVG paths     │
│ - node forces   │ │           │ │ - interactions  │
└─────────────────┘ └─────┬─────┘ └─────────────────┘
                          │ uses
                          ▼
              ┌─────────────────────┐
              │ EdgeCompatibility.ts│
              │                     │
              │ - Ca (angle)        │
              │ - Cs (scale)        │
              │ - Cp (position)     │
              │ - Cv (visibility)   │
              └─────────────────────┘
```

### File Structure

```
src/web/utils/graph/
├── index.ts                    # Re-exports
├── edge-compatibility.ts       # Module 1: 4 compatibility metrics
├── fdeb-bundler.ts            # Module 2: FDEB algorithm
├── bounded-force-layout.ts    # Module 3: D3 force with bounds
└── edge-renderer.ts           # Module 4: SVG rendering
```

---

## Module 1: Edge Compatibility (`edge-compatibility.ts`)

### Purpose
Calcule la compatibilité entre deux edges pour déterminer s'ils doivent se bundler.

### Types

```typescript
interface Point {
  x: number;
  y: number;
}

interface Edge {
  source: Point;
  target: Point;
}

interface CompatibilityResult {
  angle: number;      // Ca ∈ [0,1]
  scale: number;      // Cs ∈ [0,1]
  position: number;   // Cp ∈ [0,1]
  visibility: number; // Cv ∈ [0,1]
  total: number;      // Ce = Ca × Cs × Cp × Cv
}
```

### API

```typescript
/**
 * Angle Compatibility: parallel edges = 1, perpendicular = 0
 * Ca(P,Q) = |cos(α)|
 */
export function angleCompatibility(p: Edge, q: Edge): number;

/**
 * Scale Compatibility: similar length edges bundle better
 * Cs(P,Q) = 2 / (lavg/min + max/lavg)
 */
export function scaleCompatibility(p: Edge, q: Edge): number;

/**
 * Position Compatibility: closer midpoints = higher compatibility
 * Cp(P,Q) = lavg / (lavg + ||Pm - Qm||)
 */
export function positionCompatibility(p: Edge, q: Edge): number;

/**
 * Visibility Compatibility: handles skewed parallelograms
 * Cv(P,Q) = min(V(P,Q), V(Q,P))
 */
export function visibilityCompatibility(p: Edge, q: Edge): number;

/**
 * Total Edge Compatibility
 * Ce(P,Q) = Ca × Cs × Cp × Cv
 */
export function edgeCompatibility(p: Edge, q: Edge): CompatibilityResult;
```

### Formulas (from paper)

```
Ca(P,Q) = |cos(α)| where α = arccos(P·Q / |P||Q|)

Cs(P,Q) = 2 / (lavg/min(|P|,|Q|) + max(|P|,|Q|)/lavg)
          where lavg = (|P|+|Q|)/2

Cp(P,Q) = lavg / (lavg + ||Pm - Qm||)
          where Pm, Qm are midpoints

Cv(P,Q) = min(V(P,Q), V(Q,P))
          where V(P,Q) = max(1 - 2||Pm-Im|| / ||I0-I1||, 0)
```

---

## Module 2: FDEB Bundler (`fdeb-bundler.ts`)

### Purpose
Implémente l'algorithme Force-Directed Edge Bundling avec cycles itératifs.

### Types

```typescript
interface FDEBConfig {
  K: number;              // Global spring constant (default: 0.1)
  S0: number;             // Initial step size (default: 0.04)
  I0: number;             // Initial iterations (default: 50)
  cycles: number;         // Number of cycles (default: 6)
  compatibilityThreshold: number; // Min Ce to consider (default: 0.05)
}

interface BundledEdge {
  sourceId: string;
  targetId: string;
  subdivisionPoints: Point[];  // P+2 points (including endpoints)
}
```

### API

```typescript
export class FDEBBundler {
  constructor(config?: Partial<FDEBConfig>);

  /**
   * Set node positions (needed for edge endpoints)
   */
  setNodes(nodes: Map<string, Point>): this;

  /**
   * Set edges to bundle
   */
  setEdges(edges: Array<{source: string; target: string}>): this;

  /**
   * Run FDEB algorithm and return bundled edges
   */
  bundle(): BundledEdge[];
}
```

### Algorithm (from paper Section 3.3)

```typescript
// Iterative refinement scheme
const scheme = {
  cycle:      [0,    1,    2,    3,     4,      5],
  P:          [1,    2,    4,    8,    16,     32],  // subdivisions
  S:          [0.04, 0.02, 0.01, 0.005, 0.0025, 0.00125], // step size
  I:          [50,   33,   22,   15,    9,      7],  // iterations
};

// For each cycle:
//   1. Double subdivision points P
//   2. Halve step size S
//   3. Reduce iterations I by factor 2/3
//   4. Run I iterations of force calculation
```

### Force Calculation

```typescript
// Combined force on subdivision point pi
F_pi = F_spring + F_electrostatic

// Spring force (keeps edge shape)
F_spring = kP × (||p_{i-1} - p_i|| + ||p_i - p_{i+1}||)
// where kP = K / |P| × (number of segments)

// Electrostatic force (attracts compatible edges)
F_electrostatic = Σ Ce(P,Q) / ||p_i - q_i||
// where Q ∈ compatible edges
```

---

## Module 3: Bounded Force Layout (`bounded-force-layout.ts`)

### Purpose
D3 force simulation avec contraintes de bounding box pour garder les nodes dans le viewport.

### Types

```typescript
interface BoundedForceConfig {
  width: number;
  height: number;
  padding: number;           // Distance from edges (default: 50)
  chargeStrength: number;    // Node repulsion (default: -100)
  linkDistance: number;      // Ideal edge length (default: 100)
  boundaryStrength: number;  // How hard to push back (default: 0.5)
}

interface SimulationNode {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;  // Fixed x (optional)
  fy?: number | null;  // Fixed y (optional)
}
```

### API

```typescript
export class BoundedForceLayout {
  constructor(config: BoundedForceConfig);

  /**
   * Create D3 force simulation with bounds
   */
  createSimulation(
    nodes: SimulationNode[],
    links: Array<{source: string; target: string}>
  ): d3.Simulation;

  /**
   * Custom force that pushes nodes back into bounds
   */
  forceBoundary(): d3.Force;

  /**
   * Update bounds (e.g., on resize)
   */
  setBounds(width: number, height: number): void;
}
```

### Boundary Force Implementation

```typescript
function forceBoundary(width, height, padding, strength) {
  return function(alpha) {
    for (const node of nodes) {
      // Push back from left
      if (node.x < padding) {
        node.vx += (padding - node.x) * strength * alpha;
      }
      // Push back from right
      if (node.x > width - padding) {
        node.vx += (width - padding - node.x) * strength * alpha;
      }
      // Push back from top
      if (node.y < padding) {
        node.vy += (padding - node.y) * strength * alpha;
      }
      // Push back from bottom
      if (node.y > height - padding) {
        node.vy += (height - padding - node.y) * strength * alpha;
      }
    }
  };
}
```

---

## Module 4: Edge Renderer (`edge-renderer.ts`)

### Purpose
Rendu SVG des edges bundlées avec interactions (hover, click).

### Types

```typescript
interface EdgeRenderConfig {
  strokeWidth: number;
  strokeOpacity: number;
  hoverOpacity: number;
  curveType: 'basis' | 'cardinal' | 'catmullRom';
}
```

### API

```typescript
export class EdgeRenderer {
  constructor(
    svgGroup: d3.Selection,
    config?: Partial<EdgeRenderConfig>
  );

  /**
   * Render bundled edges as SVG paths
   */
  render(edges: BundledEdge[]): void;

  /**
   * Highlight edges connected to a node
   */
  highlightByNode(nodeId: string): void;

  /**
   * Highlight a specific edge
   */
  highlightEdge(sourceId: string, targetId: string): void;

  /**
   * Clear all highlights
   */
  clearHighlights(): void;

  /**
   * Set click handler for edges
   */
  onClick(handler: (edge: BundledEdge) => void): void;
}
```

---

## Implementation Plan

### Phase 1: Core Algorithm (Module 1 + 2)

**Task 1.1: Edge Compatibility**
- File: `src/web/utils/graph/edge-compatibility.ts`
- Implement 4 compatibility functions
- Unit tests for each function
- ~2h estimated

**Task 1.2: FDEB Bundler**
- File: `src/web/utils/graph/fdeb-bundler.ts`
- Implement iterative refinement scheme
- Force calculation with compatibility
- Unit tests
- ~4h estimated

### Phase 2: Layout System (Module 3)

**Task 2.1: Bounded Force Layout**
- File: `src/web/utils/graph/bounded-force-layout.ts`
- D3 simulation wrapper
- Custom boundary force
- Integration with existing force config
- ~2h estimated

### Phase 3: Rendering (Module 4)

**Task 3.1: Edge Renderer**
- File: `src/web/utils/graph/edge-renderer.ts`
- SVG path generation from subdivision points
- Hover/click interactions
- Color coding
- ~2h estimated

### Phase 4: Integration

**Task 4.1: Update D3GraphVisualization**
- Replace current edge rendering with FDEB
- Remove hull rendering code
- Connect to BoundedForceLayout
- Wire up interactions
- ~3h estimated

**Task 4.2: Fix CodePanel integration**
- Ensure onCapabilitySelect is called
- Test click → CodePanel flow
- ~1h estimated

### Phase 5: Polish

**Task 5.1: Performance optimization**
- Compatibility threshold filtering
- Debounce bundling on layout changes
- ~1h estimated

**Task 5.2: Tests**
- Unit tests for all modules
- Integration test with Playwright
- ~2h estimated

---

## Acceptance Criteria

- [x] **AC 1:** Edges between capabilities and tools are visually bundled where compatible
- [x] **AC 2:** All nodes remain within the viewport bounds
- [x] **AC 3:** Click on capability node opens CodePanel with correct data
- [x] **AC 4:** Layout stabilizes within 2 seconds
- [x] **AC 5:** Bundling runs without blocking UI (< 100ms for 100 edges)

### Bonus Features Implemented

- [x] **AC 6:** Drag & drop nodes with live force simulation (other nodes react)
- [x] **AC 7:** Bundle interpolation during drag (elastic band effect)
- [x] **AC 8:** Click highlight: connected edges/nodes at full opacity, others dimmed (5%/15%)
- [x] **AC 9:** Hover highlight on nodes with edge preview
- [x] **AC 10:** Edge colors by type: red (contains), blue (dependency), orange (sequence)
- [x] **AC 11:** Bundling by edge type (edges of different types don't bundle together)
- [x] **AC 12:** Auto-generated "contains" edges from tool.parents field

---

## Technical Decisions

### TD-1: Custom FDEB vs Library
**Decision:** Implement custom FDEB based on paper
**Rationale:**
- Full control over algorithm
- No external dependency
- Better understanding for debugging
- Paper provides complete algorithm

### TD-2: Bundling Trigger
**Decision:** Rebundle when simulation stabilizes (alpha < 0.01)
**Rationale:**
- Avoid bundling during rapid layout changes
- Better performance
- Smooth visual experience

### TD-3: Canvas Bounds
**Decision:** Soft boundary force (not hard clamp)
**Rationale:**
- More natural movement
- Nodes can temporarily exceed bounds during simulation
- Final positions always within bounds

### TD-4: Drag Behavior
**Decision:** Only reheat simulation on actual drag movement, not click
**Rationale:**
- Prevents unwanted viewport slide on simple click
- Better separation of click (select) vs drag (move) interactions
- Smoother user experience

### TD-5: Edge Type Bundling
**Decision:** Bundle edges by type separately (contains, sequence, dependency)
**Rationale:**
- Edges of different semantic meaning shouldn't bundle together
- Preserves visual distinction between relationship types
- Color coding remains meaningful

### TD-6: Edge Colors
**Decision:** Red (#ef4444) for contains, Blue (#3b82f6) for dependency, Orange (#FFB86F) for sequence
**Rationale:**
- High contrast colors for visibility
- Semantic meaning: red = structural (cap→tool), blue = explicit deps, orange = flow

---

## Performance Considerations

- **Complexity:** O(C × I × E² × P) where C=cycles, I=iterations, E=edges, P=subdivisions
- **Optimization:** Skip edge pairs with Ce < 0.05 (reduces interactions by 50-75%)
- **Target:** < 100ms for 100 edges on modern hardware
- **Fallback:** Web Worker if > 500 edges (future)

---

## References

- [Holten & van Wijk, 2009 - Force-Directed Edge Bundling](docs/research/holten-edgebundling.pdf)
- [D3 Force Simulation](https://d3js.org/d3-force)
- [D3 Line Generators](https://d3js.org/d3-shape/line)
