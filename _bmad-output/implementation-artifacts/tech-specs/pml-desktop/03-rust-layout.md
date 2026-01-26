---
title: 'PML Desktop - Increment 3: Rust Layout Engine'
slug: 'pml-desktop-03-layout'
created: '2026-01-26'
status: 'ready-for-dev'
parent_spec: '../tech-spec-pml-desktop.md'
increment: 3
estimated_tasks: 4
depends_on: ['02-webgpu-renderer.md']
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

- [ ] **Task 3.1: Add layout module to casys_engine**
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

- [ ] **Task 3.2: Implement force-directed algorithm**
  - File: `crates/casys_engine/src/layout/force_directed.rs`
  - Action: Barnes-Hut optimized force calculation
  - Algorithm:
    1. Repulsion between all nodes (quadtree optimization)
    2. Attraction along edges
    3. Level-based vertical grouping (nodes at same level cluster)
  - Reference: Fruchterman-Reingold with hierarchy support

- [ ] **Task 3.3: Create Tauri command for layout**
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

- [ ] **Task 3.4: Implement incremental layout updates**
  - File: `crates/casys_engine/src/layout/incremental.rs`
  - Action: Add/remove nodes without full recalc
  - Strategy:
    - New node: Place near connected nodes, run 10 local iterations
    - Removed node: No recalc needed, just remove from positions
  - Notes: Critical for live sync performance later

## Acceptance Criteria

- [ ] **AC1:** Given nodes without positions, when `compute_layout` is called, then positions are computed
- [ ] **AC2:** Given nodes with `level` field, when layout runs, then same-level nodes cluster vertically
- [ ] **AC3:** Given 1000 nodes, when layout runs, then it completes in <500ms
- [ ] **AC4:** Given existing layout, when one node is added, then incremental update completes in <50ms

## Integration

Frontend calls Tauri command instead of hardcoded positions:
```ts
const positions = await invoke('compute_layout', { nodes, edges, config });
renderer.updatePositions(positions);
```

## Deliverable

Nodes auto-position based on graph structure. Level-based clustering visible.

## Next Increment

→ `04-sliding-sidebar.md` - Sidebar navigation synced with graph
