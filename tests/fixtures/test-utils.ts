/**
 * Shared Test Utilities for PML Tests
 *
 * Centralized helpers for:
 * - Deterministic polling (waitFor)
 * - Mock fetch setup/teardown
 * - Common test metadata factories
 *
 * @module tests/fixtures/test-utils
 */

/**
 * Wait for a condition with deterministic polling.
 *
 * Use this instead of hard-coded setTimeout/sleep delays.
 *
 * @example
 * ```ts
 * // Wait for server to be ready
 * await waitFor(() => server.isReady(), { timeout: 5000 });
 *
 * // Wait for file to exist
 * await waitFor(async () => await exists(path), { interval: 50 });
 * ```
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`waitFor timeout after ${timeout}ms`);
}

/**
 * Wait for a condition with timeout, returns boolean instead of throwing.
 *
 * @returns true if condition met, false if timeout
 */
export async function waitForWithResult(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {},
): Promise<boolean> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return false;
}

/**
 * Mock fetch context for capability loading tests.
 *
 * Automatically saves and restores original fetch.
 *
 * @example
 * ```ts
 * const ctx = mockFetch(() => new Response(JSON.stringify(data)));
 * try {
 *   await loader.load("test:capability");
 * } finally {
 *   ctx.restore();
 * }
 * ```
 */
export interface MockFetchContext {
  /** Call count for verification */
  callCount: number;
  /** Restore original fetch */
  restore: () => void;
  /** Last URL fetched */
  lastUrl?: string;
}

export function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): MockFetchContext {
  const originalFetch = globalThis.fetch;
  const ctx: MockFetchContext = {
    callCount: 0,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    ctx.callCount++;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    ctx.lastUrl = url;
    return await handler(url, init);
  };

  return ctx;
}

/**
 * Create a mock 404 response.
 */
export function mock404Response(): Response {
  return new Response(null, { status: 404 });
}

/**
 * Create a mock JSON response.
 */
export function mockJsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ============================================================================
// Common Test Data Factories
// ============================================================================

/**
 * Create valid capability metadata for testing.
 */
export function createTestCapabilityMetadata(overrides: Partial<TestCapabilityMetadata> = {}): TestCapabilityMetadata {
  const id = crypto.randomUUID().slice(0, 8);
  return {
    fqdn: overrides.fqdn ?? `casys.pml.test.${id}`,
    type: "deno",
    codeUrl: overrides.codeUrl ?? "data:application/javascript,export function run() { return 'ok'; }",
    tools: overrides.tools ?? [`test:${id}`],
    routing: overrides.routing ?? "client",
    mcpDeps: overrides.mcpDeps,
    ...overrides,
  };
}

export interface TestCapabilityMetadata {
  fqdn: string;
  type: string;
  codeUrl: string;
  tools: string[];
  routing: string;
  mcpDeps?: McpDependency[];
}

export interface McpDependency {
  name: string;
  type: string;
  install: string;
  version: string;
  integrity: string;
  envRequired?: string[];
}

/**
 * Create test MCP dependency.
 */
export function createTestMcpDep(overrides: Partial<McpDependency> = {}): McpDependency {
  return {
    name: overrides.name ?? "test-mcp",
    type: overrides.type ?? "stdio",
    install: overrides.install ?? "npx @mcp/test@1.0.0",
    version: overrides.version ?? "1.0.0",
    integrity: overrides.integrity ?? "sha256-abc123",
    ...overrides,
  };
}

// ============================================================================
// Environment Variable Helpers
// ============================================================================

/**
 * Temporarily set environment variables for a test.
 *
 * @example
 * ```ts
 * await withEnvVars({ API_KEY: "test" }, async () => {
 *   // Test code that needs API_KEY
 * });
 * // API_KEY is restored to original value
 * ```
 */
export async function withEnvVars<T>(
  vars: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const original: Record<string, string | undefined> = {};

  // Save original values
  for (const key of Object.keys(vars)) {
    original[key] = Deno.env.get(key);
  }

  // Set new values
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      Deno.env.delete(key);
    } else {
      Deno.env.set(key, value);
    }
  }

  try {
    return await fn();
  } finally {
    // Restore original values
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    }
  }
}

/**
 * Delete environment variables and restore after test.
 */
export async function withoutEnvVars<T>(
  keys: string[],
  fn: () => Promise<T>,
): Promise<T> {
  const vars: Record<string, undefined> = {};
  for (const key of keys) {
    vars[key] = undefined;
  }
  return withEnvVars(vars, fn);
}
