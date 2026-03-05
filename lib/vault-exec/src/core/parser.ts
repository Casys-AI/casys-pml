import { parse as parseYaml } from "jsr:@std/yaml";
import type { VaultNote, VaultReader } from "./types.ts";

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const DRAFT_NOTE_NAME_RE = /^(sans titre|untitled)(?: \d+)?$/i;

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

/** Ignore editor draft placeholders that are not executable notes. */
export function shouldIgnoreNoteFilename(filename: string): boolean {
  const name = filename.replace(/\.md$/i, "").trim();
  return DRAFT_NOTE_NAME_RE.test(name);
}

/** Parse all .md files in a vault directory */
export async function parseVault(
  reader: VaultReader,
  dir: string,
): Promise<VaultNote[]> {
  const files = await reader.listNotes(dir);
  const notes: VaultNote[] = [];
  for (const file of files) {
    const filename = file.split("/").pop() ?? file;
    if (shouldIgnoreNoteFilename(filename)) continue;
    const raw = await reader.readNote(file);
    const note = parseNote(filename, raw);
    note.path = file; // preserve full path for in-place writes
    notes.push(note);
  }
  return notes;
}
