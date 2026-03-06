import type { VaultReader, VaultWriter } from "../../core/contracts.ts";

export class DenoVaultWriter implements VaultWriter {
  async writeNote(path: string, content: string): Promise<void> {
    const normalized = path.replace(/\\/g, "/");
    const slash = normalized.lastIndexOf("/");
    if (slash > 0) {
      await Deno.mkdir(normalized.slice(0, slash), { recursive: true });
    }
    await Deno.writeTextFile(path, content);
  }
}

export class DenoVaultReader implements VaultReader {
  private static readonly SKIP_DIRS = new Set([
    ".vault-exec",
    ".vault-exec-backup",
    ".obsidian",
    "tool-graph",
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
