import { assertEquals } from "jsr:@std/assert";
import { errorJson, eventJson } from "./output.ts";

Deno.test("eventJson uses explicit type/version and deterministic key order", () => {
  const json = eventJson("intent_candidate", {
    z_field: 2,
    a_field: { b: 2, a: 1 },
  });

  assertEquals(
    json,
    '{"version":"ax.v1","type":"intent_candidate","a_field":{"a":1,"b":2},"z_field":2}',
  );
});

Deno.test("errorJson emits machine-readable error shape", () => {
  const json = errorJson({
    code: "INPUT_VALIDATION_ERROR",
    category: "validation",
    message: "Runtime input validation failed",
    details: {
      expected_schema: { type: "object" },
    },
  });

  assertEquals(
    json,
    '{"version":"ax.v1","type":"error","category":"validation","code":"INPUT_VALIDATION_ERROR","details":{"expected_schema":{"type":"object"}},"message":"Runtime input validation failed"}',
  );
});
