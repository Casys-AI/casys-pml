import { assertEquals } from "jsr:@std/assert";
import { VaultKV } from "../../db/store-kv.ts";
import { gzipCompress } from "../../utils/compress.ts";
import type { GNNConfig } from "../domain/types.ts";
import { loadOrInitGnnParams, persistGnnParams } from "./runtime-store.ts";

const TEST_CONFIG: GNNConfig = {
  numHeads: 2,
  headDim: 4,
  embDim: 8,
  shareLevelWeights: true,
  leakyReluAlpha: 0.2,
};

Deno.test("loadOrInitGnnParams - initializes and persists when missing", async () => {
  const db = await VaultKV.open(":memory:");
  try {
    const result = await loadOrInitGnnParams(db, TEST_CONFIG, 2);
    assertEquals(result.source, "initialized");
    assertEquals(result.params.levels.size, 3); // maxLevel + 1
    assertEquals((await db.getGnnParams()) !== null, true);
  } finally {
    db.close();
  }
});

Deno.test("loadOrInitGnnParams - loads compatible persisted params", async () => {
  const db = await VaultKV.open(":memory:");
  try {
    const first = await loadOrInitGnnParams(db, TEST_CONFIG, 1);
    first.params.veResidualA.set(0, -0.42);
    await persistGnnParams(db, first.params);

    const second = await loadOrInitGnnParams(db, TEST_CONFIG, 1);
    assertEquals(second.source, "loaded");
    assertEquals(second.params.veResidualA.get(0), -0.42);
  } finally {
    db.close();
  }
});

Deno.test("loadOrInitGnnParams - falls back to init when stored blob is unreadable", async () => {
  const db = await VaultKV.open(":memory:");
  try {
    const unreadable = await gzipCompress(
      new TextEncoder().encode("{not-json"),
    );
    await db.saveGnnParams(unreadable, 0, 0);

    const result = await loadOrInitGnnParams(db, TEST_CONFIG, 1);
    assertEquals(result.source, "initialized");
    assertEquals(result.params.levels.size, 2);
  } finally {
    db.close();
  }
});

Deno.test("loadOrInitGnnParams - falls back to init when config is incompatible", async () => {
  const db = await VaultKV.open(":memory:");
  try {
    await loadOrInitGnnParams(db, TEST_CONFIG, 1);
    const incompatible: GNNConfig = {
      ...TEST_CONFIG,
      headDim: TEST_CONFIG.headDim + 1,
    };

    const result = await loadOrInitGnnParams(db, incompatible, 1);
    assertEquals(result.source, "initialized");
    assertEquals(result.params.headDim, incompatible.headDim);
  } finally {
    db.close();
  }
});
