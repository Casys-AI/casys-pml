# vault-exec MVP — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Deno CLI that parses an Obsidian vault, builds a dependency graph from `[[wikilinks]]`, and executes value/code nodes in topological order with variable passing.

**Architecture:** Parser extracts frontmatter + wikilinks from `.md` files → Graph builder creates DAG with cycle detection → Executor resolves `{{variables}}` and runs code expressions in order → CLI wires it all together.

**Tech Stack:** Deno, TypeScript, `@std/yaml` for frontmatter, `deno test` for testing.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `lib/vault-exec/deno.json`
- Create: `lib/vault-exec/src/types.ts`

**Step 1: Create deno.json**

```json
{
  "name": "@casys/vault-exec",
  "version": "0.1.0",
  "tasks": {
    "test": "deno test --allow-read test/",
    "cli": "deno run --allow-read src/cli.ts"
  },
  "compilerOptions": {
    "strict": true
  }
}
```

**Step 2: Create types.ts**

```typescript
/** The three node types in a vault program */
export type NodeType = "value" | "code" | "tool";

/** A parsed note from the vault */
export interface VaultNote {
  /** File path relative to vault root */
  path: string;
  /** Note title (from filename, without .md) */
  name: string;
  /** Raw markdown body (without frontmatter) */
  body: string;
  /** Parsed frontmatter */
  frontmatter: Record<string, unknown>;
  /** Wikilinks found in the note body: [[Target Note]] */
  wikilinks: string[];
}

/** A compiled node ready for execution */
export interface CompiledNode {
  name: string;
  type: NodeType;
  /** For value nodes: the literal value */
  value?: unknown;
  /** For code nodes: the JS expression to evaluate */
  code?: string;
  /** For tool nodes (Phase 2): MCP tool identifier */
  tool?: string;
  /** Input bindings: { paramName: "{{NoteName.output}}" } */
  inputs: Record<string, string>;
  /** Named outputs this node produces */
  outputs: string[];
}

/** The executable graph */
export interface VaultGraph {
  nodes: Map<string, CompiledNode>;
  /** adjacency list: node name → names of nodes it depends on */
  edges: Map<string, string[]>;
}

/** Result of executing a node */
export type ResultMap = Map<string, Record<string, unknown>>;

/** Injectable I/O for reading vault files */
export interface VaultReader {
  listNotes(dir: string): Promise<string[]>;
  readNote(path: string): Promise<string>;
}

/** Validation error */
export interface ValidationError {
  type: "cycle" | "missing_dependency" | "unresolved_input" | "no_outputs" | "unknown_type";
  node: string;
  message: string;
}
```

**Step 3: Commit**

```bash
git add lib/vault-exec/deno.json lib/vault-exec/src/types.ts
git commit -m "feat(vault-exec): project scaffolding and type definitions"
```

---

### Task 2: Test Fixtures — Sample Vault

**Files:**
- Create: `lib/vault-exec/test/fixtures/sample-vault/Define Path.md`
- Create: `lib/vault-exec/test/fixtures/sample-vault/Read Config.md`
- Create: `lib/vault-exec/test/fixtures/sample-vault/Filter Active.md`

**Step 1: Create value node fixture**

```markdown
---
value: "/etc/app/config.json"
outputs:
  - output
---

# Define Path

The path to the main configuration file.
```

**Step 2: Create code node fixture (simulated data source)**

```markdown
---
value:
  - name: debug
    active: true
  - name: verbose
    active: false
  - name: trace
    active: true
outputs:
  - content
---

# Read Config

Returns the raw configuration data.

Depends on: [[Define Path]]
```

**Step 3: Create code node fixture (filter)**

```markdown
---
inputs:
  data: "{{Read Config.content}}"
code: "data.filter(p => p.active)"
outputs:
  - active_params
---

# Filter Active

Keep only the parameters where active is true.

Depends on: [[Read Config]]
```

**Step 4: Commit**

```bash
git add lib/vault-exec/test/fixtures/
git commit -m "test(vault-exec): add sample vault fixtures"
```

---

### Task 3: Parser — Failing Tests

**Files:**
- Create: `lib/vault-exec/test/parser.test.ts`

**Step 1: Write failing tests**

```typescript
import { assertEquals } from "jsr:@std/assert";
import { parseNote, extractWikilinks } from "../src/parser.ts";

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
```

**Step 2: Run test to verify it fails**

Run: `cd lib/vault-exec && deno test --allow-read test/parser.test.ts`
Expected: FAIL — module "../src/parser.ts" not found

