import { assertEquals } from "jsr:@std/assert";
import { classifyToolFamily } from "./families.ts";

Deno.test("classifyToolFamily - exec families", () => {
  assertEquals(classifyToolFamily("exec", { command: "git status" }), "git");
  assertEquals(classifyToolFamily("exec", { cmd: "gh pr view 123" }), "gh");
  assertEquals(
    classifyToolFamily("exec", { command: "python -m pytest" }),
    "python",
  );
  assertEquals(classifyToolFamily("exec", { command: "docker ps" }), "docker");
  assertEquals(classifyToolFamily("exec", { command: "deno test" }), "deno");
  assertEquals(
    classifyToolFamily("exec", { command: "openclaw status" }),
    "openclaw",
  );
  assertEquals(
    classifyToolFamily("exec", { command: "ls -la" }),
    "shell-utils",
  );
});

Deno.test("classifyToolFamily - write families", () => {
  assertEquals(
    classifyToolFamily("write", {
      file_path: "plan.md",
      content: "# Title\nBody",
    }),
    "markdown",
  );
  assertEquals(
    classifyToolFamily("write", {
      file_path: "conf.yaml",
      content: "key: value",
    }),
    "yaml",
  );
  assertEquals(
    classifyToolFamily("write", {
      file_path: "payload.json",
      content: '{"a":1}',
    }),
    "json",
  );
  assertEquals(
    classifyToolFamily("write", {
      file_path: "script.sh",
      content: "#!/usr/bin/env bash\necho ok",
    }),
    "script",
  );
  assertEquals(
    classifyToolFamily("write", { file_path: "note.txt", content: "hello" }),
    "other",
  );
});

Deno.test("classifyToolFamily - other tools return null", () => {
  assertEquals(classifyToolFamily("read", { file_path: "README.md" }), null);
});
