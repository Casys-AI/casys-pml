---
title: 'PML Desktop'
slug: 'pml-desktop'
created: '2026-01-26'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Tauri v2 (Rust backend)
  - Preact + Signals (frontend)
  - WebGPU (wgpu) - no fallback
  - xterm.js + portable-pty
  - casys_engine (graph storage/layout)
  - PGlite (metadata/capabilities storage)
files_to_modify:
  - crates/casys_engine/ (extend for layout)
  - new: apps/desktop/
code_patterns:
  - ExplorerSidebar pattern (collapsible, resizable, localStorage)
  - PGlite singleton pattern with PGLITE_PATH
  - Tauri Events for cross-process sync
  - RPC bridge pattern from packages/pml/
test_patterns:
  - Rust unit tests (cargo test)
  - Tauri integration tests (invoke commands)
  - E2E with WebDriver
---

# Tech-Spec: PML Desktop

**Created:** 2026-01-26

## Overview

### Problem Statement

The existing web dashboard (Fresh SSR) provides hypergraph visualization but lacks the performance and integration depth needed for power users. Navigating massive capability graphs requires native rendering (WebGPU), and executing agents while watching nodes appear in real-time requires tight terminal-to-visualization coupling that's awkward in a browser.

### Solution

Build a Tauri v2 desktop application that:
1. Embeds `casys_engine` for native graph storage and layout computation (SHGAT/DR-DSP)
2. Renders super-hypergraphs with WebGPU for 60fps on massive graphs
3. Provides infinite semantic zoom (each node can reveal sub-graphs at any depth)
4. Sidebar with sliding 2-3 level navigation synced with graph zoom
5. Integrates a terminal (xterm.js + portable-pty) to spawn any MCP agent
6. Live-syncs tool calls to animated node creation in the visualizer

### Scope

**In Scope:**
- Tauri v2 shell with Rust backend
- WebGPU renderer (no fallback - WebGPU required)
- Infinite semantic zoom (fractal navigation)
- Sliding sidebar (2-3 levels) synced with graph zoom
- xterm.js terminal with portable-pty for proper PTY handling
- Generic MCP agent spawning (not just Claude)
- Live sync: tool calls → real-time node animation
- Embedded DB: casys_engine (graph) + PGlite (metadata)
- Graph layout computed in Rust (positions sent to frontend)
- State management: Preact Signals + Tauri Events for cross-process sync

**Out of Scope:**
- PostgreSQL Docker sync (future - optional cloud sync)
- Multi-window support
- Graph export/import
- Mobile/tablet support

## Context for Development

### Codebase Patterns

**Existing Rust crates:**
- `crates/casys_engine/` - Graph engine with GQL parser/planner/executor, ANN, GDS
- `crates/casys_core/` - Core types and storage abstractions
- `crates/casys_storage_fs/` - Filesystem storage backend

**Existing TypeScript:**
- `lib/shgat/` - Super-Hypergraph Attention (message passing, scoring, training)
- `src/graphrag/algorithms/dr-dsp.ts` - DR-DSP scoring algorithm
- `src/web/islands/*.tsx` - Preact components with Signals
- `src/web/islands/ExplorerSidebar.tsx` - Collapsible/resizable sidebar pattern
- `lib/std/src/tools/pglite.ts` - PGlite MiniTools (query, schema, stats)
- `src/db/client.ts` - PGliteClient with transactions and events

**Frontend patterns:**
- Islands architecture (Preact)
- Signals for reactive state
- ExplorerSidebar: collapsible, drag-resize, localStorage persistence
- D3.js for current graph viz (to be replaced with WebGPU)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `crates/casys_engine/src/lib.rs` | Engine API, GQL execution |
| `crates/casys_engine/src/gds/mod.rs` | Graph data science algorithms |
| `lib/shgat/src/core/shgat.ts` | SHGAT implementation |
| `src/graphrag/algorithms/dr-dsp.ts` | DR-DSP algorithm |
| `src/web/islands/ExplorerSidebar.tsx` | Sidebar pattern to adapt |
| `lib/std/src/tools/pglite.ts` | PGlite tools pattern |
| `src/db/client.ts` | PGliteClient wrapper |
| `packages/pml/src/sandbox/execution/rpc-bridge.ts` | RPC bridge pattern |

### Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Shell | Tauri v2 | Small binary, Rust backend, reuses casys_engine |
| Frontend | Preact + Signals | Already used, lightweight, reactive |
| Rendering | WebGPU (wgpu) | Performance for large graphs, no fallback (intentional) |
| Terminal | xterm.js + portable-pty | Standard, good perf, proper PTY |
| Graph Layout | Rust (SHGAT/DR-DSP) | Shared graph structure, levels in node metadata |
| MCP Integration | PML MCP Gateway | Agent uses MCP gateway, no terminal parsing needed |
| Validation | AJV (JSON Schema) | Project standard, not Zod |
| State | Preact Signals + Tauri Events | Local reactivity + cross-process sync |
| Graph DB | casys_engine (embedded) | Already Rust, graph-native, offline-first |
| Metadata DB | PGlite (embedded) | PostgreSQL-compatible, keeps existing schema |
| Sidebar | Sliding 2-3 levels | Lightweight, synced with zoom, levels from node metadata |

## UI Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Menu Bar]                                                      [_][□][X]│
├────────────────┬───────────────────────────────────┬─────────────────────┤
│  [Sidebar]     │        [Graph Viz - WebGPU]       │    [Terminal]       │
│  2-3 levels    │                                   │    xterm.js         │
│  sliding view  │    ┌─────────┐    ┌─────────┐    │                     │
│                │    │  node   │────│  node   │    │ $ claude --mcp      │
│ [..] parent    │    └─────────┘    └─────────┘    │ > Executing...      │
│ 📁 current     │         │                        │                     │
│   └─ child     │    ┌────┴────┐                   │ Tool: fs:read       │
│   └─ child     │    │  node   │                   │ → node created ↑    │
│ 📁 sibling     │    └─────────┘                   │                     │
│                │                                   │ Tool: json:parse    │
│ ← sync →       │  scroll/zoom = navigate levels   │ → node created ↑    │
└────────────────┴───────────────────────────────────┴─────────────────────┘
```

**Sidebar Behavior:**
- Shows 2-3 levels around current zoom level
- `[..]` = click to zoom out / go to parent
- Folder click = zoom into that level
- Graph scroll/zoom = sidebar updates automatically
- Bidirectional sync: sidebar ↔ graph

## Implementation Plan

### Phase 1: Tauri Shell & Project Setup

- [ ] **Task 1.1: Initialize Tauri v2 project**
  - File: `apps/desktop/` (new directory)
  - Action: Run `cargo create-tauri-app` with Preact template
  - Notes: Use workspace member in root `Cargo.toml`

- [ ] **Task 1.2: Configure workspace dependencies**
  - File: `Cargo.toml` (root)
  - Action: Add `apps/desktop` as workspace member, add shared deps
  - Notes: Ensure `casys_engine` is accessible as workspace dep

- [ ] **Task 1.3: Link casys_engine to Tauri backend**
  - File: `apps/desktop/src-tauri/Cargo.toml`
  - Action: Add `casys_engine = { path = "../../crates/casys_engine", features = ["fs"] }`
  - Notes: Enable `fs` feature for persistence

- [ ] **Task 1.4: Create basic Tauri commands**
  - File: `apps/desktop/src-tauri/src/commands/mod.rs`
  - Action: Create `graph_query`, `graph_insert`, `get_layout_positions` commands
  - Notes: Use `#[tauri::command]` macro, return JSON-serializable types

### Phase 2: WebGPU Graph Renderer

- [ ] **Task 2.1: Setup WebGPU canvas component**
  - File: `apps/desktop/src/components/GraphCanvas.tsx`
  - Action: Create Preact component with WebGPU context initialization
  - Notes: Use `navigator.gpu.requestAdapter()`, handle WebGPU not supported error

- [ ] **Task 2.2: Implement node rendering shader**
  - File: `apps/desktop/src/shaders/node.wgsl`
  - Action: Write WGSL vertex/fragment shaders for node circles with labels
  - Notes: Support instance rendering for performance

- [ ] **Task 2.3: Implement edge rendering shader**
  - File: `apps/desktop/src/shaders/edge.wgsl`
  - Action: Write WGSL shaders for edge lines with optional curves
  - Notes: Use line primitives or instanced quads for thickness

- [ ] **Task 2.4: Create render pipeline**
  - File: `apps/desktop/src/renderer/Pipeline.ts`
  - Action: Setup WebGPU render pipeline with node and edge passes
  - Notes: Double-buffer for smooth updates