**Step 3: Commit**

```bash
git add lib/vault-exec/test/parser.test.ts
git commit -m "test(vault-exec): add parser tests (failing)"
```

---

### Task 4: Parser — Implementation

**Files:**
- Create: `lib/vault-exec/src/parser.ts`

**Step 1: Implement parser**

```typescript
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
```

**Step 2: Run tests**

Run: `cd lib/vault-exec && deno test --allow-read test/parser.test.ts`
Expected: all 5 tests PASS

**Step 3: Commit**

```bash
git add lib/vault-exec/src/parser.ts
git commit -m "feat(vault-exec): implement markdown parser (frontmatter + wikilinks)"
```

---

### Task 5: Graph Builder — Failing Tests

**Files:**
- Create: `lib/vault-exec/test/graph.test.ts`

**Step 1: Write failing tests**

```typescript
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { buildGraph, topologicalSort, detectCycles } from "../src/graph.ts";
import type { VaultNote } from "../src/types.ts";

function makeNote(name: string, frontmatter: Record<string, unknown>, wikilinks: string[]): VaultNote {
  return { path: `${name}.md`, name, body: "", frontmatter, wikilinks };
}

Deno.test("buildGraph - creates nodes and edges from notes", () => {
  const notes = [
    makeNote("A", { value: 1, outputs: ["output"] }, []),
    makeNote("B", { inputs: { x: "{{A.output}}" }, code: "x + 1", outputs: ["result"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  assertEquals(graph.nodes.size, 2);
  assertEquals(graph.edges.get("B"), ["A"]);
  assertEquals(graph.edges.get("A"), []);
});

Deno.test("topologicalSort - returns valid execution order", () => {
  const notes = [
    makeNote("C", { inputs: { x: "{{B.result}}" }, code: "x * 2", outputs: ["out"] }, ["B"]),
    makeNote("A", { value: 1, outputs: ["output"] }, []),
    makeNote("B", { inputs: { x: "{{A.output}}" }, code: "x + 1", outputs: ["result"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  const order = topologicalSort(graph);
  assertEquals(order, ["A", "B", "C"]);
});

Deno.test("detectCycles - returns empty for acyclic graph", () => {
  const notes = [
    makeNote("A", { value: 1, outputs: ["output"] }, []),
    makeNote("B", { inputs: {}, code: "1", outputs: ["out"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  assertEquals(detectCycles(graph), []);
});

Deno.test("detectCycles - detects simple cycle", () => {
  const notes = [
    makeNote("A", { code: "1", outputs: ["out"] }, ["B"]),
    makeNote("B", { code: "1", outputs: ["out"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  const cycles = detectCycles(graph);
  assertEquals(cycles.length > 0, true);
});

Deno.test("topologicalSort - throws on cycle", () => {
  const notes = [
    makeNote("A", { code: "1", outputs: ["out"] }, ["B"]),
    makeNote("B", { code: "1", outputs: ["out"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  assertThrows(() => topologicalSort(graph), Error, "cycle");
});
```

**Step 2: Run test — expect fail**

Run: `cd lib/vault-exec && deno test --allow-read test/graph.test.ts`

**Step 3: Commit**

```bash
git add lib/vault-exec/test/graph.test.ts
git commit -m "test(vault-exec): add graph builder tests (failing)"
```

---

### Task 6: Graph Builder — Implementation

**Files:**
- Create: `lib/vault-exec/src/graph.ts`

**Step 1: Implement graph builder**

