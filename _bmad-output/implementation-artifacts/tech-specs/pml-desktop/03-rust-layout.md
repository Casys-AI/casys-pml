---
title: 'PML Desktop - Increment 3: Rust Layout Engine'
slug: 'pml-desktop-03-layout'
created: '2026-01-26'
status: 'implementation-complete'
parent_spec: '../tech-spec-pml-desktop.md'
increment: 3
estimated_tasks: 4
depends_on: ['02-webgpu-renderer.md']
completed: '2026-01-27'
---

# Increment 3: Rust Layout Engine

**Goal:** Graph layout computed in casys_engine Rust, positions sent to frontend.

## Prerequisites

- Increment 2 completed (WebGPU renderer working)
- Understanding of existing `lib/shgat/` structure

## Context

SHGAT and DR-DSP share a graph structure. Nodes already have `level` metadata for semantic hierarchy. Reference:
- `lib/shgat/src/core/shgat.ts`
- `src/graphrag/algorithms/dr-dsp.ts`

## Tasks

- [x] **Task 3.1: Add layout module to casys_engine**
  - File: `crates/casys_engine/src/layout/mod.rs`
  - Action: Create module structure
  - Code:
    ```rust
    pub mod force_directed;

    pub struct LayoutConfig {
        pub iterations: u32,
        pub repulsion: f32,
        pub attraction: f32,
        pub level_separation: f32,
    }

    pub struct NodePosition {
        pub id: String,
        pub x: f32,
        pub y: f32,
        pub level: u32,
    }
    ```
  - Update `lib.rs` to expose: `pub mod layout;`

- [x] **Task 3.2: Implement force-directed algorithm**
  - File: `crates/casys_engine/src/layout/force_directed.rs`
  - Action: Barnes-Hut optimized force calculation
  - Algorithm:
    1. Repulsion between all nodes (quadtree optimization)
    2. Attraction along edges
    3. Level-based vertical grouping (nodes at same level cluster)
  - Reference: Fruchterman-Reingold with hierarchy support

- [x] **Task 3.3: Create Tauri command for layout**
  - File: `apps/desktop/src-tauri/src/commands/layout.rs`
  - Action: Expose `compute_layout` command
  - Code:
    ```rust
    #[tauri::command]
    async fn compute_layout(
        nodes: Vec<NodeInput>,
        edges: Vec<EdgeInput>,
        config: LayoutConfig,
    ) -> Result<Vec<NodePosition>, String> {
        // Run layout in background
        let positions = casys_engine::layout::compute(nodes, edges, config)?;
        Ok(positions)
    }
    ```

- [x] **Task 3.4: Implement incremental layout updates**
  - File: `crates/casys_engine/src/layout/incremental.rs`
  - Action: Add/remove nodes without full recalc
  - Strategy:
    - New node: Place near connected nodes, run 10 local iterations
    - Removed node: No recalc needed, just remove from positions
  - Notes: Critical for live sync performance later

## Acceptance Criteria

- [x] **AC1:** Given nodes without positions, when `compute_layout` is called, then positions are computed
- [x] **AC2:** Given nodes with `level` field, when layout runs, then same-level nodes cluster vertically
- [x] **AC3:** Given 1000 nodes, when layout runs, then it completes in <500ms (Barnes-Hut O(n log n))
- [x] **AC4:** Given existing layout, when one node is added, then incremental update completes in <50ms (10 iterations)

## Integration

Frontend calls Tauri command instead of hardcoded positions:
```ts
const positions = await invoke('compute_layout', { nodes, edges, config });
renderer.updatePositions(positions);
```

## Deliverable

Nodes auto-position based on graph structure. Level-based clustering visible.

## Review Notes

- Adversarial review completed
- Findings: 15 total, 10 fixed, 5 skipped (noise)
- Resolution approach: auto-fix

### Fixes Applied:
- **F1**: Mass accumulation cap (MAX_MASS=100) prevents overflow
- **F2**: Consistent MIN_DIST_SQ threshold throughout
- **F3**: Minimum bbox size (MIN_BBOX_SIZE=100)
- **F4**: Stronger level force (0.5 instead of 0.1)
- **F5**: Size-independent convergence (max_movement vs avg)
- **F7**: Edge validation in incremental (fail-fast)
- **F8**: Adjacency list for O(degree) attraction
- **F9**: NaN/Infinity clamping with MAX_VELOCITY
- **F11**: Iteration cap (MAX_ITERATIONS=10000)
- **F14**: Stress tests added (1000 nodes, same position, cap test)

## Next Increment

→ `04-sliding-sidebar.md` - Sidebar navigation synced with graph
