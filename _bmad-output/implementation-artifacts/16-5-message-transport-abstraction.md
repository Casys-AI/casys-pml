# Story 16.5: MessageTransport Abstraction

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a PML developer,
I want a unified MessageTransport interface for both Deno Workers and browser iframes,
so that the RpcBridge logic can be reused for MCP Apps communication without duplication.

## Acceptance Criteria

1. **Cleanup: SandboxWorker uses RpcBridge** - Given that SandboxWorker currently duplicates RpcBridge logic, when I refactor SandboxWorker, then:
   - SandboxWorker delegates message handling to RpcBridge (composition)
   - Duplicate code (`handleWorkerMessage`, `handleRpcRequest`) is removed from SandboxWorker
   - SandboxWorker only manages Worker lifecycle (create, timeout, shutdown)
   - All 31 existing sandbox tests pass without modification

2. **MessageTransport Interface** - Given the need to abstract message passing, when I create a `MessageTransport` interface, then it exposes:
   - `send(message: unknown): void`
   - `onMessage(handler: (message: unknown) => void): void`
   - `onError?(handler: (error: Error) => void): void`
   - `close(): void`

3. **DenoWorkerTransport Implementation** - Given the `MessageTransport` interface, when I create `DenoWorkerTransport` implementation, then:
   - It wraps `Worker.postMessage()` and `Worker.onmessage`
   - Existing sandbox functionality continues to work unchanged
   - All existing sandbox tests pass without modification

