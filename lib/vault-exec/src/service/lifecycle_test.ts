import { assertEquals } from "jsr:@std/assert";
import {
  cleanupStaleArtifacts,
  getServicePaths,
  stableVaultHash,
} from "./lifecycle.ts";

Deno.test("stableVaultHash is deterministic", async () => {
  const a = await stableVaultHash("/tmp/example-vault");
  const b = await stableVaultHash("/tmp/example-vault/");
  const c = await stableVaultHash("/tmp/another-vault");

  assertEquals(a, b);
  assertEquals(a === c, false);
});

Deno.test("cleanupStaleArtifacts removes stale socket and stale pid", async () => {
  const vaultDir = await Deno.makeTempDir({ prefix: "vault-watch-test-" });
  const paths = await getServicePaths(vaultDir);

  try {
    await Deno.writeTextFile(paths.pidPath, "2147483647\n");
    await Deno.writeTextFile(paths.socketPath, "stale");

    const result = await cleanupStaleArtifacts(paths);
    assertEquals(result.active, false);
    assertEquals(result.removedPid, true);
    assertEquals(result.removedSocket, true);
  } finally {
    await Deno.remove(vaultDir, { recursive: true });
  }
});
