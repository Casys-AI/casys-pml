# Tech-Spec: Emergence Dashboard (CAS Metrics)

**Created:** 2025-12-29 **Status:** Ready for Development

## Overview

### Problem Statement

The current dashboard has 3 view modes: `Capabilities`, `Tools`, and `Graph`. The `Tools` mode is redundant since tools are already visible within capabilities and graph views. We need a dedicated view to track **emergence patterns** based on Complex Adaptive Systems (CAS) theory - metrics that reveal how the system self-organizes and learns.

### Solution

Replace the `Tools` mode with an `Emergence` mode that displays real-time CAS metrics:
- **Graph entropy** (complexity)
- **Cluster stability** (Louvain)
- **Capability diversity** (pattern variety)
- **Learning velocity** (graph update rate)
- **Speculation accuracy** (prediction hit rate)
- **Threshold convergence** (adaptive threshold stability)

### Scope

**In scope:**
- New `Emergence` view mode replacing `Tools`
- Backend `/api/metrics/emergence` endpoint
- EmergencePanel component with KPIs + charts
- Integration with existing SSE for real-time updates

**Out of scope:**
- Changes to Capability or Graph modes
- New database tables (use existing data)
- Historical emergence data export

## Context for Development

### Codebase Patterns

```
src/web/
├── islands/
│   ├── GraphExplorer.tsx      # Main dashboard, manages ViewMode
│   ├── ExplorerSidebar.tsx    # View mode toggle buttons
│   ├── MetricsPanel.tsx       # Reference for chart patterns
│   └── CytoscapeGraph.tsx     # ViewMode type definition
├── components/ui/
│   └── atoms/
│       └── mod.ts             # MetricCard, ProgressBar, SectionCard
└── utils/graph/               # Graph algorithms
```

### Files to Reference

| File | Purpose |
|------|---------|
| `src/web/islands/GraphExplorer.tsx:111` | ViewMode state definition |
| `src/web/islands/ExplorerSidebar.tsx` | View toggle UI |
| `src/web/islands/MetricsPanel.tsx` | Chart.js patterns, atomic components |
| `src/web/components/ui/atoms/mod.ts` | MetricCard, ProgressBar reuse |
| `src/pml/api/metrics.ts` | Existing metrics endpoint |
| `docs/spikes/2025-12-17-complex-adaptive-systems-research.md` | CAS theory reference |

### Technical Decisions

1. **ViewMode enum change:** `"tools"` → `"emergence"` in CytoscapeGraph.tsx
2. **New endpoint:** `GET /api/metrics/emergence?range=1h|24h|7d`
3. **Compute metrics from existing data:** No new DB tables, aggregate from `edges`, `workflow_executions`, `capabilities`
4. **Chart library:** Chart.js (already used in MetricsPanel)
5. **Atomic design:** Reuse `MetricCard`, `ProgressBar`, `SectionCard` from atoms

## Implementation Plan

### Tasks

- [ ] **Task 1: Update ViewMode type**
  - File: `src/web/islands/CytoscapeGraph.tsx`
  - Change: `export type ViewMode = "capabilities" | "emergence" | "graph";`
  - Update default value if needed

- [ ] **Task 2: Update ExplorerSidebar toggle**
  - File: `src/web/islands/ExplorerSidebar.tsx`
  - Change: Replace "Tools" button with "Emergence" button
  - Icon: Use brain/sparkles icon for emergence

- [ ] **Task 3: Create EmergencePanel component**
  - File: `src/web/islands/EmergencePanel.tsx` (new)
  - Structure:
    ```tsx
    // KPI Cards row
    <div class="grid grid-cols-4 gap-2">
      <MetricCard label="Graph Entropy" value={entropy} />
      <MetricCard label="Cluster Stability" value={stability} />
      <MetricCard label="Diversity Index" value={diversity} />
      <MetricCard label="Learning Velocity" value={velocity} />
    </div>
    // Charts
    <EntropyChart data={timeseries.entropy} />
    <StabilityChart data={timeseries.stability} />
    ```
  - Features:
    - 4 KPI cards top row
    - 2 line charts (entropy + stability over time)
    - 1 gauge for speculation accuracy
    - Threshold convergence progress bar

