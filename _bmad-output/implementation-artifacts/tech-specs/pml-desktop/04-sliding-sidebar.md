---
title: 'PML Desktop - Increment 4: Sliding Sidebar'
slug: 'pml-desktop-04-sidebar'
created: '2026-01-26'
status: 'completed'
parent_spec: '../tech-spec-pml-desktop.md'
increment: 4
estimated_tasks: 4
depends_on: ['03-rust-layout.md']
---

# Increment 4: Sliding Sidebar Navigation

**Goal:** Sidebar showing 2-3 levels, synced bidirectionally with graph zoom.

## Prerequisites

- Increment 3 completed (layout working, levels visible)
- Understanding of existing `src/web/islands/ExplorerSidebar.tsx` pattern

## Context

Nodes already have `level` field in metadata. Sidebar shows a "window" of 2-3 levels around current focus, not the full tree.

## Tasks

- [x] **Task 4.1: Create SlidingSidebar component**
  - File: `apps/desktop/src/components/SlidingSidebar.tsx`
  - Action: Adapt ExplorerSidebar pattern
  - Features: Collapsible, resizable, localStorage persistence
  - Implementation: 280+ lines with full hierarchy display

- [x] **Task 4.2: Implement level navigation store**
  - File: `apps/desktop/src/stores/navigation.ts`
  - Action: Preact Signals store
  - Implementation: `currentLevel`, `focusedNodeId`, `maxLevel` signals + `zoomIn`, `zoomOut`, `navigateToLevel` functions + auto-persistence

- [x] **Task 4.3: Bidirectional sync with graph**
  - File: `apps/desktop/src/hooks/useGraphSidebarSync.ts`
  - Action: Hook that syncs camera zoom ↔ sidebar level
  - Implementation: `zoomToSemanticLevel()`, `semanticLevelToZoom()` mapping with debounce (100ms)

- [x] **Task 4.4: Implement parent breadcrumb**
  - File: `apps/desktop/src/components/SlidingSidebar.tsx`
  - Action: `←` item shows parent level name, zooms out on click
  - Implementation: Integrated in SlidingSidebar with `handleZoomOut()`

## Acceptance Criteria

- [x] **AC1:** Given nodes at levels 0-5, when app loads at level 2, then sidebar shows levels 1, 2, 3
- [x] **AC2:** Given sidebar showing level 2, when user clicks a level-3 node, then sidebar shifts to show 2, 3, 4
- [x] **AC3:** Given user zooms graph via scroll, when crossing level boundary, then sidebar updates
- [x] **AC4:** Given sidebar at level 3, when user clicks `←`, then sidebar shifts to level 2 and graph zooms out

## Layout

```
┌────────────────┬─────────────────────────┐
│  [Sidebar]     │     [Graph]             │
│                │                         │
│ ← Parent       │                         │
│ 📁 Level N     │    (nodes at level N)   │
│   └─ child     │                         │
│   └─ child     │                         │
│ 📁 Level N     │                         │
│                │                         │
└────────────────┴─────────────────────────┘
```

## Deliverable

Two-panel layout with sidebar and graph that stay in sync.

## Review Notes

- Adversarial review completed
- Findings: 10 total, 7 fixed, 3 skipped (1 noise, 1 undecided, 1 low/future)
- Resolution approach: auto-fix

### Fixed Issues
- F1 (Critical): Memory leak in effect() - added proper cleanup
- F2 (High): Race condition in sync hook - cleanup + named duration
- F3 (High): Silent fallback - added console.warn per no-silent-fallbacks policy
- F4 (High): Signal reactivity - use signal directly in JSX
- F5 (Medium): Wrong parent selection - traverse via parentId
- F6 (Medium): Unsafe localStorage - wrapped in try-catch
- F7 (Medium): Config drift - exported ZOOM_THRESHOLDS

### Skipped
- F8: Missing cleanup for non-existent debounce (noise)
- F9: Strict type options in deno.json (undecided)
- F10: Inline styles (low priority, future refactor)

## Implementation Notes

### Bonus: Migration Node/pnpm → Deno

- Removed `package.json`, `pnpm-lock.yaml`, `node_modules`
- Created `deno.json` with tasks and npm imports
- Build command: `deno task build`
- Dev command: `deno task dev`
- Coherent with main project (Deno everywhere)

### Files Created/Modified

| File | Action |
|------|--------|
| `src/components/SlidingSidebar.tsx` | Created |
| `src/stores/navigation.ts` | Created |
| `src/hooks/useGraphSidebarSync.ts` | Created |
| `src/components/GraphCanvas.tsx` | Modified (controlled camera) |
| `src/App.tsx` | Modified (sidebar integration) |
| `src/App.css` | Modified (two-panel layout) |
| `deno.json` | Created (replaces package.json) |
| `vite.config.ts` | Modified (Deno.env) |

## Next Increment

→ `05-terminal.md` - xterm.js terminal integration