- [ ] **Task 2.5: Implement zoom/pan controls**
  - File: `apps/desktop/src/renderer/Camera.ts`
  - Action: Create camera with mouse wheel zoom, drag pan, pinch support
  - Notes: Use transform matrix, emit zoom level changes

### Phase 3: Graph Layout in Rust

- [ ] **Task 3.1: Add layout module to casys_engine**
  - File: `crates/casys_engine/src/layout/mod.rs`
  - Action: Create module with `HierarchicalLayout` struct
  - Notes: SHGAT + DR-DSP share graph structure. Levels already defined in node metadata.

- [ ] **Task 3.2: Implement hierarchical force-directed algorithm**
  - File: `crates/casys_engine/src/layout/force_directed.rs`
  - Action: Implement Barnes-Hut optimized force calculation
  - Notes: Use existing node `level` field for semantic grouping. See `lib/shgat/` for reference.

- [ ] **Task 3.3: Create Tauri command for layout computation**
  - File: `apps/desktop/src-tauri/src/commands/layout.rs`
  - Action: Expose `compute_layout(nodes, edges, config) -> positions` command
  - Notes: Run in background thread, stream updates via Tauri events

- [ ] **Task 3.4: Implement incremental layout updates**
  - File: `crates/casys_engine/src/layout/incremental.rs`
  - Action: Add support for adding/removing nodes without full recalc
  - Notes: Critical for live sync performance

### Phase 4: Sliding Sidebar Navigation

- [ ] **Task 4.1: Create SlidingSidebar component**
  - File: `apps/desktop/src/components/SlidingSidebar.tsx`
  - Action: Adapt ExplorerSidebar pattern, show 2-3 levels only
  - Notes: Use Preact Signals for current level state

- [ ] **Task 4.2: Implement level navigation logic**
  - File: `apps/desktop/src/stores/navigation.ts`
  - Action: Create signal store with `currentLevel`, `visibleNodes`, `parentPath`
  - Notes: Level already defined in node metadata. Query nodes by level field. See existing graph code.

- [ ] **Task 4.3: Bidirectional sync with graph**
  - File: `apps/desktop/src/hooks/useGraphSidebarSync.ts`
  - Action: Create hook that syncs sidebar ↔ graph zoom level
  - Notes: Debounce graph zoom events to avoid jitter

- [ ] **Task 4.4: Implement parent breadcrumb**
  - File: `apps/desktop/src/components/SlidingSidebar.tsx`
  - Action: Add `[..]` parent item that zooms out on click
  - Notes: Show parent name on hover

### Phase 5: Terminal Integration

- [ ] **Task 5.1: Setup xterm.js component**
  - File: `apps/desktop/src/components/Terminal.tsx`
  - Action: Create Preact component wrapping xterm.js with fit addon
  - Notes: Handle resize, dark theme matching app

- [ ] **Task 5.2: Implement PTY backend in Rust**
  - File: `apps/desktop/src-tauri/src/terminal/pty.rs`
  - Action: Use `portable-pty` crate to spawn shell processes
  - Notes: Support Windows (ConPTY) and Unix (pty)

- [ ] **Task 5.3: Create Tauri commands for terminal**
  - File: `apps/desktop/src-tauri/src/commands/terminal.rs`
  - Action: Expose `spawn_shell(cmd)`, `write_stdin(data)`, `resize_pty(cols, rows)`
  - Notes: Stream stdout via Tauri events

- [ ] **Task 5.4: Configure MCP gateway integration**
  - File: `apps/desktop/src-tauri/src/mcp/gateway.rs`
  - Action: Agent uses PML MCP server as gateway - intercept tool calls at MCP protocol level
  - Notes: Reuse existing `src/mcp/` patterns. No terminal output parsing - clean MCP interception.

### Phase 6: Live Sync & Animation

- [ ] **Task 6.1: Create event bridge**
  - File: `apps/desktop/src/events/bridge.ts`
  - Action: Setup Tauri event listeners for `mcp:tool_call`, `graph:node_added`
  - Notes: Use typed events with AJV validation (JSON Schema)

- [ ] **Task 6.2: Implement node creation animation**
  - File: `apps/desktop/src/renderer/Animator.ts`
  - Action: Add spring animation for new nodes appearing
  - Notes: Fade in + scale up, 300ms duration

- [ ] **Task 6.3: Connect MCP interception to graph**
  - File: `apps/desktop/src/hooks/useMcpSync.ts`
  - Action: Listen for tool calls, create nodes in casys_engine, trigger layout
  - Notes: Batch rapid tool calls for smoother animation