```typescript
import type { VaultNote, VaultGraph, CompiledNode, NodeType } from "./types.ts";

/** Determine node type from frontmatter */
function resolveNodeType(fm: Record<string, unknown>): NodeType {
  if ("tool" in fm) return "tool";
  if ("code" in fm) return "code";
  return "value";
}

/** Build a VaultGraph from parsed notes */
export function buildGraph(notes: VaultNote[]): VaultGraph {
  const nodes = new Map<string, CompiledNode>();
  const edges = new Map<string, string[]>();

  for (const note of notes) {
    const type = resolveNodeType(note.frontmatter);
    const node: CompiledNode = {
      name: note.name,
      type,
      value: note.frontmatter.value,
      code: note.frontmatter.code as string | undefined,
      tool: note.frontmatter.tool as string | undefined,
      inputs: (note.frontmatter.inputs as Record<string, string>) ?? {},
      outputs: (note.frontmatter.outputs as string[]) ?? [],
    };
    nodes.set(note.name, node);
    edges.set(note.name, note.wikilinks);
  }

  return { nodes, edges };
}

/** Detect cycles using DFS. Returns list of cycle descriptions. */
export function detectCycles(graph: VaultGraph): string[] {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const cycles: string[] = [];

  for (const name of graph.nodes.keys()) {
    color.set(name, WHITE);
  }

  function dfs(node: string, path: string[]): void {
    color.set(node, GRAY);
    path.push(node);
    for (const dep of graph.edges.get(node) ?? []) {
      if (!graph.nodes.has(dep)) continue;
      if (color.get(dep) === GRAY) {
        const cycleStart = path.indexOf(dep);
        cycles.push(`Cycle: ${path.slice(cycleStart).join(" -> ")} -> ${dep}`);
      } else if (color.get(dep) === WHITE) {
        dfs(dep, path);
      }
    }
    path.pop();
    color.set(node, BLACK);
  }

  for (const name of graph.nodes.keys()) {
    if (color.get(name) === WHITE) {
      dfs(name, []);
    }
  }

  return cycles;
}

/** Topological sort using Kahn's algorithm. Throws on cycle. */
export function topologicalSort(graph: VaultGraph): string[] {
  const cycles = detectCycles(graph);
  if (cycles.length > 0) {
    throw new Error(`Graph contains cycle(s):\n${cycles.join("\n")}`);
  }

  const inDegree = new Map<string, number>();
  for (const name of graph.nodes.keys()) {
    inDegree.set(name, 0);
  }

  for (const [node, deps] of graph.edges) {
    if (!graph.nodes.has(node)) continue;
    const validDeps = deps.filter(d => graph.nodes.has(d));
    inDegree.set(node, validDeps.length);
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    queue.sort();
    const current = queue.shift()!;
    order.push(current);

    for (const [node, deps] of graph.edges) {
      if (deps.includes(current) && graph.nodes.has(node)) {
        const newDegree = inDegree.get(node)! - 1;
        inDegree.set(node, newDegree);
        if (newDegree === 0) queue.push(node);
      }
    }
  }

  return order;
}
```

**Step 2: Run tests**

Run: `cd lib/vault-exec && deno test --allow-read test/graph.test.ts`
Expected: all 5 tests PASS

**Step 3: Commit**

```bash
git add lib/vault-exec/src/graph.ts
git commit -m "feat(vault-exec): implement graph builder with topological sort and cycle detection"
```

---

### Task 7: Validator — Failing Tests

**Files:**
- Create: `lib/vault-exec/test/validator.test.ts`

**Step 1: Write failing tests**

```typescript
import { assertEquals } from "jsr:@std/assert";
import { validate } from "../src/validator.ts";
import { buildGraph } from "../src/graph.ts";
import type { VaultNote } from "../src/types.ts";

function makeNote(name: string, fm: Record<string, unknown>, wikilinks: string[]): VaultNote {
  return { path: `${name}.md`, name, body: "", frontmatter: fm, wikilinks };
}

Deno.test("validate - valid graph returns no errors", () => {
  const notes = [
    makeNote("A", { value: 1, outputs: ["output"] }, []),
    makeNote("B", { inputs: { x: "{{A.output}}" }, code: "x + 1", outputs: ["result"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  const errors = validate(graph);
  assertEquals(errors, []);
});

Deno.test("validate - missing dependency", () => {
  const notes = [
    makeNote("B", { inputs: { x: "{{A.output}}" }, code: "x", outputs: ["out"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  const errors = validate(graph);
  assertEquals(errors.length, 1);
  assertEquals(errors[0].type, "missing_dependency");
});

Deno.test("validate - unresolved input reference", () => {
  const notes = [
    makeNote("A", { value: 1, outputs: ["output"] }, []),
    makeNote("B", { inputs: { x: "{{A.nonexistent}}" }, code: "x", outputs: ["out"] }, ["A"]),
  ];
  const graph = buildGraph(notes);
  const errors = validate(graph);
  assertEquals(errors.length, 1);
  assertEquals(errors[0].type, "unresolved_input");
});

Deno.test("validate - node with no outputs", () => {
  const notes = [
    makeNote("A", { value: 1 }, []),
  ];
  const graph = buildGraph(notes);
  const errors = validate(graph);
  assertEquals(errors.length, 1);
  assertEquals(errors[0].type, "no_outputs");
});
```

**Step 2: Run — expect fail**

