// Factory for vault storage (Deno KV backend).

export type { NoteRow, TraceRow, IVaultStore } from "./types.ts";

/**
 * Open a vault KV store at the given path.
 * path === ":memory:" → opens an in-memory KV instance (for tests).
 */
export async function openVaultStore(
  path: string,
): Promise<import("./types.ts").IVaultStore> {
  const { VaultKV } = await import("./store-kv.ts");
  return VaultKV.open(path);
}
