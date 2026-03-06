import { parseVault } from "../core/parser.ts";
import {
  buildGraph,
  extractSubgraph,
  topologicalSort,
  withVirtualEdges,
} from "../core/graph.ts";
import { validate } from "../core/validator.ts";
import { executeGraph } from "../core/executor.ts";
import { DenoVaultReader } from "../infrastructure/fs/deno-vault-fs.ts";
import { feedbackToVirtualEdgeUpdates } from "../links/feedback.ts";
import {
  applyVirtualEdgeDecay,
  applyVirtualEdgeUpdate,
} from "../links/learning.ts";
import { nextVirtualEdgeStatus, PROMOTION_POLICY } from "../links/policy.ts";
import {
  buildRuntimeInputSchema,
  validateRuntimeInputsForGraph,
} from "../routing/runtime-inputs.ts";
import {
  evaluateIntentCandidates,
  formatIntentCandidateLine,
} from "../routing/intent-candidates.ts";
import {
  buildTargetIdentifierIndex,
  resolveTargetIdentifier,
} from "../routing/target-identifiers.ts";
import { errorJson, eventJson } from "../cli-runtime/output.ts";
import {
  EXIT_CODE_RUNTIME,
  EXIT_CODE_VALIDATION,
} from "../cli-runtime/exit-codes.ts";
import {
  parseRuntimeInputsArg,
  toInputParseErrorDetails,
} from "./input-contract.ts";

function resolveDbPath(vaultPath: string): string {
  return `${vaultPath}/.vault-exec/vault.kv`;
}

