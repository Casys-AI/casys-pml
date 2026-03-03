#!/usr/bin/env -S deno run --allow-all --unstable-ffi
/**
 * SHGAT Training Console
 * Beautiful CLI monitoring with progress bars, metrics, and real-time updates
 */

import "@std/dotenv/load";
import { parseArgs } from "@std/cli/parse-args";
import { NUM_NEGATIVES } from "../src/graphrag/algorithms/shgat/types.ts";
import {
  normalizeToolId,
  buildRenameChain,
  buildToolNameResolver,
  canonicalizeCaps,
  dedupTracesByIntent,
  capExamplesPerTarget,
} from "../lib/gru/src/data-prep/index.ts";
import type { CapData } from "../lib/gru/src/data-prep/index.ts";
import postgres from "postgres";

// ============================================================================
// ANSI Escape Codes & Styling
// ============================================================================

const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const ITALIC = `${ESC}3m`;

// Colors
const c = {
  black: (s: string) => `${ESC}30m${s}${RESET}`,
  red: (s: string) => `${ESC}31m${s}${RESET}`,
  green: (s: string) => `${ESC}32m${s}${RESET}`,
  yellow: (s: string) => `${ESC}33m${s}${RESET}`,
  blue: (s: string) => `${ESC}34m${s}${RESET}`,
  magenta: (s: string) => `${ESC}35m${s}${RESET}`,
  cyan: (s: string) => `${ESC}36m${s}${RESET}`,
  white: (s: string) => `${ESC}37m${s}${RESET}`,
  gray: (s: string) => `${ESC}90m${s}${RESET}`,

  // Bright variants
  brightRed: (s: string) => `${ESC}91m${s}${RESET}`,
  brightGreen: (s: string) => `${ESC}92m${s}${RESET}`,
  brightYellow: (s: string) => `${ESC}93m${s}${RESET}`,
  brightBlue: (s: string) => `${ESC}94m${s}${RESET}`,
  brightMagenta: (s: string) => `${ESC}95m${s}${RESET}`,
  brightCyan: (s: string) => `${ESC}96m${s}${RESET}`,

  // Background
  bgBlue: (s: string) => `${ESC}44m${s}${RESET}`,
  bgGreen: (s: string) => `${ESC}42m${s}${RESET}`,
  bgRed: (s: string) => `${ESC}41m${s}${RESET}`,
  bgYellow: (s: string) => `${ESC}43m${s}${RESET}`,

  bold: (s: string) => `${BOLD}${s}${RESET}`,
  dim: (s: string) => `${DIM}${s}${RESET}`,
  italic: (s: string) => `${ITALIC}${s}${RESET}`,
};

// Box drawing
const box = {
  tl: "╭", tr: "╮", bl: "╰", br: "╯",
  h: "─", v: "│",
  ltee: "├", rtee: "┤", ttee: "┬", btee: "┴",
  cross: "┼",
  // Double line
  dtl: "╔", dtr: "╗", dbl: "╚", dbr: "╝",
  dh: "═", dv: "║",
};

// Symbols
const sym = {
  check: "✓",
  cross: "✗",
  bullet: "●",
  circle: "○",
  arrow: "→",
  arrowUp: "↑",
  arrowDown: "↓",
  star: "★",
  sparkle: "✨",
  brain: "🧠",
  rocket: "🚀",
  chart: "📊",
  fire: "🔥",
  warning: "⚠",
  info: "ℹ",
  spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  bars: ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"],
};

// Terminal utilities
const term = {
  clear: () => console.log(`${ESC}2J${ESC}H`),
  clearLine: () => Deno.stdout.writeSync(new TextEncoder().encode(`${ESC}2K\r`)),
  moveTo: (row: number, col: number) => `${ESC}${row};${col}H`,
  moveUp: (n: number) => `${ESC}${n}A`,
  moveDown: (n: number) => `${ESC}${n}B`,
  saveCursor: () => `${ESC}s`,
  restoreCursor: () => `${ESC}u`,
  hideCursor: () => Deno.stdout.writeSync(new TextEncoder().encode(`${ESC}?25l`)),
  showCursor: () => Deno.stdout.writeSync(new TextEncoder().encode(`${ESC}?25h`)),
};

// ============================================================================
// UI Components
// ============================================================================

function renderBox(title: string, content: string[], width = 60): string {
  const lines: string[] = [];
  const innerWidth = width - 4;

  // Title bar
  const titleText = ` ${title} `;
  const titlePad = Math.max(0, innerWidth - titleText.length);
  const leftPad = Math.floor(titlePad / 2);
  const rightPad = titlePad - leftPad;

  lines.push(
    c.cyan(box.tl + box.h.repeat(leftPad)) +
    c.bold(c.brightCyan(titleText)) +
    c.cyan(box.h.repeat(rightPad) + box.tr)
  );

  // Content
  for (const line of content) {
    const stripped = stripAnsi(line);
    const pad = Math.max(0, innerWidth - stripped.length);
    lines.push(c.cyan(box.v) + " " + line + " ".repeat(pad) + " " + c.cyan(box.v));
  }

  // Bottom
  lines.push(c.cyan(box.bl + box.h.repeat(width - 2) + box.br));

  return lines.join("\n");
}

function stripAnsi(str: string): string {
  // deno-lint-ignore no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function sparkline(values: number[], width = 20, color = c.brightGreen): string {
  if (values.length === 0) return c.dim("─".repeat(width));

  const chars = "▁▂▃▄▅▆▇█";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Sample values to fit width
  const sampled: number[] = [];
  for (let i = 0; i < width; i++) {
    const idx = Math.floor((i / width) * values.length);
    sampled.push(values[idx]);
  }

  return sampled.map(v => {
    const idx = Math.floor(((v - min) / range) * (chars.length - 1));
    return color(chars[idx]);
  }).join("");
}


function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}


// ============================================================================
// Main Script
// ============================================================================

const args = parseArgs(Deno.args, {
  default: { epochs: 10, "batch-size": 32, quiet: false },
  alias: { e: "epochs", b: "batch-size", q: "quiet" },
  boolean: ["quiet", "help"],
});