4. **IframeTransport Implementation** - Given the `MessageTransport` interface, when I create `IframeTransport` implementation (browser-only), then:
   - It wraps `iframe.contentWindow.postMessage()` and `window.addEventListener('message')`
   - Messages from other sources are filtered out (only iframe's contentWindow)
   - Origin validation is performed for security

5. **McpAppsProtocolAdapter** - Given MCP Apps JSON-RPC messages (`ui/initialize`, `tools/call`), when I create `McpAppsProtocolAdapter`, then it converts:
   - `tools/call` → internal RPC format `{ type: 'rpc', rpcId, method, args }`
   - Internal response → JSON-RPC response `{ jsonrpc: '2.0', id, result }`
   - `ui/initialize` → init message with proper handling
   - `ui/update-model-context` → internal format for event routing

6. **RpcBridge Refactoring** - Given the RpcBridge class, when I refactor it to accept `MessageTransport`, then:
   - Constructor accepts `MessageTransport` instead of direct `Worker` reference
   - All existing functionality is preserved
   - Optional `ProtocolAdapter` parameter for message transformation
   - All existing tests continue to pass without modification

7. **Backward Compatibility** - Given existing sandbox code, when I deploy the refactored code, then:
   - No breaking changes to existing API consumers
   - SandboxWorker public API unchanged (constructor, execute, shutdown)
   - All 31 existing sandbox tests pass

8. **Unit Tests** - Tests verify:
   - `MessageTransport` interface contract
   - `DenoWorkerTransport` wraps Worker correctly
   - `IframeTransport` filters messages by source
   - `McpAppsProtocolAdapter` converts messages bidirectionally
   - `RpcBridge` works with any `MessageTransport` implementation

9. **Type Safety** - All new files pass `deno check` without errors

10. **Export Structure** - New files are exported from:
    - `packages/pml/src/sandbox/transport/mod.ts` (new directory)
    - `packages/pml/src/sandbox/mod.ts` (updated exports)

## Tasks / Subtasks

- [x] Task 0: Cleanup - Refactor SandboxWorker to use RpcBridge (AC: #1, #7)
  - [x] Analyze current duplication between `SandboxWorker` and `RpcBridge`
  - [x] Modify `SandboxWorker.initializeWorker()` to create and use `RpcBridge`
  - [x] Remove duplicate methods from SandboxWorker:
    - [x] Remove `handleWorkerMessage()` (delegated to RpcBridge)
    - [x] Remove `handleRpcRequest()` (delegated to RpcBridge)
  - [x] Keep in SandboxWorker only lifecycle management:
    - [x] Worker creation with permissions
    - [x] Execution timeout handling
    - [x] Shutdown and cleanup
  - [x] **CRITICAL**: Run all 31 sandbox tests to verify no regression
  - [x] Commit cleanup before proceeding to abstraction

- [x] Task 1: Create MessageTransport interface (AC: #2, #9)
  - [x] Create directory `packages/pml/src/sandbox/transport/`
  - [x] Create `packages/pml/src/sandbox/transport/types.ts`
  - [x] Define `MessageTransport` interface with JSDoc
  - [x] Define `ProtocolAdapter` interface for message transformation
  - [x] Export from `packages/pml/src/sandbox/transport/mod.ts`

- [x] Task 2: Implement DenoWorkerTransport (AC: #3, #7)
  - [x] Create `packages/pml/src/sandbox/transport/deno-worker-transport.ts`
  - [x] Implement `send()` wrapping `worker.postMessage()`
  - [x] Implement `onMessage()` wrapping `worker.onmessage`
  - [x] Implement `onError()` wrapping `worker.onerror`
  - [x] Implement `close()` calling `worker.terminate()`
  - [x] Add unit tests in `*_test.ts`

- [x] Task 3: Implement IframeTransport (AC: #4)
  - [x] Create `packages/pml/src/sandbox/transport/iframe-transport.ts`
  - [x] Implement `send()` wrapping `iframe.contentWindow.postMessage()`
  - [x] Implement `onMessage()` with source filtering (`e.source === iframe.contentWindow`)
  - [x] Implement `close()` removing event listener
  - [x] Add origin validation for security
  - [x] Add unit tests (browser-only, may need mock)

- [x] Task 4: Implement McpAppsProtocolAdapter (AC: #5)
  - [x] Create `packages/pml/src/sandbox/transport/mcp-apps-adapter.ts`
  - [x] Implement `toInternal()` for incoming JSON-RPC → internal format
  - [x] Implement `toExternal()` for internal format → JSON-RPC response
  - [x] Handle `ui/initialize` special case
  - [x] Handle `tools/call` → `{ type: 'rpc', rpcId, method, args }`
  - [x] Handle `ui/update-model-context` for event routing
  - [x] Add unit tests with example messages

- [x] Task 5: Refactor RpcBridge to accept MessageTransport (AC: #6, #7)
  - [x] Modify `RpcBridge` constructor signature to accept `MessageTransport`
  - [x] Add optional `adapter?: ProtocolAdapter` parameter
  - [x] Replace `this.worker.postMessage()` with `this.transport.send()`
  - [x] Replace `this.worker.onmessage` with `this.transport.onMessage()`
  - [x] Replace `this.worker.onerror` with `this.transport.onError?.()`
  - [x] Update `close()` to call `this.transport.close()`
  - [x] Apply adapter transformation if provided
  - [x] **VERIFY**: All existing tests pass without modification

- [x] Task 6: Update SandboxWorker to use DenoWorkerTransport (AC: #7)
  - [x] Modify `worker-runner.ts` to create `DenoWorkerTransport`
  - [x] Pass transport to `RpcBridge` instead of raw `Worker`
  - [x] Verify sandbox execution still works
  - [x] Run all 31 sandbox tests to confirm backward compatibility

- [x] Task 7: Export from mod.ts (AC: #10)
  - [x] Create `packages/pml/src/sandbox/transport/mod.ts`
  - [x] Export `MessageTransport`, `ProtocolAdapter` interfaces
  - [x] Export `DenoWorkerTransport`, `IframeTransport`, `McpAppsProtocolAdapter`
  - [x] Update `packages/pml/src/sandbox/mod.ts` to re-export transport module

- [x] Task 8: Unit tests (AC: #8)
  - [x] Create `packages/pml/tests/transport_deno_worker_test.ts`
  - [x] Create `packages/pml/tests/transport_mcp_apps_adapter_test.ts`
  - [x] Test: `DenoWorkerTransport` wraps Worker correctly
  - [x] Test: `McpAppsProtocolAdapter.toInternal()` converts tools/call
  - [x] Test: `McpAppsProtocolAdapter.toInternal()` converts ui/initialize
  - [x] Test: `McpAppsProtocolAdapter.toExternal()` converts responses
  - [x] Test: RpcBridge works with DenoWorkerTransport (integration)

- [x] Task 9: Validation (AC: #9)
  - [x] Run `deno check packages/pml/src/sandbox/transport/*.ts`
  - [x] Run `deno lint packages/pml/src/sandbox/`
  - [x] Run `deno test packages/pml/tests/sandbox*.ts` (all 31 existing tests)
  - [x] Run new transport tests

### Review Follow-ups (AI) - All Fixed ✅

- [x] [AI-Review][HIGH] IframeTransport: Add `isClosed` flag and check in `send()` to prevent sending after `close()` [iframe-transport.ts:77]
- [x] [AI-Review][HIGH] RpcBridge: Fix memory leak - pendingExecute entries not cleaned up on external timeout [rpc-bridge.ts:127]
- [x] [AI-Review][HIGH] McpAppsProtocolAdapter: Add `typeof message === 'object' && message !== null` check before casting [mcp-apps-adapter.ts:85]
- [x] [AI-Review][HIGH] DenoWorkerTransport: Prevent silent handler overwrite - throw error or chain handlers if `onMessage()` called twice [deno-worker-transport.ts:41]
- [x] [AI-Review][MEDIUM] IframeTransport: Log warning when using default `targetOrigin="*"` (security risk) [iframe-transport.ts:49]
- [x] [AI-Review][MEDIUM] Add unit tests for IframeTransport with mocks (AC8 mentions it but no tests exist) [tests/]
- [x] [AI-Review][MEDIUM] RpcBridge: Make init response configurable instead of hardcoded `{ status: "ok" }` [rpc-bridge.ts:209]
- [x] [AI-Review][LOW] IframeTransport: Fix misleading comment "Optional:" when code is active [iframe-transport.ts:68]
- [x] [AI-Review][LOW] McpAppsProtocolAdapter: Fix return type `JsonRpcResponse | unknown` to be more precise [mcp-apps-adapter.ts:139]
- [x] [AI-Review][LOW] Story: Correct "49 tests" to actual test count (547 tests total after fixes)

## Dev Notes

### Critical: Architecture Reality - Code Duplication to Fix First

**Current State (Problematic):**

`RpcBridge` et `SandboxWorker` ont été créés ensemble (commit `41e1488e`) mais `SandboxWorker` a **dupliqué** la logique de `RpcBridge` au lieu de l'utiliser:

| RpcBridge (non utilisé) | SandboxWorker (utilisé) |
|-------------------------|-------------------------|
| `handleMessage()` | `handleWorkerMessage()` |
| `handleRpcRequest()` | `handleRpcRequest()` |
| `worker.onmessage = ...` | `worker.onmessage = ...` |
| `worker.onerror = ...` | `worker.onerror = ...` |

**Résultat:** RpcBridge est exporté mais jamais importé = **code mort**.

**Task 0 Cleanup:**

Avant d'abstraire avec MessageTransport, on doit d'abord faire en sorte que `SandboxWorker` **compose** avec `RpcBridge`:

```typescript
// AVANT (actuel - duplication)
class SandboxWorker {
  private worker: Worker;

  async initializeWorker() {
    this.worker = new Worker(...);
    this.worker.onmessage = this.handleWorkerMessage.bind(this);  // Dupliqué!
  }

  handleWorkerMessage() { ... }  // Dupliqué de RpcBridge!
  handleRpcRequest() { ... }     // Dupliqué de RpcBridge!
}

// APRÈS (cleanup - composition)
class SandboxWorker {
  private worker: Worker;
  private bridge: RpcBridge;

  async initializeWorker() {
    this.worker = new Worker(...);
    this.bridge = new RpcBridge(this.worker, this.onRpc);  // Délégation!
  }

  // Plus de duplication - RpcBridge gère la communication
}
```

### Critical: Do NOT Break Existing Tests

Il y a **31 tests sandbox** qui doivent passer sans modification:
- `sandbox_integration_test.ts`: 9 tests
- `sandbox_isolation_test.ts`: 8 tests
- `sandbox_rpc_test.ts`: 7 tests
- `sandbox_ui_collection_test.ts`: 7 tests

**Stratégie:** Faire le cleanup (Task 0) et valider les tests AVANT de commencer l'abstraction MessageTransport.

### Task 0: SandboxWorker Cleanup Pattern

```typescript
// packages/pml/src/sandbox/execution/worker-runner.ts (AFTER CLEANUP)

import { RpcBridge } from "./rpc-bridge.ts";

export class SandboxWorker {
  private worker: Worker | null = null;
  private bridge: RpcBridge | null = null;  // NEW: delegate to RpcBridge
  private readonly onRpc: RpcHandler;
  // ... other fields unchanged ...

  private async initializeWorker(): Promise<void> {
    logDebug("Initializing sandbox Worker");

    // Create Worker with no permissions
    this.worker = new Worker(
      new URL("./sandbox-script.ts", import.meta.url),
      { type: "module", deno: { permissions: "none" } },
    );

    // NEW: Create RpcBridge to handle communication
    this.bridge = new RpcBridge(this.worker, this.onRpc, this.rpcTimeoutMs);

    await new Promise((resolve) => setTimeout(resolve, 10));
    logDebug("Sandbox Worker initialized");
  }

  async execute(code: string, args: unknown): Promise<SandboxResult> {
    // ... timeout and lifecycle logic stays here ...

    // NEW: Delegate execution to RpcBridge
    const executionId = crypto.randomUUID();
    const resultPromise = this.bridge!.execute(executionId, code, args);

    // ... timeout race logic stays here ...
  }

  // REMOVED: handleWorkerMessage() - now in RpcBridge
  // REMOVED: handleRpcRequest() - now in RpcBridge

  shutdown(): void {
    // ... cleanup logic ...
    this.bridge?.close();  // NEW: close bridge
    this.worker?.terminate();
  }
}
```

**Key changes in Task 0:**
- Add `private bridge: RpcBridge` field
- In `initializeWorker()`: create `RpcBridge` instead of setting up `worker.onmessage` directly
- In `execute()`: call `this.bridge.execute()` instead of `this.worker.postMessage()`
- Remove `handleWorkerMessage()` and `handleRpcRequest()` methods
- In `shutdown()`: call `this.bridge.close()`

### MessageTransport Interface

```typescript
// packages/pml/src/sandbox/transport/types.ts

/**
 * Generic message transport interface.
 * Works for both Deno Workers and Browser iframes.
 */
export interface MessageTransport {
  /** Send a message to the other side */
  send(message: unknown): void;

  /** Register handler for incoming messages */
  onMessage(handler: (message: unknown) => void): void;

  /** Optional: Register handler for errors */
  onError?(handler: (error: Error) => void): void;

  /** Close the transport and cleanup resources */
  close(): void;
}

/**
 * Optional protocol adapter for message transformation.
 * Used to convert between different message formats (e.g., MCP Apps JSON-RPC).
 */
export interface ProtocolAdapter {
  /** Convert incoming message to internal format */
  toInternal(message: unknown): unknown | null;

  /** Convert internal message to external format */
  toExternal(message: unknown): unknown;
}
```

### DenoWorkerTransport Implementation

```typescript
// packages/pml/src/sandbox/transport/deno-worker-transport.ts

import type { MessageTransport } from "./types.ts";

/**
 * MessageTransport implementation for Deno Workers.
 */
export class DenoWorkerTransport implements MessageTransport {
  constructor(private readonly worker: Worker) {}

  send(message: unknown): void {
    this.worker.postMessage(message);
  }

  onMessage(handler: (message: unknown) => void): void {
    this.worker.onmessage = (e: MessageEvent) => handler(e.data);
  }

  onError(handler: (error: Error) => void): void {
    this.worker.onerror = (e: ErrorEvent) => handler(new Error(e.message));
  }

  close(): void {
    this.worker.terminate();
  }
}
```

### IframeTransport Implementation (Browser-Only)

```typescript
// packages/pml/src/sandbox/transport/iframe-transport.ts

import type { MessageTransport } from "./types.ts";

/**
 * MessageTransport implementation for browser iframes.
 * Filters messages to only accept those from the target iframe.
 */
export class IframeTransport implements MessageTransport {
  private handler?: (message: unknown) => void;
  private readonly boundHandleMessage: (e: MessageEvent) => void;

  constructor(
    private readonly iframe: HTMLIFrameElement,
    private readonly targetOrigin: string = "*",
  ) {
    this.boundHandleMessage = this.handleMessage.bind(this);
    globalThis.addEventListener("message", this.boundHandleMessage);
  }

  private handleMessage(e: MessageEvent): void {
    // SECURITY: Only accept messages from our iframe
    if (e.source !== this.iframe.contentWindow) return;

    // Optional: Validate origin for additional security
    // if (this.targetOrigin !== "*" && e.origin !== this.targetOrigin) return;

    this.handler?.(e.data);
  }

  send(message: unknown): void {
    this.iframe.contentWindow?.postMessage(message, this.targetOrigin);
  }

  onMessage(handler: (message: unknown) => void): void {
    this.handler = handler;
  }

  close(): void {
    globalThis.removeEventListener("message", this.boundHandleMessage);
  }
}
```

### McpAppsProtocolAdapter Implementation

```typescript
// packages/pml/src/sandbox/transport/mcp-apps-adapter.ts

import type { ProtocolAdapter } from "./types.ts";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
}

interface InternalRpcMessage {
  type: string;
  id?: string;
  rpcId?: string;
  method?: string;
  args?: unknown;
  result?: unknown;
  error?: string;
}

/**
 * Protocol adapter for MCP Apps JSON-RPC ↔ internal PML format.
 *
 * Handles bidirectional conversion between:
 * - MCP Apps: `{ jsonrpc: '2.0', method: 'tools/call', params: { name, arguments } }`
 * - Internal: `{ type: 'rpc', rpcId, method, args }`
 */
export class McpAppsProtocolAdapter implements ProtocolAdapter {
  /**
   * Convert MCP Apps JSON-RPC to internal format.
   */
  toInternal(message: unknown): InternalRpcMessage | null {
    const msg = message as JsonRpcMessage;
    if (!msg?.jsonrpc || msg.jsonrpc !== "2.0") return null;

    // ui/initialize → init message
    if (msg.method === "ui/initialize") {
      return {
        type: "init",
        id: String(msg.id),
      };
    }

    // tools/call → rpc message
    if (msg.method === "tools/call") {
      const params = msg.params as { name: string; arguments?: unknown };
      return {
        type: "rpc",
        rpcId: String(msg.id),
        method: params.name,
        args: params.arguments,
      };
    }

    // ui/update-model-context → context update (for event routing)
    if (msg.method === "ui/update-model-context") {
      return {
        type: "context_update",
        id: String(msg.id),
        args: msg.params,
      };
    }

    return null;
  }

  /**
   * Convert internal format to MCP Apps JSON-RPC response.
   */
  toExternal(message: unknown): unknown {
    const msg = message as InternalRpcMessage;

    // rpc_response → JSON-RPC result
    if (msg.type === "rpc_response") {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: msg.result,
      };
    }

    // rpc_error → JSON-RPC error
    if (msg.type === "rpc_error") {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        error: {
          code: -32000,
          message: msg.error,
        },
      };
    }

    // Pass through other messages unchanged
    return message;
  }
}
```

### RpcBridge Refactoring Pattern

```typescript
// packages/pml/src/sandbox/execution/rpc-bridge.ts (MODIFIED)

import type { MessageTransport, ProtocolAdapter } from "../transport/types.ts";

export class RpcBridge {
  private readonly transport: MessageTransport;
  private readonly adapter?: ProtocolAdapter;
  // ... existing fields ...

  constructor(
    transport: MessageTransport,
    onRpc: RpcHandler,
    rpcTimeoutMs = SANDBOX_RPC_TIMEOUT_MS,
    adapter?: ProtocolAdapter,
  ) {
    this.transport = transport;
    this.onRpc = onRpc;
    this.rpcTimeoutMs = rpcTimeoutMs;
    this.adapter = adapter;

    // Setup message handler
    this.transport.onMessage(this.handleMessage.bind(this));
    this.transport.onError?.(this.handleError.bind(this));
  }

  // ... execute() and other methods use this.transport.send() ...

  private async handleMessage(rawData: unknown): Promise<void> {
    if (this.shutdown) return;

    // Apply adapter transformation if provided
    const data = this.adapter
      ? this.adapter.toInternal(rawData)
      : rawData;

    if (!data) return; // Adapter filtered out the message

    // ... rest of existing handleMessage logic ...
  }

  close(): void {
    this.shutdown = true;
    // ... cleanup pending requests ...
    this.transport.close();
    logDebug("RpcBridge closed");
  }
}
```

### Project Structure Notes

| Path | Purpose |
|------|---------|
| `packages/pml/src/sandbox/execution/worker-runner.ts` | **MODIFIED (Task 0)** Remove duplicate code, compose with RpcBridge |
| `packages/pml/src/sandbox/execution/rpc-bridge.ts` | **MODIFIED (Task 5)** Accept MessageTransport instead of Worker |
| `packages/pml/src/sandbox/transport/` | **NEW** directory for transport abstractions |
| `packages/pml/src/sandbox/transport/types.ts` | **NEW** MessageTransport, ProtocolAdapter interfaces |
| `packages/pml/src/sandbox/transport/deno-worker-transport.ts` | **NEW** Worker wrapper |
| `packages/pml/src/sandbox/transport/iframe-transport.ts` | **NEW** iframe wrapper (browser-only) |
| `packages/pml/src/sandbox/transport/mcp-apps-adapter.ts` | **NEW** JSON-RPC adapter |
| `packages/pml/src/sandbox/transport/mod.ts` | **NEW** public exports |
| `packages/pml/src/sandbox/mod.ts` | **MODIFIED** re-export transport module |

### Design Decisions

1. **Cleanup First** - Task 0 élimine la duplication de code AVANT d'abstraire. Cela simplifie le refactoring et réduit les risques de régression.

2. **Composition over Duplication** - SandboxWorker compose avec RpcBridge au lieu de dupliquer sa logique. Séparation claire: SandboxWorker = lifecycle, RpcBridge = communication.

3. **Interface Segregation** - `MessageTransport` is minimal (4 methods) to support any message-passing mechanism

4. **Optional Error Handler** - `onError` is optional because not all transports have explicit error events (iframes don't)

5. **Adapter Pattern** - `ProtocolAdapter` is optional, allowing RpcBridge to work with both native and adapted protocols

6. **Source Filtering** - `IframeTransport` filters by `e.source` to prevent message injection from other iframes/tabs

7. **Backward Compatibility** - SandboxWorker public API unchanged, internal refactoring only

8. **Browser-Only IframeTransport** - Uses `globalThis` for browser compatibility, not available in Deno sandbox

### Integration with Story 16.4

Story 16.4 created the Composite UI Generator that embeds multiple iframes. Story 16.5 provides the transport layer for communicating with those iframes using the same RpcBridge logic as the sandbox.

Future usage (Story 16.6 or beyond):

```typescript
// In composite UI host (browser)
const iframe = document.getElementById('child-ui') as HTMLIFrameElement;
const transport = new IframeTransport(iframe);
const adapter = new McpAppsProtocolAdapter();
const bridge = new RpcBridge(transport, onRpc, 30000, adapter);

// Same onRpc handler routes to MCP servers
const onRpc: RpcHandler = async (method, args) => {
  return await mcpClient.callTool(method, args);
};
```

### Testing Pattern

```typescript
// packages/pml/src/sandbox/transport/deno-worker-transport_test.ts
import { assertEquals, assertSpyCalls, spy } from "@std/testing";
import { DenoWorkerTransport } from "./deno-worker-transport.ts";

Deno.test("DenoWorkerTransport - send() calls worker.postMessage", () => {
  const mockWorker = {
    postMessage: spy(() => {}),
    terminate: () => {},
    onmessage: null,
    onerror: null,
  } as unknown as Worker;

  const transport = new DenoWorkerTransport(mockWorker);
  transport.send({ type: "test", data: 42 });

  assertSpyCalls(mockWorker.postMessage, 1);
  assertEquals(mockWorker.postMessage.calls[0].args[0], { type: "test", data: 42 });
});

Deno.test("DenoWorkerTransport - onMessage() registers handler", () => {
  const mockWorker = {
    postMessage: () => {},
    terminate: () => {},
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null,
  } as unknown as Worker;

  const transport = new DenoWorkerTransport(mockWorker);
  const handler = spy((_msg: unknown) => {});
  transport.onMessage(handler);

  // Simulate message event
  const event = { data: { type: "result", value: 123 } } as MessageEvent;
  mockWorker.onmessage?.(event);

  assertSpyCalls(handler, 1);
  assertEquals(handler.calls[0].args[0], { type: "result", value: 123 });
});
```

```typescript
// packages/pml/src/sandbox/transport/mcp-apps-adapter_test.ts
import { assertEquals } from "@std/assert";
import { McpAppsProtocolAdapter } from "./mcp-apps-adapter.ts";

Deno.test("McpAppsProtocolAdapter - toInternal() converts tools/call", () => {
  const adapter = new McpAppsProtocolAdapter();

  const jsonRpc = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "postgres:query", arguments: { sql: "SELECT 1" } },
  };

  const internal = adapter.toInternal(jsonRpc);

  assertEquals(internal, {
    type: "rpc",
    rpcId: "1",
    method: "postgres:query",
    args: { sql: "SELECT 1" },
  });
});

Deno.test("McpAppsProtocolAdapter - toExternal() converts rpc_response", () => {
  const adapter = new McpAppsProtocolAdapter();

  const internal = {
    type: "rpc_response",
    id: "1",
    result: { rows: [{ id: 1 }] },
  };

  const jsonRpc = adapter.toExternal(internal);

  assertEquals(jsonRpc, {
    jsonrpc: "2.0",
    id: "1",
    result: { rows: [{ id: 1 }] },
  });
});

Deno.test("McpAppsProtocolAdapter - toInternal() converts ui/initialize", () => {
  const adapter = new McpAppsProtocolAdapter();

  const jsonRpc = {
    jsonrpc: "2.0",
    id: "init-1",
    method: "ui/initialize",
    params: {},
  };

  const internal = adapter.toInternal(jsonRpc);

  assertEquals(internal, {
    type: "init",
    id: "init-1",
  });
});
```

### Dependencies

**Depends on (DONE):**
- Story 16.1 - Types: Foundation types for UI orchestration
- Story 16.4 - Composite UI Generator: Creates iframes that need transport

**Used by (FUTURE):**
- Story 16.6 - Dev Frontend Preview: Will use IframeTransport for mock UIs
- MCP Apps integration: Real iframe communication in production

### Git Context (Recent Commits)

| Commit | Description |
|--------|-------------|
| `d4e1a0a7` | feat(16.4): Composite UI Generator with sharedContext support |
| `e2ade8c1` | fix(16.3): code review - lint fixes and test commits |
| `1bc71c2f` | 16.2 - MCP Server Resources Handlers |
| `4a473e5b` | feat(lib/server): add HTTP transport support with Hono |

### References

- [Source: packages/pml/src/sandbox/execution/rpc-bridge.ts - Current implementation to refactor]
- [Source: packages/pml/src/sandbox/types.ts - RpcHandler, RpcRequestMessage types]
- [Source: _bmad-output/planning-artifacts/spikes/2026-01-27-mcp-apps-ui-orchestration.md#Solution-Elegante-Abstraction-du-Transport]
- [Source: _bmad-output/planning-artifacts/epics/epic-16-mcp-apps-ui-orchestration.md#Story-16.5]
- [Source: packages/pml/src/ui/composite-generator.ts - Generates iframes that will use this transport]

### FRs Covered

| FR ID | Description | How Addressed |
|-------|-------------|---------------|
| FR-UI-009 | MessageTransport for Workers Deno et iframes browser | `MessageTransport` interface + 2 implementations |
| ARCH-001 | Compatibilité RpcBridge existant | RpcBridge refactored to accept `MessageTransport` |
| ARCH-002 | Protocol adapter JSON-RPC ↔ format interne | `McpAppsProtocolAdapter` with bidirectional conversion |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Task 0: Fixed RPC timeout message format to match existing test expectations ("RPC timeout: method" vs "timed out after Xms")

### Completion Notes List

- **Task 0 (Cleanup)**: Removed duplicate code from SandboxWorker. SandboxWorker now delegates message handling to RpcBridge via composition. All 31 existing sandbox tests pass.
- **Task 1-4 (Transport Layer)**: Created MessageTransport interface, DenoWorkerTransport, IframeTransport, and McpAppsProtocolAdapter. IframeTransport uses browser-compatible types with any/EventListener casts for Deno compatibility.
- **Task 5-6 (RpcBridge Refactoring)**: RpcBridge now accepts `MessageTransport | Worker` for backward compatibility. When a Worker is passed, it's automatically wrapped in DenoWorkerTransport. Added optional ProtocolAdapter support.
- **Task 7 (Exports)**: Created transport/mod.ts and updated sandbox/mod.ts with all new exports.
- **Task 8 (Tests)**: 28 new transport tests added (5 DenoWorkerTransport + 13 McpAppsProtocolAdapter + 10 IframeTransport). Tests moved to tests/ directory as per project convention.
- **Task 9 (Validation)**: All 547 tests pass. deno check and deno lint pass for all modified files.

### File List

**New Files:**
- `packages/pml/src/sandbox/transport/types.ts` - MessageTransport and ProtocolAdapter interfaces
- `packages/pml/src/sandbox/transport/deno-worker-transport.ts` - Worker wrapper implementation (with isClosed, handler overwrite protection)
- `packages/pml/src/sandbox/transport/iframe-transport.ts` - Browser iframe wrapper (with isClosed, origin warning, security checks)
- `packages/pml/src/sandbox/transport/mcp-apps-adapter.ts` - JSON-RPC ↔ internal format adapter (with type validation)
- `packages/pml/src/sandbox/transport/mod.ts` - Transport module exports
- `packages/pml/tests/transport_deno_worker_test.ts` - DenoWorkerTransport tests (5 tests)
- `packages/pml/tests/transport_mcp_apps_adapter_test.ts` - McpAppsProtocolAdapter tests (13 tests)
- `packages/pml/tests/transport_iframe_test.ts` - IframeTransport tests (10 tests) - Added during code review

**Modified Files:**
- `packages/pml/src/sandbox/execution/worker-runner.ts` - SandboxWorker now uses RpcBridge+DenoWorkerTransport, calls cancelExecution on timeout
- `packages/pml/src/sandbox/execution/rpc-bridge.ts` - Refactored to accept MessageTransport, added adapter support, InitHandler, cancelExecution
- `packages/pml/src/sandbox/execution/sandbox-script.ts` - Fixed lint error (removed redundant async)
- `packages/pml/src/sandbox/mod.ts` - Added transport module exports + InitHandler type
- `packages/pml/deno.json` - Added @std/testing/mock import mapping

## Change Log

- 2026-02-02: Code Review fixes applied - All 10 issues fixed (4 HIGH, 3 MEDIUM, 3 LOW). 547 tests passing. Status → done.
- 2026-02-02: Code Review (AI) - 10 issues found (4 HIGH, 3 MEDIUM, 3 LOW). Status → in-progress pending fixes.
- 2026-02-02: Story 16.5 implementation complete - MessageTransport abstraction with 537 tests passing
