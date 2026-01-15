#!/usr/bin/env -S deno run --allow-all --unstable-ffi
/**
 * Standalone SHGAT Training Script with Live UI
 *
 * Runs batch training independently of the main server.
 * Features rich CLI output with progress bars, sparklines, and live stats.
 *
 * Usage:
 *   deno task train [--epochs=25] [--batch-size=32]
 */

import "@std/dotenv/load";
import { NUM_NEGATIVES } from "../src/graphrag/algorithms/shgat/types.ts";
import postgres from "postgres";
import { parseArgs } from "@std/cli/parse-args";

// ═══════════════════════════════════════════════════════════════════════════════
// CLI ARGS
// ═══════════════════════════════════════════════════════════════════════════════

const args = parseArgs(Deno.args, {
  default: { epochs: 25, "batch-size": 32 },
  alias: { e: "epochs", b: "batch-size" },
});

const EPOCHS = Number(args.epochs);
const BATCH_SIZE = Number(args["batch-size"]);
const DATABASE_URL = Deno.env.get("DATABASE_URL");

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable required");
  Deno.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE UI UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

const SPARKLINE_CHARS = "▁▂▃▄▅▆▇█";
const PROGRESS_FULL = "█";
const PROGRESS_EMPTY = "░";
const GRAPH_CHARS = " ▁▂▃▄▅▆▇█";

function sparkline(values: number[], width = 20): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Take last `width` values
  const recent = values.slice(-width);
  return recent.map(v => {
    const idx = Math.floor(((v - min) / range) * (SPARKLINE_CHARS.length - 1));
    return SPARKLINE_CHARS[Math.max(0, Math.min(idx, SPARKLINE_CHARS.length - 1))];
  }).join("");
}

/**
 * Draw ASCII chart with multiple series side by side
 * @param series Array of {name, values, color} objects
 * @param height Chart height in rows
 * @param width Chart width per series
 */
function drawChart(
  series: Array<{ name: string; values: number[]; color: string; unit?: string }>,
  height = 8,
  width = 25
): string[] {
  const lines: string[] = [];

  if (series.every(s => s.values.length === 0)) {
    return ["  (waiting for data...)"];
  }

  // Calculate bounds for each series
  const seriesData = series.map(s => {
    const vals = s.values.length > 0 ? s.values : [0];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const current = vals[vals.length - 1] ?? 0;
    return { ...s, min, max, range, current, vals };
  });

  // Header with current values
  let header = "  ";
  for (const s of seriesData) {
    const valStr = s.unit === "%"
      ? `${(s.current * 100).toFixed(1)}%`
      : s.current.toFixed(4);
    header += `${s.color}${s.name}: ${valStr}${c.reset}`.padEnd(width + 15);
  }
  lines.push(header);
  lines.push("");

  // Draw chart rows (top to bottom)
  for (let row = height - 1; row >= 0; row--) {
    const threshold = row / (height - 1); // 0 at bottom, 1 at top
    let line = "  ";

    for (const s of seriesData) {
      // Y-axis label on first series
      if (s === seriesData[0]) {
        if (row === height - 1) {
          line = `${s.max.toFixed(2).slice(0, 5).padStart(5)} `;
        } else if (row === 0) {
          line = `${s.min.toFixed(2).slice(0, 5).padStart(5)} `;
        } else {
          line = "      ";
        }
      }

      // Sample values to fit width
      const step = Math.max(1, Math.floor(s.vals.length / width));
      const sampled: number[] = [];
      for (let i = 0; i < s.vals.length; i += step) {
        sampled.push(s.vals[i]);
      }
      // Ensure we have the latest value
      if (sampled.length > 0 && sampled[sampled.length - 1] !== s.vals[s.vals.length - 1]) {
        sampled.push(s.vals[s.vals.length - 1]);
      }

      let chartLine = "";
      for (let x = 0; x < width; x++) {
        if (x < sampled.length) {
          const normalized = (sampled[x] - s.min) / s.range;
          if (normalized >= threshold) {
            // Determine fill level for this cell
            const cellLevel = (normalized - threshold) * (height - 1);
            const charIdx = Math.min(Math.floor(cellLevel * GRAPH_CHARS.length), GRAPH_CHARS.length - 1);
            chartLine += s.color + GRAPH_CHARS[Math.max(1, charIdx)] + c.reset;
          } else {
            chartLine += " ";
          }
        } else {
          chartLine += c.dim + "·" + c.reset;
        }
      }
      line += chartLine + "  ";
    }
    lines.push(line);
  }

  // X-axis
  let xAxis = "      ";
  for (const s of seriesData) {
    xAxis += "└" + "─".repeat(width - 1) + "  ";
  }
  lines.push(xAxis);

  // Epoch labels
  let epochLabel = "      ";
  for (const s of seriesData) {
    const epochs = s.vals.length;
    epochLabel += `0${" ".repeat(Math.floor(width / 2) - 1)}${epochs}${" ".repeat(width - Math.floor(width / 2) - String(epochs).length)}  `;
  }
  lines.push(c.dim + epochLabel + c.reset);

  return lines;
}

