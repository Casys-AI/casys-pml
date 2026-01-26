---
title: 'PML Desktop - Increment 4: Sliding Sidebar'
slug: 'pml-desktop-04-sidebar'
created: '2026-01-26'
status: 'ready-for-dev'
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

- [ ] **Task 4.1: Create SlidingSidebar component**
  - File: `apps/desktop/src/components/SlidingSidebar.tsx`
  - Action: Adapt ExplorerSidebar pattern
  - Structure:
    ```tsx
    export function SlidingSidebar({ currentLevel, nodes, onNavigate }) {
      // Filter nodes to show: currentLevel-1, currentLevel, currentLevel+1
      const visibleNodes = nodes.filter(n =>
        n.level >= currentLevel - 1 && n.level <= currentLevel + 1
      );

      return (
        <div class="sidebar">
          {currentLevel > 0 && (
            <div class="parent" onClick={() => onNavigate(currentLevel - 1)}>
              [..] Go up
            </div>
          )}
          {/* Render nodes grouped by level */}
        </div>
      );
    }
    ```
  - Features: Collapsible, resizable (reuse ExplorerSidebar CSS)

- [ ] **Task 4.2: Implement level navigation store**
  - File: `apps/desktop/src/stores/navigation.ts`
  - Action: Preact Signals store
  - Code:
    ```ts
    import { signal, computed } from '@preact/signals';

    export const currentLevel = signal(0);
    export const focusedNodeId = signal<string | null>(null);

    export function zoomIn(nodeId: string, level: number) {
      focusedNodeId.value = nodeId;
      currentLevel.value = level;
    }

    export function zoomOut() {
      if (currentLevel.value > 0) {
        currentLevel.value--;
      }
    }
    ```

- [ ] **Task 4.3: Bidirectional sync with graph**
  - File: `apps/desktop/src/hooks/useGraphSidebarSync.ts`
  - Action: Hook that syncs camera zoom ↔ sidebar level
  - Logic:
    ```ts
    // Graph zoom changes → update sidebar
    camera.onZoomChange((zoomLevel) => {
      // Map camera zoom to semantic level
      const semanticLevel = Math.floor(zoomLevel / ZOOM_PER_LEVEL);
      if (semanticLevel !== currentLevel.value) {
        currentLevel.value = semanticLevel;
      }
    });

    // Sidebar click → update graph
    function handleSidebarNavigate(level: number) {
      currentLevel.value = level;
      camera.zoomToLevel(level);
    }
    ```
  - Notes: Debounce to avoid jitter

- [ ] **Task 4.4: Implement parent breadcrumb**
  - File: `apps/desktop/src/components/SlidingSidebar.tsx`
  - Action: `[..]` item shows parent level name, zooms out on click
  - Code:
    ```tsx
    {parentNode && (
      <div
        class="breadcrumb"
        onClick={() => zoomOut()}
        title={parentNode.label}
      >
        ← {parentNode.label}
      </div>
    )}
    ```

## Acceptance Criteria

- [ ] **AC1:** Given nodes at levels 0-5, when app loads at level 2, then sidebar shows levels 1, 2, 3
- [ ] **AC2:** Given sidebar showing level 2, when user clicks a level-3 node, then sidebar shifts to show 2, 3, 4
- [ ] **AC3:** Given user zooms graph via scroll, when crossing level boundary, then sidebar updates
- [ ] **AC4:** Given sidebar at level 3, when user clicks `[..]`, then sidebar shifts to level 2 and graph zooms out

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

## Next Increment

→ `05-terminal.md` - xterm.js terminal integration
