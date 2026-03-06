import { assertEquals } from "jsr:@std/assert";
import {
  isServiceMethod,
  isServiceRequest,
  isServiceResponse,
  isSyncResponse,
} from "./protocol.ts";

Deno.test("isServiceMethod accepts only supported RPC methods", () => {
  assertEquals(isServiceMethod("status"), true);
  assertEquals(isServiceMethod("sync"), true);
  assertEquals(isServiceMethod("stop"), true);
  assertEquals(isServiceMethod("restart"), false);
  assertEquals(isServiceMethod(123), false);
});

Deno.test("isServiceRequest validates request envelope", () => {
  assertEquals(isServiceRequest({ id: "abc", method: "status" }), true);
  assertEquals(isServiceRequest({ id: "", method: "status" }), false);
  assertEquals(isServiceRequest({ id: "abc", method: "restart" }), false);
  assertEquals(isServiceRequest({ id: "abc" }), false);
  assertEquals(isServiceRequest(null), false);
});

Deno.test("isSyncResponse validates sync response contract", () => {
  assertEquals(
    isSyncResponse({
      ok: true,
      tracesUsed: 4,
      notesReindexed: 1,
      gruTrained: false,
      gruAccuracy: 0,
      gnnUpdated: true,
      traceSourcesConfigured: 2,
      traceFilesChanged: 1,
      traceFilesUnchanged: 3,
      traceSessionsImported: 1,
      traceToolCallsStored: 7,
      traceWarnings: [],
    }),
    true,
  );
  assertEquals(
    isSyncResponse({
      ok: false,
      tracesUsed: 0,
      notesReindexed: 0,
      gruTrained: false,
      gruAccuracy: 0,
      gnnUpdated: false,
      traceSourcesConfigured: 0,
      traceFilesChanged: 0,
      traceFilesUnchanged: 0,
      traceSessionsImported: 0,
      traceToolCallsStored: 0,
      traceWarnings: [],
      error: "failed",
    }),
    true,
  );
  assertEquals(
    isSyncResponse({
      ok: false,
      tracesUsed: 0,
      notesReindexed: 0,
      gruTrained: false,
      gruAccuracy: 0,
      gnnUpdated: false,
      traceSourcesConfigured: 0,
      traceFilesChanged: 0,
      traceFilesUnchanged: 0,
      traceSessionsImported: 0,
      traceToolCallsStored: 0,
      traceWarnings: [],
    }),
    false,
  );
  assertEquals(
    isSyncResponse({
      ok: true,
      tracesUsed: "4",
      notesReindexed: 1,
      gruTrained: false,
      gruAccuracy: 0,
      gnnUpdated: true,
      traceSourcesConfigured: 2,
      traceFilesChanged: 1,
      traceFilesUnchanged: 3,
      traceSessionsImported: 1,
      traceToolCallsStored: 7,
      traceWarnings: [],
    }),
    false,
  );
});

Deno.test("isServiceResponse validates success and error envelopes", () => {
  assertEquals(
    isServiceResponse({
      id: "req-1",
      ok: true,
      result: { stopped: true },
    }),
    true,
  );
  assertEquals(
    isServiceResponse({ id: "req-1", ok: false, error: "boom" }),
    true,
  );
  assertEquals(
    isServiceResponse({ id: "req-1", ok: false }),
    false,
  );
  assertEquals(
    isServiceResponse({ id: "req-1", ok: true }),
    false,
  );
});