function noGruWeightsMessage(vaultPath: string): string {
  return `Intent routing requires trained GRU weights, but none were found for this vault (${
    resolveDbPath(vaultPath)
  }). Run 'vault-exec init ${vaultPath}' first, then run intent commands.`;
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

function failIntentRouterNotInitialized(
  human: boolean,
  vaultPath: string,
  reason?: string,
): never {
  emitError(human, {
    code: "INTENT_ROUTER_NOT_INITIALIZED",
    category: "validation",
    message: noGruWeightsMessage(vaultPath),
    details: reason ? { reason } : undefined,
  });
  Deno.exit(EXIT_CODE_VALIDATION);
}

function printInputSchema(
  human: boolean,
  schema: Record<string, unknown>,
): void {
  if (human) {
    console.log("[input_schema]");
    console.log(JSON.stringify(schema, null, 2));
    return;
  }
  emitEvent(false, "input_schema", { schema });
}

async function loadNotes(dir: string) {
  const reader = new DenoVaultReader();
  const notes = await parseVault(reader, dir);
  if (notes.length === 0) {
    console.error(`No .md files found in ${dir}`);
    Deno.exit(1);
  }
  return notes;
}

export interface RunCommandOptions {
  target?: string;
  intent?: string;
  confirm?: boolean;
  train?: boolean;
  dry?: boolean;
  inputs?: string;
  human?: boolean;
}

export async function runVaultCommand(
  opts: RunCommandOptions,
  vaultPath: string,
): Promise<void> {
  const human = opts.human === true;
  const skipTrain = opts.train === false;
  const vaultDbPath = resolveDbPath(vaultPath);

  let preloadedIntentWeightsBlob: Uint8Array | undefined;
  if (opts.intent) {
    try {
      const { openVaultStore } = await import("../db/index.ts");
      const db = await openVaultStore(vaultDbPath);
      try {
        const weightsRow = await db.getLatestWeights();
        if (!weightsRow) {
          failIntentRouterNotInitialized(human, vaultPath);
        }
        preloadedIntentWeightsBlob = weightsRow.blob;
      } finally {
        db.close();
      }
    } catch (err) {
      failIntentRouterNotInitialized(
        human,
        vaultPath,
        (err as Error).message,
      );
    }
  }

  const notes = await loadNotes(vaultPath);
  const fullGraph = buildGraph(notes);
  const targetIndex = buildTargetIdentifierIndex([
    ...fullGraph.nodes.keys(),
  ]);

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

  let intentEmbedding: number[] | undefined;
  let rejectedTargets: Array<
    { target: string; path: string[]; score: number }
  > = [];
  let selectedBeamPath: string[] | null = null;

  let parsedRuntimeInputs: Record<string, unknown> = {};
  if (opts.inputs) {
    const parsed = await parseRuntimeInputsArg(opts.inputs);
    if (!parsed.ok) {
      emitError(human, {
        code: "INPUT_PARSE_ERROR",
        category: "validation",
        message: `Failed to parse --inputs: ${parsed.message}`,
        details: toInputParseErrorDetails(opts.inputs, parsed),
      });
      Deno.exit(EXIT_CODE_VALIDATION);
    }
    parsedRuntimeInputs = parsed.payload;
  }

  if (opts.intent) {
    const originalWarn = console.warn;
    if (!human) console.warn = () => {};
    try {
      const { openVaultStore } = await import("../db/index.ts");
      const { GRUInference } = await import("../gru/inference.ts");
      const { deserializeWeights } = await import("../gru/weights.ts");
      const { EmbeddingModel, BGEEmbedder } = await import(
        "../embeddings/model.ts"
      );

      const db = await openVaultStore(vaultDbPath);
      const { weights, vocab, config } = await deserializeWeights(
        preloadedIntentWeightsBlob!,
      );
      const embedder = new EmbeddingModel(new BGEEmbedder());
      intentEmbedding = await embedder.encode(opts.intent);
      const gru = new GRUInference(weights, vocab, config);

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

      const seenTargets = new Map<string, typeof beams[0]>();
      for (const beam of beams) {
        const target = beam.path[beam.path.length - 1];
        if (
          !seenTargets.has(target) ||
          beam.score > seenTargets.get(target)!.score
        ) {
          seenTargets.set(target, beam);
        }
      }
      const uniqueBeams = [...seenTargets.values()].sort((a, b) =>
        b.score - a.score
      );

      const rawScores = uniqueBeams.map((b) => b.score);
      const maxScore = Math.max(...rawScores);
      const expScores = rawScores.map((s) => Math.exp(s - maxScore));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      const normalizedScores = expScores.map((e) => e / sumExp);

      const maxCandidates = 3;
      const displayBeams = uniqueBeams.slice(0, maxCandidates);
      const displayScores = normalizedScores.slice(0, maxCandidates);
      const displaySum = displayScores.reduce((a, b) => a + b, 0);
      const renormalized = displayScores.map((s) => s / displaySum);

      emitEvent(
        human,
        "intent",
        { intent: opts.intent! },
        `[intent] ${opts.intent}`,
      );
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
      if (
        candidateCompatibility.length > 0 &&
        candidateCompatibility.every((c) => !c.payloadOk)
      ) {
        const compactReasons = candidateCompatibility.map((c) =>
          `${c.targetId}:${c.payloadStatus}`
        ).join(" | ");
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
        emitEvent(
          human,
          "confirm_prompt",
          { max_choice: noneIdx },
          `[confirm] Select (1-${noneIdx}):`,
        );
        const buf = new Uint8Array(64);
        const n = await Deno.stdin.read(buf);
        const input = new TextDecoder().decode(buf.subarray(0, n ?? 0)).trim();
        const choice = parseInt(input);

        if (isNaN(choice) || choice < 1 || choice > noneIdx) {
          emitEvent(human, "confirm_skipped", {
            reason: "invalid_choice",
            raw_input: input,
          }, "[skip] Invalid input. No trace recorded.");
          db.close();
          await embedder.dispose();
          return;
        }

        if (choice === noneIdx) {
          emitEvent(
            human,
            "intent_none_selected",
            { choice },
            "[none] All candidates rejected.",
          );
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
          try {
            const { recordTrace } = await import("../traces/recorder.ts");
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
              const row = await applyVirtualEdgeUpdate(db, u);
              const next = nextVirtualEdgeStatus(row);
              if (next !== row.status) {
                await db.setVirtualEdgeStatus(row.source, row.target, next);
              }
            }
            await applyVirtualEdgeDecay(db, PROMOTION_POLICY.decayFactor);
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

      try {
        const updates = feedbackToVirtualEdgeUpdates(
          fullGraph,
          selectedBeamPath,
          rejectedTargets.map((r) => r.path),
        );
        for (const u of updates) {
          const row = await applyVirtualEdgeUpdate(db, u);
          const next = nextVirtualEdgeStatus(row);
          if (next !== row.status) {
            await db.setVirtualEdgeStatus(row.source, row.target, next);
          }
        }
        await applyVirtualEdgeDecay(db, PROMOTION_POLICY.decayFactor);
      } catch {
        // Non-fatal: run should proceed even if edge-learning persistence fails.
      }

      db.close();
      await embedder.dispose();
    } catch (err) {
      const errMsg = (err as Error).message;
      if (
        errMsg.includes("unable to open database file") ||
        errMsg.includes("No GRU weights found") ||
        errMsg.includes("trained GRU weights")
      ) {
        failIntentRouterNotInitialized(human, vaultPath, errMsg);
      }
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

  let graph = targetNote ? extractSubgraph(fullGraph, targetNote) : fullGraph;
  try {
    const { openVaultStore } = await import("../db/index.ts");
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
    if (targetNote && Object.keys(runtimeInputs).length === 0) {
      printInputSchema(
        human,
        runtimeSchema as unknown as Record<string, unknown>,
      );
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
      printInputSchema(
        human,
        runtimeSchema as unknown as Record<string, unknown>,
      );
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
        errors: errors.map((err) => ({
          node: err.node,
          type: err.type,
          message: err.message,
        })),
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
    const targetInfo = targetNote
      ? targetIndex.byName.get(targetNote)
      : undefined;
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
    if (runtimeSchema) {
      printInputSchema(
        human,
        runtimeSchema as unknown as Record<string, unknown>,
      );
    }
    return;
  }

  emitEvent(human, "run_start", {
    label,
    node_count: nodeCount,
    vault_path: vaultPath,
  }, `Running ${label}: ${vaultPath} (${nodeCount} notes)\n`);

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
    const outputEntries = [...results.entries()].map(([name, output]) => ({
      node: name,
      output,
    }));
    emitEvent(false, "run_result", {
      outputs: outputEntries,
      path,
    });
  }

  try {
    const { openVaultStore } = await import("../db/index.ts");
    const { recordTrace } = await import("../traces/recorder.ts");
    const db = await openVaultStore(vaultDbPath);

    await recordTrace(db, {
      intent: opts.intent,
      intentEmbedding,
      targetNote: path[path.length - 1],
      path,
      success: true,
      synthetic: false,
    });

    const successUpdates = feedbackToVirtualEdgeUpdates(
      fullGraph,
      path,
      [],
    );
    for (const u of successUpdates) {
      const row = await applyVirtualEdgeUpdate(db, {
        ...u,
        reason: "execution_success",
      });
      const next = nextVirtualEdgeStatus(row);
      if (next !== row.status) {
        await db.setVirtualEdgeStatus(row.source, row.target, next);
      }
    }

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
    const negMsg = rejectedTargets.length > 0
      ? ` + ${rejectedTargets.length} negative`
      : "";
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

  if (!skipTrain) {
    try {
      const { retrain } = await import("./retrain.ts");
      emitEvent(human, "retraining_start", {}, "Retraining...");
      const result = await retrain(notes, vaultDbPath, null, {
        skipReindex: true,
        maxEpochs: 5,
        verbose: false,
      });
      if (result.gruTrained) {
        emitEvent(
          human,
          "retraining_done",
          { traces_used: result.tracesUsed, accuracy: result.gruAccuracy },
          `✓ Retrained: ${result.tracesUsed} traces, accuracy=${
            (result.gruAccuracy * 100).toFixed(1)
          }%`,
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
}