- [ ] **Task 6.4: Implement edge animation for tool flows**
  - File: `apps/desktop/src/renderer/EdgeAnimator.ts`
  - Action: Animate edges appearing between tool calls
  - Notes: Draw edge progressively from source to target

### Phase 7: PGlite Integration

- [ ] **Task 7.1: Setup PGlite in WebView**
  - File: `apps/desktop/src/db/pglite.ts`
  - Action: Initialize PGlite with pgvector, reuse schema from `src/db/`
  - Notes: Store in app data directory via Tauri path API

- [ ] **Task 7.2: Migrate schema initialization**
  - File: `apps/desktop/src/db/migrations.ts`
  - Action: Port migrations from `src/db/migrations/` for capabilities, tools, traces
  - Notes: Only include tables needed for desktop (subset)

- [ ] **Task 7.3: Create Tauri↔PGlite bridge**
  - File: `apps/desktop/src/db/bridge.ts`
  - Action: Expose query functions that can be called from Rust via invoke
  - Notes: Needed when Rust backend needs metadata from PGlite

## Acceptance Criteria

### Core Functionality

- [ ] **AC1:** Given the app is launched, when WebGPU is available, then the graph canvas renders with 60fps
- [ ] **AC2:** Given a graph with 1000 nodes, when zooming in/out, then frame rate stays above 30fps
- [ ] **AC3:** Given the user scrolls the graph, when crossing a semantic level boundary, then the sidebar updates to show the new level context
- [ ] **AC4:** Given the user clicks a folder in the sidebar, when the click is processed, then the graph zooms to that node's level
- [ ] **AC5:** Given the user clicks `[..]` in the sidebar, when processed, then the graph zooms out one level

### Terminal Integration

- [ ] **AC6:** Given a terminal is spawned, when the user types a command, then it executes in the shell and output appears
- [ ] **AC7:** Given an agent uses PML MCP gateway, when a tool call is executed, then the corresponding node appears in the graph
- [ ] **AC8:** Given multiple rapid tool calls, when processed, then nodes appear with smooth animation without jank

### Data Persistence

- [ ] **AC9:** Given nodes are created via MCP, when the app is restarted, then the nodes persist in casys_engine
- [ ] **AC10:** Given capabilities are stored in PGlite, when queried via graph, then metadata is correctly associated

### Error Handling

- [ ] **AC11:** Given WebGPU is not available, when the app launches, then a clear error message is shown (no silent fail)
- [ ] **AC12:** Given the terminal process crashes, when detected, then the UI shows an error and allows restart

## Additional Context

### Dependencies

**Rust crates (Cargo.toml):**
```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
portable-pty = "0.8"
casys_engine = { path = "../../crates/casys_engine", features = ["fs"] }
```

**Frontend (package.json):**
```json
{
  "dependencies": {
    "preact": "^10.x",
    "@preact/signals": "^1.x",
    "xterm": "^5.x",
    "@xterm/addon-fit": "^0.10.x",
    "@electric-sql/pglite": "^0.2.x",
    "ajv": "^8.x"
  }
}
```

### Testing Strategy

**Unit Tests:**
- Rust: `cargo test -p casys_engine` for layout algorithms
- Rust: `cargo test -p pml-desktop` for Tauri commands
- TypeScript: Vitest for renderer logic, camera transforms

**Integration Tests:**
- Tauri command invocation tests with mock data
- PGlite query tests with in-memory DB

**E2E Tests:**
- WebDriver tests: launch app, spawn terminal, verify node creation
- Visual regression: screenshot comparison for graph rendering

**Manual Testing:**
- Stress test: 10k nodes graph navigation
- MCP flow: run full capability execution, verify sync

### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WebGPU support in Tauri WebView | Low | High | WebGPU required - show clear error if unavailable |
| SHGAT/DR-DSP Rust port | Medium | Medium | Reuse shared graph structure, levels already in nodes |
| PTY cross-platform issues | Medium | Medium | Test on Windows/Mac/Linux early |
| PGlite + Tauri integration | Low | Low | Use proven patterns from web version |

### Future Considerations (Out of Scope)

- Cloud sync with PostgreSQL Docker
- Multi-window support for detached terminal
- Graph export to Excalidraw/SVG/PNG
- Plugin system for custom renderers
- Collaborative editing (multiple users same graph)
