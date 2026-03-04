import { parse as parseYaml } from "jsr:@std/yaml";
import type { VaultNote, VaultReader } from "./types.ts";

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/** Extract unique [[wikilinks]] from markdown text */
export function extractWikilinks(text: string): string[] {
  const links = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(text)) !== null) {
    links.add(match[1]);
  }
  return [...links];
}

/** Parse a single .md file into a VaultNote */
export function parseNote(filename: string, raw: string): VaultNote {
  const name = filename.replace(/\.md$/, "");
  const fmMatch = raw.match(FRONTMATTER_RE);

  let frontmatter: Record<string, unknown> = {};
  let body: string;

  if (fmMatch) {
    try {
      frontmatter = (parseYaml(fmMatch[1]) as Record<string, unknown>) ?? {};
    } catch {
      frontmatter = {};
    }
    body = fmMatch[2];
  } else {
    body = raw;
  }

  const wikilinks = extractWikilinks(body);

  return { path: filename, name, body, frontmatter, wikilinks };
}

/** Parse all .md files in a vault directory */
export async function parseVault(reader: VaultReader, dir: string): Promise<VaultNote[]> {
  const files = await reader.listNotes(dir);
  const notes: VaultNote[] = [];
  for (const file of files) {
    const raw = await reader.readNote(file);
    notes.push(parseNote(file.split("/").pop()!, raw));
  }
  return notes;
}
