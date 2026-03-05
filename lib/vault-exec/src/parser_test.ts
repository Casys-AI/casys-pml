import { assertEquals } from "jsr:@std/assert";
import { parseNote, extractWikilinks } from "./parser.ts";

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