Run: `cd lib/vault-exec && deno test --allow-read test/validator.test.ts`

**Step 3: Commit**

```bash
git add lib/vault-exec/test/validator.test.ts
git commit -m "test(vault-exec): add validator tests (failing)"
```

---

### Task 8: Validator — Implementation

**Files:**
- Create: `lib/vault-exec/src/validator.ts`

**Step 1: Implement validator**

```typescript
import type { VaultGraph, ValidationError } from "./types.ts";
import { detectCycles } from "./graph.ts";

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

function parseRef(ref: string): { note: string; output: string } {
  const parts = ref.trim().split(".");
  if (parts.length === 1) return { note: parts[0], output: "output" };
  return { note: parts[0], output: parts.slice(1).join(".") };
}

/** Validate the graph for common errors */
export function validate(graph: VaultGraph): ValidationError[] {
  const errors: ValidationError[] = [];

  const cycles = detectCycles(graph);
  for (const cycle of cycles) {
    errors.push({ type: "cycle", node: "", message: cycle });
  }

  for (const [name, node] of graph.nodes) {
    const deps = graph.edges.get(name) ?? [];
    for (const dep of deps) {
      if (!graph.nodes.has(dep)) {
        errors.push({
          type: "missing_dependency",
          node: name,
          message: `"${name}" depends on "[[${dep}]]" which does not exist in the vault`,
        });
      }
    }

    if (!node.outputs || node.outputs.length === 0) {
      errors.push({
        type: "no_outputs",
        node: name,
        message: `"${name}" has no outputs declared`,
      });
    }

    for (const [param, template] of Object.entries(node.inputs)) {
      const re = new RegExp(TEMPLATE_RE.source, "g");
      let match: RegExpExecArray | null;
      while ((match = re.exec(template)) !== null) {
        const ref = parseRef(match[1]);
        const targetNode = graph.nodes.get(ref.note);
        if (!targetNode) {
          errors.push({
            type: "unresolved_input",
            node: name,
            message: `"${name}" input "${param}" references "{{${match[1]}}}" but note "${ref.note}" not found`,
          });
        } else if (!targetNode.outputs.includes(ref.output)) {
          errors.push({
            type: "unresolved_input",
            node: name,
            message: `"${name}" input "${param}" references "{{${match[1]}}}" but "${ref.note}" has no output "${ref.output}"`,
          });
        }
      }
    }
  }

  return errors;
}
```

**Step 2: Run tests**

Run: `cd lib/vault-exec && deno test --allow-read test/validator.test.ts`
Expected: all 4 tests PASS

**Step 3: Commit**

```bash
git add lib/vault-exec/src/validator.ts
git commit -m "feat(vault-exec): implement graph validator"
```

---

### Task 9: Executor — Failing Tests

**Files:**
- Create: `lib/vault-exec/test/executor.test.ts`

**Step 1: Write failing tests**

```typescript
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { resolveTemplate, executeNode, executeGraph } from "../src/executor.ts";
import type { CompiledNode, ResultMap, VaultGraph } from "../src/types.ts";

Deno.test("resolveTemplate - simple reference", () => {
  const results: ResultMap = new Map([["A", { output: 42 }]]);
  assertEquals(resolveTemplate("{{A.output}}", results), 42);
});

Deno.test("resolveTemplate - shorthand (single output)", () => {
  const results: ResultMap = new Map([["A", { output: 42 }]]);
  assertEquals(resolveTemplate("{{A}}", results), 42);
});

Deno.test("resolveTemplate - throws on missing note", () => {
  const results: ResultMap = new Map();
  assertThrows(() => resolveTemplate("{{Missing.output}}", results), Error, "Missing");
});

Deno.test("executeNode - value node returns literal", async () => {
  const node: CompiledNode = {
    name: "A", type: "value", value: 42, inputs: {}, outputs: ["output"],
  };
  const result = await executeNode(node, new Map());
  assertEquals(result, { output: 42 });
});

Deno.test("executeNode - code node evaluates expression", async () => {
  const node: CompiledNode = {
    name: "B", type: "code",
    code: "data.filter(x => x > 2)",
    inputs: { data: "{{A.output}}" },
    outputs: ["result"],
  };
  const results: ResultMap = new Map([["A", { output: [1, 2, 3, 4] }]]);
  const result = await executeNode(node, results);
  assertEquals(result, { result: [3, 4] });
});

Deno.test("executeGraph - executes full DAG in order", async () => {
  const nodes = new Map<string, CompiledNode>([
    ["A", { name: "A", type: "value", value: [1, 2, 3, 4, 5], inputs: {}, outputs: ["output"] }],
    ["B", {
      name: "B", type: "code",
      code: "data.filter(x => x > 3)",
      inputs: { data: "{{A.output}}" },
      outputs: ["result"],
    }],
    ["C", {
      name: "C", type: "code",
      code: "items.length",
      inputs: { items: "{{B.result}}" },
      outputs: ["count"],
    }],
  ]);
  const edges = new Map([["A", [] as string[]], ["B", ["A"]], ["C", ["B"]]]);
  const graph: VaultGraph = { nodes, edges };
  const results = await executeGraph(graph);
  assertEquals(results.get("A"), { output: [1, 2, 3, 4, 5] });
  assertEquals(results.get("B"), { result: [4, 5] });
  assertEquals(results.get("C"), { count: 2 });
});
```

