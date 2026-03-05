import { Command } from "jsr:@cliffy/command@1.0.0-rc.7";
import { loadSync } from "jsr:@std/dotenv";
import { parseVault } from "./parser.ts";
import { buildGraph, extractSubgraph, topologicalSort, withVirtualEdges } from "./graph.ts";
import { validate } from "./validator.ts";
import { executeGraph } from "./executor.ts";
import { DenoVaultReader } from "./io.ts";
import { feedbackToVirtualEdgeUpdates } from "./links/feedback.ts";
import { nextVirtualEdgeStatus, PROMOTION_POLICY } from "./links/policy.ts";
import {
  buildRuntimeInputSchema,
  validateRuntimeInputsForGraph,
} from "./runtime-inputs.ts";
import {
  evaluateIntentCandidates,
  formatIntentCandidateLine,
} from "./intent-candidates.ts";

// Load .env.local (gitignored) then .env as fallback
try { loadSync({ envPath: ".env.local", export: true }); } catch { /* ok */ }
try { loadSync({ export: true }); } catch { /* ok */ }

/** Parse .md files from a vault directory and bail if empty */
async function loadNotes(dir: string) {
  const reader = new DenoVaultReader();
  const notes = await parseVault(reader, dir);
  if (notes.length === 0) {
    console.error(`No .md files found in ${dir}`);
    Deno.exit(1);
  }
  return notes;
}

/** Resolve store path — KV only */
function resolveDbPath(vaultPath: string): string {
  return `${vaultPath}/.vault-exec/vault.kv`;
}

async function parseInputsArg(raw?: string): Promise<Record<string, unknown>> {
  if (!raw) return {};

  const fromFile = raw.startsWith("@") ? raw.slice(1) : raw;
  try {
    const stat = await Deno.stat(fromFile);
    if (stat.isFile) {
      const content = await Deno.readTextFile(fromFile);
      return JSON.parse(content) as Record<string, unknown>;
    }
  } catch {
    // not a file path, fall through to raw JSON
  }

  return JSON.parse(raw) as Record<string, unknown>;
}

function printInputSchema(schema: Record<string, unknown>): void {
  console.log("[input_schema]");
  console.log(JSON.stringify(schema, null, 2));
}

type ServiceClient = {
  startWatch(args: { vaultPath: string; idleSecs?: number }): Promise<unknown>;
  stopWatch(args: { vaultPath: string }): Promise<unknown>;
  watchStatus(args: { vaultPath: string }): Promise<unknown>;
  syncOnce(args: { vaultPath: string }): Promise<unknown>;
};

async function loadServiceClient(): Promise<ServiceClient> {
  const serviceModulePath = "./service/client.ts";
  const mod = await import(serviceModulePath);
  return mod as ServiceClient;
}

// ── Commands ────────────────────────────────────────────────────────────────

