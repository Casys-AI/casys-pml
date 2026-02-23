# PML E2E Tests

End-to-end tests for the PML (Procedural Memory Layer) package.

## Overview

These tests validate the complete flow of the PML package:

```
Claude Code → pml stdio → Permission Check → Routing → Execution → Response
```

## Test Coverage

| Test File | ACs Covered | Description |
|-----------|-------------|-------------|
| `local_flow_test.ts` | AC1, AC4, AC5 | Local MCP execution, file permissions, network isolation |
| `cloud_flow_test.ts` | AC2, AC3 | Cloud forwarding, offline mode |
| `hil_flow_test.ts` | AC6, AC7 | HIL approval flow, dependency installation |
| `integrity_test.ts` | AC8 | Lockfile integrity validation |
| `concurrent_test.ts` | AC9 | Concurrent call handling |
| `error_recovery_test.ts` | AC10 | Error recovery and resource cleanup |

## Test Infrastructure

### Test Harness (`test-harness.ts`)

Provides isolated test environments:

```typescript
import { setupE2EContext, teardownE2EContext } from "./test-harness.ts";

Deno.test("My E2E test", async () => {
  const ctx = await setupE2EContext({
    permissions: { allow: ["filesystem:*"], deny: [], ask: ["*"] },
    envVars: { PML_API_KEY: "test-key" },
  });

  try {
    // Test code here
    const loader = await CapabilityLoader.create({
      cloudUrl: "http://localhost:3099",
      workspace: ctx.workspace,
    });
    // ...
  } finally {
    await teardownE2EContext(ctx);
  }
});
```

### Mock Cloud Server (`mock-cloud-server.ts`)

Simulates the PML cloud for testing:

```typescript
import { createMockServer } from "../fixtures/mock-cloud-server.ts";

const server = await createMockServer({ port: 3099 });

// Set up mock capability response
// Note: code is function BODY format, not ES module
server.setMcpResponse("casys.pml.json.parse", {
  code: `return JSON.parse(args.input);`,  // Function body, not ES module
  fqdn: "casys.pml.json.parse",
  type: "deno",
  tools: ["parse"],
  routing: "client",
  integrity: "sha256-abc123",
});

// Set up mock tool call response
server.setToolResponse("tavily:search", {
  result: { content: [{ type: "text", text: "results" }] },
});

// Simulate offline
server.simulateOffline();

// Cleanup
server.shutdown();
```

### Stdio Simulator (`../fixtures/stdio-simulator.ts`)

Simulates Claude Code interacting with `pml stdio`:

```typescript
import { StdioSimulator } from "../fixtures/stdio-simulator.ts";

const stdio = new StdioSimulator(ctx, { debug: true });
await stdio.start();

// Call a tool
const result = await stdio.callTool("filesystem:read_file", { path: "/test.txt" });

// Handle HIL approval
const result2 = await stdio.continueWorkflow({
  workflowId: result.workflowId!,
  approved: true,
}, "dangerous:action", { arg: "value" });

await stdio.stop();
```

## Running Tests

### All E2E Tests

```bash
deno task test:e2e
```

### Specific Test File

```bash
deno test --allow-all --unstable-worker-options --unstable-broadcast-channel \
  packages/pml/tests/e2e/local_flow_test.ts
```

### With Debug Output

```bash
PML_DEBUG=1 deno task test:e2e
```

## Environment Requirements

- **Deno 2.x** with unstable worker options
- **Ports 3070-3099** available for mock servers
- **Temp directory access** for test workspaces

## Test Patterns

### Testing Sandbox Execution

```typescript
Deno.test("Sandbox test", async () => {
  const sandbox = new SandboxWorker({
    onRpc: async (method, args) => {
      // Handle mcp.* calls from sandbox
      return { result: "from rpc" };
    },
  });

  const result = await sandbox.execute(
    `const response = await mcp.test.call({}); return response;`,
    {},
  );

  assertEquals(result.success, true);
  sandbox.shutdown();
});
```

### Testing Approval Flow

```typescript
Deno.test("HIL approval", async () => {
  // First call returns approval_required
  const result1 = await loader.call("dangerous:action", {});
  assertEquals(result1.approvalRequired, true);

  // Second call with approval
  const result2 = await loader.call("dangerous:action", {}, { approved: true });
  assertEquals(result2.success, true);
});
```

### Testing Integrity Validation

```typescript
Deno.test("Lockfile integrity", async () => {
  // Pre-populate lockfile with old hash
  await lockfileManager.addEntry({
    fqdn: "casys.pml.cap",
    integrity: "sha256-oldHash",
    type: "deno",
  });

  // Mock returns different hash
  mockServer.setMcpResponse("casys.pml.cap", {
    fqdn: "casys.pml.cap",
    integrity: "sha256-newHash", // Different!
  });

  // Should return IntegrityApprovalRequired
  const result = await loader.load("cap");
  assertEquals(result.approvalType, "integrity");
});
```

## Troubleshooting

### Port Already in Use

Each test file uses different port ranges to avoid conflicts:
- `local_flow_test.ts`: 3098-3099
- `cloud_flow_test.ts`: 3091-3097
- `hil_flow_test.ts`: 3082-3089
- `integrity_test.ts`: 3077-3081
- `concurrent_test.ts`: 3074-3076
- `error_recovery_test.ts`: 3070-3073

### Sandbox Timeout Issues

If tests timeout, check:
1. `executionTimeoutMs` option (default: 30s)
2. `rpcTimeoutMs` option (default: 10s)
3. Network availability for cloud tests

### Resource Leaks

All tests should use:
```typescript
Deno.test({
  name: "...",
  fn: async () => { ... },
  sanitizeResources: false,
  sanitizeOps: false,
});
```

This is necessary because Worker cleanup is asynchronous.

## Story Reference

- **Story 14.8**: E2E Integration Testing
- **Epic 14**: JSR Package Local/Cloud MCP Routing
- **Prerequisites**: Stories 14.1-14.7
