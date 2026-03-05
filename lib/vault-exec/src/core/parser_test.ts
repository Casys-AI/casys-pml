import { assertEquals } from "jsr:@std/assert";
import {
  extractWikilinks,
  parseNote,
  parseVault,
  shouldIgnoreNoteFilename,
} from "./parser.ts";

Deno.test("extractWikilinks - extracts [[links]] from markdown body", () => {
  const body = "Depends on: [[Define Path]]\nUsed by: [[Generate Report]]";
  const links = extractWikilinks(body);
  assertEquals(links, ["Define Path", "Generate Report"]);
});

Deno.test("extractWikilinks - no duplicates", () => {
  const body = "See [[Foo]] and also [[Foo]] again";
  const links = extractWikilinks(body);
  assertEquals(links, ["Foo"]);
});

Deno.test("extractWikilinks - empty when no links", () => {
  const body = "No links here.";
  const links = extractWikilinks(body);
  assertEquals(links, []);
});

Deno.test("parseNote - parses frontmatter and body", () => {
  const raw = `---
value: 42
outputs:
  - output
---

# My Note

Some body text.

Depends on: [[Other Note]]`;

  const note = parseNote("My Note.md", raw);
  assertEquals(note.name, "My Note");
  assertEquals(note.frontmatter.value, 42);
  assertEquals((note.frontmatter.outputs as string[])[0], "output");
  assertEquals(note.wikilinks, ["Other Note"]);
  assertEquals(note.body.includes("Some body text"), true);
});

Deno.test("parseNote - handles missing frontmatter", () => {
  const raw = `# Just a note

With [[A Link]] in it.`;

  const note = parseNote("Just a note.md", raw);
  assertEquals(note.name, "Just a note");
  assertEquals(note.frontmatter, {});
  assertEquals(note.wikilinks, ["A Link"]);
});

Deno.test("shouldIgnoreNoteFilename - matches draft placeholders", () => {
  assertEquals(shouldIgnoreNoteFilename("Sans titre.md"), true);
  assertEquals(shouldIgnoreNoteFilename("Sans titre 7.md"), true);
  assertEquals(shouldIgnoreNoteFilename("Untitled.md"), true);
  assertEquals(shouldIgnoreNoteFilename("Untitled 3.md"), true);
  assertEquals(shouldIgnoreNoteFilename("Read Config.md"), false);
});

Deno.test("parseVault - skips draft placeholder notes", async () => {
  const calls: string[] = [];
  const reader = {
    async listNotes(_dir: string): Promise<string[]> {
      return [
        "/tmp/vault/Sans titre.md",
        "/tmp/vault/Untitled 2.md",
        "/tmp/vault/Real Note.md",
      ];
    },
    async readNote(path: string): Promise<string> {
      calls.push(path);
      if (path.includes("Sans titre") || path.includes("Untitled")) {
        throw new Error("draft note should not be read");
      }
      return `---
value: 1
outputs:
  - output
---

content`;
    },
  };

  const notes = await parseVault(reader, "/tmp/vault");
  assertEquals(notes.map((n) => n.name), ["Real Note"]);
  assertEquals(calls, ["/tmp/vault/Real Note.md"]);
});