**Step 2: Run — expect fail**

Run: `cd lib/vault-exec && deno test --allow-read test/executor.test.ts`

**Step 3: Commit**

```bash
git add lib/vault-exec/test/executor.test.ts
git commit -m "test(vault-exec): add executor tests (failing)"
```

---

### Task 10: Executor — Implementation

**Files:**
- Create: `lib/vault-exec/src/executor.ts`

**Step 1: Implement executor**

```typescript
import type { CompiledNode, ResultMap, VaultGraph } from "./types.ts";
import { topologicalSort } from "./graph.ts";

const TEMPLATE_RE = /\{\{([^}]+)\}\}/;

function parseRef(ref: string): { note: string; output: string } {
  const parts = ref.trim().split(".");
  if (parts.length === 1) return { note: parts[0], output: "output" };
  return { note: parts[0], output: parts.slice(1).join(".") };
}

/** Resolve a template string like "{{NoteName.output}}" against results */
export function resolveTemplate(template: string, results: ResultMap): unknown {
  const match = template.match(TEMPLATE_RE);
  if (!match) return template;

  const ref = parseRef(match[1]);
  const noteResults = results.get(ref.note);
  if (!noteResults) {
    throw new Error(`Cannot resolve "{{${match[1]}}}": note "${ref.note}" has no results yet`);
  }
  if (!(ref.output in noteResults)) {
    throw new Error(`Cannot resolve "{{${match[1]}}}": note "${ref.note}" has no output "${ref.output}"`);
  }
  return noteResults[ref.output];
}

/** Execute a single node */
export async function executeNode(
  node: CompiledNode,
  results: ResultMap,
): Promise<Record<string, unknown>> {
  if (node.type === "value") {
    const outputName = node.outputs[0] ?? "output";
    return { [outputName]: node.value };
  }

  if (node.type === "code") {
    const resolvedInputs: Record<string, unknown> = {};
    for (const [param, template] of Object.entries(node.inputs)) {
      resolvedInputs[param] = resolveTemplate(template, results);
    }

    const paramNames = Object.keys(resolvedInputs);
    const paramValues = Object.values(resolvedInputs);
    const fn = new Function(...paramNames, `return (${node.code});`);
    const result = await fn(...paramValues);

    const outputName = node.outputs[0] ?? "output";
    return { [outputName]: result };
  }

  if (node.type === "tool") {
    throw new Error(`Tool nodes not supported yet (Phase 2). Node: "${node.name}"`);
  }

  throw new Error(`Unknown node type "${node.type}" for node "${node.name}"`);
}

/** Execute the full graph in topological order */
export async function executeGraph(graph: VaultGraph): Promise<ResultMap> {
  const order = topologicalSort(graph);
  const results: ResultMap = new Map();

  for (const name of order) {
    const node = graph.nodes.get(name);
    if (!node) throw new Error(`Node "${name}" not found in graph`);

    console.log(`▶ ${name} (${node.type})`);
    const output = await executeNode(node, results);
    results.set(name, output);
    console.log(`  → ${JSON.stringify(output)}`);
  }

  return results;
}
```

**Step 2: Run tests**

Run: `cd lib/vault-exec && deno test --allow-read test/executor.test.ts`
Expected: all 6 tests PASS

**Step 3: Commit**

```bash
git add lib/vault-exec/src/executor.ts
git commit -m "feat(vault-exec): implement executor (value + code nodes)"
```

---

### Task 11: CLI Entry Point

**Files:**
- Create: `lib/vault-exec/src/io.ts`
- Create: `lib/vault-exec/src/cli.ts`

