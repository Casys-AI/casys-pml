import type { VaultReader } from "./types.ts";

export interface VaultWriter {
  writeNote(path: string, content: string): Promise<void>;
}

export class DenoVaultWriter implements VaultWriter {
  async writeNote(path: string, content: string): Promise<void> {
    await Deno.writeTextFile(path, content);
  }
}

export class DenoVaultReader implements VaultReader {
  async listNotes(dir: string): Promise<string[]> {
    const files: string[] = [];
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && entry.name.endsWith(".md")) {
        files.push(`${dir}/${entry.name}`);
      }
    }
    return files.sort();
  }

  async readNote(path: string): Promise<string> {
    return await Deno.readTextFile(path);
  }
}
