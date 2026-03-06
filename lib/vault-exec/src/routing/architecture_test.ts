import { assertEquals } from "jsr:@std/assert";

Deno.test("routing architecture: legacy intent-llm facade is removed", async () => {
  const legacy = new URL("./intent-llm.ts", import.meta.url);
  let exists = false;
  try {
    await Deno.stat(legacy);
    exists = true;
  } catch {
    exists = false;
  }

  assertEquals(
    exists,
    false,
    "Expected src/routing/intent-llm.ts to be removed (GRU + candidate policy is the routing entrypoint).",
  );
});
