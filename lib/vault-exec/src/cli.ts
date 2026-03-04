import { Command } from "jsr:@cliffy/command@1.0.0-rc.7";
import { loadSync } from "jsr:@std/dotenv";
import { parseVault } from "./parser.ts";
import { buildGraph, extractSubgraph, topologicalSort } from "./graph.ts";
import { validate } from "./validator.ts";
import { executeGraph } from "./executor.ts";
import { DenoVaultReader } from "./io.ts";

// Load .env.local (gitignored) then .env as fallback
try { loadSync({ envPath: ".env.local", export: true }); } catch { /* ok */ }
try { loadSync({ export: true }); } catch { /* ok */ }

/** Parse vault and bail if empty */
async function loadVault(vaultPath: string) {
  const reader = new DenoVaultReader();
  const notes = await parseVault(reader, vaultPath);
  if (notes.length === 0) {
    console.error(`No .md files found in ${vaultPath}`);
    Deno.exit(1);
  }
  return notes;
}

// ── Commands ────────────────────────────────────────────────────────────────

const validateCmd = new Command()
  .description("Check for cycles, missing inputs, orphans")
  .arguments("<vault-path:string>")
  .action(async (_opts: void, vaultPath: string) => {
    const notes = await loadVault(vaultPath);
    const graph = buildGraph(notes);
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
  });

const graphCmd = new Command()
  .description("Print dependency graph and execution order")
  .arguments("<vault-path:string>")
  .action(async (_opts: void, vaultPath: string) => {
    const notes = await loadVault(vaultPath);
    const graph = buildGraph(notes);
    const order = topologicalSort(graph);
    console.log("Execution order:");
    for (let i = 0; i < order.length; i++) {
      const name = order[i];
      const node = graph.nodes.get(name)!;
      const deps = graph.edges.get(name) ?? [];
      const depStr = deps.length > 0 ? ` <- [${deps.join(", ")}]` : "";
      console.log(`  ${i + 1}. ${name} (${node.type})${depStr}`);
    }
  });

const runCmd = new Command()
  .description("Execute the compiled DAG (full, by target, or by intent)")
  .arguments("<vault-path:string>")
  .option("-t, --target <target:string>", "Execute only the subgraph needed for this note")
  .option("-i, --intent <intent:string>", "GRU routes intent to target note, then executes its subgraph")
  .action(async (opts: { target?: string; intent?: string }, vaultPath: string) => {
    const notes = await loadVault(vaultPath);
    const fullGraph = buildGraph(notes);
    const dbPath = `${vaultPath}/.vault-exec/vault.duckdb`;

    // Resolve target note
    let targetNote: string | undefined = opts.target;

    if (opts.intent) {
      // GRU intent routing
      try {
        const { VaultDB } = await import("./db/store.ts");
        const { GRUInference } = await import("./gru/inference.ts");
        const { EmbeddingModel, BGEEmbedder } = await import("./embeddings/model.ts");

        const db = await VaultDB.open(dbPath);
        const weightsRow = await db.getLatestWeights();
        if (!weightsRow) {
          console.error("✗ No GRU weights found. Run 'vault-exec init' first, then accumulate traces.");
          Deno.exit(1);
        }

        const embedder = new EmbeddingModel(new BGEEmbedder());
        const intentEmb = await embedder.encode(opts.intent);
        const gru = new GRUInference(weightsRow.weights, weightsRow.vocab, weightsRow.config);
        const prediction = gru.predictNext(intentEmb, []);

        targetNote = prediction.name;
        console.log(`Intent: "${opts.intent}"`);
        console.log(`GRU prediction: ${targetNote} (score: ${prediction.score.toFixed(4)})\n`);

        db.close();
        await embedder.dispose();
      } catch (err) {
        console.error(`✗ GRU routing failed: ${(err as Error).message}`);
        console.error("Falling back to full DAG execution.\n");
      }
    }

    // Build execution graph (subgraph if target, full otherwise)
    const graph = targetNote ? extractSubgraph(fullGraph, targetNote) : fullGraph;

    const errors = validate(graph);
    if (errors.length > 0) {
      console.error(`✗ Cannot run: ${errors.length} validation error(s)`);
      for (const err of errors) {
        console.error(`  [${err.type}] ${err.message}`);
      }
      Deno.exit(1);
    }

    const nodeCount = graph.nodes.size;
    const label = targetNote ? `subgraph for "${targetNote}"` : "full DAG";
    console.log(`Running ${label}: ${vaultPath} (${nodeCount} notes)\n`);
    const { results, path } = await executeGraph(graph);

    console.log("\n── Results ──");
    for (const [name, output] of results) {
      console.log(`${name}: ${JSON.stringify(output)}`);
    }

    // Record execution trace to DuckDB
    try {
      const { VaultDB } = await import("./db/store.ts");
      const { recordTrace } = await import("./traces/recorder.ts");
      const db = await VaultDB.open(dbPath);
      await recordTrace(db, {
        intent: opts.intent,
        targetNote: path[path.length - 1],
        path,
        success: true,
        synthetic: false,
      });
      db.close();
      console.log("\nTrace recorded.");
    } catch {
      console.log("\nNo vault DB found. Run 'vault-exec init' to enable learning.");
    }
  });

