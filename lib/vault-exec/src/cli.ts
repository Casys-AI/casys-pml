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
  vault-exec compile <vault-path>    Compile uncompiled notes using LLM (requires OPENAI_API_KEY)
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

    case "compile": {
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) {
        console.error("OPENAI_API_KEY environment variable is required for compilation");
        Deno.exit(1);
      }

      const { OpenAIClient, compileVault } = await import("./compiler.ts");
      const { DenoVaultWriter } = await import("./io.ts");
      const llm = new OpenAIClient(apiKey);
      const writer = new DenoVaultWriter();

      const uncompiled = notes.filter((n) => !n.frontmatter.compiled_at);
      if (uncompiled.length === 0) {
        console.log("All notes already compiled. Nothing to do.");
        break;
      }

      console.log(`Compiling ${uncompiled.length} note(s)...\n`);

      const results = await compileVault(notes, llm, (name, i, total) => {
        console.log(`[${i}/${total}] Compiling: ${name}`);
      });

      for (const [name, { fullContent }] of results) {
        const note = notes.find((n) => n.name === name)!;
        await writer.writeNote(note.path, fullContent);
        console.log(`  -> written: ${name}`);
      }

      console.log(`\nDone. ${results.size} note(s) compiled.`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log(USAGE);
      Deno.exit(1);
  }
}

main();
