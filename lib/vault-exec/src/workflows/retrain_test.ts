import { assertEquals, assertStringIncludes } from "jsr:@std/assert";

import { LEGACY_RETRAIN_MESSAGE, retrain } from "./retrain.ts";

Deno.test("retrain returns an explicit notebook-first legacy result", async () => {
  const dbPath = `${await Deno.makeTempDir()}/vault.kv`;

  const result = await retrain([], dbPath, null, { verbose: false });

  assertEquals(result.notesReindexed, 0);
  assertEquals(result.gnnUpdated, false);
  assertEquals(result.tracesUsed, 0);
  assertEquals(result.gruTrained, false);
  assertEquals(result.gruAccuracy, 0);
  assertEquals(result.trainingMode, "notebook_first");
  assertEquals(result.message, LEGACY_RETRAIN_MESSAGE);
  assertStringIncludes(result.message, "notebook");
});
