# Test Infrastructure Extension Guide

**Date:** 2025-11-11
**Owner:** Murat (TEA - Test Engineer Architect)
**Status:** ✅ COMPLETE
**Purpose:** Guide for extending AgentCards E2E test infrastructure for Epic 3 sandbox testing

---

## Executive Summary

AgentCards has a **robust E2E test infrastructure** built during Epic 2 (Story 2.7). This guide shows how to extend it for Epic 3 sandbox testing.

**Key Characteristics of Our Test Infrastructure:**
- ✅ Tests with **real MCP servers** (not mocks)
- ✅ Comprehensive edge case coverage (failures, timeouts, errors)
- ✅ Fast feedback loop (<2s per test)
- ✅ Maintainable and debuggable
- ✅ Load testing capable (parallel execution validation)

**Purpose of This Guide:**
- Enable developers to add new E2E tests confidently
- Document test patterns and conventions
- Provide templates for common test scenarios
- Ensure Epic 3 sandbox tests follow established patterns

---

## Table of Contents

1. [Test Infrastructure Overview](#test-infrastructure-overview)
2. [Test File Organization](#test-file-organization)
3. [Adding a New E2E Test](#adding-a-new-e2e-test)
4. [Test Patterns and Templates](#test-patterns-and-templates)
5. [Sandbox-Specific Testing](#sandbox-specific-testing)
6. [Mocking vs Real Services](#mocking-vs-real-services)
7. [Debugging Failed Tests](#debugging-failed-tests)
8. [Performance Testing](#performance-testing)
9. [CI/CD Integration](#cicd-integration)

---

## Test Infrastructure Overview

### Testing Stack

**Runtime:** Deno 2.x
**Framework:** Deno's built-in test runner (`Deno.test`)
**Assertions:** `@std/assert` (Deno standard library)

**Key Dependencies:**
```typescript
import { assertEquals, assertExists, assertRejects } from "@std/assert";
```

### Test Categories

**1. Unit Tests**
- Location: `tests/unit/`
- Scope: Individual functions, classes, modules
- Speed: <10ms per test
- Mocking: Extensive mocking of dependencies

**2. Integration Tests**
- Location: `tests/integration/`
- Scope: Component interactions (e.g., DAG executor + MCP gateway)
- Speed: <100ms per test
- Mocking: Minimal, real components where possible

**3. End-to-End Tests**
- Location: `tests/e2e/`
- Scope: Full user journeys (MCP server → gateway → executor → results)
- Speed: <2s per test
- Mocking: None (real MCP servers, real database)

**4. Load Tests**
- Location: `tests/load/`
- Scope: Performance under concurrent load
- Speed: Variable (depends on load)
- Mocking: Real services under stress

**5. POC/Spike Tests**
- Location: `tests/poc/`
- Scope: Proof-of-concept validation
- Speed: Variable
- Mocking: As needed for validation

---

## Test File Organization

### Directory Structure

```
tests/
├── unit/
│   ├── dag/
│   │   ├── graph-builder.test.ts
│   │   └── executor.test.ts
│   ├── mcp/
│   │   ├── gateway.test.ts
│   │   └── vector-search.test.ts
│   └── sandbox/              # ← NEW for Epic 3
│       ├── executor.test.ts
│       ├── pii-detector.test.ts
│       └── serializer.test.ts
├── integration/
│   ├── dag-with-mcp.test.ts
│   └── sandbox-with-bridge.test.ts  # ← NEW for Epic 3
├── e2e/
│   ├── gateway-workflow.test.ts
│   ├── parallel-execution.test.ts
│   └── sandbox-execution.test.ts    # ← NEW for Epic 3
├── load/
│   ├── concurrent-workflows.test.ts
│   └── sandbox-load.test.ts         # ← NEW for Epic 3
└── poc/
    ├── deno-sandbox-executor.ts
    ├── deno-sandbox-poc.test.ts
    └── agentcards-bridge.ts
```

### Naming Conventions

**Test files:**
- Pattern: `<component>.test.ts`
- Examples: `executor.test.ts`, `pii-detector.test.ts`

**Test names:**
- Pattern: `<Component> <action> <expected result>`
- Examples:
  - `"Sandbox executor runs basic code successfully"`
  - `"PII detector identifies email addresses"`
  - `"Gateway denies network access in sandbox"`

---

## Adding a New E2E Test

### Step-by-Step Process

#### 1. Create Test File

```bash
# Navigate to appropriate directory
cd tests/e2e/

# Create test file
touch sandbox-execution.test.ts
```

#### 2. Set Up Test Boilerplate

```typescript
// tests/e2e/sandbox-execution.test.ts
import { assertEquals, assertExists } from "@std/assert";
import { DenoSandboxExecutor } from "../../src/sandbox/executor.ts";

// ✅ Test setup function (reusable)
function createTestExecutor() {
  return new DenoSandboxExecutor({
    timeout: 30000,
    memoryLimit: 512,
  });
}

// ✅ Cleanup function (run after tests)
async function cleanup() {
  // Clean up temp files, close connections, etc.
}
```

#### 3. Write Test Cases

```typescript
Deno.test("Sandbox executor runs basic code successfully", async () => {
  const executor = createTestExecutor();

  const result = await executor.execute(`
    const x = 1 + 1;
    return x;
  `);

  assertEquals(result.success, true);
  assertEquals(result.result, 2);
});

Deno.test("Sandbox executor denies file system access", async () => {
  const executor = createTestExecutor();

  const result = await executor.execute(`
    await Deno.readTextFile("/etc/passwd");
  `);

  assertEquals(result.success, false);
  assertEquals(result.error?.type, "PermissionError");
});
```

#### 4. Run Tests

```bash
# Run single test file
deno test tests/e2e/sandbox-execution.test.ts

# Run all E2E tests
deno test tests/e2e/

# Run with coverage
deno test --coverage=coverage/ tests/e2e/

# Run in watch mode (during development)
deno test --watch tests/e2e/sandbox-execution.test.ts
```

---

## Test Patterns and Templates

### Pattern 1: Basic Success Case

```typescript
Deno.test("Component performs expected action successfully", async () => {
  // Arrange: Set up test data and dependencies
  const executor = createTestExecutor();
  const input = "test input";

  // Act: Perform the action
  const result = await executor.execute(input);

  // Assert: Verify expected outcome
  assertEquals(result.success, true);
  assertExists(result.data);
});
```

---

### Pattern 2: Error Handling

```typescript
Deno.test("Component handles error condition gracefully", async () => {
  const executor = createTestExecutor();

  // Act & Assert: Expect specific error
  const result = await executor.execute(`throw new Error("test error")`);

  assertEquals(result.success, false);
  assertEquals(result.error?.type, "RuntimeError");
  assertEquals(result.error?.message.includes("test error"), true);
});
```

---

### Pattern 3: Permission Violation

```typescript
Deno.test("Sandbox denies <permission_type> access", async () => {
  const executor = createTestExecutor();

  const result = await executor.execute(`
    // Code that requires permission
    await Deno.readTextFile("/etc/passwd");
  `);

  assertEquals(result.success, false);
  assertEquals(result.error?.type, "PermissionError");
  assertEquals(
    result.error?.message.includes("read") ||
    result.error?.message.includes("PermissionDenied"),
    true
  );
});
```

---

### Pattern 4: Timeout Enforcement

```typescript
Deno.test("Sandbox enforces timeout on infinite loop", async () => {
  const executor = createTestExecutor({ timeout: 1000 }); // 1s timeout

  const startTime = performance.now();

  const result = await executor.execute(`
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  `);

  const duration = performance.now() - startTime;

  assertEquals(result.success, false);
  assertEquals(result.error?.type, "TimeoutError");
  assertEquals(duration < 1500, true); // Should timeout around 1s
});
```

---

### Pattern 5: Async Code Execution

```typescript
Deno.test("Sandbox executes async code correctly", async () => {
  const executor = createTestExecutor();

  const result = await executor.execute(`
    async function fetchData() {
      return new Promise(resolve => {
        setTimeout(() => resolve("async result"), 100);
      });
    }

    const data = await fetchData();
    return data;
  `);

  assertEquals(result.success, true);
  assertEquals(result.result, "async result");
});
```

---

### Pattern 6: Resource Limits

```typescript
Deno.test("Sandbox enforces memory limit", async () => {
  const executor = createTestExecutor({ memoryLimit: 128 }); // 128MB

  const result = await executor.execute(`
    const arrays = [];
    while (true) {
      arrays.push(new Array(1024 * 1024).fill(0)); // 1MB per iteration
    }
  `);

  assertEquals(result.success, false);
  assertEquals(result.error?.type, "MemoryError");
});
```

---

### Pattern 7: Message Passing (MCP Bridge)

```typescript
Deno.test("Sandbox calls MCP tool via message bridge", async () => {
  const executor = createTestExecutor();

  // Mock message handler
  const mockToolCall = async (name: string, args: unknown) => {
    return { result: "tool called" };
  };

  const result = await executor.executeWithBridge(`
    // Use bridge to call MCP tool
    const tools = await searchTools("github");
    return tools.length;
  `, mockToolCall);

  assertEquals(result.success, true);
  assertExists(result.result);
});
```

---

## Sandbox-Specific Testing

### Epic 3 Test Scenarios

**Story 3.1 - Sandbox Executor:**
```typescript
// tests/e2e/sandbox-execution.test.ts

Deno.test("Story 3.1: Sandbox executes basic TypeScript", async () => {
  const executor = createTestExecutor();
  const result = await executor.execute(`return 1 + 1;`);

  assertEquals(result.success, true);
  assertEquals(result.result, 2);
  assertEquals(result.executionTimeMs < 150, true);
});

Deno.test("Story 3.1: Sandbox isolates file system", async () => {
  const executor = createTestExecutor();
  const result = await executor.execute(`
    await Deno.readTextFile("/etc/passwd");
  `);

  assertEquals(result.success, false);
  assertEquals(result.error?.type, "PermissionError");
});
```

**Story 3.2 - MCP Tools Injection:**
```typescript
// tests/e2e/mcp-bridge.test.ts

Deno.test("Story 3.2: Sandbox accesses MCP tools via bridge", async () => {
  const worker = createSandboxWorker();

  // Send search request
  worker.postMessage({ type: "search_tools", query: "github" });

  // Wait for response
  const response = await new Promise(resolve => {
    worker.onmessage = (e) => resolve(e.data);
  });

  assertEquals(response.type, "search_result");
  assertExists(response.tools);
});
```

**Story 3.5 - PII Detection:**
```typescript
// tests/unit/sandbox/pii-detector.test.ts

Deno.test("Story 3.5: PII detector identifies email", async () => {
  const detector = new PIIDetector();

  const result = detector.detect(`
    const email = "user@example.com";
  `);

  assertEquals(result.detected, true);
  assertEquals(result.matches.length, 1);
  assertEquals(result.matches[0].type, "email");
  assertEquals(result.matches[0].value, "user@example.com");
});
```

---

## Mocking vs Real Services

### When to Use Real Services

**✅ Use real services when:**
- Testing integration points (E2E tests)
- Validating actual behavior under realistic conditions
- Testing performance characteristics
- Ensuring contracts are honored

**Example:** Story 2.4 tests use **real MCP servers** to validate gateway integration.

---

### When to Use Mocks

**✅ Use mocks when:**
- Testing error paths (hard to trigger with real services)
- Isolating component under test (unit tests)
- Speed is critical (unit tests should be <10ms)
- External service is unreliable or expensive

**Example:** Unit tests for DAG builder mock the MCP gateway.

---

### Mocking Example

```typescript
// Mock MCP tool call
class MockMCPGateway {
  async callTool(name: string, args: unknown): Promise<CallToolResult> {
    // Return predictable mock response
    return {
      content: [{ type: "text", text: "mocked result" }],
    };
  }
}

Deno.test("Component uses MCP gateway correctly", async () => {
  const mockGateway = new MockMCPGateway();
  const component = new MyComponent(mockGateway);

  const result = await component.doSomething();

  assertEquals(result.includes("mocked result"), true);
});
```

---

## Debugging Failed Tests

### Common Failures and Solutions

#### 1. Permission Errors

**Symptom:**
```
PermissionDenied: Requires read access to "/tmp/abc123.ts"
```

**Solution:**
```typescript
// Run tests with required permissions
deno test --allow-read --allow-write tests/e2e/
```

---

#### 2. Timeout Failures

**Symptom:**
```
Test timed out after 5000ms
```

**Solution:**
```typescript
// Increase test timeout
Deno.test({
  name: "Long-running test",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Test code
  },
});

// Or run with longer timeout
deno test --timeout=30000 tests/e2e/
```

---

#### 3. Resource Leak Warnings

**Symptom:**
```
Leaking resources:
  - 1 async op still pending
```

**Solution:**
```typescript
// Ensure cleanup happens
Deno.test("Test with cleanup", async () => {
  const resource = await createResource();

  try {
    // Test code
  } finally {
    await resource.close(); // ✅ Always cleanup
  }
});
```

---

### Debugging Tips

**1. Add verbose logging:**
```bash
deno test --log-level=debug tests/e2e/
```

**2. Run single test:**
```bash
deno test --filter="specific test name" tests/e2e/
```

**3. Use debugger:**
```bash
deno test --inspect-brk tests/e2e/sandbox-execution.test.ts
# Then connect Chrome DevTools to chrome://inspect
```

**4. Check test output:**
```typescript
Deno.test("Debug test", async () => {
  const result = await executor.execute(code);
  console.log("Result:", JSON.stringify(result, null, 2)); // ✅ Debug output
  assertEquals(result.success, true);
});
```

---

## Performance Testing

### Benchmarking Pattern

```typescript
Deno.test("Benchmark: Sandbox execution performance", async () => {
  const executor = createTestExecutor();
  const iterations = 100;
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    await executor.execute(`return ${i};`);

    const duration = performance.now() - start;
    times.push(duration);
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

  console.log(`Average: ${avgTime.toFixed(2)}ms`);
  console.log(`P95: ${p95Time.toFixed(2)}ms`);

  // Assert performance targets
  assertEquals(avgTime < 150, true, "Average should be <150ms");
  assertEquals(p95Time < 300, true, "P95 should be <300ms");
});
```

---

### Load Testing Pattern

```typescript
Deno.test("Load test: 100 concurrent sandbox executions", async () => {
  const executor = createTestExecutor();
  const concurrency = 100;

  const promises = Array.from({ length: concurrency }, (_, i) =>
    executor.execute(`return ${i};`)
  );

  const startTime = performance.now();
  const results = await Promise.all(promises);
  const duration = performance.now() - startTime;

  // Verify all succeeded
  assertEquals(results.filter(r => r.success).length, concurrency);

  // Verify reasonable total time
  console.log(`100 executions in ${duration.toFixed(2)}ms`);
  assertEquals(duration < 10000, true, "Should complete in <10s");
});
```

---

## CI/CD Integration

### Running Tests in CI

**GitHub Actions example:**
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: denoland/setup-deno@v1
        with:
          deno-version: v2.x

      - name: Run unit tests
        run: deno test --allow-read --allow-write tests/unit/

      - name: Run integration tests
        run: deno test --allow-all tests/integration/

      - name: Run E2E tests
        run: deno test --allow-all tests/e2e/

      - name: Generate coverage
        run: deno coverage coverage/ --lcov > coverage.lcov

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: coverage.lcov
```

---

## Checklist for New Tests

Before submitting a new test, verify:

- [ ] Test file in correct directory (`unit/`, `integration/`, `e2e/`)
- [ ] Test name follows convention (`Component action expected`)
- [ ] Arrange-Act-Assert pattern followed
- [ ] Cleanup in `finally` block (if needed)
- [ ] Assertions are specific (not just `assertTrue`)
- [ ] Test runs in <2s (E2E) or <100ms (integration) or <10ms (unit)
- [ ] Test passes consistently (run 5 times)
- [ ] No resource leaks (Deno checks this automatically)
- [ ] Documented in this guide if it's a new pattern

---

## Examples from Existing Tests

### Real Example: Story 2.7 E2E Test

```typescript
// tests/e2e/parallel-execution.test.ts (excerpt)

Deno.test("DAG executor runs parallel workflows correctly", async () => {
  // Arrange: Set up real MCP servers
  const mcpServers = await startRealMCPServers();
  const gateway = new MCPGateway(mcpServers);
  const dagExecutor = new DAGExecutor(gateway);

  // Act: Execute workflow
  const workflow = {
    nodes: [
      { id: "1", tool: "github.searchRepos", args: { q: "deno" } },
      { id: "2", tool: "github.getRepo", args: {}, deps: ["1"] },
    ],
  };

  const result = await dagExecutor.execute(workflow);

  // Assert: Verify results
  assertEquals(result.success, true);
  assertExists(result.nodes["1"].result);
  assertExists(result.nodes["2"].result);

  // Cleanup
  await mcpServers.close();
});
```

---

## Conclusion

AgentCards has **production-grade test infrastructure** ready for Epic 3 sandbox testing.

**Key takeaways:**
- ✅ Use patterns from this guide for consistency
- ✅ Test with real services in E2E tests
- ✅ Mock aggressively in unit tests
- ✅ Keep tests fast and reliable
- ✅ Clean up resources in `finally` blocks

**Epic 3 is ready:** Follow these patterns to add sandbox tests with confidence! 🚀

---

**Document Status:** ✅ COMPLETE
**Date:** 2025-11-11
**Owner:** Murat (TEA)