**Step 1: Create Deno I/O adapter**

```typescript
import type { VaultReader } from "./types.ts";

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
```

**Step 2: Create CLI**

```typescript
import { parseVault } from "./parser.ts";
import { buildGraph, topologicalSort } from "./graph.ts";
import { validate } from "./validator.ts";
import { executeGraph } from "./executor.ts";
import { DenoVaultReader } from "./io.ts";

const USAGE = `vault-exec — Your Obsidian vault is an executable program.

Usage:
  vault-exec validate <vault-path>   Check for cycles, missing inputs, orphans
  vault-exec graph <vault-path>      Print dependency graph
  vault-exec run <vault-path>        Execute the compiled DAG
`;

async function main() {
  const [command, vaultPath] = Deno.args;

  if (!command || !vaultPath) {
    console.log(USAGE);
    Deno.exit(1);
  }

  const reader = new DenoVaultReader();
  const notes = await parseVault(reader, vaultPath);

  if (notes.length === 0) {
    console.error(`No .md files found in ${vaultPath}`);
    Deno.exit(1);
  }

  const graph = buildGraph(notes);

  switch (command) {
    case "validate": {
      const errors = validate(graph);
      if (errors.length === 0) {
        console.log(`✓ ${notes.length} notes, no errors`);
      } else {
        console.error(`✗ ${errors.length} error(s):`);
        for (const err of errors) {
          console.error(`  [${err.type}] ${err.message}`);
        }
        Deno.exit(1);
      }
      break;
    }

    case "graph": {
      const order = topologicalSort(graph);
      console.log("Execution order:");
      for (let i = 0; i < order.length; i++) {
        const name = order[i];
        const node = graph.nodes.get(name)!;
        const deps = graph.edges.get(name) ?? [];
        const depStr = deps.length > 0 ? ` <- [${deps.join(", ")}]` : "";
        console.log(`  ${i + 1}. ${name} (${node.type})${depStr}`);
      }
      break;
    }

    case "run": {
      const errors = validate(graph);
      if (errors.length > 0) {
        console.error(`✗ Cannot run: ${errors.length} validation error(s)`);
        for (const err of errors) {
          console.error(`  [${err.type}] ${err.message}`);
        }
        Deno.exit(1);
      }

      console.log(`Running vault: ${vaultPath} (${notes.length} notes)\n`);
      const results = await executeGraph(graph);

      console.log("\n── Results ──");
      for (const [name, output] of results) {
        console.log(`${name}: ${JSON.stringify(output)}`);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log(USAGE);
      Deno.exit(1);
  }
}

main();
```

**Step 3: Smoke test**

Run: `cd lib/vault-exec && deno run --allow-read src/cli.ts validate test/fixtures/sample-vault`
Expected: `✓ 3 notes, no errors`

Run: `cd lib/vault-exec && deno run --allow-read src/cli.ts graph test/fixtures/sample-vault`
Expected: Execution order with dependencies

Run: `cd lib/vault-exec && deno run --allow-read src/cli.ts run test/fixtures/sample-vault`
Expected: Executes 3 notes, shows filtered results

**Step 4: Commit**

```bash
git add lib/vault-exec/src/io.ts lib/vault-exec/src/cli.ts
git commit -m "feat(vault-exec): CLI with validate, graph, and run commands"
```

---

### Task 12: End-to-End Verification

**Step 1: Run full test suite**

```bash
cd lib/vault-exec && deno test --allow-read test/
```

Expected: 20 tests pass (parser: 5, graph: 5, validator: 4, executor: 6)

**Step 2: CLI demo run**

```bash
cd lib/vault-exec && deno run --allow-read src/cli.ts run test/fixtures/sample-vault
```

Expected:
```
Running vault: test/fixtures/sample-vault (3 notes)

▶ Define Path (value)
  → {"output":"/etc/app/config.json"}
▶ Read Config (value)
  → {"content":[{"name":"debug","active":true},{"name":"verbose","active":false},{"name":"trace","active":true}]}
▶ Filter Active (code)
  → {"active_params":[{"name":"debug","active":true},{"name":"trace","active":true}]}

── Results ──
Define Path: {"output":"/etc/app/config.json"}
Read Config: {"content":[...]}
Filter Active: {"active_params":[...]}
```

**Step 3: Final commit**

```bash
git add -A lib/vault-exec/
git commit -m "feat(vault-exec): MVP complete — parse, validate, graph, run"
```