- [ ] **Task 4: Create emergence metrics API**
  - File: `src/pml/api/metrics-emergence.ts` (new)
  - Endpoint: `GET /api/metrics/emergence`
  - Response type:
    ```typescript
    interface EmergenceMetricsResponse {
      current: {
        graphEntropy: number;        // 0-1, Shannon entropy of edge distribution
        clusterStability: number;    // 0-1, Louvain community consistency
        capabilityDiversity: number; // unique patterns / total patterns
        learningVelocity: number;    // edges/hour rate
        speculationAccuracy: number; // correct predictions / total
        thresholdConvergence: number;// 0-1, how stable is adaptive threshold
        capabilityCount: number;
        parallelizationRate: number;
      };
      timeseries: {
        entropy: Array<{ timestamp: string; value: number }>;
        stability: Array<{ timestamp: string; value: number }>;
        velocity: Array<{ timestamp: string; value: number }>;
      };
      thresholds: {
        entropyHealthy: [number, number];  // [0.3, 0.7] ideal range
        stabilityHealthy: number;          // >= 0.8 is good
        diversityHealthy: number;          // >= 0.5 is good
      };
    }
    ```

- [ ] **Task 5: Implement entropy calculation**
  - File: `src/pml/services/emergence-metrics.ts` (new)
  - Algorithm: Shannon entropy of edge weight distribution
    ```typescript
    function computeGraphEntropy(edges: Edge[]): number {
      const total = edges.reduce((s, e) => s + e.weight, 0);
      const probs = edges.map(e => e.weight / total);
      return -probs.reduce((h, p) => h + (p > 0 ? p * Math.log2(p) : 0), 0) / Math.log2(edges.length);
    }
    ```

- [ ] **Task 6: Implement cluster stability**
  - Use existing Louvain from `src/pml/algorithms/louvain.ts`
  - Compare communities at t vs t-1, compute Jaccard similarity
  - Store previous community assignment in memory/cache

- [ ] **Task 7: Implement learning velocity**
  - Count new edges created per hour from `edge_events` or `workflow_executions`
  - Normalize to edges/hour

- [ ] **Task 8: Integrate EmergencePanel in GraphExplorer**
  - File: `src/web/islands/GraphExplorer.tsx`
  - Add: `{viewMode === "emergence" && <EmergencePanel apiBase={apiBase} />}`
  - Position: Full panel replacing graph area when emergence mode active

- [ ] **Task 9: Add SSE listeners for emergence updates**
  - Events: `emergence.updated`, `capability.learned`
  - Trigger: Refetch emergence metrics on event

- [ ] **Task 10: Register route**
  - File: `src/pml/api/mod.ts`
  - Add: `router.get("/api/metrics/emergence", handleEmergenceMetrics)`

### Acceptance Criteria

- [ ] **AC1:** Given user clicks "Emergence" tab, When the mode switches, Then EmergencePanel displays with all 6 KPIs visible
- [ ] **AC2:** Given emergence mode is active, When graph entropy is below 0.3 or above 0.7, Then the entropy card shows warning color
- [ ] **AC3:** Given new capabilities are learned, When SSE event fires, Then metrics refresh automatically within 500ms
- [ ] **AC4:** Given user selects different time ranges (1h/24h/7d), When range changes, Then timeseries charts update accordingly
- [ ] **AC5:** Given cluster stability drops below 0.8, When displayed, Then progress bar shows warning state
- [ ] **AC6:** Given the dashboard loads, When emergence mode selected, Then API call completes in < 200ms

## Additional Context

### Dependencies

- Chart.js (already installed)
- Existing Louvain algorithm in `src/pml/algorithms/louvain.ts`
- SSE infrastructure at `/events/stream`

### Testing Strategy

1. **Unit tests:**
   - `computeGraphEntropy()` with known distributions
   - `computeClusterStability()` with mock community data
   - API response shape validation

2. **Integration tests:**
   - `/api/metrics/emergence` returns valid data
   - EmergencePanel renders without errors

3. **Manual testing:**
   - Toggle between 3 modes (Capabilities/Emergence/Graph)
   - Verify charts animate on data change
   - Check responsive layout on mobile

### Notes

**CAS Theory Reference (Holland 1992):**
- **Graph Entropy** = system complexity. Too low = rigid, too high = chaotic. Ideal: 0.3-0.7
- **Cluster Stability** = emergent structure persistence. High = mature patterns
- **Diversity Index** = variety of learned behaviors. Higher = richer adaptation
- **Learning Velocity** = rate of adaptation. Should stabilize over time

**UI Design:**
- Compact, technical look (not marketing)
- Monospace numbers for precision
- Subtle animations on data change
- Color coding: green (healthy), amber (attention), red (alert)

**Performance:**
- Cache entropy/stability calculations (expensive)
- Debounce SSE refresh to max 1/second
- Use `useMemo` for derived values in React