const compileCmd = new Command()
  .description("Compile uncompiled notes using LLM")
  .arguments("<vault-path:string>")
  .option("-m, --model <model:string>", "OpenAI model to use", { default: "gpt-4o-mini" })
  .action(async (opts: { model: string }, vaultPath: string) => {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.error("OPENAI_API_KEY environment variable is required for compilation");
      Deno.exit(1);
    }

    const notes = await loadVault(vaultPath);
    const { OpenAIClient, compileVault } = await import("./compiler.ts");
    const { DenoVaultWriter } = await import("./io.ts");
    const llm = new OpenAIClient(apiKey, opts.model);
    const writer = new DenoVaultWriter();

    const uncompiled = notes.filter((n) => !n.frontmatter.compiled_at);
    if (uncompiled.length === 0) {
      console.log("All notes already compiled. Nothing to do.");
      return;
    }

    const compiledDir = `${vaultPath}/compiled`;
    await Deno.mkdir(compiledDir, { recursive: true });

    console.log(`Compiling ${uncompiled.length} note(s)...\n`);

    const results = await compileVault(notes, llm, (name, i, total) => {
      console.log(`[${i}/${total}] Compiling: ${name}`);
    });

    for (const [name, { fullContent }] of results) {
      const outPath = `${compiledDir}/${name}.md`;
      await writer.writeNote(outPath, fullContent);
      console.log(`  -> written: ${outPath}`);
    }

    console.log(`\nDone. ${results.size} note(s) compiled to ${compiledDir}/`);
  });

const initCmd = new Command()
  .description("Initialize GNN+GRU pipeline (embed, GNN, synthetic traces)")
  .arguments("<vault-path:string>")
  .action(async (_opts: void, vaultPath: string) => {
    const notes = await loadVault(vaultPath);
    const { BGEEmbedder } = await import("./embeddings/model.ts");
    const { initVault } = await import("./init.ts");

    const initDbPath = `${vaultPath}/.vault-exec/vault.duckdb`;
    await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });

    console.log(`Initializing vault: ${vaultPath}\n`);
    const embedder = new BGEEmbedder();
    const result = await initVault(notes, initDbPath, embedder);

    console.log(`\nDone:`);
    console.log(`  ${result.notesIndexed} notes indexed`);
    console.log(`  ${result.syntheticTraces} synthetic traces generated`);
    console.log(`  GNN: ${result.gnnForwardDone ? "done" : "skipped"}`);
    console.log(`  GRU: ${result.gruTrained ? `trained (accuracy: ${((result.gruAccuracy ?? 0) * 100).toFixed(1)}%)` : "skipped"}`);
  });

// ── Main ────────────────────────────────────────────────────────────────────

await new Command()
  .name("vault-exec")
  .version("0.1.0")
  .description("Your Obsidian vault is an executable program.")
  .command("validate", validateCmd)
  .command("graph", graphCmd)
  .command("run", runCmd)
  .command("compile", compileCmd)
  .command("init", initCmd)
  .parse(Deno.args);
