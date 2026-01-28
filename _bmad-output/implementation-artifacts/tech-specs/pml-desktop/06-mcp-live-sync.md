---
title: 'PML Desktop - Increment 6: MCP Live Sync'
slug: 'pml-desktop-06-mcp-sync'
created: '2026-01-26'
status: 'ready-for-dev'
parent_spec: '../tech-spec-pml-desktop.md'
increment: 6
estimated_tasks: 5
depends_on: ['05-terminal.md']
---

# Increment 6: MCP Live Sync

**Goal:** When agent executes tools via MCP gateway, nodes appear in graph with animation.

## Prerequisites

- Increment 5 completed (terminal working)
- Understanding of existing `src/mcp/` gateway patterns
- PML MCP server running or embeddable

## Context

Agent uses PML MCP server as gateway. We intercept tool calls at MCP protocol level (not terminal parsing). The desktop app either:
1. Embeds PML MCP server
2. Connects to running PML MCP server

Reference: `src/mcp/gateway-server.ts`, `packages/pml/`

## Tasks

- [ ] **Task 6.1: Setup MCP gateway in Rust**
  - File: `apps/desktop/src-tauri/src/mcp/gateway.rs`
  - Action: MCP server that intercepts tool calls
  - Options:
    - A) Embed PML MCP server via Deno FFI
    - B) Spawn `pml serve` as subprocess, communicate via stdio
    - C) Port MCP gateway to Rust (more work)
  - Recommendation: Option B for MVP
  - Code:
    ```rust
    pub struct McpGateway {
        process: Child,
        // Subscribe to tool call events
    }

    impl McpGateway {
        pub fn spawn(app: tauri::AppHandle) -> Result<Self, String> {
            let child = Command::new("pml")
                .args(["serve", "--emit-events"])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .spawn()?;

            // Parse stdout for tool call events, emit to frontend
            Ok(Self { process: child })
        }
    }
    ```

- [ ] **Task 6.2: Create event bridge**
  - File: `apps/desktop/src/events/bridge.ts`
  - Action: Listen for MCP events, validate with AJV
  - Code:
    ```ts
    import Ajv from 'ajv';
    import { listen } from '@tauri-apps/api/event';

    const ajv = new Ajv();
    const toolCallSchema = {
      type: 'object',
      properties: {
        tool: { type: 'string' },
        server: { type: 'string' },
        args: { type: 'object' },
        result: { type: 'object' },
        timestamp: { type: 'number' },
      },
      required: ['tool', 'server', 'timestamp'],
    };
    const validateToolCall = ajv.compile(toolCallSchema);

    export function onToolCall(callback: (event: ToolCallEvent) => void) {
      return listen('mcp:tool_call', (e) => {
        if (validateToolCall(e.payload)) {
          callback(e.payload as ToolCallEvent);
        }
      });
    }
    ```

- [ ] **Task 6.3: Connect tool calls to graph**
  - File: `apps/desktop/src/hooks/useMcpSync.ts`
  - Action: Create nodes in casys_engine when tools are called
  - Code:
    ```ts
    import { onToolCall } from '../events/bridge';
    import { invoke } from '@tauri-apps/api/core';

    export function useMcpSync() {
      useEffect(() => {
        const unlisten = onToolCall(async (event) => {
          // Create node for this tool call
          await invoke('graph_add_node', {
            id: `tool-${event.timestamp}`,
            label: event.tool,
            level: getCurrentLevel() + 1,
            metadata: { server: event.server, args: event.args },
          });

          // Trigger incremental layout
          await invoke('layout_incremental', { nodeId: `tool-${event.timestamp}` });
        });

        return () => unlisten.then(f => f());
      }, []);
    }
    ```

- [ ] **Task 6.4: Implement node creation animation**
  - File: `apps/desktop/src/renderer/Animator.ts`
  - Action: Spring animation for new nodes
  - Code:
    ```ts
    export class Animator {
      private animations: Map<string, Animation> = new Map();

      animateNodeIn(nodeId: string, targetPos: Position) {
        const anim = {
          startTime: performance.now(),
          duration: 300,
          startScale: 0,
          endScale: 1,
          startOpacity: 0,
          endOpacity: 1,
        };
        this.animations.set(nodeId, anim);
      }

      update(time: number) {
        for (const [id, anim] of this.animations) {
          const t = (time - anim.startTime) / anim.duration;
          if (t >= 1) {
            this.animations.delete(id);
          } else {
            // Apply spring easing
            const scale = this.spring(t) * anim.endScale;
            this.renderer.setNodeScale(id, scale);
          }
        }
      }
    }
    ```

- [ ] **Task 6.5: Implement edge animation**
  - File: `apps/desktop/src/renderer/EdgeAnimator.ts`
  - Action: Edges draw progressively from source to target
  - Code:
    ```ts
    animateEdgeIn(edgeId: string, from: Position, to: Position) {
      // Draw edge as it "grows" from source to target
      const anim = {
        startTime: performance.now(),
        duration: 200,
        from,
        to,
        progress: 0,
      };
      this.edgeAnimations.set(edgeId, anim);
    }
    ```

## Acceptance Criteria

- [ ] **AC1:** Given PML MCP server running, when agent calls a tool, then event is received in desktop app
- [ ] **AC2:** Given tool call received, when processed, then a new node appears in graph
- [ ] **AC3:** Given new node, when appearing, then it fades in with scale animation
- [ ] **AC4:** Given sequential tool calls, when processed, then edges animate between them
- [ ] **AC5:** Given 10 rapid tool calls, when processed, then animations are smooth (no jank)

## Integration Flow

```
Agent (Claude/other)
    │
    ▼ (uses MCP)
PML MCP Server
    │
    ▼ (emits events)
Tauri Backend
    │
    ▼ (Tauri event)
Frontend
    │
    ├─→ Create node in casys_engine
    ├─→ Trigger incremental layout
    └─→ Animate node appearance
```

## Deliverable

Running `claude --mcp` in terminal creates animated nodes in graph.

## Next Increment

→ `07-pglite-persistence.md` - PGlite for metadata persistence