if (args.help) {
  console.log(`
${c.bold(c.brightCyan("SHGAT Training Console"))} ${sym.brain}

${c.bold("Usage:")} train-shgat-standalone.ts [options]

${c.bold("Options:")}
  ${c.yellow("-e, --epochs")}      Number of training epochs (default: 10)
  ${c.yellow("-b, --batch-size")}  Batch size (default: 32)
  ${c.yellow("-q, --quiet")}       Minimal output
  ${c.yellow("--help")}            Show this help

${c.bold("Examples:")}
  ${c.dim("# Quick test run")}
  deno run --allow-all scripts/train-shgat-standalone.ts -e 1 -b 4

  ${c.dim("# Full training")}
  deno run --allow-all scripts/train-shgat-standalone.ts -e 25 -b 32
`);
  Deno.exit(0);
}

const EPOCHS = Number(args.epochs);
const BATCH_SIZE = Number(args["batch-size"]);
const QUIET = args.quiet as boolean || Deno.env.get("NO_TUI") === "true";
const DATABASE_URL = Deno.env.get("DATABASE_URL");

if (!DATABASE_URL) {
  console.error(c.red(`${sym.cross} ERROR: DATABASE_URL environment variable required`));
  Deno.exit(1);
}

// Quiet loading - no output until dashboard
const loadingStatus = { caps: 0, traces: 0, examples: 0, phase: "loading" };

// Helper functions
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

function parseVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    const arr = v.replace(/^\[|\]$/g, "").split(",").map(Number);
    if (!arr.some(isNaN)) return arr;
  }
  return null;
}

const sql = postgres(DATABASE_URL);

