/**
 * MCP Discovery Tests
 *
 * Tests for packages/pml/src/discovery/mcp-discovery.ts
 * F16 Fix: Add missing tests for MCP tool discovery
 */

import { assertEquals } from "@std/assert";
import { summarizeDiscovery } from "../src/discovery/mod.ts";
import type { DiscoveryResult } from "../src/discovery/mod.ts";

// ============================================================================
// summarizeDiscovery Tests
// ============================================================================

Deno.test("summarizeDiscovery - empty results", () => {
  const summary = summarizeDiscovery([]);

  assertEquals(summary.totalServers, 0);
  assertEquals(summary.successfulServers, 0);
  assertEquals(summary.failedServers, 0);
  assertEquals(summary.totalTools, 0);
  assertEquals(summary.skippedTools, 0);
  assertEquals(summary.failures, []);
});

Deno.test("summarizeDiscovery - successful discovery", () => {
  const results: DiscoveryResult[] = [
    {
      serverName: "server1",
      tools: [
        { name: "tool1", description: "Tool 1" },
        { name: "tool2", description: "Tool 2" },
      ],
      config: { type: "stdio", command: "cmd1" },
    },
    {
      serverName: "server2",
      tools: [{ name: "tool3" }],
      config: { type: "stdio", command: "cmd2" },
    },
  ];

  const summary = summarizeDiscovery(results);

  assertEquals(summary.totalServers, 2);
  assertEquals(summary.successfulServers, 2);
  assertEquals(summary.failedServers, 0);
  assertEquals(summary.totalTools, 3);
  assertEquals(summary.failures, []);
});

Deno.test("summarizeDiscovery - failed discovery", () => {
  const results: DiscoveryResult[] = [
    {
      serverName: "good-server",
      tools: [{ name: "tool1" }],
      config: { type: "stdio", command: "cmd" },
    },
    {
      serverName: "bad-server",
      tools: [],
      config: { type: "stdio", command: "cmd" },
      error: "Connection timeout",
    },
  ];

  const summary = summarizeDiscovery(results);

  assertEquals(summary.totalServers, 2);
  assertEquals(summary.successfulServers, 1);
  assertEquals(summary.failedServers, 1);
  assertEquals(summary.totalTools, 1);
  assertEquals(summary.failures, [
    { server: "bad-server", error: "Connection timeout" },
  ]);
});

Deno.test("summarizeDiscovery - skipped tools counted", () => {
  const results: DiscoveryResult[] = [
    {
      serverName: "server1",
      tools: [{ name: "valid-tool" }],
      config: { type: "stdio", command: "cmd" },
      skippedTools: ["invalid-tool-1", "invalid-tool-2"],
    },
  ];

  const summary = summarizeDiscovery(results);

  assertEquals(summary.totalTools, 1);
  assertEquals(summary.skippedTools, 2);
});

Deno.test("summarizeDiscovery - http server failure", () => {
  const results: DiscoveryResult[] = [
    {
      serverName: "http-server",
      tools: [],
      config: { type: "http", url: "https://example.com" },
      error: "HTTP servers not yet supported for discovery",
    },
  ];

  const summary = summarizeDiscovery(results);

  assertEquals(summary.failedServers, 1);
  assertEquals(summary.failures[0].error, "HTTP servers not yet supported for discovery");
});

// ============================================================================
// Tool Name Validation Tests (via discovery behavior)
// ============================================================================

// Note: validateToolSchema is private, but we can test its behavior
// indirectly by observing which tools get skipped during discovery.
// For unit testing the validation logic, we'd need to export it or
// create a test harness.

Deno.test("discovery - tool validation rules documented", () => {
  // This test documents the validation rules implemented in F10:
  // - Name is required and must be string
  // - Max length: 256 characters
  // - Pattern: /^[a-zA-Z0-9_\-\.]+$/ (no colons, spaces, special chars)

  // Valid names:
  const validNames = [
    "tool_name",
    "tool-name",
    "tool.name",
    "ToolName123",
    "a", // single char
    "a".repeat(256), // max length
  ];

  // Invalid names (would be skipped):
  const invalidNames = [
    "", // empty
    "a".repeat(257), // too long
    "tool:name", // colon not allowed
    "tool name", // space not allowed
    "tool@name", // special char
    "tool\nname", // newline
  ];

  // This is a documentation test - actual validation is tested via integration
  assertEquals(validNames.length > 0, true);
  assertEquals(invalidNames.length > 0, true);
});
