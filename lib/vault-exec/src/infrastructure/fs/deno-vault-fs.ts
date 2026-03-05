import type { VaultReader } from "../../core/types.ts";
import type { VaultWriter } from "../../core/io.ts";

export class DenoVaultWriter implements VaultWriter {
  async writeNote(path: string, content: string): Promise<void> {
    await Deno.writeTextFile(path, content);
  }
}

export class DenoVaultReader implements VaultReader {
  private static readonly SKIP_DIRS = new Set([
    ".vault-exec",
    ".vault-exec-backup",
    ".obsidian",
    "node_modules",
    ".git",
    "_drafts",
  ]);

  private async collectMarkdownFiles(
    dir: string,
    out: string[],
  ): Promise<void> {
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        if (
          entry.name.startsWith(".") ||
          DenoVaultReader.SKIP_DIRS.has(entry.name)
        ) {
          continue;
        }
        await this.collectMarkdownFiles(path, out);
        continue;
      }
      if (entry.isFile && entry.name.toLowerCase().endsWith(".md")) {
        out.push(path);
      }
    }
  }

  async listNotes(dir: string): Promise<string[]> {
    const files: string[] = [];
    await this.collectMarkdownFiles(dir, files);
    return files.sort();
  }

  async readNote(path: string): Promise<string> {
    return await Deno.readTextFile(path);
  }
}
