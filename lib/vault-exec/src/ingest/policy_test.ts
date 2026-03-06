import { assert, assertEquals } from "jsr:@std/assert";
import {
  classifyToolCallL2,
  classifyToolFamily,
  isToolPolicySupported,
  SUPPORTED_TOOL_POLICIES,
} from "./policy.ts";

const CURRENT_PROJECT_README = new URL("../../README.md", import.meta.url)
  .pathname;
const ALTERNATE_CHECKOUT_README =
  "/tmp/openclaw-fixture/lib/vault-exec/README.md";

Deno.test("classifyToolCallL2 - hits for each supported major tool", () => {
  const cases: Array<{
    toolName: string;
    args: Record<string, unknown>;
    expectedFamily: string;
  }> = [
    {
      toolName: "exec",
      args: { command: 'timeout 30 bash -lc "curl https://example.com"' },
      expectedFamily: "network_http",
    },
    { toolName: "process", args: { action: "poll" }, expectedFamily: "poll" },
    {
      toolName: "read",
      args: { file_path: "/tmp/openclaw-fixture/lib/vault-exec/README.md" },
      expectedFamily: "project_abs:file_path",
    },
    {
      toolName: "edit",
      args: {
        file_path: "/tmp/openclaw-fixture/lib/vault-exec/src/cli.ts",
        old_string: "old",
        new_string: "new",
      },
      expectedFamily: "snake_case:project_abs",
    },
    {
      toolName: "write",
      args: {
        file_path: "/tmp/openclaw-fixture/lib/vault-exec/docs/note.md",
        content: "x",
      },
      expectedFamily: "project_abs:file_path",
    },
    {
      toolName: "browser",
      args: { action: "navigate", targetUrl: "https://example.com" },
      expectedFamily: "navigate",
    },
    {
      toolName: "web_fetch",
      args: { url: "https://example.com", extractMode: "text", maxChars: 2000 },
      expectedFamily: "text:small",
    },
    { toolName: "cron", args: { action: "add" }, expectedFamily: "add" },
    {
      toolName: "message",
      args: { action: "send", message: "hello", to: "+15550001111" },
      expectedFamily: "text_only",
    },
    {
      toolName: "memory_search",
      args: { query: "how to test", maxResults: 3 },
      expectedFamily: "bounded",
    },
    {
      toolName: "sessions_spawn",
      args: { label: "w1", task: "do task", runtime: "node" },
      expectedFamily: "runtime_specific",
    },
    {
      toolName: "web_search",
      args: { query: "latest docs", freshness: "day" },
      expectedFamily: "freshness_filtered",
    },
    {
      toolName: "gateway",
      args: {
        action: "config.patch",
        patch: [{ op: "replace", path: "/x", value: 1 }],
      },
      expectedFamily: "config.patch",
    },
    {
      toolName: "subagents",
      args: { action: "steer", target: "worker-1", message: "continue" },
      expectedFamily: "steer",
    },
    {
      toolName: "image",
      args: { prompt: "compare", images: ["/tmp/a.png", "/tmp/b.png"] },
      expectedFamily: "multi",
    },
    {
      toolName: "sessions_send",
      args: { sessionKey: "agent:xyz", message: "status" },
      expectedFamily: "session_key",
    },
    {
      toolName: "sessions_history",
      args: { sessionKey: "main:abc", includeTools: true },
      expectedFamily: "with_tools",
    },
    {
      toolName: "session_status",
      args: { model: "gpt-4.1" },
      expectedFamily: "model_scoped",
    },
    {
      toolName: "sessions_list",
      args: { limit: 5, kinds: ["agent"] },
      expectedFamily: "filtered",
    },
    {
      toolName: "memory_get",
      args: { path: "memory/2026-03-05.md", from: 1, lines: 10 },
      expectedFamily: "range_read",
    },
    {
      toolName: "pdf",
      args: { pdf: "/tmp/doc.pdf" },
      expectedFamily: "single",
    },
    {
      toolName: "tts",
      args: { text: "hello", channel: "whatsapp" },
      expectedFamily: "channel_scoped",
    },
    {
      toolName: "whatsapp_login",
      args: { action: "start" },
      expectedFamily: "start",
    },
    {
      toolName: "agents_list",
      args: {},
      expectedFamily: "list",
    },
  ];

  for (const testCase of cases) {
    const result = classifyToolCallL2(testCase.toolName, testCase.args);
    assertEquals(result.family, testCase.expectedFamily, testCase.toolName);
    assertEquals(result.hit, true, `${testCase.toolName} should hit`);
    assertEquals(
      result.fallbackReason,
      undefined,
      `${testCase.toolName} fallback`,
    );
  }
});