function progressBar(current: number, total: number, width = 30): string {
  const pct = Math.min(current / total, 1);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return PROGRESS_FULL.repeat(filled) + PROGRESS_EMPTY.repeat(empty);
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function formatEta(msPerEpoch: number, remaining: number): string {
  const eta = msPerEpoch * remaining;
  return formatDuration(eta);
}

function clearLines(n: number) {
  for (let i = 0; i < n; i++) {
    Deno.stdout.writeSync(new TextEncoder().encode("\x1b[1A\x1b[2K"));
  }
}

// Colors
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  bgBlue: "\x1b[44m",
  bgGreen: "\x1b[42m",
};

// ═══════════════════════════════════════════════════════════════════════════════
// TRAINING STATE
// ═══════════════════════════════════════════════════════════════════════════════

interface TrainingState {
  epoch: number;
  totalEpochs: number;
  loss: number;
  trainAcc: number;
  testAcc: number;
  baselineTestAcc: number;
  beta: number;
  temperature: number;
  priorityMin: number;
  priorityMax: number;
  lossHistory: number[];
  trainAccHistory: number[];
  testAccHistory: number[];
  startTime: number;
  epochStartTime: number;
  epochTimes: number[];
  phase: "init" | "training" | "saving" | "done";
  status: string;
}

