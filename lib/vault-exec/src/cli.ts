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
import {
  buildTargetIdentifierIndex,
  resolveTargetIdentifier,
} from "./target-identifiers.ts";
import { errorJson, eventJson } from "./output.ts";
import { EXIT_CODE_RUNTIME, EXIT_CODE_VALIDATION } from "./exit-codes.ts";

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

function emitEvent(
  human: boolean,
  type: string,
  payload: Record<string, unknown>,
  humanText?: string,
): void {
  if (human) {
    if (humanText) console.log(humanText);
    return;
  }
  console.log(eventJson(type, payload));
}

function emitError(
  human: boolean,
  args: {
    code: string;
    category: "validation" | "runtime" | "internal";
    message: string;
    details?: Record<string, unknown>;
    humanText?: string;
  },
): void {
  if (human) {
    console.error(args.humanText ?? `✗ ${args.message}`);
    return;
  }
  console.log(errorJson(args));
}

function printInputSchema(human: boolean, schema: Record<string, unknown>): void {
  if (human) {
    console.log("[input_schema]");
    console.log(JSON.stringify(schema, null, 2));
    return;
  }
  emitEvent(false, "input_schema", { schema });
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
  .alias("v")
  .description("Check for cycles, missing inputs, orphans")
  .arguments("<vault-path:string>")
  .option("-H, --human", "Human-readable output (default: JSONL)")
  .action(async (opts: { human?: boolean }, vaultPath: string) => {
    const human = opts.human === true;
    const notes = await loadNotes(vaultPath);
    const graph = buildGraph(notes);
    const errors = validate(graph);
    if (errors.length === 0) {
      emitEvent(human, "validate_ok", { note_count: notes.length }, `✓ ${notes.length} notes, no errors`);
      return;
    }

    emitError(human, {
      code: "GRAPH_VALIDATION_ERROR",
      category: "validation",
      message: `${errors.length} validation error(s)`,
      details: {
        error_count: errors.length,
        errors: errors.map((err) => ({ node: err.node, type: err.type, message: err.message })),
      },
      humanText: `✗ ${errors.length} error(s):`,
    });
    if (human) {
      for (const err of errors) {
        console.error(`  [${err.type}] ${err.message}`);
      }
    }
    Deno.exit(EXIT_CODE_VALIDATION);
  });

const graphCmd = new Command()
  .alias("g")
  .description("Print dependency graph and execution order")
  .arguments("<vault-path:string>")
  .option("-H, --human", "Human-readable output (default: JSONL)")
  .action(async (opts: { human?: boolean }, vaultPath: string) => {
    const human = opts.human === true;
    const notes = await loadNotes(vaultPath);
    const graph = buildGraph(notes);
    const order = topologicalSort(graph);

    if (human) {
      console.log("Execution order:");
      for (let i = 0; i < order.length; i++) {
        const name = order[i];
        const node = graph.nodes.get(name)!;
        const deps = graph.edges.get(name) ?? [];
        const depStr = deps.length > 0 ? ` <- [${deps.join(", ")}]` : "";
        console.log(`  ${i + 1}. ${name} (${node.type})${depStr}`);
      }
      return;
    }

    emitEvent(false, "graph", {
      execution_order: order,
      nodes: order.map((name, i) => {
        const node = graph.nodes.get(name)!;
        const deps = graph.edges.get(name) ?? [];
        return {
          index: i + 1,
          name,
          node_type: node.type,
          dependencies: deps,
        };
      }),
      note_count: notes.length,
      vault_path: vaultPath,
    });
  });

const runCmd = new Command()
  .alias("r")
  .description("Execute the compiled DAG (full, by target, or by intent)")
  .arguments("<vault-path:string>")
  .option("-t, --target <target:string>", "Execute only the subgraph needed for this note")
  .option("-i, --intent <intent:string>", "GRU routes intent to target note, then executes its subgraph")
  .option("--no-confirm", "Auto-select best candidate instead of asking for a numbered choice")
  .option("--no-train", "Skip live retraining after execution")
  .option("--dry", "Preview target execution and required runtime input schema without executing")
  .option("-I, --inputs <inputs:string>", "Runtime input payload (JSON string or @path/to/inputs.json)")
  .option("-H, --human", "Human-readable output (default: JSONL)")
  .action(async (opts: { target?: string; intent?: string; confirm?: boolean; train?: boolean; dry?: boolean; inputs?: string; human?: boolean }, vaultPath: string) => {
    const human = opts.human === true;
    const skipTrain = opts.train === false;
    const notes = await loadNotes(vaultPath);
    const fullGraph = buildGraph(notes);
    const vaultDbPath = resolveDbPath(vaultPath);
    const targetIndex = buildTargetIdentifierIndex([...fullGraph.nodes.keys()]);

    // Resolve target note (exact name, normalized id, or shorthand alias)
    let targetNote: string | undefined;
    if (opts.target) {
      const resolved = resolveTargetIdentifier(opts.target, targetIndex);
      if (!resolved) {
        emitError(human, {
          code: "TARGET_NOT_FOUND",
          category: "validation",
          message: `Unknown target reference: ${opts.target}`,
          details: {
            input: opts.target,
            available: targetIndex.entries.map((entry) => ({
              name: entry.name,
              target_id: entry.id,
              target_alias: entry.alias,
            })),
          },
        });
        Deno.exit(EXIT_CODE_VALIDATION);
      }
      targetNote = resolved.name;
      if (!human) {
        emitEvent(false, "target_resolved", {
          input: opts.target,
          target: resolved.name,
          target_alias: resolved.alias,
          target_id: resolved.id,
        });
      }
    }
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
        emitError(human, {
          code: "INPUT_PARSE_ERROR",
          category: "validation",
          message: `Failed to parse --inputs: ${(err as Error).message}`,
          details: { inputs: opts.inputs },
        });
        Deno.exit(EXIT_CODE_VALIDATION);
      }
    }

    if (opts.intent) {
      // GRU intent routing with beam search
      const originalWarn = console.warn;
      if (!human) console.warn = () => {};
      try {
        const { openVaultStore } = await import("./db/index.ts");
        const { GRUInference } = await import("./gru/inference.ts");
        const { deserializeWeights } = await import("./gru/weights.ts");
        const { EmbeddingModel, BGEEmbedder } = await import("./embeddings/model.ts");

        const db = await openVaultStore(vaultDbPath);
        const weightsRow = await db.getLatestWeights();
        if (!weightsRow) {
          emitError(human, {
            code: "INTENT_ROUTER_NOT_INITIALIZED",
            category: "validation",
            message: "No GRU weights found. Run 'vault-exec init' first, then accumulate traces.",
          });
          Deno.exit(EXIT_CODE_VALIDATION);
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
          emitError(human, {
            code: "INTENT_NO_CANDIDATES",
            category: "validation",
            message: "Beam search returned no candidates.",
            details: { intent: opts.intent },
          });
          Deno.exit(EXIT_CODE_VALIDATION);
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

        emitEvent(human, "intent", { intent: opts.intent! }, `[intent] ${opts.intent}`);
        emitEvent(
          human,
          "candidate_count",
          { count: displayBeams.length + 1 },
          `[candidates] ${displayBeams.length + 1}`,
        );
        const candidateCompatibility = evaluateIntentCandidates(
          fullGraph,
          displayBeams.map((b, i) => ({
            target: b.path[b.path.length - 1],
            confidence: renormalized[i],
            path: b.path,
          })),
          parsedRuntimeInputs,
          targetIndex,
        );
        for (let i = 0; i < candidateCompatibility.length; i++) {
          const candidate = candidateCompatibility[i];
          emitEvent(
            human,
            "intent_candidate",
            {
              index: i + 1,
              candidate_id: candidate.candidateId,
              confidence: candidate.confidence,
              target: candidate.target,
              target_alias: candidate.targetAlias,
              target_id: candidate.targetId,
              validation: candidate.validation,
              payload_ok: candidate.payloadOk,
              payload_status: candidate.payloadStatus,
              path: candidate.path,
            },
            formatIntentCandidateLine(i + 1, candidate),
          );
        }
        if (candidateCompatibility.length > 0 && candidateCompatibility.every((c) => !c.payloadOk)) {
          const compactReasons = candidateCompatibility.map((c) => `${c.targetId}:${c.payloadStatus}`).join(" | ");
          emitEvent(
            human,
            "candidate_compatibility_summary",
            {
              all_invalid: true,
              reasons: candidateCompatibility.map((c) => ({
                target: c.target,
                target_alias: c.targetAlias,
                target_id: c.targetId,
                payload_status: c.payloadStatus,
              })),
            },
            `[compatibility] No candidate is schema-compatible with the provided payload (${compactReasons})`,
          );
        }
        emitEvent(
          human,
          "intent_candidate_none",
          { index: displayBeams.length + 1 },
          `[${displayBeams.length + 1}] none`,
        );

        if (opts.confirm !== false) {
          const noneIdx = displayBeams.length + 1;
          emitEvent(human, "confirm_prompt", { max_choice: noneIdx }, `[confirm] Select (1-${noneIdx}):`);
          const buf = new Uint8Array(64);
          const n = await Deno.stdin.read(buf);
          const input = new TextDecoder().decode(buf.subarray(0, n ?? 0)).trim();
          const choice = parseInt(input);

          if (isNaN(choice) || choice < 1 || choice > noneIdx) {
            emitEvent(human, "confirm_skipped", { reason: "invalid_choice", raw_input: input }, "[skip] Invalid input. No trace recorded.");
            db.close();
            await embedder.dispose();
            return;
          }

          if (choice === noneIdx) {
            // "none" selected — ALL candidates are negative
            emitEvent(human, "intent_none_selected", { choice }, "[none] All candidates rejected.");
            rejectedTargets = displayBeams.map((b) => ({
              target: b.path[b.path.length - 1],
              path: b.path,
              score: b.score,
            }));
            emitEvent(
              human,
              "intent_rejected_candidates",
              { count: rejectedTargets.length },
              `[negatives] ${rejectedTargets.length} rejected candidates stored`,
            );
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
              emitEvent(
                human,
                "trace_recorded",
                { negative_count: rejectedTargets.length, positive_count: 0 },
                `[trace] ${rejectedTargets.length} negative recorded.`,
              );
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
          const selectedInfo = targetIndex.byName.get(targetNote);
          emitEvent(
            human,
            "intent_selected",
            {
              choice,
              target: targetNote,
              target_alias: selectedInfo?.alias ?? targetNote,
              target_id: selectedInfo?.id ?? targetNote,
            },
            `[selected] ${choice} → target=${targetNote}`,
          );

          // Store rejected candidates as negative examples
          rejectedTargets = displayBeams
            .filter((_, i) => i !== choice - 1)
            .map((b) => ({
              target: b.path[b.path.length - 1],
              path: b.path,
              score: b.score,
            }));
          if (rejectedTargets.length > 0) {
            emitEvent(
              human,
              "intent_rejected_candidates",
              { count: rejectedTargets.length },
              `[negatives] ${rejectedTargets.length} rejected candidates stored`,
            );
          }
        } else {
          // Auto-select best candidate
          selectedBeamPath = displayBeams[0].path;
          targetNote = selectedBeamPath[selectedBeamPath.length - 1];
          const selectedInfo = targetIndex.byName.get(targetNote);
          emitEvent(
            human,
            "intent_auto_selected",
            {
              target: targetNote,
              target_alias: selectedInfo?.alias ?? targetNote,
              target_id: selectedInfo?.id ?? targetNote,
            },
            `[auto] target=${targetNote}`,
          );
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
        const message = `GRU routing failed: ${(err as Error).message}`;
        if (human) {
          console.error(`[error] ${message}`);
          console.error("Falling back to full DAG execution.");
        } else {
          emitEvent(false, "intent_routing_fallback", {
            error: message,
            fallback: "full_dag_execution",
          });
        }
      } finally {
        console.warn = originalWarn;
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
        printInputSchema(human, runtimeSchema as unknown as Record<string, unknown>);
        return;
      }

      const inputValidation = validateRuntimeInputsForGraph(graph, runtimeInputs);
      if (!inputValidation.ok) {
        emitError(human, {
          code: "INPUT_VALIDATION_ERROR",
          category: "validation",
          message: "Runtime input validation failed",
          details: {
            expected_schema: runtimeSchema,
            issues: inputValidation.issues.map((issue) => ({
              path: issue.path || "/",
              kind: issue.kind,
              message: issue.message,
            })),
            status: inputValidation.status,
          },
          humanText: "✗ Runtime input validation failed:",
        });
        if (human) {
          for (const issue of inputValidation.issues) {
            console.error(`  - ${issue.path || "/"}: ${issue.message}`);
          }
        }
        printInputSchema(human, runtimeSchema as unknown as Record<string, unknown>);
        Deno.exit(EXIT_CODE_VALIDATION);
      }
    }

    const errors = validate(graph);
    if (errors.length > 0) {
      emitError(human, {
        code: "GRAPH_VALIDATION_ERROR",
        category: "validation",
        message: `Cannot run: ${errors.length} validation error(s)`,
        details: {
          error_count: errors.length,
          errors: errors.map((err) => ({ node: err.node, type: err.type, message: err.message })),
        },
        humanText: `✗ Cannot run: ${errors.length} validation error(s)`,
      });
      if (human) {
        for (const err of errors) {
          console.error(`  [${err.type}] ${err.message}`);
        }
      }
      Deno.exit(EXIT_CODE_VALIDATION);
    }

    const nodeCount = graph.nodes.size;
    const label = targetNote ? `subgraph for "${targetNote}"` : "full DAG";
    if (opts.dry) {
      const order = topologicalSort(graph);
      const targetInfo = targetNote ? targetIndex.byName.get(targetNote) : undefined;
      emitEvent(
        human,
        "dry_run",
        {
          execution_order: order,
          label,
          node_count: nodeCount,
          target: targetNote,
          target_alias: targetInfo?.alias,
          target_id: targetInfo?.id,
          vault_path: vaultPath,
        },
        `[dry] ${label}: ${vaultPath} (${nodeCount} notes)`,
      );
      if (human) {
        console.log("[dry] execution_order");
        for (let i = 0; i < order.length; i++) {
          console.log(`  ${i + 1}. ${order[i]}`);
        }
      }
      if (runtimeSchema) printInputSchema(human, runtimeSchema as unknown as Record<string, unknown>);
      return;
    }

    emitEvent(human, "run_start", { label, node_count: nodeCount, vault_path: vaultPath }, `Running ${label}: ${vaultPath} (${nodeCount} notes)\n`);

    let execution;
    try {
      execution = await executeGraph(graph, runtimeInputs, { verbose: human });
    } catch (err) {
      emitError(human, {
        code: "EXECUTION_FAILED",
        category: "runtime",
        message: `Execution failed: ${(err as Error).message}`,
      });
      Deno.exit(EXIT_CODE_RUNTIME);
    }
    const { results, path } = execution;

    if (human) {
      console.log("\n── Results ──");
      for (const [name, output] of results) {
        console.log(`${name}: ${JSON.stringify(output)}`);
      }
    } else {
      const outputEntries = [...results.entries()].map(([name, output]) => ({ node: name, output }));
      emitEvent(false, "run_result", {
        outputs: outputEntries,
        path,
      });
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
      emitEvent(
        human,
        "trace_recorded",
        { positive_count: 1, negative_count: rejectedTargets.length },
        `\n[trace] 1 positive${negMsg} recorded.`,
      );
    } catch {
      emitEvent(
        human,
        "trace_unavailable",
        { hint: "Run 'vault-exec init' to enable learning." },
        "\n[trace] No vault DB found. Run 'vault-exec init' to enable learning.",
      );
    }

    // Live retraining (unless --no-train)
    if (!skipTrain) {
      try {
        const { retrain } = await import("./retrain.ts");
        emitEvent(human, "retraining_start", {}, "Retraining...");
        const result = await retrain(notes, vaultDbPath, null, {
          skipReindex: true, // notes haven't changed during this run
          maxEpochs: 5,
          verbose: false,
        });
        if (result.gruTrained) {
          emitEvent(
            human,
            "retraining_done",
            { traces_used: result.tracesUsed, accuracy: result.gruAccuracy },
            `✓ Retrained: ${result.tracesUsed} traces, accuracy=${(result.gruAccuracy * 100).toFixed(1)}%`,
          );
        }
      } catch (err) {
        const message = `Retraining failed: ${(err as Error).message}`;
        if (human) {
          console.error(`⚠ ${message}`);
        } else {
          emitEvent(false, "retraining_failed", { error: message });
        }
      }
    }
  });

const compileCmd = new Command()
  .alias("c")
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
  .alias("n")
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
  .alias("st")
  .description("Start background watch loop for a vault path")
  .arguments("<vault-path:string>")
  .option("--idle-secs <idleSecs:number>", "Idle window in seconds before batching sync")
  .action(async (opts: { idleSecs?: number }, vaultPath: string) => {
    const service = await loadServiceClient();
    await service.startWatch({ vaultPath, idleSecs: opts.idleSecs });
    console.log(`watch started: ${vaultPath}`);
  });

const watchStopCmd = new Command()
  .alias("sp")
  .description("Stop background watch loop for a vault path")
  .arguments("<vault-path:string>")
  .action(async (_opts: void, vaultPath: string) => {
    const service = await loadServiceClient();
    await service.stopWatch({ vaultPath });
    console.log(`watch stopped: ${vaultPath}`);
  });

const watchStatusCmd = new Command()
  .alias("ss")
  .description("Show background watch status for a vault path")
  .arguments("<vault-path:string>")
  .action(async (_opts: void, vaultPath: string) => {
    const service = await loadServiceClient();
    const status = await service.watchStatus({ vaultPath });
    console.log(JSON.stringify(status, null, 2));
  });

const watchCmd = new Command()
  .alias("w")
  .description("Manage background watch loop")
  .command("start", watchStartCmd)
  .command("stop", watchStopCmd)
  .command("status", watchStatusCmd);

const syncCmd = new Command()
  .alias("s")
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
