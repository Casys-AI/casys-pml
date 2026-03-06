import { assertEquals } from "jsr:@std/assert";
import { classifyToolFamily } from "./policy/tool-family.ts";

Deno.test("classifyToolFamily wrapper - exec and write", () => {
  assertEquals(
    classifyToolFamily("exec", { command: "git status --short" }),
    "git_vcs",
  );
  assertEquals(
    classifyToolFamily("write", { file_path: "note.md", content: "x" }),
    "relative:file_path",
  );
});

Deno.test("classifyToolFamily wrapper - unknown tool", () => {
  assertEquals(classifyToolFamily("unknown_tool", { path: "x" }), null);
});
