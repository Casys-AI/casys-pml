import { assertEquals, assertMatch } from "jsr:@std/assert";

import { buildOpenClawFixture } from "./test-fixtures.ts";
import {
  loadSourceScanState,
  resolveSourceScanStatePath,
  saveSourceScanState,
  scanSourceFilesForChanges,
} from "./source-state.ts";

Deno.test("loadSourceScanState - missing state returns empty snapshot map", async () => {
  const vaultPath = await Deno.makeTempDir();
  try {
    const state = await loadSourceScanState(vaultPath);
    assertEquals(state, { version: 1, files: {} });
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});

Deno.test("saveSourceScanState + loadSourceScanState - roundtrip", async () => {
  const vaultPath = await Deno.makeTempDir();
  try {
    const state = {
      version: 1 as const,
      files: {
        "/tmp/example.jsonl": {
          path: "/tmp/example.jsonl",
          size: 12,
          mtimeMs: 123,
          contentHash: "abc",
          sessionId: "example",
          importedAt: "2026-03-06T00:00:00.000Z",
          status: "imported" as const,
        },
      },
    };

    await saveSourceScanState(vaultPath, state);

    assertEquals(await loadSourceScanState(vaultPath), state);
    assertEquals(
      resolveSourceScanStatePath(vaultPath),
      `${vaultPath}/.vault-exec/trace-source-state.json`,
    );
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
  }
});

Deno.test("scanSourceFilesForChanges - captures file metadata and session id", async () => {
  const vaultPath = await Deno.makeTempDir();
  const sourcePath = await Deno.makeTempDir();
  try {
    const filePath = `${sourcePath}/abcd1234-0000.jsonl`;
    await Deno.writeTextFile(filePath, buildOpenClawFixture());

    const result = await scanSourceFilesForChanges(sourcePath, {
      version: 1,
      files: {},
    });

    assertEquals(result.changed.length, 1);
    assertEquals(result.unchanged.length, 0);
    assertEquals(result.changed[0].path, filePath);
    assertEquals(result.changed[0].sessionId, "abcd1234-0000");
    assertEquals(result.changed[0].status, "pending");
    assertEquals(typeof result.changed[0].size, "number");
    assertEquals(result.changed[0].size > 0, true);
    assertEquals(typeof result.changed[0].mtimeMs, "number");
    assertMatch(result.changed[0].contentHash, /^[a-f0-9]{64}$/);
  } finally {
    await Deno.remove(vaultPath, { recursive: true });
    await Deno.remove(sourcePath, { recursive: true });
  }
});

Deno.test("scanSourceFilesForChanges - marks modified files as changed", async () => {
  const sourcePath = await Deno.makeTempDir();
  try {
    const filePath = `${sourcePath}/session-a.jsonl`;
    await Deno.writeTextFile(filePath, buildOpenClawFixture());

    const first = await scanSourceFilesForChanges(sourcePath, {
      version: 1,
      files: {},
    });
    const baseline = first.nextState.files[filePath];
    const previousState = {
      version: 1 as const,
      files: {
        [filePath]: {
          ...baseline,
          importedAt: "2026-03-06T01:00:00.000Z",
          status: "imported" as const,
        },
      },
    };

    await Deno.writeTextFile(
      filePath,
      buildOpenClawFixture({ assistantText: "changed" }),
    );

    const second = await scanSourceFilesForChanges(sourcePath, previousState);
    assertEquals(second.changed.length, 1);
    assertEquals(second.unchanged.length, 0);
    assertEquals(second.changed[0].path, filePath);
    assertEquals(second.changed[0].status, "pending");
    assertEquals(second.changed[0].importedAt, null);
    assertEquals(
      second.changed[0].contentHash === previousState.files[filePath].contentHash,
      false,
    );
  } finally {
    await Deno.remove(sourcePath, { recursive: true });
  }
});

Deno.test("scanSourceFilesForChanges - keeps unchanged files skipped", async () => {
  const sourcePath = await Deno.makeTempDir();
  try {
    const filePath = `${sourcePath}/session-b.jsonl`;
    await Deno.writeTextFile(filePath, buildOpenClawFixture());

    const first = await scanSourceFilesForChanges(sourcePath, {
      version: 1,
      files: {},
    });
    const previousState = {
      version: 1 as const,
      files: {
        [filePath]: {
          ...first.nextState.files[filePath],
          importedAt: "2026-03-06T01:00:00.000Z",
          status: "imported" as const,
        },
      },
    };

    const second = await scanSourceFilesForChanges(sourcePath, previousState);
    assertEquals(second.changed.length, 0);
    assertEquals(second.unchanged.length, 1);
    assertEquals(second.unchanged[0].path, filePath);
    assertEquals(second.unchanged[0].status, "imported");
    assertEquals(second.unchanged[0].importedAt, "2026-03-06T01:00:00.000Z");
  } finally {
    await Deno.remove(sourcePath, { recursive: true });
  }
});

Deno.test("buildOpenClawFixture - supports BOM, CRLF and truncated variants", () => {
  const fixture = buildOpenClawFixture({
    bom: true,
    lineEnding: "crlf",
    truncated: true,
  });

  assertEquals(fixture.startsWith("\uFEFF"), true);
  assertEquals(fixture.includes("\r\n"), true);
  assertEquals(fixture.endsWith("\n"), false);
});
