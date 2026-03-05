// Factory for vault storage (Deno KV backend).

export type { IVaultStore, NoteRow, TraceRow } from "../core/types.ts";

/**
 * Open a vault KV store at the given path.
 * path === ":memory:" → opens an in-memory KV instance (for tests).
 */
export async function openVaultStore(
  path: string,
): Promise<import("../core/types.ts").IVaultStore> {
  const { VaultKV } = await import("./store-kv.ts");
  return VaultKV.open(path);
}