function createState(): TrainingState {
  return {
    epoch: 0,
    totalEpochs: EPOCHS,
    loss: 0,
    trainAcc: 0,
    testAcc: 0,
    baselineTestAcc: 0,
    beta: 0.4,
    temperature: 0.1,
    priorityMin: 0,
    priorityMax: 1,
    lossHistory: [],
    trainAccHistory: [],
    testAccHistory: [],
    startTime: Date.now(),
    epochStartTime: Date.now(),
    epochTimes: [],
    phase: "init",
    status: "Initializing...",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE DISPLAY
// ═══════════════════════════════════════════════════════════════════════════════

let lastDisplayLines = 0;

function renderDisplay(state: TrainingState) {
  // Clear previous display
  if (lastDisplayLines > 0) {
    clearLines(lastDisplayLines);
  }

  const lines: string[] = [];
  const elapsed = Date.now() - state.startTime;
  const avgEpochTime = state.epochTimes.length > 0
    ? state.epochTimes.reduce((a, b) => a + b, 0) / state.epochTimes.length
    : 0;
  const eta = state.epoch < state.totalEpochs && avgEpochTime > 0
    ? formatEta(avgEpochTime, state.totalEpochs - state.epoch)
    : "--";

  // Header
  lines.push("");
  lines.push(`${c.bold}${c.bgBlue} SHGAT TRAINING ${c.reset} ${c.dim}epochs=${EPOCHS} batch=${BATCH_SIZE}${c.reset}`);
  lines.push("");

  // Progress bar
  const pct = ((state.epoch / state.totalEpochs) * 100).toFixed(0);
  lines.push(`${c.cyan}Progress:${c.reset} [${progressBar(state.epoch, state.totalEpochs, 40)}] ${pct}%`);
  lines.push(`${c.dim}Epoch ${state.epoch}/${state.totalEpochs} • Elapsed: ${formatDuration(elapsed)} • ETA: ${eta}${c.reset}`);
  lines.push("");

  // Charts: Loss and Accuracy side by side
  lines.push(`${c.bold}┌─ Training Curves ──────────────────────────────────────────────────────────────┐${c.reset}`);

  const chartLines = drawChart([
    { name: "Loss", values: state.lossHistory, color: c.yellow },
    { name: "Train Acc", values: state.trainAccHistory, color: c.green, unit: "%" },
    { name: "Test Acc", values: state.testAccHistory, color: c.blue, unit: "%" },
  ], 6, 20);

  for (const line of chartLines) {
    lines.push(`${c.bold}│${c.reset} ${line}`);
  }
  lines.push(`${c.bold}└────────────────────────────────────────────────────────────────────────────────┘${c.reset}`);
  lines.push("");

  // Compact stats row
  const testDelta = state.testAcc - state.baselineTestAcc;
  const deltaStr = state.testAccHistory.length > 0
    ? (testDelta >= 0 ? `${c.green}+${(testDelta * 100).toFixed(1)}%${c.reset}` : `${c.red}${(testDelta * 100).toFixed(1)}%${c.reset}`)
    : "--";

  lines.push(`${c.dim}Hyperparams:${c.reset} τ=${state.temperature.toFixed(3)} β=${state.beta.toFixed(2)} priority=[${state.priorityMin.toFixed(2)},${state.priorityMax.toFixed(1)}] ${c.dim}|${c.reset} Test Δbaseline: ${deltaStr}`);
  lines.push("");

  // Status
  const statusIcon = state.phase === "training" ? "⚡" : state.phase === "saving" ? "💾" : state.phase === "done" ? "✓" : "⏳";
  lines.push(`${c.dim}${statusIcon} ${state.status}${c.reset}`);
  lines.push("");

  // Output
  const output = lines.join("\n");
  Deno.stdout.writeSync(new TextEncoder().encode(output));
  lastDisplayLines = lines.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOG PARSER
// ═══════════════════════════════════════════════════════════════════════════════

function parseWorkerLog(line: string, state: TrainingState): boolean {
  // Epoch log: [SHGAT Worker] Epoch 5: loss=0.4521, acc=0.82, priority=[0.01-18.5], β=0.52, τ=0.085
  const epochMatch = line.match(/Epoch (\d+): loss=([\d.]+), acc=([\d.]+)(?:, priority=\[([\d.]+)-([\d.]+)\])?, β=([\d.]+), τ=([\d.]+)/);
  if (epochMatch) {
    const epochTime = Date.now() - state.epochStartTime;
    state.epochTimes.push(epochTime);
    state.epochStartTime = Date.now();

    state.epoch = parseInt(epochMatch[1]) + 1;
    state.loss = parseFloat(epochMatch[2]);
    state.trainAcc = parseFloat(epochMatch[3]);
    if (epochMatch[4]) state.priorityMin = parseFloat(epochMatch[4]);
    if (epochMatch[5]) state.priorityMax = parseFloat(epochMatch[5]);
    state.beta = parseFloat(epochMatch[6]);
    state.temperature = parseFloat(epochMatch[7]);

    state.lossHistory.push(state.loss);
    state.trainAccHistory.push(state.trainAcc);
    state.status = `Training epoch ${state.epoch}/${state.totalEpochs}`;
    return true;
  }

  // Health check baseline: [SHGAT Worker] Health check baseline: testAcc=0.65
  const baselineMatch = line.match(/Health check baseline: testAcc=([\d.]+)/);
  if (baselineMatch) {
    state.testAcc = parseFloat(baselineMatch[1]);
    state.baselineTestAcc = state.testAcc;
    state.testAccHistory.push(state.testAcc);
    return true;
  }

  // Health check: [SHGAT Worker] Health check epoch 5: testAcc=0.71, Δbaseline=+2.3%, Δlast=+0.8%
  const healthMatch = line.match(/Health check epoch \d+: testAcc=([\d.]+)/);
  if (healthMatch) {
    state.testAcc = parseFloat(healthMatch[1]);
    state.testAccHistory.push(state.testAcc);
    return true;
  }

  // BLAS status
  if (line.includes("BLAS:")) {
    state.status = line.includes("enabled") ? "BLAS acceleration enabled" : "Using JS fallback";
    return true;
  }

  // Reading input
  if (line.includes("Reading input from stdin")) {
    state.status = "Reading input...";
    return true;
  }

  // Received input
  if (line.includes("Received") && line.includes("MB input")) {
    const match = line.match(/([\d.]+) MB input/);
    state.status = match ? `Received ${match[1]} MB input` : "Received input";
    return true;
  }

  // Parsing JSON
  if (line.includes("Parsing JSON")) {
    state.status = "Parsing input JSON...";
    return true;
  }

  // Parsed
  if (line.includes("Parsed:")) {
    const match = line.match(/Parsed: (\d+) caps, (\d+) examples/);
    state.status = match ? `Loaded ${match[1]} caps, ${match[2]} examples` : "Input parsed";
    return true;
  }

  // Creating SHGAT
  if (line.includes("Creating SHGAT graph")) {
    state.status = "Building SHGAT graph...";
    return true;
  }

  // SHGAT created
  if (line.includes("SHGAT created in")) {
    const match = line.match(/(\d+)ms/);
    state.status = match ? `SHGAT created in ${match[1]}ms` : "SHGAT created";
    return true;
  }

  // Starting training
  if (line.includes("Starting") && line.includes("training")) {
    state.phase = "training";
    state.epochStartTime = Date.now();
    const match = line.match(/(\d+) examples/);
    state.status = match ? `Training on ${match[1]} examples...` : "Training started...";
    return true;
  }

  // Exporting params
  if (line.includes("Exporting params")) {
    state.phase = "saving";
    state.status = "Exporting model parameters...";
    return true;
  }

  // Saved to DB
  if (line.includes("Params saved to DB")) {
    state.status = "Parameters saved to database";
    return true;
  }

  // Degradation
  if (line.includes("DEGRADATION DETECTED")) {
    state.status = "⚠️ Degradation detected - early stopping";
    return true;
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

const sql = postgres(DATABASE_URL);

// Header
console.log(`
${c.bold}╔════════════════════════════════════════════════════════════════════════════════╗
║                        SHGAT STANDALONE TRAINING                               ║
╚════════════════════════════════════════════════════════════════════════════════╝${c.reset}

${c.dim}Config:${c.reset} epochs=${c.cyan}${EPOCHS}${c.reset}, batch_size=${c.cyan}${BATCH_SIZE}${c.reset}
${c.dim}Database:${c.reset} ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}
`);

// Helper functions
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

function parseVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const cleaned = v.replace(/^\[|\]$/g, "");
      const arr = cleaned.split(",").map(Number);
      if (arr.length > 0 && !arr.some(isNaN)) return arr;
    } catch { /* ignore */ }
  }
  return null;
}

try {
  // 1. Load capabilities
  console.log(`${c.cyan}[1/5]${c.reset} Loading capabilities...`);
  const caps = await sql`
    SELECT
      pattern_id as id,
      intent_embedding as embedding,
      dag_structure->'tools_used' as tools_used,
      success_rate
    FROM workflow_pattern
    WHERE code_snippet IS NOT NULL
      AND intent_embedding IS NOT NULL
    LIMIT 1000
  `;

  const capabilities = caps
    .map((c: any) => ({
      id: c.id,
      embedding: parseVector(c.embedding),
      toolsUsed: c.tools_used ?? [],
      successRate: c.success_rate ?? 0.5,
    }))
    .filter((c: any) => c.embedding && c.embedding.length > 0);

  console.log(`      ${c.green}✓${c.reset} ${capabilities.length} capabilities loaded`);

  if (capabilities.length === 0) {
    console.error(`${c.red}ERROR:${c.reset} No capabilities with embeddings found`);
    Deno.exit(1);
  }

  // 2. Load traces
  console.log(`${c.cyan}[2/5]${c.reset} Loading execution traces...`);
  const traces = await sql`
    SELECT
      et.capability_id,
      wp.description AS intent_text,
      wp.intent_embedding,
      et.success,
      et.executed_path
    FROM execution_trace et
    JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
    WHERE et.capability_id IS NOT NULL
      AND wp.intent_embedding IS NOT NULL
    ORDER BY et.priority DESC
    LIMIT 500
  `;

  console.log(`      ${c.green}✓${c.reset} ${traces.length} traces loaded`);

  if (traces.length === 0) {
    console.error(`${c.red}ERROR:${c.reset} No execution traces found`);
    Deno.exit(1);
  }

  // 3. Compute thresholds
  console.log(`${c.cyan}[3/5]${c.reset} Computing semi-hard negative thresholds...`);

  const allEmbeddings = new Map<string, number[]>();
  const capToTools = new Map<string, Set<string>>();

  for (const cap of capabilities) {
    allEmbeddings.set(cap.id, cap.embedding);
    capToTools.set(cap.id, new Set(cap.toolsUsed));
  }

  const allSims: number[] = [];
  for (const trace of traces) {
    if (!trace.intent_embedding) continue;
    const intentEmb = parseVector(trace.intent_embedding);
    if (!intentEmb) continue;

    const anchorTools = capToTools.get(trace.capability_id) ?? new Set();
    for (const [itemId, emb] of allEmbeddings) {
      if (itemId === trace.capability_id) continue;
      if (anchorTools.has(itemId)) continue;
      allSims.push(cosineSim(intentEmb, emb));
    }
  }

  let SEMI_HARD_MIN = allSims.length > 0 ? percentile(allSims, 25) : 0.15;
  let SEMI_HARD_MAX = allSims.length > 0 ? percentile(allSims, 75) : 0.65;

  const MIN_SPREAD = 0.1;
  if (SEMI_HARD_MAX - SEMI_HARD_MIN < MIN_SPREAD) {
    SEMI_HARD_MIN = SEMI_HARD_MAX - MIN_SPREAD;
  }

  const easyCount = allSims.filter(s => s < SEMI_HARD_MIN).length;
  const semiHardCount = allSims.filter(s => s >= SEMI_HARD_MIN && s <= SEMI_HARD_MAX).length;
  const hardCount = allSims.filter(s => s > SEMI_HARD_MAX).length;

  console.log(`      ${c.green}✓${c.reset} Thresholds: [${SEMI_HARD_MIN.toFixed(3)}, ${SEMI_HARD_MAX.toFixed(3)}]`);
  console.log(`      ${c.dim}Distribution: easy=${easyCount}, semi-hard=${semiHardCount}, hard=${hardCount}${c.reset}`);

  // 4. Build examples
  console.log(`${c.cyan}[4/5]${c.reset} Building training examples...`);

  interface TrainingExample {
    intentEmbedding: number[];
    contextTools: string[];
    candidateId: string;
    outcome: number;
    negativeCapIds: string[];
    allNegativesSorted?: string[];
  }

  const examples: TrainingExample[] = [];

  for (const trace of traces) {
    if (!capToTools.has(trace.capability_id)) continue;

    const intentEmbedding = parseVector(trace.intent_embedding);
    if (!intentEmbedding) continue;

    const anchorTools = capToTools.get(trace.capability_id)!;

    const candidatesWithSim: Array<{ id: string; sim: number }> = [];
    for (const [itemId, emb] of allEmbeddings) {
      if (itemId === trace.capability_id) continue;
      if (anchorTools.has(itemId)) continue;
      const sim = cosineSim(intentEmbedding, emb);
      candidatesWithSim.push({ id: itemId, sim });
    }

    const allSorted = [...candidatesWithSim].sort((a, b) => b.sim - a.sim);
    const allNegativesSorted = allSorted.map(c => c.id);

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
      intentEmbedding,
      contextTools: trace.executed_path ?? [],
      candidateId: trace.capability_id,
      outcome: trace.success ? 1.0 : 0.0,
      negativeCapIds,
      allNegativesSorted,
    });
  }

  console.log(`      ${c.green}✓${c.reset} ${examples.length} training examples ready`);

  if (examples.length === 0) {
    console.error(`${c.red}ERROR:${c.reset} No valid training examples`);
    Deno.exit(1);
  }

  // Additional tools
  const toolsInCaps = new Set<string>();
  for (const cap of capabilities) {
    for (const tool of cap.toolsUsed) {
      toolsInCaps.add(tool);
    }
  }

  const additionalTools: string[] = [];
  for (const ex of examples) {
    for (const tool of ex.contextTools) {
      if (!toolsInCaps.has(tool) && !additionalTools.includes(tool)) {
        additionalTools.push(tool);
      }
    }
  }

  if (additionalTools.length > 0) {
    console.log(`      ${c.dim}+ ${additionalTools.length} additional tools from traces${c.reset}`);
  }

  // 5. Run training with live UI
  console.log(`${c.cyan}[5/5]${c.reset} Starting training...`);
  console.log("");

  const state = createState();
  state.phase = "init";
  state.status = "Launching training subprocess...";

  // Spawn worker directly for live output
  const workerPath = new URL("../src/graphrag/algorithms/shgat/train-worker.ts", import.meta.url).pathname;

  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", "--unstable-ffi", workerPath],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();

  // Send input
  const inputJson = JSON.stringify({
    capabilities: capabilities.map((c: any) => ({
      id: c.id,
      embedding: c.embedding,
      toolsUsed: c.toolsUsed,
      successRate: c.successRate,
    })),
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
  });

  const writer = process.stdin.getWriter();
  await writer.write(new TextEncoder().encode(inputJson));
  await writer.close();

  // Initial display
  renderDisplay(state);

  // Stream stderr for live updates
  const decoder = new TextDecoder();
  const stderrReader = process.stderr.getReader();
  let buffer = "";

  const stderrPromise = (async () => {
    try {
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            if (parseWorkerLog(line, state)) {
              renderDisplay(state);
            }
          }
        }
      }
    } catch {
      // Ignore
    }
  })();

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
    } catch {
      // Ignore
    }
  })();

  await Promise.all([stderrPromise, stdoutPromise]);
  const status = await process.status;

  // Parse result
  const stdoutBytes = new Uint8Array(stdoutChunks.reduce((acc, c) => acc + c.length, 0));
  let offset = 0;
  for (const chunk of stdoutChunks) {
    stdoutBytes.set(chunk, offset);
    offset += chunk.length;
  }
  const stdout = decoder.decode(stdoutBytes).trim();

  state.phase = "done";

  // Clear live display and show final summary
  if (lastDisplayLines > 0) {
    clearLines(lastDisplayLines);
  }

  const elapsed = Date.now() - state.startTime;

  console.log("");
  console.log(`${c.bold}╔════════════════════════════════════════════════════════════════════════════════╗`);
  console.log(`║                           TRAINING COMPLETE                                   ║`);
  console.log(`╚════════════════════════════════════════════════════════════════════════════════╝${c.reset}`);
  console.log("");

  if (status.success && stdout) {
    try {
      const result = JSON.parse(stdout);

      if (result.success) {
        console.log(`  ${c.green}✓${c.reset} ${c.bold}Status:${c.reset}     Success`);
        console.log(`  ${c.cyan}⏱${c.reset} ${c.bold}Duration:${c.reset}   ${formatDuration(elapsed)}`);
        console.log("");
        console.log(`  ${c.bold}Final Metrics:${c.reset}`);
        console.log(`    Loss:       ${c.yellow}${result.finalLoss?.toFixed(4)}${c.reset}`);
        console.log(`    Train Acc:  ${c.green}${((result.finalAccuracy ?? 0) * 100).toFixed(1)}%${c.reset}`);

        if (result.healthCheck) {
          const hc = result.healthCheck;
          const delta = hc.finalAccuracy - hc.baselineAccuracy;
          const deltaColor = delta >= 0 ? c.green : c.red;
          const deltaSign = delta >= 0 ? "+" : "";

          console.log("");
          console.log(`  ${c.bold}Health Check (20% test set):${c.reset}`);
          console.log(`    Baseline:   ${(hc.baselineAccuracy * 100).toFixed(1)}%`);
          console.log(`    Final:      ${(hc.finalAccuracy * 100).toFixed(1)}%`);
          console.log(`    Change:     ${deltaColor}${deltaSign}${(delta * 100).toFixed(1)}%${c.reset}`);

          if (hc.degradationDetected) {
            console.log(`    ${c.red}⚠ Early stopped at epoch ${hc.earlyStopEpoch} (degradation)${c.reset}`);
          }
        }

        console.log("");
        console.log(`  ${c.bold}Loss History:${c.reset}     ${sparkline(state.lossHistory, 40)}`);
        console.log(`  ${c.bold}Train Acc:${c.reset}        ${sparkline(state.trainAccHistory, 40)}`);
        if (state.testAccHistory.length > 0) {
          console.log(`  ${c.bold}Test Acc:${c.reset}         ${sparkline(state.testAccHistory, 40)}`);
        }

        console.log("");
        console.log(`  ${c.green}✓${c.reset} ${c.bold}Saved to DB:${c.reset} ${result.savedToDb ? "Yes" : "No"}`);
      } else {
        console.log(`  ${c.red}✗${c.reset} Training failed: ${result.error}`);
      }
    } catch {
      console.log(`  ${c.red}✗${c.reset} Failed to parse result: ${stdout}`);
    }
  } else {
    console.log(`  ${c.red}✗${c.reset} Training process failed (exit code ${status.code})`);
  }

  console.log("");

} catch (error) {
  console.error(`${c.red}ERROR:${c.reset} ${error}`);
  Deno.exit(1);
} finally {
  await sql.end();
}
