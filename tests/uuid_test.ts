/**
 * UUID v7 Tests
 *
 * @module utils/uuid_test
 */

import { assertEquals, assertMatch } from "@std/assert";
import { uuidv7, extractTimestamp } from "../src/utils/uuid.ts";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

Deno.test("uuidv7 - generates valid UUID v7 format", () => {
  const uuid = uuidv7();
  assertMatch(uuid, UUID_REGEX);
});

Deno.test("uuidv7 - version is 7", () => {
  const uuid = uuidv7();
  assertEquals(uuid[14], "7");
});

Deno.test("uuidv7 - variant is RFC 4122", () => {
  const uuid = uuidv7();
  const variantChar = uuid[19];
  assertEquals(["8", "9", "a", "b"].includes(variantChar), true);
});

Deno.test("uuidv7 - generates unique UUIDs", () => {
  const uuids = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    uuids.add(uuidv7());
  }
  assertEquals(uuids.size, 1000);
});

Deno.test("uuidv7 - is chronologically sortable", () => {
  const uuid1 = uuidv7();
  // Small delay to ensure different timestamp
  const start = Date.now();
  while (Date.now() - start < 2) { /* busy wait 2ms */ }
  const uuid2 = uuidv7();

  // UUID v7 should sort chronologically as strings
  assertEquals(uuid1 < uuid2, true);
});

Deno.test("extractTimestamp - extracts timestamp from UUID v7", () => {
  const before = Date.now();
  const uuid = uuidv7();
  const after = Date.now();

  const timestamp = extractTimestamp(uuid);
  assertEquals(timestamp !== null, true);
  assertEquals(timestamp!.getTime() >= before, true);
  assertEquals(timestamp!.getTime() <= after, true);
});

Deno.test("extractTimestamp - returns null for invalid UUID", () => {
  assertEquals(extractTimestamp("not-a-uuid"), null);
  assertEquals(extractTimestamp("00000000-0000-0000-0000-000000000000"), null);
});

Deno.test("extractTimestamp - returns null for UUID v4", () => {
  // UUID v4 has version 4, not 7
  const uuidv4 = "550e8400-e29b-41d4-a716-446655440000";
  assertEquals(extractTimestamp(uuidv4), null);
});
