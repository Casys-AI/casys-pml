---
title: 'PML Desktop - Increment 2: WebGPU Renderer'
slug: 'pml-desktop-02-renderer'
created: '2026-01-26'
status: 'completed'
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

- [x] **Task 2.1: Setup WebGPU canvas component**
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

- [x] **Task 2.2: Implement node rendering shader**
  - File: `apps/desktop/src/shaders/node.wgsl`
  - Action: WGSL shader for instanced circle rendering
  - Notes: Use instance buffer for position, size, color per node

- [x] **Task 2.3: Implement edge rendering shader**
  - File: `apps/desktop/src/shaders/edge.wgsl`
  - Action: WGSL shader for line segments
  - Notes: Use vertex buffer with start/end positions

- [x] **Task 2.4: Create render pipeline**
  - File: `apps/desktop/src/renderer/Pipeline.ts`
  - Action: Setup WebGPU render pipeline
  - Structure:
    ```
    Pipeline
    ├── NodePass (instanced circles)
    ├── EdgePass (lines)
    └── TextPass (labels, optional for MVP)
    ```

- [x] **Task 2.5: Implement zoom/pan controls**
  - File: `apps/desktop/src/renderer/Camera.ts`
  - Action: Camera with transform matrix
  - Features:
    - Mouse wheel = zoom
    - Mouse drag = pan
    - Emit `onZoomLevelChange` event for sidebar sync

## Acceptance Criteria

- [x] **AC1:** Given hardcoded node data, when app launches, then nodes render as circles
- [x] **AC2:** Given hardcoded edges, when app launches, then edges render as lines between nodes
- [x] **AC3:** Given the canvas, when user scrolls mouse wheel, then graph zooms in/out smoothly
- [x] **AC4:** Given the canvas, when user drags, then graph pans
- [x] **AC5:** Given 100 nodes, when rendering, then frame rate is 60fps

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

---

## Review Notes

- Adversarial review completed: 2026-01-27
- Findings: 8 total, 8 fixed, 0 skipped
- Resolution approach: auto-fix

### Fixed Issues:
- **F1 (Critical):** Memory leak - Deferred buffer destruction to avoid race conditions
- **F2 (Critical):** Stale closure - Used refs for nodes/edges to keep render loop updated
- **F3 (High):** Stride mismatch - Fixed edge buffer stride from 32 to 36 bytes
- **F4 (High):** Camera stale - Used ref for camera state in render loop
- **F5 (High):** Device lost - Added device.lost promise handling with error display
- **F6 (Medium):** Hard-coded dimensions - Replaced 400/300 with actual canvas dimensions
- **F7 (Medium):** No ResizeObserver - Added ResizeObserver for proper canvas buffer sizing
- **F8 (Low):** Dead code - Removed unused Camera.ts file