try {
  // =========================================================================
  // Phase 1: Load Data (quiet - will show in dashboard)
  // =========================================================================
  loadingStatus.phase = "caps";

  // Source of truth: task_results from execution_trace (real execution data)
  // instead of dag_structure->'tools_used' (static snapshot)
  // Note: we load ALL caps (not just those with traces) because capability_dependency
  // edges may reference caps without traces. tools_used will be empty for those.
  const caps = await sql`
    SELECT pattern_id as id, intent_embedding as embedding,
           ARRAY(
             SELECT DISTINCT tr->>'tool'
             FROM execution_trace et,
                  jsonb_array_elements(et.task_results) tr
             WHERE et.capability_id = wp.pattern_id
               AND et.task_results IS NOT NULL
               AND jsonb_typeof(et.task_results) = 'array'
               AND jsonb_array_length(et.task_results) >= 1
           ) as tools_used,
           success_rate,
           COALESCE(wp.usage_count, 0) as usage_count
    FROM workflow_pattern wp
    WHERE code_snippet IS NOT NULL AND intent_embedding IS NOT NULL
  `;

  // --- Resolve chain: exec_hash → rename → canonical ---
  const renameRows = await sql`SELECT old_name, new_name, old_fqdn FROM capability_name_history ORDER BY renamed_at ASC`;
  // deno-lint-ignore no-explicit-any
  const renameMap = buildRenameChain(renameRows as any as Array<{ old_name: string; new_name: string; old_fqdn?: string | null }>);
  console.error(`  Rename chain: ${renameRows.length} rows → ${renameMap.size} mappings`);

  const hashRows = await sql`
    SELECT wp.code_hash, cr.namespace || ':' || cr.action as cap_name
    FROM workflow_pattern wp
    JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
    WHERE wp.code_hash IS NOT NULL
  `;
  const execHashToCapName = new Map<string, string>();
  for (const r of hashRows) execHashToCapName.set((r.code_hash as string).slice(0, 8), r.cap_name as string);
  console.error(`  Exec hash map: ${execHashToCapName.size} entries`);

  // No canonicalMap here — SHGAT resolves tool names, not cap names via this resolver.
  // Canonicalization is handled separately below via canonicalizeCaps().
  const resolveToolName = buildToolNameResolver(execHashToCapName, renameMap, new Map());

  // Load hierarchy edges (parent → child cap relationships)
  // SKIP_HIERARCHY=true → flat training (no parent-child edges), for A/B ablation
  const SKIP_HIERARCHY = Deno.env.get("SKIP_HIERARCHY") === "true";
  const depRows = SKIP_HIERARCHY ? [] : await sql`
    SELECT from_capability_id, to_capability_id
    FROM capability_dependency
    WHERE edge_type = 'contains'
  `;
  if (SKIP_HIERARCHY) {
    console.error(`  SKIP_HIERARCHY=true → 0 hierarchy edges (flat mode)`);
  }

  const childrenMap = new Map<string, string[]>();
  const parentsMap = new Map<string, string[]>();
  for (const row of depRows) {
    const parentId = row.from_capability_id;
    const childId = row.to_capability_id;
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId)!.push(childId);
    if (!parentsMap.has(childId)) parentsMap.set(childId, []);
    parentsMap.get(childId)!.push(parentId);
  }

  if (depRows.length > 0) {
    console.error(`  Loaded ${depRows.length} hierarchy edges (${childrenMap.size} parents, ${parentsMap.size} children)`);
  }

  const capabilities = caps
    // deno-lint-ignore no-explicit-any
    .map((c: any) => {
      const toolsUsed = (c.tools_used ?? [])
        .map(normalizeToolId)
        .filter(Boolean)
        .map(resolveToolName) as string[];
      return {
        id: c.id,
        embedding: parseVector(c.embedding),
        toolsUsed,
        successRate: c.success_rate ?? 0.5,
        usageCount: c.usage_count ?? 0,
        children: childrenMap.get(c.id),
        parents: parentsMap.get(c.id),
      };
    })
    .filter((c: { embedding: number[] | null }) => {
      if (!c.embedding || c.embedding.length === 0) return false;
      return true;
    });

  // --- Canonicalization: merge caps with identical toolsets ---
  const capDataForCanon: CapData[] = capabilities.map((c) => ({
    id: c.id,
    embedding: c.embedding!,
    toolChildren: c.toolsUsed,
    level: 1, // all SHGAT caps are L1 (workflow patterns with tools)
    usageCount: c.usageCount as number,
  }));

  const { canonicalMap, groupCount, remapped } = canonicalizeCaps(capDataForCanon);
  const canonicalIds = new Set(capDataForCanon.map((c) => c.id));
  const preCanonCount = capabilities.length;
  const capabilities2 = capabilities.filter((c) => canonicalIds.has(c.id));

  // Remap hierarchy edges through canonical map (non-canonical caps were removed)
  for (const cap of capabilities2) {
    if (cap.children) {
      cap.children = cap.children
        .map((id: string) => canonicalMap.get(id) ?? id)
        .filter((id: string) => canonicalIds.has(id));
    }
    if (cap.parents) {
      cap.parents = cap.parents
        .map((id: string) => canonicalMap.get(id) ?? id)
        .filter((id: string) => canonicalIds.has(id));
    }
  }
  console.error(`  Canonicalized: ${preCanonCount} → ${capabilities2.length} caps (${groupCount} groups, ${remapped} remapped)`);

  // Replace capabilities array
  // deno-lint-ignore no-explicit-any
  const capabilitiesFinal = capabilities2 as any[];

  loadingStatus.caps = capabilitiesFinal.length;
  loadingStatus.phase = "traces";

  const traces = await sql`
    SELECT et.capability_id,
           COALESCE(et.intent_embedding, wp.intent_embedding) as intent_embedding,
           et.success, et.task_results
    FROM execution_trace et
    JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
    WHERE et.capability_id IS NOT NULL
      AND wp.intent_embedding IS NOT NULL
      AND et.task_results IS NOT NULL
      AND jsonb_typeof(et.task_results) = 'array'
      AND jsonb_array_length(et.task_results) >= 1
    ORDER BY et.executed_at DESC
  `;

  loadingStatus.traces = traces.length;
  loadingStatus.phase = "examples";

  const capToTools = new Map<string, Set<string>>();
  const allEmbeddings = new Map<string, number[]>();
  // Remap trace capability_ids through canonical map
  for (const trace of traces) {
    const remappedId = canonicalMap.get(trace.capability_id);
    if (remappedId) trace.capability_id = remappedId;
  }

  // Intent dedup: same cap + same intent embedding = duplicate
  // deno-lint-ignore no-explicit-any
  const { deduped: dedupedTraces, removedCount: dedupRemoved } = dedupTracesByIntent<any>(
    [...traces],
    (t) => t.capability_id,
    (t) => parseVector(t.intent_embedding) ?? [],
  );
  console.error(`  Dedup: ${traces.length} → ${dedupedTraces.length} (-${dedupRemoved})`);

  // Frequency cap: limit traces per cap to avoid dominant caps drowning the loss
  const MAX_PER_CAP = parseInt(Deno.env.get("MAX_PER_CAP") ?? "50", 10);
  // Wrap traces to match CappableExample interface (targetToolId + intentEmbedding)
  // deno-lint-ignore no-explicit-any
  const wrappedForCap = dedupedTraces.map((t: any) => ({
    ...t,
    targetToolId: t.capability_id,
    intentEmbedding: parseVector(t.intent_embedding) ?? [],
  }));
  const { capped: cappedTraces, stats: capStats } = capExamplesPerTarget(wrappedForCap, MAX_PER_CAP);
  console.error(`  FreqCap(${MAX_PER_CAP}): ${capStats.before} → ${capStats.after} (-${capStats.dropped}, ${capStats.cappedTargets} targets capped)`);
  for (const d of capStats.topDropped) {
    console.error(`    ${d.target.slice(0, 8)}: ${d.had} → ${d.kept}`);
  }

  // Use capped traces for example generation
  const finalTraces = cappedTraces;

  for (const cap of capabilitiesFinal) {
    allEmbeddings.set(cap.id, cap.embedding!);
    capToTools.set(cap.id, new Set(cap.toolsUsed));
  }

  // deno-lint-ignore no-explicit-any
  const examples: any[] = [];
  for (const trace of finalTraces) {
    if (!capToTools.has(trace.capability_id)) continue;
    const intentEmb = parseVector(trace.intent_embedding);
    if (!intentEmb) continue;

    // Extract context tools from task_results (0% corruption vs 37.7% for executed_path)
    const taskResults = (trace.task_results ?? []) as Array<{ tool?: string }>;
    const contextTools = taskResults
      .map((t: { tool?: string }) => t.tool)
      .filter((t: string | undefined): t is string => !!t)
      .map(normalizeToolId)
      .filter(Boolean)
      .map(resolveToolName) as string[];

    const anchorTools = capToTools.get(trace.capability_id)!;
    const candidates: Array<{id: string; sim: number}> = [];
    for (const [id, emb] of allEmbeddings) {
      if (id !== trace.capability_id && !anchorTools.has(id)) {
        candidates.push({ id, sim: cosineSim(intentEmb, emb) });
      }
    }
    candidates.sort((a, b) => b.sim - a.sim);
    const allNegativesSorted = candidates.map(c => c.id);

    const total = allNegativesSorted.length;
    let negativeCapIds: string[];
    if (total >= NUM_NEGATIVES * 3) {
      const tierSize = Math.floor(total / 3);
      negativeCapIds = allNegativesSorted.slice(tierSize, tierSize + NUM_NEGATIVES);
    } else if (total >= NUM_NEGATIVES) {
      const start = Math.floor((total - NUM_NEGATIVES) / 2);
      negativeCapIds = allNegativesSorted.slice(start, start + NUM_NEGATIVES);
    } else {
      negativeCapIds = allNegativesSorted;
    }

    examples.push({
      intentEmbedding: intentEmb,
      contextTools,
      candidateId: trace.capability_id,
      outcome: trace.success ? 1.0 : 0.0,
      negativeCapIds,
      allNegativesSorted,
    });
  }

  loadingStatus.examples = examples.length;
  loadingStatus.phase = "ready";

  // Load real tool embeddings for ALL tools (cap + example)
  const allToolIds = new Set<string>();
  for (const cap of capabilitiesFinal) cap.toolsUsed.forEach((t: string) => allToolIds.add(t));
  // deno-lint-ignore no-explicit-any
  for (const ex of examples) for (const t of (ex as any).contextTools) allToolIds.add(t);

  const toolEmbeddings: Record<string, number[]> = {};
  if (allToolIds.size > 0) {
    const rows = await sql`
      SELECT tool_id, embedding FROM tool_embedding
      WHERE tool_id = ANY(${[...allToolIds]})
    `;
    for (const row of rows) {
      const emb = parseVector(row.embedding);
      if (emb) toolEmbeddings[row.tool_id] = emb;
    }
    console.error(`  Loaded ${Object.keys(toolEmbeddings).length}/${allToolIds.size} tool embeddings`);
  }

  const startTime = Date.now();

  // Metrics collectors for dashboard
  const batchTimes: number[] = [];
  const epochLosses: number[] = [];
  const epochAccuracies: number[] = [];
  const epochTemperatures: number[] = [];
  let currentBatch = 0;
  let totalBatches = 0;
  let phase = "init";

  // Custom training with log parsing for dashboard
  const workerPath = new URL("../src/graphrag/algorithms/shgat/train-worker.ts", import.meta.url).pathname;

  const SHARE_LEVEL_WEIGHTS = Deno.env.get("SHARE_LEVEL_WEIGHTS") === "true";
  if (SHARE_LEVEL_WEIGHTS) {
    console.error(`  ${c.brightYellow("SHARE_LEVEL_WEIGHTS=true")} → levels 1+ reuse level 0 weights (HSG-style)`);
  }

  const EARLY_STOP_PATIENCE = parseInt(Deno.env.get("PATIENCE") ?? "8", 10);
  const EARLY_STOP_THRESHOLD = parseFloat(Deno.env.get("DEGRADATION_THRESHOLD") ?? "0.25");
  const VE_RESIDUAL_LR = Deno.env.get("VE_RESIDUAL_LR") ? parseFloat(Deno.env.get("VE_RESIDUAL_LR")!) : undefined;
  console.error(`  Early stop: patience=${EARLY_STOP_PATIENCE}, threshold=${(EARLY_STOP_THRESHOLD * 100).toFixed(0)}%`);
  if (VE_RESIDUAL_LR !== undefined) {
    console.error(`  ${c.brightYellow(`VE_RESIDUAL_LR=${VE_RESIDUAL_LR}`)} (main LR=0.05)`);
  }

  const inputData = {
    capabilities: capabilitiesFinal,
    examples,
    config: {
      epochs: EPOCHS,
      batchSize: BATCH_SIZE,
      usePER: true,
      useCurriculum: true,
      learningRate: 0.05,
      useProjectionHead: Deno.env.get("SHGAT_USE_PROJECTION_HEAD") === "true",
      shareLevelWeights: SHARE_LEVEL_WEIGHTS,
      earlyStopPatience: EARLY_STOP_PATIENCE,
      earlyStopThreshold: EARLY_STOP_THRESHOLD,
      ...(VE_RESIDUAL_LR !== undefined ? { veResidualLR: VE_RESIDUAL_LR } : {}),
    },
    databaseUrl: DATABASE_URL,
    toolEmbeddings,
  };

  const tempFile = await Deno.makeTempFile({ prefix: "shgat-", suffix: ".json" });
  await Deno.writeTextFile(tempFile, JSON.stringify(inputData));

  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", "--unstable-ffi", workerPath, tempFile],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();
  const decoder = new TextDecoder();

  // Additional metrics for dashboard
  const testAccuracies: number[] = [];
  const perPriorityMin: number[] = [];
  const perPriorityMax: number[] = [];
  const perBetas: number[] = [];
  let baselineTestAcc = 0;

  // Parse worker logs for metrics
  const parseWorkerLog = (line: string) => {
    // Phase detection
    if (line.includes("Creating SHGAT")) phase = "init";
    if (line.includes("Starting") && line.includes("training")) phase = "train";
    if (line.includes("Compressing params")) phase = "save";

    // Batch time: [SHGAT] Slow batch (8526ms): ...
    const batchMatch = line.match(/Slow batch \((\d+)ms\)/);
    if (batchMatch) {
      batchTimes.push(parseInt(batchMatch[1]));
      currentBatch++;
    }

    // First batch: [SHGAT Worker] First batch took 8526ms
    // NOTE: Don't push here - "Slow batch" already logged it with timing breakdown
    // This log is just informational, the timing is already captured
    // const firstBatchMatch = line.match(/First batch took (\d+)ms/);

    // Total batches: Processing batch 1/96...
    const totalMatch = line.match(/Processing batch \d+\/(\d+)/);
    if (totalMatch) {
      totalBatches = parseInt(totalMatch[1]);
    }

    // Epoch results: Epoch 0: loss=0.1234, acc=0.75, ...τ=0.100
    const epochMatch = line.match(/Epoch (\d+): loss=([\d.]+), acc=([\d.]+).*τ=([\d.]+)/);
    if (epochMatch) {
      const parsedEpoch = parseInt(epochMatch[1]);
      // Only record if this is a new epoch (avoid duplicates) and within bounds
      if (parsedEpoch === epochLosses.length && epochLosses.length < EPOCHS) {
        epochLosses.push(parseFloat(epochMatch[2]));
        epochAccuracies.push(parseFloat(epochMatch[3]));
        epochTemperatures.push(parseFloat(epochMatch[4]));
        if (QUIET) {
          console.error(`  ep${parsedEpoch}/${EPOCHS} loss=${parseFloat(epochMatch[2]).toFixed(4)} train=${(parseFloat(epochMatch[3])*100).toFixed(1)}% τ=${epochMatch[4]}`);
        }
      }
    }

    // PER priority stats: priority=[0.010-25.000], β=0.85
    const perMatch = line.match(/priority=\[([\d.]+)-([\d.]+)\], β=([\d.]+)/);
    if (perMatch) {
      perPriorityMin.push(parseFloat(perMatch[1]));
      perPriorityMax.push(parseFloat(perMatch[2]));
      perBetas.push(parseFloat(perMatch[3]));
    }

    // Health check baseline: testAcc=0.55
    const baselineMatch = line.match(/Health check baseline: testAcc=([\d.]+)/);
    if (baselineMatch) {
      baselineTestAcc = parseFloat(baselineMatch[1]);
      testAccuracies.push(baselineTestAcc);
      if (QUIET) {
        console.error(`  baseline test: ${(baselineTestAcc*100).toFixed(1)}%`);
      }
    }

    // Health check epoch X: hit1=25.1%, mrr=0.419, contrastive=0.84, best_hit1=25.1% (ep1)
    const testAccMatch = line.match(/Health check epoch (\d+): hit1=([\d.]+)%(.*)/);
    if (testAccMatch) {
      testAccuracies.push(parseFloat(testAccMatch[2]) / 100);
      if (QUIET) {
        console.error(`  test ep${testAccMatch[1]}: hit1=${testAccMatch[2]}%${testAccMatch[3]}`);
      }
    }

    // Debug: print any line with DB, error, fail, save, export
    if (/DB|error|Error|fail|Fail|save|Save|export|Export/i.test(line)) {
      console.error(`[DEBUG] ${line}`);
    }
  };

  // =========================================================================
  // Dashboard Renderer
  // =========================================================================
  const embeddingDim = capabilitiesFinal[0]?.embedding?.length ?? 1024;

  // deno-lint-ignore no-inner-declarations
  function renderDashboard() {
    const elapsed = Date.now() - startTime;
    const lines: string[] = [];

    // Header with config
    lines.push(c.bold(c.brightCyan("  ╔════════════════════════════════════════════════════════════════════════════════╗")));
    lines.push(c.bold(c.brightCyan("  ║")) + c.bold("  SHGAT Training Dashboard " + sym.brain) + " ".repeat(25) +
      c.dim(`${EPOCHS}ep × ${BATCH_SIZE}bs`) + " ".repeat(5) +
      c.dim(`${loadingStatus.caps} caps, ${loadingStatus.examples} ex`) + " ".repeat(4) + c.bold(c.brightCyan("║")));
    lines.push(c.bold(c.brightCyan("  ╚════════════════════════════════════════════════════════════════════════════════╝")));

    // Status bar
    const phaseText = phase === "init" ? c.yellow("● Init") :
                      phase === "train" ? c.green("● Train") :
                      phase === "save" ? c.cyan("● Save") : c.dim("● Wait");
    const elapsedText = formatDuration(elapsed);
    // Use batchTimes.length as the single source of truth for batch count
    const batchCount = batchTimes.length;
    const totalBatchesAll = totalBatches * EPOCHS;

    const etaMs = totalBatches > 0 && batchCount > 0 ? (elapsed / batchCount) * (totalBatchesAll - batchCount) : 0;
    const etaText = etaMs > 0 ? formatDuration(etaMs) : "---";

    // Epoch display: completed epochs + 1 if actively processing batches beyond completed (capped at EPOCHS)
    const displayEpoch = Math.min(epochLosses.length + (batchCount > epochLosses.length * totalBatches ? 1 : 0), EPOCHS);

    lines.push(`  ${phaseText} ${c.dim("│")} ${c.dim("Elapsed:")} ${c.white(elapsedText.padEnd(8))} ${c.dim("│")} ${c.dim("ETA:")} ${c.white(etaText.padEnd(8))} ${c.dim("│")} ${c.dim("Epoch:")} ${c.brightYellow(((displayEpoch || 1) + "/" + EPOCHS).padEnd(5))} ${c.dim("│")} ${c.dim("Batch:")} ${c.brightCyan((batchCount + "/" + totalBatchesAll).padEnd(8))} ${c.dim("│")} ${c.dim("τ:")} ${c.cyan(epochTemperatures.length > 0 ? epochTemperatures[epochTemperatures.length - 1].toFixed(3) : "0.100")}`);

    // Progress bar (full width)
    const progress = totalBatches > 0 ? Math.min(currentBatch / (totalBatches * EPOCHS), 1.0) : 0;
    const barWidth = 70;
    const filled = Math.min(Math.round(progress * barWidth), barWidth);
    const progressBar = c.brightGreen("█".repeat(filled)) + c.gray("░".repeat(barWidth - filled));
    lines.push(`  [${progressBar}] ${c.bold((progress * 100).toFixed(1) + "%")}`);

    // Two-column layout - wider
    lines.push(c.cyan("  ┌────────────────────────────────────────┬────────────────────────────────────────┐"));

    // Left: Batch Time | Right: Current Metrics
    const avgBatch = batchTimes.length > 0 ? batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length : 0;
    const lastBatch = batchTimes.length > 0 ? batchTimes[batchTimes.length - 1] : 0;
    const minBatch = batchTimes.length > 0 ? Math.min(...batchTimes) : 0;
    const btSparkAll = sparkline(batchTimes, 35, c.brightGreen);

    const lastLoss = epochLosses.length > 0 ? epochLosses[epochLosses.length - 1].toFixed(4) : "------";
    const lastAcc = epochAccuracies.length > 0 ? (epochAccuracies[epochAccuracies.length - 1] * 100).toFixed(1) + "%" : "-----";
    const lastTestAcc = testAccuracies.length > 0 ? (testAccuracies[testAccuracies.length - 1] * 100).toFixed(1) + "%" : "-----";

    lines.push(c.cyan("  │") + c.bold(" ⏱ Batch Time (ms)") + " ".repeat(21) + c.cyan("│") + c.bold(" 📊 Current Metrics") + " ".repeat(20) + c.cyan("│"));
    lines.push(c.cyan("  │") + `  ${c.dim("Last:")} ${c.white(lastBatch.toString().padStart(5))}  ${c.dim("Avg:")} ${c.white(avgBatch.toFixed(0).padStart(5))}  ${c.dim("Min:")} ${c.green(minBatch.toString().padStart(5))}  ` + c.cyan("│") + `  ${c.bold("Loss:")}       ${c.brightMagenta(lastLoss.padStart(8))}               ` + c.cyan("│"));
    lines.push(c.cyan("  │") + `  ${btSparkAll}   ` + c.cyan("│") + `  ${c.bold("Train Acc:")}  ${c.brightGreen(lastAcc.padStart(8))}               ` + c.cyan("│"));
    lines.push(c.cyan("  │") + " ".repeat(40) + c.cyan("│") + `  ${c.bold("Test Acc:")}   ${c.brightYellow(lastTestAcc.padStart(8))}               ` + c.cyan("│"));
    lines.push(c.cyan("  ├────────────────────────────────────────┼────────────────────────────────────────┤"));

    // Left: Loss History | Right: Train Accuracy History
    const lossSpark = sparkline(epochLosses, 35, c.brightMagenta);
    const accSpark = sparkline(epochAccuracies, 35, c.brightGreen);

    const lossStart = epochLosses.length > 0 ? epochLosses[0].toFixed(4) : "------";
    const lossEnd = epochLosses.length > 0 ? epochLosses[epochLosses.length - 1].toFixed(4) : "------";
    const lossBest = epochLosses.length > 0 ? Math.min(...epochLosses).toFixed(4) : "------";

    const accStart = epochAccuracies.length > 0 ? (epochAccuracies[0] * 100).toFixed(1) : "----";
    const accEnd = epochAccuracies.length > 0 ? (epochAccuracies[epochAccuracies.length - 1] * 100).toFixed(1) : "----";
    const accBest = epochAccuracies.length > 0 ? (Math.max(...epochAccuracies) * 100).toFixed(1) : "----";

    lines.push(c.cyan("  │") + c.bold(" 📉 Loss History (per epoch)") + " ".repeat(11) + c.cyan("│") + c.bold(" 📈 Train Accuracy (per epoch)") + " ".repeat(9) + c.cyan("│"));
    lines.push(c.cyan("  │") + `  ${lossSpark}   ` + c.cyan("│") + `  ${accSpark}   ` + c.cyan("│"));
    lines.push(c.cyan("  │") + `  ${c.dim("Start:")} ${lossStart}  ${c.dim("End:")} ${lossEnd}  ${c.dim("Best:")} ${c.green(lossBest)}` + " " + c.cyan("│") + `  ${c.dim("Start:")} ${accStart}%  ${c.dim("End:")} ${accEnd}%  ${c.dim("Best:")} ${c.green(accBest)}%` + " " + c.cyan("│"));
    lines.push(c.cyan("  ├────────────────────────────────────────┼────────────────────────────────────────┤"));

    // Left: Test Accuracy History | Right: PER Stats
    const testAccSpark = sparkline(testAccuracies, 35, c.brightYellow);
    const testAccStart = testAccuracies.length > 0 ? (testAccuracies[0] * 100).toFixed(1) : "----";
    const testAccEnd = testAccuracies.length > 0 ? (testAccuracies[testAccuracies.length - 1] * 100).toFixed(1) : "----";
    const testAccBest = testAccuracies.length > 0 ? (Math.max(...testAccuracies) * 100).toFixed(1) : "----";

    const perMinNow = perPriorityMin.length > 0 ? perPriorityMin[perPriorityMin.length - 1].toFixed(3) : "-----";
    const perMaxNow = perPriorityMax.length > 0 ? perPriorityMax[perPriorityMax.length - 1].toFixed(2) : "-----";
    const betaNow = perBetas.length > 0 ? perBetas[perBetas.length - 1].toFixed(2) : "----";
    const betaSpark = sparkline(perBetas, 35, c.brightBlue);

    lines.push(c.cyan("  │") + c.bold(" 🎯 Test Accuracy (per epoch)") + " ".repeat(10) + c.cyan("│") + c.bold(" ⚡ PER Buffer Stats") + " ".repeat(19) + c.cyan("│"));
    lines.push(c.cyan("  │") + `  ${testAccSpark}   ` + c.cyan("│") + `  ${c.dim("Priority:")} [${c.cyan(perMinNow)} - ${c.brightRed(perMaxNow)}]       ` + c.cyan("│"));
    lines.push(c.cyan("  │") + `  ${c.dim("Start:")} ${testAccStart}%  ${c.dim("End:")} ${testAccEnd}%  ${c.dim("Best:")} ${c.green(testAccBest)}%` + " " + c.cyan("│") + `  ${c.dim("β (IS weight):")} ${c.brightBlue(betaNow)}                 ` + c.cyan("│"));
    lines.push(c.cyan("  │") + " ".repeat(40) + c.cyan("│") + `  ${betaSpark}   ` + c.cyan("│"));
    lines.push(c.cyan("  ├────────────────────────────────────────┴────────────────────────────────────────┤"));

    // Full width: Temperature annealing
    const tauSpark = sparkline(epochTemperatures, 75, c.brightCyan);
    const tauStart = epochTemperatures.length > 0 ? epochTemperatures[0].toFixed(3) : "0.100";
    const tauEnd = epochTemperatures.length > 0 ? epochTemperatures[epochTemperatures.length - 1].toFixed(3) : "0.100";
    lines.push(c.cyan("  │") + c.bold(" 🌡 Temperature τ") + `  ${c.dim("Start:")} ${tauStart}  ${c.dim("End:")} ${tauEnd}` + " ".repeat(43) + c.cyan("│"));
    lines.push(c.cyan("  │") + `  ${tauSpark}   ` + c.cyan("│"));
    lines.push(c.cyan("  └─────────────────────────────────────────────────────────────────────────────────┘"));

    // Throughput footer
    const throughput = elapsed > 0 && currentBatch > 0 ? (currentBatch * BATCH_SIZE / (elapsed / 1000)).toFixed(1) : "0";
    lines.push(`  ${c.dim("Throughput:")} ${c.white(throughput)} ${c.dim("ex/s")}  ${c.dim("│")}  ${c.dim("Batches:")} ${c.white(batchTimes.length.toString())}/${totalBatches * EPOCHS}  ${c.dim("│")}  ${c.dim("Epochs:")} ${c.white(epochLosses.length.toString())}/${EPOCHS}  ${c.dim("│")}  ${c.dim("Dim:")} ${embeddingDim}`);

    return lines;
  }

  // Collect stdout
  const stdoutChunks: Uint8Array[] = [];
  const stdoutReader = process.stdout.getReader();
  const stdoutPromise = (async () => {
    try {
      while (true) {
        const { done, value } = await stdoutReader.read();
        if (done) break;
        stdoutChunks.push(value);
      }
    } catch { /* ignore */ }
  })();

  // Parse stderr for metrics (don't display raw logs)
  const stderrReader = process.stderr.getReader();
  const stderrPromise = (async () => {
    try {
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split("\n")) {
          if (line.trim()) { parseWorkerLog(line); console.error("[WORKER] " + line); }
        }
      }
    } catch { /* ignore */ }
  })();

  let lastDashboardLines = 0;
  let dashboardInterval: ReturnType<typeof setInterval> | null = null;

  if (!QUIET) {
    // Clear screen and start dashboard
    term.clear();
    term.hideCursor();

    dashboardInterval = setInterval(() => {
      // Move cursor up to overwrite previous dashboard
      if (lastDashboardLines > 0) {
        Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${lastDashboardLines}A`));
      }

      const dashboardLines = renderDashboard();
      lastDashboardLines = dashboardLines.length;

      // Clear and print each line
      for (const line of dashboardLines) {
        Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[2K${line}\n`));
      }
    }, 250);
  }

  await Promise.all([stdoutPromise, stderrPromise]);
  if (dashboardInterval) clearInterval(dashboardInterval);
  if (!QUIET) term.showCursor();

  const status = await process.status;
  const elapsed = Date.now() - startTime;

  if (!QUIET) {
    // Final dashboard render
    if (lastDashboardLines > 0) {
      Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${lastDashboardLines}A`));
    }
    const finalDashboard = renderDashboard();
    for (const line of finalDashboard) {
      Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[2K${line}\n`));
    }
  }
  console.log();

  // Parse result
  let result: { success: boolean; finalLoss?: number; finalAccuracy?: number; savedToDb?: boolean; error?: string };

  if (!status.success) {
    // Still try to parse stdout for the actual error message
    const failBytes = new Uint8Array(stdoutChunks.reduce((acc, c) => acc + c.length, 0));
    let failOffset = 0;
    for (const chunk of stdoutChunks) { failBytes.set(chunk, failOffset); failOffset += chunk.length; }
    try {
      result = JSON.parse(decoder.decode(failBytes).trim());
      console.error(`[WORKER ERROR] ${result.error}`);
    } catch {
      result = { success: false, error: `Exit code: ${status.code}` };
    }
  } else {
    const stdoutBytes = new Uint8Array(stdoutChunks.reduce((acc, c) => acc + c.length, 0));
    let offset = 0;
    for (const chunk of stdoutChunks) {
      stdoutBytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      result = JSON.parse(decoder.decode(stdoutBytes).trim());
    } catch {
      result = { success: false, error: "Failed to parse result" };
    }
  }

  // =========================================================================
  // Phase 3: Results
  // =========================================================================
  console.log();
  console.log(c.bold(c.white("  Phase 3: Results")));
  console.log(c.dim("  " + "─".repeat(50)));
  console.log();

  if (result.success) {
    // Performance calculations
    const batchesPerEpoch = Math.ceil(examples.length * 0.8 / BATCH_SIZE);
    const totalBatches = EPOCHS * batchesPerEpoch;
    const avgBatchTime = elapsed / totalBatches;
    const throughput = Math.round(examples.length * 0.8 * EPOCHS / (elapsed / 1000));

    // Main results box
    console.log();
    console.log(c.cyan(box.tl + box.h.repeat(62) + box.tr));
    console.log(c.cyan(box.v) + c.bold(c.bgGreen("  SUCCESS  ")) + " ".repeat(51) + c.cyan(box.v));
    console.log(c.cyan(box.v) + " ".repeat(62) + c.cyan(box.v));

    // Metrics row
    const lossVal = result.finalLoss?.toFixed(4) ?? "N/A";
    const accVal = ((result.finalAccuracy ?? 0) * 100).toFixed(1) + "%";
    console.log(c.cyan(box.v) +
      `  ${c.bold("Loss")} ${c.brightMagenta(lossVal.padStart(8))}` +
      `  ${c.dim(box.v)}  ${c.bold("Accuracy")} ${c.brightGreen(accVal.padStart(7))}` +
      `  ${c.dim(box.v)}  ${c.bold("Saved")} ${result.savedToDb ? c.green(sym.check) : c.yellow(sym.warning)}` +
      " ".repeat(13) + c.cyan(box.v));
    console.log(c.cyan(box.v) + " ".repeat(62) + c.cyan(box.v));

    // Duration bar
    console.log(c.cyan(box.v) + c.cyan(box.h.repeat(62)) + c.cyan(box.v));
    console.log(c.cyan(box.v) + " ".repeat(62) + c.cyan(box.v));

    // Performance stats with mini-bars
    const durationBar = c.brightCyan("█".repeat(Math.min(20, Math.round(elapsed / 30000))));
    console.log(c.cyan(box.v) +
      `  ${c.bold("Duration")}     ${c.brightCyan(formatDuration(elapsed).padStart(10))}  ${durationBar}` +
      " ".repeat(Math.max(0, 28 - durationBar.length)) + c.cyan(box.v));

    const batchBar = c.brightYellow("█".repeat(Math.min(15, Math.round(avgBatchTime / 500))));
    console.log(c.cyan(box.v) +
      `  ${c.bold("Avg Batch")}    ${formatDuration(avgBatchTime).padStart(10)}  ${batchBar}` +
      " ".repeat(Math.max(0, 33 - batchBar.length)) + c.cyan(box.v));

    const tputBar = c.brightGreen("█".repeat(Math.min(12, Math.round(throughput / 5))));
    console.log(c.cyan(box.v) +
      `  ${c.bold("Throughput")}   ${(throughput + " ex/s").padStart(10)}  ${tputBar}` +
      " ".repeat(Math.max(0, 36 - tputBar.length)) + c.cyan(box.v));

    console.log(c.cyan(box.v) + " ".repeat(62) + c.cyan(box.v));

    // Summary stats line
    const statsLine = `${totalBatches} batches × ${EPOCHS} epochs = ${formatNumber(totalBatches * BATCH_SIZE)} examples trained`;
    console.log(c.cyan(box.v) + `  ${c.dim(statsLine)}` + " ".repeat(Math.max(0, 60 - statsLine.length)) + c.cyan(box.v));

    console.log(c.cyan(box.bl + box.h.repeat(62) + box.br));

    // Multi-window graphs section
    if (batchTimes.length > 0 || epochLosses.length > 0) {
      console.log();
      console.log(c.bold(c.white("  Training History")));
      console.log(c.dim("  " + "─".repeat(50)));
      console.log();

      // Batch Time Graph
      if (batchTimes.length > 1) {
        console.log(`  ${c.bold("Batch Time (ms)")}`);
        const btMin = Math.min(...batchTimes);
        const btMax = Math.max(...batchTimes);
        const btAvg = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
        console.log(`  ${c.dim("Min:")} ${btMin.toFixed(0)}  ${c.dim("Max:")} ${btMax.toFixed(0)}  ${c.dim("Avg:")} ${btAvg.toFixed(0)}`);
        console.log();

        // Multi-window sparklines for batch times
        const windows = [
          { size: 5, label: "Last 5", color: c.brightCyan },
          { size: 20, label: "Last 20", color: c.brightYellow },
          { size: 1000, label: "All", color: c.brightGreen },
        ];

        for (const { size, label, color } of windows) {
          const slice = batchTimes.slice(-size);
          if (slice.length < 2) continue;

          const first = slice[0];
          const last = slice[slice.length - 1];
          const delta = last - first;
          const pctChange = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;

          const trendIcon = delta > 100 ? c.brightRed("↑") : delta < -100 ? c.brightGreen("↓") : c.dim("─");
          const spark = sparkline(slice, 30, color);

          console.log(`  ${c.dim(label.padEnd(8))} ${spark} ${trendIcon}${Math.abs(pctChange).toFixed(1).padStart(5)}%`);
        }
        console.log();
      }

      // Loss Graph (per epoch)
      if (epochLosses.length > 1) {
        console.log(`  ${c.bold("Loss (per epoch)")}`);
        const lossMin = Math.min(...epochLosses);
        console.log(`  ${c.dim("Start:")} ${epochLosses[0].toFixed(4)}  ${c.dim("End:")} ${epochLosses[epochLosses.length - 1].toFixed(4)}  ${c.dim("Best:")} ${lossMin.toFixed(4)}`);
        console.log();
        console.log(`  ${c.dim("All".padEnd(8))} ${sparkline(epochLosses, 30, c.brightMagenta)}`);
        console.log();
      }

      // Accuracy Graph (per epoch)
      if (epochAccuracies.length > 1) {
        console.log(`  ${c.bold("Accuracy (per epoch)")}`);
        const accStart = epochAccuracies[0] * 100;
        const accEnd = epochAccuracies[epochAccuracies.length - 1] * 100;
        const accBest = Math.max(...epochAccuracies) * 100;
        console.log(`  ${c.dim("Start:")} ${accStart.toFixed(1)}%  ${c.dim("End:")} ${accEnd.toFixed(1)}%  ${c.dim("Best:")} ${accBest.toFixed(1)}%`);
        console.log();
        console.log(`  ${c.dim("All".padEnd(8))} ${sparkline(epochAccuracies, 30, c.brightGreen)}`);
        console.log();
      }

      // Temperature Graph (per epoch)
      if (epochTemperatures.length > 1) {
        console.log(`  ${c.bold("Temperature τ (per epoch)")}`);
        console.log(`  ${c.dim("Start:")} ${epochTemperatures[0].toFixed(3)}  ${c.dim("End:")} ${epochTemperatures[epochTemperatures.length - 1].toFixed(3)}`);
        console.log();
        console.log(`  ${c.dim("All".padEnd(8))} ${sparkline(epochTemperatures, 30, c.brightCyan)}`);
        console.log();
      }
    }

  } else {
    const errorContent = [
      "",
      `  ${c.bold("Status")}  ${c.bgRed(c.bold(" FAILED "))}`,
      "",
      `  ${c.bold("Error")}   ${c.red(result.error ?? "Unknown error")}`,
      "",
    ];
    console.log(renderBox(`${sym.cross} Training Failed`, errorContent, 50));
    Deno.exit(1);
  }

  // =========================================================================
  // Phase: Persist enriched cap embeddings to workflow_pattern.shgat_embedding
  // =========================================================================
  console.log();
  console.log(`  ${c.bold("Persisting SHGAT cap embeddings...")}`);

  try {
    const { createSHGATFromCapabilities } = await import("../src/graphrag/algorithms/shgat.ts");
    const toolEmbMap = new Map(Object.entries(toolEmbeddings));
    const capsWithEmb = capabilitiesFinal.filter((cap): cap is typeof cap & { embedding: number[] } => cap.embedding !== null);
    const shgat = createSHGATFromCapabilities(capsWithEmb, toolEmbMap);

    // Load freshly trained params from DB
    const paramsRows = await sql`SELECT params FROM shgat_params ORDER BY updated_at DESC LIMIT 1`;
    if (paramsRows.length > 0) {
      const raw = typeof paramsRows[0].params === "string"
        ? JSON.parse(paramsRows[0].params) : paramsRows[0].params;

      // Decode msgpack+gzip+base64 if needed (raw.data is a base64 string, not a decoded object)
      let decodedParams: Record<string, unknown>;
      if (raw.format === "msgpack+gzip+base64" && typeof raw.data === "string") {
        const { decode: msgpackDecode } = await import("npm:@msgpack/msgpack@3.0.0-beta2");
        const pako = (await import("pako")).default;
        const binaryStr = atob(raw.data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const decompressed = pako.ungzip(bytes);
        decodedParams = msgpackDecode(decompressed) as Record<string, unknown>;
        console.log(`  Decoded params: ${Object.keys(decodedParams).length} keys, veResidualA=${(decodedParams as Record<string, unknown>).veResidualA}`);
      } else {
        decodedParams = raw.data ?? raw;
      }
      shgat.importParams(decodedParams);

      const capEmbs = shgat.getCapEmbeddings();
      let persisted = 0;
      const entries = [...capEmbs.entries()];
      for (let i = 0; i < entries.length; i += 50) {
        const batch = entries.slice(i, i + 50);
        await Promise.all(batch.map(([patternId, emb]) =>
          sql`UPDATE workflow_pattern SET shgat_embedding = ${`[${emb.join(",")}]`}::vector WHERE pattern_id = ${patternId}::uuid`
        ));
        persisted += batch.length;
      }
      console.log(`  ${c.green(sym.check)} Persisted ${persisted}/${capabilitiesFinal.length} cap embeddings to workflow_pattern.shgat_embedding`);

      // Also persist enriched TOOL embeddings (L0 after MP with trained weights)
      const toolEmbs = shgat.getToolEmbeddings();
      if (toolEmbs.size > 0) {
        let toolPersisted = 0;
        const toolEntries = [...toolEmbs.entries()];
        for (let i = 0; i < toolEntries.length; i += 50) {
          const batch = toolEntries.slice(i, i + 50);
          await Promise.all(batch.map(([toolId, emb]) =>
            sql`UPDATE tool_embedding SET shgat_embedding = ${`[${emb.join(",")}]`}::vector WHERE tool_id = ${toolId}`
          ));
          toolPersisted += batch.length;
        }
        console.log(`  ${c.green(sym.check)} Persisted ${toolPersisted}/${toolEmbs.size} tool embeddings to tool_embedding.shgat_embedding`);
      }
    } else {
      console.log(`  ${c.yellow(sym.warning)} No SHGAT params found in DB — skipping cap embedding persistence`);
    }
  } catch (e) {
    console.log(`  ${c.yellow(sym.warning)} Failed to persist cap embeddings: ${e}`);
  }

  console.log();
  console.log(c.dim("  " + "═".repeat(55)));
  console.log(c.bold(c.brightGreen(`  ${sym.check} All done!`)));
  console.log();

} catch (error) {
  console.log();
  console.error(c.red(`  ${sym.cross} Fatal Error: ${error}`));
  console.log();
  Deno.exit(1);
} finally {
  await sql.end();
  term.showCursor();
}
