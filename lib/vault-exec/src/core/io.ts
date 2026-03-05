import type { VaultReader } from "./types.ts";

export interface VaultWriter {
  writeNote(path: string, content: string): Promise<void>;
}
