#!/usr/bin/env -S deno run --allow-all --unstable-ffi
/**
 * SHGAT Training Console
 * Beautiful CLI monitoring with progress bars, metrics, and real-time updates
 */

import "@std/dotenv/load";
import { parseArgs } from "@std/cli/parse-args";
import { NUM_NEGATIVES } from "../src/graphrag/algorithms/shgat/types.ts";
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
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function progressBar(current: number, total: number, width = 30, label = ""): string {
  const percent = Math.min(1, current / total);
  const filled = Math.round(percent * width);
  const empty = width - filled;

  const bar = c.brightGreen(sym.bars[7].repeat(filled)) + c.gray(sym.bars[0].repeat(empty));
  const pct = c.bold((percent * 100).toFixed(0).padStart(3) + "%");
  const counter = c.dim(`${current}/${total}`);

  return `${label}[${bar}] ${pct} ${counter}`;
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

/**
 * Multi-window sparklines showing trends at different time scales
 * Superimposes short/medium/long term trends
 */
function multiWindowSparklines(
  values: number[],
  windows: { size: number; label: string; color: (s: string) => string }[],
  width = 30
): string[] {
  const lines: string[] = [];

  for (const { size, label, color } of windows) {
    const slice = values.slice(-size);
    if (slice.length === 0) {
      lines.push(`${c.dim(label.padEnd(8))} ${c.dim("─".repeat(width))}`);
      continue;
    }

    // Calculate trend
    const first = slice[0];
    const last = slice[slice.length - 1];
    const delta = last - first;
    const pctChange = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;

    const trend = delta > 0.001
      ? c.brightGreen(`↑${Math.abs(pctChange).toFixed(1)}%`)
      : delta < -0.001
        ? c.brightRed(`↓${Math.abs(pctChange).toFixed(1)}%`)
        : c.dim("─0%");

    const spark = sparkline(slice, width, color);
    const current = last.toFixed(4);

    lines.push(`${c.dim(label.padEnd(8))} ${spark} ${color(current)} ${trend}`);
  }

  return lines;
}

/**
 * Renders a compact metrics dashboard with multi-window graphs
 */
function renderMetricsDashboard(
  label: string,
  values: number[],
  format: (n: number) => string = (n) => n.toFixed(4),
  isHigherBetter = true
): string[] {
  const windows = [
    { size: 5, label: "5 bat", color: c.brightCyan },
    { size: 20, label: "20 bat", color: c.brightYellow },
    { size: 1000, label: "all", color: c.brightGreen },
  ];

  const lines: string[] = [];
  lines.push(`${c.bold(label)}`);

  if (values.length === 0) {
    lines.push(`  ${c.dim("No data yet...")}`);
    return lines;
  }

  const current = values[values.length - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  // Header stats
  lines.push(`  ${c.dim("Current:")} ${c.bold(format(current))}  ${c.dim("Min:")} ${format(min)}  ${c.dim("Max:")} ${format(max)}  ${c.dim("Avg:")} ${format(avg)}`);
  lines.push("");

  // Multi-window sparklines
  for (const { size, label: wLabel, color } of windows) {
    const slice = values.slice(-size);
    if (slice.length < 2) continue;

    const first = slice[0];
    const last = slice[slice.length - 1];
    const delta = last - first;
    const pctChange = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;

    const trendIcon = delta > 0.001
      ? (isHigherBetter ? c.brightGreen("↑") : c.brightRed("↑"))
      : delta < -0.001
        ? (isHigherBetter ? c.brightRed("↓") : c.brightGreen("↓"))
        : c.dim("─");

    const spark = sparkline(slice, 25, color);

    lines.push(`  ${c.dim(wLabel.padEnd(7))} ${spark} ${trendIcon}${Math.abs(pctChange).toFixed(1).padStart(5)}%`);
  }

  return lines;
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
// Spinner Class
// ============================================================================

class Spinner {
  private interval: number | null = null;
  private frame = 0;
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  start() {
    term.hideCursor();
    this.interval = setInterval(() => {
      const spinner = c.cyan(sym.spinner[this.frame % sym.spinner.length]);
      term.clearLine();
      Deno.stdout.writeSync(new TextEncoder().encode(`  ${spinner} ${this.text}`));
      this.frame++;
    }, 80);
  }

  stop(success = true) {
    if (this.interval) clearInterval(this.interval);
    term.clearLine();
    const icon = success ? c.green(sym.check) : c.red(sym.cross);
    console.log(`  ${icon} ${this.text}`);
    term.showCursor();
  }

  update(text: string) {
    this.text = text;
  }
}

// ============================================================================
// Training Monitor
// ============================================================================

interface TrainingMetrics {
  epoch: number;
  batch: number;
  totalBatches: number;
  loss: number;
  accuracy: number;
  learningRate: number;
  temperature: number;
  batchTime: number;
  lossHistory: number[];
  accHistory: number[];
}

function renderMetricsPanel(metrics: TrainingMetrics, startTime: number): string {
  const elapsed = Date.now() - startTime;
  const progress = metrics.batch / metrics.totalBatches;
  const eta = progress > 0 ? (elapsed / progress) - elapsed : 0;

  const content = [
    "",
    `  ${c.bold("Epoch")}     ${c.brightYellow(metrics.epoch.toString())}`,
    `  ${c.bold("Progress")}  ${progressBar(metrics.batch, metrics.totalBatches, 25)}`,
    "",
    `  ${c.bold("Loss")}      ${c.brightMagenta(metrics.loss.toFixed(4))}  ${sparkline(metrics.lossHistory.slice(-20), 15)}`,
    `  ${c.bold("Accuracy")}  ${c.brightGreen((metrics.accuracy * 100).toFixed(1) + "%")}  ${sparkline(metrics.accHistory.slice(-20), 15)}`,
    "",
    `  ${c.bold("τ (temp)")} ${c.cyan(metrics.temperature.toFixed(3))}`,
    `  ${c.bold("Batch")}     ${c.dim(formatDuration(metrics.batchTime) + "/batch")}`,
    "",
    `  ${c.dim("Elapsed")}   ${formatDuration(elapsed)}`,
    `  ${c.dim("ETA")}       ${formatDuration(eta)}`,
    "",
  ];

  return renderBox(`${sym.brain} SHGAT Training`, content, 50);
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
const QUIET = args.quiet;
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

  const caps = await sql`
    SELECT pattern_id as id, intent_embedding as embedding,
           dag_structure->'tools_used' as tools_used, success_rate
    FROM workflow_pattern
    WHERE code_snippet IS NOT NULL AND intent_embedding IS NOT NULL
    LIMIT 1000
  `;

  const capabilities = caps
    .map((c: any) => ({
      id: c.id,
      embedding: parseVector(c.embedding),
      toolsUsed: c.tools_used ?? [],
      successRate: c.success_rate ?? 0.5,
    }))
    .filter((c: any) => c.embedding?.length > 0);

  loadingStatus.caps = capabilities.length;
  loadingStatus.phase = "traces";

  const traces = await sql`
    SELECT et.capability_id, wp.intent_embedding, et.success, et.executed_path
    FROM execution_trace et
    JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
    WHERE et.capability_id IS NOT NULL AND wp.intent_embedding IS NOT NULL
    ORDER BY et.priority DESC LIMIT 500
  `;

  loadingStatus.traces = traces.length;
  loadingStatus.phase = "examples";

  const capToTools = new Map<string, Set<string>>();
  const allEmbeddings = new Map<string, number[]>();
  for (const cap of capabilities) {
    allEmbeddings.set(cap.id, cap.embedding);
    capToTools.set(cap.id, new Set(cap.toolsUsed));
  }

  const examples: any[] = [];
  for (const trace of traces) {
    if (!capToTools.has(trace.capability_id)) continue;
    const intentEmb = parseVector(trace.intent_embedding);
    if (!intentEmb) continue;

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
      contextTools: trace.executed_path ?? [],
      candidateId: trace.capability_id,
      outcome: trace.success ? 1.0 : 0.0,
      negativeCapIds,
      allNegativesSorted,
    });
  }

  loadingStatus.examples = examples.length;
  loadingStatus.phase = "ready";

  // Additional tools
  const toolsInCaps = new Set<string>();
  for (const cap of capabilities) cap.toolsUsed.forEach((t: string) => toolsInCaps.add(t));
  const additionalTools = [...new Set(examples.flatMap((e: any) => e.contextTools))].filter(t => !toolsInCaps.has(t));

  const startTime = Date.now();

  // Metrics collectors for dashboard
  const batchTimes: number[] = [];
  const batchLosses: number[] = [];      // Per-batch loss estimates
  const epochLosses: number[] = [];
  const epochAccuracies: number[] = [];
  const epochTemperatures: number[] = [];
  let currentEpoch = 0;
  let currentBatch = 0;
  let totalBatches = 0;
  let phase = "init";

  // Custom training with log parsing for dashboard
  const workerPath = new URL("../src/graphrag/algorithms/shgat/train-worker.ts", import.meta.url).pathname;

  const inputData = {
    capabilities,
    examples,
    config: {
      epochs: EPOCHS,
      batchSize: BATCH_SIZE,
      usePER: true,
      useCurriculum: true,
      learningRate: 0.05,
    },
    databaseUrl: DATABASE_URL,
    additionalTools,
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
        currentEpoch = parsedEpoch + 1;
        epochLosses.push(parseFloat(epochMatch[2]));
        epochAccuracies.push(parseFloat(epochMatch[3]));
        epochTemperatures.push(parseFloat(epochMatch[4]));
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
    }

    // Health check epoch X: testAcc=0.75
    const testAccMatch = line.match(/Health check epoch \d+: testAcc=([\d.]+)/);
    if (testAccMatch) {
      testAccuracies.push(parseFloat(testAccMatch[1]));
    }
  };

  // =========================================================================
  // Dashboard Renderer
  // =========================================================================
  const embeddingDim = capabilities[0]?.embedding?.length ?? 1024;

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
    const maxBatch = batchTimes.length > 0 ? Math.max(...batchTimes) : 0;
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
          if (line.trim()) parseWorkerLog(line);
        }
      }
    } catch { /* ignore */ }
  })();

  // Clear screen and start dashboard
  term.clear();
  term.hideCursor();
  let lastDashboardLines = 0;

  const dashboardInterval = setInterval(() => {
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

  await Promise.all([stdoutPromise, stderrPromise]);
  clearInterval(dashboardInterval);
  term.showCursor();

  const status = await process.status;
  const elapsed = Date.now() - startTime;

  // Final dashboard render
  if (lastDashboardLines > 0) {
    Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${lastDashboardLines}A`));
  }
  const finalDashboard = renderDashboard();
  for (const line of finalDashboard) {
    Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[2K${line}\n`));
  }
  console.log();

  // Parse result
  let result: { success: boolean; finalLoss?: number; finalAccuracy?: number; savedToDb?: boolean; error?: string };

  if (!status.success) {
    result = { success: false, error: `Exit code: ${status.code}` };
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
        const lossMax = Math.max(...epochLosses);
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
