import { assertEquals } from "jsr:@std/assert";
import {
  closeBlasAcceleration,
  getBlasStatus,
  initBlasAcceleration,
  isBlasAvailable,
} from "./blas-ffi.ts";

Deno.test("BLAS init is explicit and teardown resets status", () => {
  closeBlasAcceleration();
  assertEquals(isBlasAvailable(), false);
  assertEquals(getBlasStatus().available, false);

  const ready = initBlasAcceleration();
  assertEquals(isBlasAvailable(), ready);
  assertEquals(getBlasStatus().available, ready);

  closeBlasAcceleration();
  assertEquals(isBlasAvailable(), false);
  assertEquals(getBlasStatus().available, false);
});
