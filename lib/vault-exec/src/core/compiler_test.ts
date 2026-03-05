import { assertEquals, assertRejects } from "jsr:@std/assert";
import {
  compileNote,
  needsCompilation,
  reconstructNote,
  validateFrontmatter,
} from "./compiler.ts";
import type { VaultNote } from "./types.ts";
import type { LLMClient } from "./compiler.ts";

function makeNote(
  name: string,
  fm: Record<string, unknown>,
  body: string,
  wikilinks: string[] = [],
): VaultNote {
  return { path: `${name}.md`, name, body, frontmatter: fm, wikilinks };
}

Deno.test("needsCompilation - true when no compiled_at", () => {
  const note = makeNote("A", {}, "Some text");
  assertEquals(needsCompilation(note), true);
});

Deno.test("needsCompilation - false when compiled_at exists", () => {
  const note = makeNote(
    "A",
    { compiled_at: "2026-03-04T00:00:00Z" },
    "Some text",
  );
  assertEquals(needsCompilation(note), false);
});

Deno.test("needsCompilation - false when compiled_at is non-empty string", () => {
  const note = makeNote(
    "A",
    { compiled_at: "2026-01-01T00:00:00.000Z" },
    "Body",
  );
  assertEquals(needsCompilation(note), false);
});

Deno.test("reconstructNote - combines frontmatter and body", () => {
  const result = reconstructNote("# My Note\n\nSome body.", {
    value: 42,
    outputs: ["output"],
  });
  assertEquals(result.startsWith("---\n"), true);
  assertEquals(result.includes("value: 42"), true);
  assertEquals(result.includes("# My Note"), true);
  assertEquals(result.endsWith("Some body.\n"), true);
});

Deno.test("reconstructNote - frontmatter block is valid YAML-fenced", () => {
  const result = reconstructNote("Body text.", {
    type: "value",
    value: "hello",
  });
  // Must open with --- and close with --- before body
  const lines = result.split("\n");
  assertEquals(lines[0], "---");
  const closingDash = lines.findIndex((l: string, i: number) =>
    i > 0 && l === "---"
  );
  assertEquals(closingDash > 1, true);
});

Deno.test("compileNote - uses LLM response as frontmatter", async () => {
  const mockLLM: LLMClient = {
    async chat(_system: string, _user: string): Promise<string> {
      return `value: "/etc/config.json"
outputs:
  - output
compiled_at: "2026-03-04T12:00:00Z"`;
    },
  };

  const note = makeNote("Define Path", {}, "The path to the config file.", []);
  const allNotes = [note];
  const result = await compileNote(note, allNotes, mockLLM);

  assertEquals(result.value, "/etc/config.json");
  assertEquals((result.outputs as string[])[0], "output");
  assertEquals(result.compiled_at, "2026-03-04T12:00:00Z");
  assertEquals(result.node_type, "value");
  assertEquals((result.tags as string[]).includes("type:value"), true);
});

Deno.test("compileNote - handles LLM response with markdown fences", async () => {
  const mockLLM: LLMClient = {
    async chat(_system: string, _user: string): Promise<string> {
      return '```yaml\nvalue: 42\noutputs:\n  - output\ncompiled_at: "2026-03-04T12:00:00Z"\n```';
    },
  };

  const note = makeNote("A", {}, "A value note.", []);
  const result = await compileNote(note, [note], mockLLM);
  assertEquals(result.value, 42);
});

Deno.test("compileNote - handles LLM response with plain backtick fences", async () => {
  const mockLLM: LLMClient = {
    async chat(_system: string, _user: string): Promise<string> {
      return '```\nvalue: true\noutputs:\n  - flag\ncompiled_at: "2026-03-04T12:00:00Z"\n```';
    },
  };

  const note = makeNote("B", {}, "A flag.", []);
  const result = await compileNote(note, [note], mockLLM);
  assertEquals(result.value, true);
  assertEquals((result.outputs as string[])[0], "flag");
  assertEquals((result.tags as string[]).includes("type:value"), true);
});