Deno.test("classifyToolCallL2 - fallback for uncertainty per supported tool", () => {
  const fallbackCases: Array<
    { toolName: string; args: Record<string, unknown> }
  > = [
    { toolName: "exec", args: {} },
    { toolName: "process", args: { action: "custom" } },
    { toolName: "read", args: {} },
    { toolName: "edit", args: { path: "/tmp/file.ts" } },
    { toolName: "write", args: {} },
    { toolName: "browser", args: { action: "teleport" } },
    { toolName: "web_fetch", args: {} },
    { toolName: "cron", args: { action: "patch-all" } },
    { toolName: "message", args: { action: "send" } },
    { toolName: "memory_search", args: {} },
    { toolName: "sessions_spawn", args: { label: "only-label" } },
    { toolName: "web_search", args: {} },
    { toolName: "gateway", args: { action: "noop" } },
    { toolName: "subagents", args: { action: "reroute" } },
    { toolName: "image", args: {} },
    { toolName: "sessions_send", args: { message: "x" } },
    { toolName: "sessions_history", args: {} },
    { toolName: "session_status", args: { model: 42 } },
    { toolName: "sessions_list", args: { kinds: "agent" } },
    { toolName: "memory_get", args: {} },
    { toolName: "pdf", args: {} },
    { toolName: "tts", args: {} },
    { toolName: "whatsapp_login", args: { action: "noop" } },
  ];

  for (const testCase of fallbackCases) {
    const result = classifyToolCallL2(testCase.toolName, testCase.args);
    assertEquals(
      result.family,
      null,
      `${testCase.toolName} family should fallback`,
    );
    assertEquals(result.hit, false, `${testCase.toolName} should fallback`);
    assert(
      result.fallbackReason !== undefined,
      `${testCase.toolName} fallback reason`,
    );
  }
});

Deno.test("classifyToolCallL2 - project paths stay checkout-agnostic", () => {
  const current = classifyToolCallL2("read", {
    file_path: CURRENT_PROJECT_README,
  });
  const legacy = classifyToolCallL2("read", {
    file_path: ALTERNATE_CHECKOUT_README,
  });

  assertEquals(current.family, "project_abs:file_path");
  assertEquals(current.hit, true);
  assertEquals(legacy.family, "project_abs:file_path");
  assertEquals(legacy.hit, true);
});

Deno.test("classifyToolCallL2 - exec normalization captures wrappers and primary binary", () => {
  const result = classifyToolCallL2("exec", {
    command: 'timeout 60 env DEBUG=1 bash -lc "curl -s https://example.com"',
  });

  assertEquals(result.family, "network_http");
  assertEquals(result.hit, true);
  assertEquals(result.context, {
    normalizedCommand:
      'timeout 60 env DEBUG=1 bash -lc "curl -s https://example.com"',
    wrappers: ["timeout", "env", "bash -lc"],
    primaryBinary: "curl",
  });
});

Deno.test("policy exports supported tool registry", () => {
  assertEquals(isToolPolicySupported("exec"), true);
  assertEquals(isToolPolicySupported("unknown_tool"), false);
  assert(SUPPORTED_TOOL_POLICIES.length >= 19);
});

Deno.test("classifyToolFamily wrapper returns only family", () => {
  assertEquals(
    classifyToolFamily("exec", { command: "git status" }),
    "git_vcs",
  );
  assertEquals(classifyToolFamily("unknown_tool", {}), null);
});