const validateCmd = new Command()
  .description("Check for cycles, missing inputs, orphans")
  .arguments("<vault-path:string>")
  .action(async (_opts: void, vaultPath: string) => {
    const notes = await loadNotes(vaultPath);
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
    const notes = await loadNotes(vaultPath);
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
  .option("--no-confirm", "Auto-select best candidate instead of asking for a numbered choice")
  .option("--no-train", "Skip live retraining after execution")
  .option("--dry", "Preview target execution and required runtime input schema without executing")
  .option("--inputs <inputs:string>", "Runtime input payload (JSON string or @path/to/inputs.json)")
  .action(async (opts: { target?: string; intent?: string; confirm?: boolean; train?: boolean; dry?: boolean; inputs?: string }, vaultPath: string) => {
    const skipTrain = opts.train === false;
    const notes = await loadNotes(vaultPath);
    const fullGraph = buildGraph(notes);
    const vaultDbPath = resolveDbPath(vaultPath);

    // Resolve target note
    let targetNote: string | undefined = opts.target;
    // Store intent embedding early (reuse for trace recording)
    let intentEmbedding: number[] | undefined;
    // Rejected beam candidates (negative examples for contrastive learning)
    let rejectedTargets: Array<{ target: string; path: string[]; score: number }> = [];
    let selectedBeamPath: string[] | null = null;

    let parsedRuntimeInputs: Record<string, unknown> = {};
    if (opts.inputs) {
      try {
        parsedRuntimeInputs = await parseInputsArg(opts.inputs);
      } catch (err) {
        console.error(`✗ Failed to parse --inputs: ${(err as Error).message}`);
        Deno.exit(1);
      }
    }

    if (opts.intent) {
      // GRU intent routing with beam search
      try {
        const { openVaultStore } = await import("./db/index.ts");
        const { GRUInference } = await import("./gru/inference.ts");
        const { deserializeWeights } = await import("./gru/weights.ts");
        const { EmbeddingModel, BGEEmbedder } = await import("./embeddings/model.ts");

        const db = await openVaultStore(vaultDbPath);
        const weightsRow = await db.getLatestWeights();
        if (!weightsRow) {
          console.error("✗ No GRU weights found. Run 'vault-exec init' first, then accumulate traces.");
          Deno.exit(1);
        }

        const { weights, vocab, config } = await deserializeWeights(weightsRow.blob);
        const embedder = new EmbeddingModel(new BGEEmbedder());
        intentEmbedding = await embedder.encode(opts.intent);
        const gru = new GRUInference(weights, vocab, config);

        // Beam search: explore multiple paths
        const beamWidth = 5;
        const maxLen = Math.min(vocab.nodes.length, 8);
        const beams = gru.buildPathBeam(intentEmbedding, beamWidth, maxLen);

        if (beams.length === 0) {
          console.error("✗ Beam search returned no candidates.");
          Deno.exit(1);
        }

        // Deduplicate by target (last node in path) — keep best score per target
        const seenTargets = new Map<string, typeof beams[0]>();
        for (const beam of beams) {
          const target = beam.path[beam.path.length - 1];
          if (!seenTargets.has(target) || beam.score > seenTargets.get(target)!.score) {
            seenTargets.set(target, beam);
          }
        }
        const uniqueBeams = [...seenTargets.values()].sort((a, b) => b.score - a.score);

        // Normalize scores to [0, 1] via softmax
        const rawScores = uniqueBeams.map((b) => b.score);
        const maxScore = Math.max(...rawScores);
        const expScores = rawScores.map((s) => Math.exp(s - maxScore));
        const sumExp = expScores.reduce((a, b) => a + b, 0);
        const normalizedScores = expScores.map((e) => e / sumExp);

        // Output: structured for AI consumption
        // Show top 3 + "none" option
        const maxCandidates = 3;
        const displayBeams = uniqueBeams.slice(0, maxCandidates);
        const displayScores = normalizedScores.slice(0, maxCandidates);
        // Renormalize displayed scores to sum to ~1 (excluding "none")
        const displaySum = displayScores.reduce((a, b) => a + b, 0);
        const renormalized = displayScores.map((s) => s / displaySum);

        console.log(`[intent] ${opts.intent}`);
        console.log(`[candidates] ${displayBeams.length + 1}`);
        const candidateCompatibility = evaluateIntentCandidates(
          fullGraph,
          displayBeams.map((b, i) => ({
            target: b.path[b.path.length - 1],
            confidence: renormalized[i],
            path: b.path,
          })),
          parsedRuntimeInputs,
        );
        for (let i = 0; i < candidateCompatibility.length; i++) {
          console.log(formatIntentCandidateLine(i + 1, candidateCompatibility[i]));
        }
        if (candidateCompatibility.length > 0 && candidateCompatibility.every((c) => !c.payloadOk)) {
          const compactReasons = candidateCompatibility.map((c) => `${c.target}:${c.payloadStatus}`).join(" | ");
          console.log(`[compatibility] No candidate is schema-compatible with the provided payload (${compactReasons})`);
        }
        console.log(`[${displayBeams.length + 1}] none`);

        if (opts.confirm !== false) {
          const noneIdx = displayBeams.length + 1;
          console.log(`[confirm] Select (1-${noneIdx}):`);
          const buf = new Uint8Array(64);
          const n = await Deno.stdin.read(buf);
          const input = new TextDecoder().decode(buf.subarray(0, n ?? 0)).trim();
          const choice = parseInt(input);

          if (isNaN(choice) || choice < 1 || choice > noneIdx) {
            console.log("[skip] Invalid input. No trace recorded.");
            db.close();
            await embedder.dispose();
            return;
          }

          if (choice === noneIdx) {
            // "none" selected — ALL candidates are negative
            console.log("[none] All candidates rejected.");
            rejectedTargets = displayBeams.map((b) => ({
              target: b.path[b.path.length - 1],
              path: b.path,
              score: b.score,
            }));
            console.log(`[negatives] ${rejectedTargets.length} rejected candidates stored`);
            // No execution — just record negatives
            try {
              const { recordTrace } = await import("./traces/recorder.ts");
              const updates = feedbackToVirtualEdgeUpdates(
                fullGraph,
                null,
                rejectedTargets.map((r) => r.path),
              );
              for (const neg of rejectedTargets) {
                await recordTrace(db, {
                  intent: opts.intent,
                  intentEmbedding: intentEmbedding,
                  targetNote: neg.target,
                  path: neg.path,
                  success: false,
                  synthetic: false,
                });
              }
              for (const u of updates) {
                const row = await db.upsertVirtualEdge(u);
                const next = nextVirtualEdgeStatus(row);
                if (next !== row.status) {
                  await db.setVirtualEdgeStatus(row.source, row.target, next);
                }
              }
              await db.applyVirtualEdgeDecay(PROMOTION_POLICY.decayFactor);
              console.log(`[trace] ${rejectedTargets.length} negative recorded.`);
            } catch {
              // DB not available
            }
            db.close();
            await embedder.dispose();
            return;
          }

          const selected = displayBeams[choice - 1];
          targetNote = selected.path[selected.path.length - 1];
          selectedBeamPath = selected.path;
          console.log(`[selected] ${choice} → target=${targetNote}`);

          // Store rejected candidates as negative examples
          rejectedTargets = displayBeams
            .filter((_, i) => i !== choice - 1)
            .map((b) => ({
              target: b.path[b.path.length - 1],
              path: b.path,
              score: b.score,
            }));
          if (rejectedTargets.length > 0) {
            console.log(`[negatives] ${rejectedTargets.length} rejected candidates stored`);
          }
        } else {
          // Auto-select best candidate
          selectedBeamPath = displayBeams[0].path;
          targetNote = selectedBeamPath[selectedBeamPath.length - 1];
          console.log(`[auto] target=${targetNote}`);
        }

        // Update virtual edge candidates from feedback.
        try {
          const updates = feedbackToVirtualEdgeUpdates(
            fullGraph,
            selectedBeamPath,
            rejectedTargets.map((r) => r.path),
          );
          for (const u of updates) {
            const row = await db.upsertVirtualEdge(u);
            const next = nextVirtualEdgeStatus(row);
            if (next !== row.status) {
              await db.setVirtualEdgeStatus(row.source, row.target, next);
            }
          }
          await db.applyVirtualEdgeDecay(PROMOTION_POLICY.decayFactor);
        } catch {
          // Non-fatal: run should proceed even if edge-learning persistence fails.
        }

        db.close();
        await embedder.dispose();
      } catch (err) {
        console.error(`[error] GRU routing failed: ${(err as Error).message}`);
        console.error("Falling back to full DAG execution.");
      }
    }

    // Build execution graph (subgraph if target, full otherwise), then augment with promoted virtual edges.
    let graph = targetNote ? extractSubgraph(fullGraph, targetNote) : fullGraph;
    try {
      const { openVaultStore } = await import("./db/index.ts");
      const db = await openVaultStore(vaultDbPath);
      const promoted = await db.listVirtualEdges("promoted");
      db.close();
      if (promoted.length > 0) {
        graph = withVirtualEdges(graph, promoted);
      }
    } catch {
      // non-fatal
    }

    const runtimeSchema = buildRuntimeInputSchema(graph);
    const runtimeInputs = parsedRuntimeInputs;

    if (runtimeSchema) {
      // For target runs: if payload missing, return schema instead of executing.
      if (targetNote && Object.keys(runtimeInputs).length === 0) {
        printInputSchema(runtimeSchema as unknown as Record<string, unknown>);
        return;
      }

      const inputValidation = validateRuntimeInputsForGraph(graph, runtimeInputs);
      if (!inputValidation.ok) {
        console.error("✗ Runtime input validation failed:");
        for (const issue of inputValidation.issues) {
          console.error(`  - ${issue.path || "/"}: ${issue.message}`);
        }
        printInputSchema(runtimeSchema as unknown as Record<string, unknown>);
        Deno.exit(1);
      }
    }

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
    if (opts.dry) {
      const order = topologicalSort(graph);
      console.log(`[dry] ${label}: ${vaultPath} (${nodeCount} notes)`);
      console.log("[dry] execution_order");
      for (let i = 0; i < order.length; i++) {
        console.log(`  ${i + 1}. ${order[i]}`);
      }
      if (runtimeSchema) printInputSchema(runtimeSchema as unknown as Record<string, unknown>);
      return;
    }

    console.log(`Running ${label}: ${vaultPath} (${nodeCount} notes)\n`);
    const { results, path } = await executeGraph(graph, runtimeInputs);

    console.log("\n── Results ──");
    for (const [name, output] of results) {
      console.log(`${name}: ${JSON.stringify(output)}`);
    }

    // Record execution trace to the vault store.
    // intentEmbedding already computed above during GRU routing (if --intent)
    try {
      const { openVaultStore } = await import("./db/index.ts");
      const { recordTrace } = await import("./traces/recorder.ts");
      const db = await openVaultStore(vaultDbPath);

      // Positive trace: the executed path
      await recordTrace(db, {
        intent: opts.intent,
        intentEmbedding,
        targetNote: path[path.length - 1],
        path,
        success: true,
        synthetic: false,
      });

      // Reinforce successful sequential relations from executed path.
      const successUpdates = feedbackToVirtualEdgeUpdates(fullGraph, path, []);
      for (const u of successUpdates) {
        const row = await db.upsertVirtualEdge({ ...u, reason: "execution_success" });
        const next = nextVirtualEdgeStatus(row);
        if (next !== row.status) {
          await db.setVirtualEdgeStatus(row.source, row.target, next);
        }
      }

      // Negative traces: rejected beam candidates (only with --confirm)
      for (const neg of rejectedTargets) {
        await recordTrace(db, {
          intent: opts.intent,
          intentEmbedding,
          targetNote: neg.target,
          path: neg.path,
          success: false,
          synthetic: false,
        });
      }

      db.close();
      const negMsg = rejectedTargets.length > 0 ? ` + ${rejectedTargets.length} negative` : "";
      console.log(`\n[trace] 1 positive${negMsg} recorded.`);
    } catch {
      console.log("\n[trace] No vault DB found. Run 'vault-exec init' to enable learning.");
    }

    // Live retraining (unless --no-train)
    if (!skipTrain) {
      try {
        const { retrain } = await import("./retrain.ts");
        console.log("Retraining...");
        const result = await retrain(notes, vaultDbPath, null, {
          skipReindex: true, // notes haven't changed during this run
          maxEpochs: 5,
          verbose: false,
        });
        if (result.gruTrained) {
          console.log(`✓ Retrained: ${result.tracesUsed} traces, accuracy=${(result.gruAccuracy * 100).toFixed(1)}%`);
        }
      } catch (err) {
        console.error(`⚠ Retraining failed: ${(err as Error).message}`);
      }
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

    const notes = await loadNotes(vaultPath);
    const { OpenAIClient, compileVault } = await import("./compiler.ts");
    const { DenoVaultWriter } = await import("./io.ts");
    const llm = new OpenAIClient(apiKey, opts.model);
    const writer = new DenoVaultWriter();

    const uncompiled = notes.filter((n) => !n.frontmatter.compiled_at);
    if (uncompiled.length === 0) {
      console.log("All notes already compiled. Nothing to do.");
      return;
    }

    console.log(`Compiling ${uncompiled.length} note(s)...\n`);

    const results = await compileVault(notes, llm, (name, i, total) => {
      console.log(`[${i}/${total}] Compiling: ${name}`);
    });

    // Write compiled frontmatter back into the original note files
    for (const [name, { fullContent }] of results) {
      const original = notes.find((n) => n.name === name);
      if (!original) continue;
      await writer.writeNote(original.path, fullContent);
      console.log(`  -> updated: ${original.path}`);
    }

    console.log(`\nDone. ${results.size} note(s) compiled in-place.`);
  });

const initCmd = new Command()
  .description("Initialize GNN+GRU pipeline (embed, GNN, synthetic traces)")
  .arguments("<vault-path:string>")
  .action(async (_opts: void, vaultPath: string) => {
    const notes = await loadNotes(vaultPath);
    const { BGEEmbedder } = await import("./embeddings/model.ts");
    const { initVault } = await import("./init.ts");

    const dbPath = resolveDbPath(vaultPath);
    await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });

    console.log(`Initializing vault: ${vaultPath}\n`);
    const embedder = new BGEEmbedder();
    const result = await initVault(notes, dbPath, embedder);

    console.log(`\nDone:`);
    console.log(`  ${result.notesIndexed} notes indexed`);
    console.log(`  ${result.syntheticTraces} synthetic traces generated`);
    console.log(`  GNN: ${result.gnnForwardDone ? "done" : "skipped"}`);
    console.log(`  GRU: ${result.gruTrained ? `trained (accuracy=${((result.gruAccuracy ?? 0) * 100).toFixed(1)}%)` : "skipped"}`);
  });

const watchStartCmd = new Command()
  .description("Start background watch loop for a vault path")
  .arguments("<vault-path:string>")
  .option("--idle-secs <idleSecs:number>", "Idle window in seconds before batching sync")
  .action(async (opts: { idleSecs?: number }, vaultPath: string) => {
    const service = await loadServiceClient();
    await service.startWatch({ vaultPath, idleSecs: opts.idleSecs });
    console.log(`watch started: ${vaultPath}`);
  });

const watchStopCmd = new Command()
  .description("Stop background watch loop for a vault path")
  .arguments("<vault-path:string>")
  .action(async (_opts: void, vaultPath: string) => {
    const service = await loadServiceClient();
    await service.stopWatch({ vaultPath });
    console.log(`watch stopped: ${vaultPath}`);
  });

const watchStatusCmd = new Command()
  .description("Show background watch status for a vault path")
  .arguments("<vault-path:string>")
  .action(async (_opts: void, vaultPath: string) => {
    const service = await loadServiceClient();
    const status = await service.watchStatus({ vaultPath });
    console.log(JSON.stringify(status, null, 2));
  });

const watchCmd = new Command()
  .description("Manage background watch loop")
  .command("start", watchStartCmd)
  .command("stop", watchStopCmd)
  .command("status", watchStatusCmd);

const syncCmd = new Command()
  .description("Run one sync cycle for a vault path")
  .arguments("<vault-path:string>")
  .action(async (_opts: void, vaultPath: string) => {
    const service = await loadServiceClient();
    await service.syncOnce({ vaultPath });
    console.log(`sync complete: ${vaultPath}`);
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
  .command("watch", watchCmd)
  .command("sync", syncCmd)
  .parse(Deno.args);