Deno.test("compileNote - adds compiled_at if LLM omits it", async () => {
  const mockLLM: LLMClient = {
    async chat(_system: string, _user: string): Promise<string> {
      return `value: 99\noutputs:\n  - output`;
    },
  };

  const note = makeNote("C", {}, "A number.", []);
  const result = await compileNote(note, [note], mockLLM);
  assertEquals(typeof result.compiled_at, "string");
  assertEquals((result.compiled_at as string).length > 0, true);
});

Deno.test("compileNote - throws on invalid YAML from LLM", async () => {
  const mockLLM: LLMClient = {
    async chat(_system: string, _user: string): Promise<string> {
      return "this is: not: valid: yaml: at: all: [broken";
    },
  };

  const note = makeNote("D", {}, "Something.", []);
  await assertRejects(
    () => compileNote(note, [note], mockLLM),
    Error,
  );
});

Deno.test("compileNote - code node frontmatter parsed correctly", async () => {
  const mockLLM: LLMClient = {
    async chat(_system: string, _user: string): Promise<string> {
      return `inputs:
  data: "{{Define Path.output}}"
code: "data.filter(item => item.active)"
outputs:
  - result
compiled_at: "2026-03-04T12:00:00Z"`;
    },
  };

  const dep = makeNote(
    "Define Path",
    {
      value: "/etc/config.json",
      outputs: ["output"],
      compiled_at: "2026-03-04T00:00:00Z",
    },
    "The config path.",
  );
  const note = makeNote(
    "Filter Active",
    {},
    "Filter active items from [[Define Path]].",
    [
      "Define Path",
    ],
  );

  const result = await compileNote(note, [dep, note], mockLLM);

  assertEquals(result.code, "data.filter(item => item.active)");
  assertEquals(
    (result.inputs as Record<string, string>).data,
    "{{Define Path.output}}",
  );
  assertEquals((result.outputs as string[])[0], "result");
  assertEquals(result.node_type, "code");
  assertEquals((result.tags as string[]).includes("type:code"), true);
});

Deno.test("compileNote - preserves existing tags and does not duplicate type tag", async () => {
  const mockLLM: LLMClient = {
    async chat(_system: string, _user: string): Promise<string> {
      return `value: 7
outputs:
  - output
tags:
  - analytics
  - type:value
compiled_at: "2026-03-04T12:00:00Z"`;
    },
  };

  const note = makeNote("Tagged Note", {}, "A tagged value note.", []);
  const result = await compileNote(note, [note], mockLLM);

  const tags = result.tags as string[];
  assertEquals(tags.includes("analytics"), true);
  assertEquals(tags.filter((tag) => tag === "type:value").length, 1);
});

Deno.test("validateFrontmatter - accepts tool payload as valid node type", () => {
  const fm = {
    node_type: "tool",
    tool: "crm.lookup_contact",
    outputs: ["result"],
    input_schema: {
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    },
  };
  const errors = validateFrontmatter(fm, []);
  assertEquals(errors, []);
});

Deno.test("validateFrontmatter - allows runtime input references", () => {
  const source = makeNote(
    "CRM - Inbox-to-CRM",
    {
      node_type: "code",
      code: "rawSubject.length + rawSender.length",
      inputs: {
        rawSubject: "{{input.raw_subject}}",
        rawSender: "{{inputs.raw_sender}}",
      },
      outputs: ["score"],
    },
    "Build a score from runtime vars.",
  );

  const errors = validateFrontmatter(source.frontmatter, [source]);
  assertEquals(errors, []);
});

Deno.test("validateFrontmatter - requires node_type field", () => {
  const fm = {
    value: 42,
    outputs: ["output"],
  };
  const errors = validateFrontmatter(fm, []);
  assertEquals(
    errors.includes(
      `Missing "node_type" field — expected one of: value | code | tool.`,
    ),
    true,
  );
});

Deno.test("validateFrontmatter - rejects node_type mismatch with payload", () => {
  const fm = {
    node_type: "value",
    code: "x + 1",
    outputs: ["result"],
  };
  const errors = validateFrontmatter(fm, []);
  assertEquals(
    errors.includes(
      `node_type "value" does not match payload type "code".`,
    ),
    true,
  );
});
