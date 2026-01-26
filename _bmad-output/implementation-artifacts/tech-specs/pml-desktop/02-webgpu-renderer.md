---
title: 'PML Desktop - Increment 2: WebGPU Renderer'
slug: 'pml-desktop-02-renderer'
created: '2026-01-26'
status: 'ready-for-dev'
parent_spec: '../tech-spec-pml-desktop.md'
increment: 2
estimated_tasks: 5
depends_on: ['01-tauri-shell-setup.md']
---

# Increment 2: WebGPU Graph Renderer

**Goal:** WebGPU canvas renders nodes and edges with zoom/pan controls.

## Prerequisites

- Increment 1 completed (Tauri shell running)
- WebGPU-capable system

## Tasks

- [ ] **Task 2.1: Setup WebGPU canvas component**
  - File: `apps/desktop/src/components/GraphCanvas.tsx`
  - Action: Create Preact component with WebGPU context
  - Code pattern:
    ```tsx
    import { useEffect, useRef } from 'preact/hooks';

    export function GraphCanvas() {
      const canvasRef = useRef<HTMLCanvasElement>(null);

      useEffect(() => {
        const init = async () => {
          if (!navigator.gpu) {
            throw new Error('WebGPU not supported');
          }
          const adapter = await navigator.gpu.requestAdapter();
          const device = await adapter!.requestDevice();
          const context = canvasRef.current!.getContext('webgpu');
          // ... setup pipeline
        };
        init();
      }, []);

      return <canvas ref={canvasRef} />;
    }
    ```

- [ ] **Task 2.2: Implement node rendering shader**
  - File: `apps/desktop/src/shaders/node.wgsl`
  - Action: WGSL shader for instanced circle rendering
  - Notes: Use instance buffer for position, size, color per node

- [ ] **Task 2.3: Implement edge rendering shader**
  - File: `apps/desktop/src/shaders/edge.wgsl`
  - Action: WGSL shader for line segments
  - Notes: Use vertex buffer with start/end positions

- [ ] **Task 2.4: Create render pipeline**
  - File: `apps/desktop/src/renderer/Pipeline.ts`
  - Action: Setup WebGPU render pipeline
  - Structure:
    ```
    Pipeline
    ├── NodePass (instanced circles)
    ├── EdgePass (lines)
    └── TextPass (labels, optional for MVP)
    ```

- [ ] **Task 2.5: Implement zoom/pan controls**
  - File: `apps/desktop/src/renderer/Camera.ts`
  - Action: Camera with transform matrix
  - Features:
    - Mouse wheel = zoom
    - Mouse drag = pan
    - Emit `onZoomLevelChange` event for sidebar sync

## Acceptance Criteria

- [ ] **AC1:** Given hardcoded node data, when app launches, then nodes render as circles
- [ ] **AC2:** Given hardcoded edges, when app launches, then edges render as lines between nodes
- [ ] **AC3:** Given the canvas, when user scrolls mouse wheel, then graph zooms in/out smoothly
- [ ] **AC4:** Given the canvas, when user drags, then graph pans
- [ ] **AC5:** Given 100 nodes, when rendering, then frame rate is 60fps

## Test Data

Hardcode 10-20 nodes with random positions for testing:
```ts
const testNodes = [
  { id: '1', x: 100, y: 100, label: 'Node A' },
  { id: '2', x: 200, y: 150, label: 'Node B' },
  // ...
];
```

## Deliverable

Canvas showing nodes and edges, zoomable and pannable. No layout algorithm yet - positions hardcoded.

## Next Increment

→ `03-rust-layout.md` - Graph layout computed in Rust
