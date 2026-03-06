import { assertEquals } from "jsr:@std/assert";
import {
  parseRuntimeInputsArg,
  type RuntimeInputParseResult,
  toInputParseErrorDetails,
} from "./input-contract.ts";

function assertParseFailure(
  result: RuntimeInputParseResult,
  expected: {
    source: "file" | "inline_json";
    code: "INPUT_FILE_READ_ERROR" | "INPUT_JSON_PARSE_ERROR";
  },
): void {
  assertEquals(result.ok, false);
  if (result.ok) {
    throw new Error("Expected parse failure");
  }
  assertEquals(result.source, expected.source);
  assertEquals(result.code, expected.code);
}

Deno.test("parseRuntimeInputsArg: empty input returns empty payload", async () => {
  const result = await parseRuntimeInputsArg();
  assertEquals(result, {
    ok: true,
    source: "empty",
    payload: {},
  });
});

Deno.test("parseRuntimeInputsArg: inline JSON payload", async () => {
  const result = await parseRuntimeInputsArg('{"count": 2}');
  assertEquals(result, {
    ok: true,
    source: "inline_json",
    payload: { count: 2 },
  });
});

Deno.test("parseRuntimeInputsArg: @file loads JSON", async () => {
  const tmp = await Deno.makeTempFile({ suffix: ".json" });
  await Deno.writeTextFile(tmp, '{"mode": "strict"}');

  const result = await parseRuntimeInputsArg(`@${tmp}`);
  assertEquals(result, {
    ok: true,
    source: "file",
    payload: { mode: "strict" },
  });

  await Deno.remove(tmp);
});

Deno.test("parseRuntimeInputsArg: @file missing is deterministic file error", async () => {
  const uniqueMissing =
    `/tmp/vault-exec-missing-${crypto.randomUUID()}-inputs.json`;
  const result = await parseRuntimeInputsArg(
    `@${uniqueMissing}`,
  );
  assertParseFailure(result, {
    source: "file",
    code: "INPUT_FILE_READ_ERROR",
  });
});

Deno.test("parseRuntimeInputsArg: existing file with invalid JSON returns JSON parse error", async () => {
  const tmp = await Deno.makeTempFile({ suffix: ".txt" });
  await Deno.writeTextFile(tmp, "not json");

  const result = await parseRuntimeInputsArg(tmp);
  assertParseFailure(result, {
    source: "file",
    code: "INPUT_JSON_PARSE_ERROR",
  });

  await Deno.remove(tmp);
});

Deno.test("parseRuntimeInputsArg: invalid inline JSON returns parse error", async () => {
  const result = await parseRuntimeInputsArg("not-json");
  assertParseFailure(result, {
    source: "inline_json",
    code: "INPUT_JSON_PARSE_ERROR",
  });
});

Deno.test("parseRuntimeInputsArg: non-object JSON payload is rejected", async () => {
  const result = await parseRuntimeInputsArg("[]");
  assertEquals(result.ok, false);
  if (result.ok) {
    throw new Error("Expected parse failure");
  }
  assertEquals(result.source, "inline_json");
  assertEquals(result.code, "INPUT_JSON_PARSE_ERROR");
  assertEquals(result.details?.received_type, "array");
});

Deno.test("toInputParseErrorDetails: preserves machine-first parse contract", () => {
  const details = toInputParseErrorDetails("not-json", {
    ok: false,
    source: "inline_json",
    code: "INPUT_JSON_PARSE_ERROR",
    message: "Unexpected token",
    details: { hint: "Use JSON object" },
  });

  assertEquals(details, {
    inputs: "not-json",
    source: "inline_json",
    parse_code: "INPUT_JSON_PARSE_ERROR",
    hint: "Use JSON object",
  });
});
