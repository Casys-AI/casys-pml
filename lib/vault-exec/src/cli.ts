import { Command } from "jsr:@cliffy/command@1.0.0-rc.7";
import { loadSync } from "jsr:@std/dotenv";
import { parseVault } from "./core/parser.ts";
import { buildGraph, topologicalSort } from "./core/graph.ts";
import { validate } from "./core/validator.ts";
import { DenoVaultReader } from "./infrastructure/fs/deno-vault-fs.ts";
import { errorJson, eventJson } from "./cli-runtime/output.ts";
import { EXIT_CODE_VALIDATION } from "./cli-runtime/exit-codes.ts";
import { runVaultCommand } from "./workflows/run.ts";

// Load .env.local (gitignored) then .env as fallback
try {
  loadSync({ envPath: ".env.local", export: true });
} catch { /* ok */ }
try {
  loadSync({ export: true });
} catch { /* ok */ }

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

const PREFLIGHT_LIST_LIMIT = 20;

function printNamedPreflightList(title: string, names: string[]): void {
  const uniqueSorted = [...new Set(names)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
  console.error(`\n${title} (${uniqueSorted.length}):`);
  const shown = uniqueSorted.slice(0, PREFLIGHT_LIST_LIMIT);
  for (const name of shown) {
    console.error(`  - ${name}`);
  }
  const remaining = uniqueSorted.length - shown.length;
  if (remaining > 0) {
    console.error(`  ... +${remaining} more`);
  }
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
      emitEvent(
        human,
        "validate_ok",
        { note_count: notes.length },
        `✓ ${notes.length} notes, no errors`,
      );
      return;
    }

    emitError(human, {
      code: "GRAPH_VALIDATION_ERROR",
      category: "validation",
      message: `${errors.length} validation error(s)`,
      details: {
        error_count: errors.length,
        errors: errors.map((err) => ({
          node: err.node,
          type: err.type,
          message: err.message,
        })),
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
  .option(
    "-t, --target <target:string>",
    "Execute only the subgraph needed for this note",
  )
  .option(
    "-i, --intent <intent:string>",
    "GRU routes intent to target note, then executes its subgraph",
  )
  .option(
    "--no-confirm",
    "Auto-select best candidate instead of asking for a numbered choice",
  )
  .option("--no-train", "Skip live retraining after execution")
  .option(
    "--dry",
    "Preview target execution and required runtime input schema without executing",
  )
  .option(
    "-I, --inputs <inputs:string>",
    "Runtime input payload (JSON string or @path/to/inputs.json)",
  )
  .option(
    "--payload-mode <mode:string>",
    "Runtime payload mode: strict (default) or project",
    { default: "strict" },
  )
  .option("-H, --human", "Human-readable output (default: JSONL)")
  .action(
    async (opts: Parameters<typeof runVaultCommand>[0], vaultPath: string) => {
      await runVaultCommand(opts, vaultPath);
    },
  );

const compileCmd = new Command()
  .alias("c")
  .description("Compile uncompiled notes using LLM")
  .arguments("<vault-path:string>")
  .option("-m, --model <model:string>", "OpenAI model to use", {
    default: "gpt-4o-mini",
  })
  .action(async (opts: { model: string }, vaultPath: string) => {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.error(
        "OPENAI_API_KEY environment variable is required for compilation",
      );
      Deno.exit(1);
    }

    const notes = await loadNotes(vaultPath);
    const { compileVault } = await import("./core/compiler.ts");
    const { OpenAIClient } = await import(
      "./infrastructure/llm/openai-client.ts"
    );
    const { DenoVaultWriter } = await import(
      "./infrastructure/fs/deno-vault-fs.ts"
    );
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
  .description("Initialize DB-first trace import, rebuild, and projection")
  .arguments("<vault-path:string>")
  .action(async (_opts: void, vaultPath: string) => {
    const notes = await loadNotes(vaultPath);
    const { validateFrontmatter } = await import("./core/compiler.ts");
    const graph = buildGraph(notes);
    const graphErrors = validate(graph);
    const uncompiledNotes = notes
      .filter((n) => !n.frontmatter.compiled_at)
      .map((n) => n.name)
      .sort((a, b) => a.localeCompare(b));
    const frontmatterIssues = notes
      .filter((n) => !!n.frontmatter.compiled_at)
      .map((note) => ({
        note: note.name,
        errors: validateFrontmatter(note.frontmatter, notes),
      }))
      .filter((entry) => entry.errors.length > 0)
      .sort((a, b) => a.note.localeCompare(b.note));

    if (
      graphErrors.length > 0 ||
      frontmatterIssues.length > 0 ||
      uncompiledNotes.length > 0
    ) {
      const unknownTypeNodes = graphErrors
        .filter((err) => err.type === "unknown_type" && err.node.length > 0)
        .map((err) => err.node);
      const otherGraphErrors = graphErrors.filter((err) =>
        err.type !== "unknown_type"
      );

      console.error(
        "Init preflight failed. Fix the following before running init:",
      );
      if (graphErrors.length > 0) {
        console.error(`\nGraph validation errors (${graphErrors.length}):`);
        if (unknownTypeNodes.length > 0) {
          printNamedPreflightList(
            "Nodes with invalid payload type (need exactly one of value|code|tool)",
            unknownTypeNodes,
          );
        }
        for (const err of otherGraphErrors) {
          console.error(`  [${err.type}] ${err.message}`);
        }
      }
      if (frontmatterIssues.length > 0) {
        const errorCount = frontmatterIssues.reduce(
          (sum, item) => sum + item.errors.length,
          0,
        );
        console.error(`\nFrontmatter validation errors (${errorCount}):`);
        for (const issue of frontmatterIssues) {
          for (const message of issue.errors) {
            console.error(`  [${issue.note}] ${message}`);
          }
        }
      }
      if (uncompiledNotes.length > 0) {
        printNamedPreflightList("Non-compiled notes", uncompiledNotes);
        console.error(
          `\nRun 'vault-exec compile ${vaultPath}' (or set frontmatter.compiled_at) before init.`,
        );
      }
      Deno.exit(EXIT_CODE_VALIDATION);
    }

    const { BGEEmbedder } = await import("./embeddings/model.ts");
    const { initVaultWithTraceImport } = await import("./workflows/init.ts");

    const dbPath = resolveDbPath(vaultPath);
    await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });

    console.log(`Initializing vault: ${vaultPath}\n`);
    const embedder = new BGEEmbedder();
    const result = await initVaultWithTraceImport(
      vaultPath,
      notes,
      dbPath,
      embedder,
    );

    console.log(`\nDone:`);
    console.log(
      `  Trace import: ${result.traceImport.sessionsImported} session(s), ${result.traceImport.toolCallsStored} tool call(s), ${result.traceImport.changedFiles} changed file(s)`,
    );
    if (result.traceImport.warnings.length > 0) {
      console.log(
        `  Trace warnings: ${result.traceImport.warnings.length}`,
      );
    }
    console.log(
      "  Derived tables: rebuilt in .vault-exec/vault.kv",
    );
    console.log(
      "  Training: notebook-first in this phase (05, 06, 08 under notebooks/)",
    );
  });

const watchStartCmd = new Command()
  .alias("st")
  .description("Start background watch loop for a vault path")
  .arguments("<vault-path:string>")
  .option(
    "--idle-secs <idleSecs:number>",
    "Idle window in seconds before batching sync",
  )
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

const ingestCmd = new Command()
  .alias("i")
  .description("Ingest OpenClaw JSONL sessions into markdown trace notes")
  .arguments("<source-path:string> <output-path:string>")
  .action(async (_opts: void, sourcePath: string, outputPath: string) => {
    try {
      const { ingestOpenClawSessions } = await import("./ingest/ingest.ts");
      const result = await ingestOpenClawSessions({ sourcePath, outputPath });
      console.log(
        `ingest complete: ${result.sessionsProcessed} sessions, ${result.toolsProcessed} tools`,
      );
      console.log(`sessions: ${outputPath}/sessions`);
      console.log(`tools: ${outputPath}/tools`);
      console.log(`coverage: ${result.coverageReportPath}`);
      console.log(
        `l2 summary: hits=${result.l2Coverage.totalHits} fallback=${result.l2Coverage.totalFallbacks} hit_rate=${
          (result.l2Coverage.hitRate * 100).toFixed(1)
        }%`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ingest failed: ${message}`);
      Deno.exit(1);
    }
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
  .command("ingest", ingestCmd)
  .parse(Deno.args);
