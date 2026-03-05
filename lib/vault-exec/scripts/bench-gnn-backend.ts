import {
  blasMatVec,
  getBlasStatus,
  initBlasAcceleration,
  isBlasAvailable,
} from "../src/gnn/infrastructure/blas-ffi.ts";

interface BenchCase {
  name: string;
  rows: number;
  cols: number;
  batches: number;
  warmup: number;
  iterations: number;
}

interface Stats {
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  checksum: number;
}

interface Options {
  seed: number;
  scale: number;
}

function parseOptions(args: string[]): Options {
  let seed = 42;
  let scale = 1;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--seed") {
      const next = Number(args[i + 1]);
      if (!Number.isFinite(next)) throw new Error("Invalid --seed value");
      seed = Math.trunc(next);
      i++;
      continue;
    }
    if (arg === "--scale") {
      const next = Number(args[i + 1]);
      if (!Number.isFinite(next) || next <= 0) throw new Error("Invalid --scale value");
      scale = next;
      i++;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: deno task bench:gnn [--seed <int>] [--scale <number>]");
      Deno.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { seed, scale };
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function makeVector(size: number, rng: () => number): number[] {
  return Array.from({ length: size }, () => (rng() * 2 - 1));
}

function makeMatrix(rows: number, cols: number, rng: () => number): number[][] {
  return Array.from({ length: rows }, () => makeVector(cols, rng));
}

function jsMatVec(matrix: number[][], vector: number[]): number[] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const out = new Array<number>(rows);
  for (let i = 0; i < rows; i++) {
    let sum = 0;
    for (let j = 0; j < cols; j++) sum += matrix[i][j] * vector[j];
    out[i] = sum;
  }
  return out;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

function buildStats(samples: number[], checksum: number): Stats {
  const total = samples.reduce((sum, ms) => sum + ms, 0);
  const meanMs = total / samples.length;
  const minMs = Math.min(...samples);
  const maxMs = Math.max(...samples);
  return {
    meanMs,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    minMs,
    maxMs,
    checksum,
  };
}

function runCase(
  matrix: number[][],
  vector: number[],
  batches: number,
  warmup: number,
  iterations: number,
  runner: (m: number[][], v: number[]) => number[],
): Stats {
  let checksum = 0;

  for (let i = 0; i < warmup; i++) {
    for (let b = 0; b < batches; b++) {
      const out = runner(matrix, vector);
      checksum += out[0] ?? 0;
    }
  }

  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    for (let b = 0; b < batches; b++) {
      const out = runner(matrix, vector);
      checksum += out[0] ?? 0;
    }
    const elapsed = performance.now() - start;
    samples.push(elapsed);
  }

  return buildStats(samples, checksum);
}

function maxAbsDiff(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
  }
  return max;
}

function fmt(ms: number): string {
  return ms.toFixed(4);
}

function main(): void {
  const options = parseOptions(Deno.args);
  const scale = options.scale;
  const seed = options.seed;
  initBlasAcceleration();
  const blasStatus = getBlasStatus();
  const blasReady = isBlasAvailable();

  const cases: BenchCase[] = [
    {
      name: "head-proj-64x1024",
      rows: 64,
      cols: 1024,
      batches: 1,
      warmup: Math.max(2, Math.round(8 * scale)),
      iterations: Math.max(4, Math.round(40 * scale)),
    },
    {
      name: "8-head-proj-64x1024",
      rows: 64,
      cols: 1024,
      batches: 8,
      warmup: Math.max(1, Math.round(4 * scale)),
      iterations: Math.max(2, Math.round(14 * scale)),
    },
    {
      name: "small-proj-16x256",
      rows: 16,
      cols: 256,
      batches: 8,
      warmup: Math.max(2, Math.round(8 * scale)),
      iterations: Math.max(4, Math.round(36 * scale)),
    },
  ];

  console.log("== GNN Backend Benchmark ==");
  console.log(`seed=${seed} scale=${scale}`);
  console.log(
    `blas_available=${blasReady} path=${blasStatus.path ?? "n/a"}`,
  );
  console.log("Note: lightweight synthetic benchmark, no DB/files are modified.");

  const rng = makeRng(seed);
  let globalChecksum = 0;

  for (const c of cases) {
    const matrix = makeMatrix(c.rows, c.cols, rng);
    const vector = makeVector(c.cols, rng);

    const jsStats = runCase(matrix, vector, c.batches, c.warmup, c.iterations, jsMatVec);
    globalChecksum += jsStats.checksum;

    console.log(`\nCase: ${c.name} rows=${c.rows} cols=${c.cols} batches=${c.batches}`);
    console.table([
      {
        backend: "js",
        mean_ms: fmt(jsStats.meanMs),
        p50_ms: fmt(jsStats.p50Ms),
        p95_ms: fmt(jsStats.p95Ms),
        min_ms: fmt(jsStats.minMs),
        max_ms: fmt(jsStats.maxMs),
      },
    ]);

    if (!blasReady) {
      console.log("BLAS benchmark skipped (backend unavailable in this runtime).");
      continue;
    }

    const blasStats = runCase(matrix, vector, c.batches, c.warmup, c.iterations, blasMatVec);
    globalChecksum += blasStats.checksum;

    const jsOnce = jsMatVec(matrix, vector);
    const blasOnce = blasMatVec(matrix, vector);
    const diff = maxAbsDiff(jsOnce, blasOnce);
    const speedup = jsStats.meanMs / Math.max(blasStats.meanMs, 1e-9);

    console.table([
      {
        backend: "blas",
        mean_ms: fmt(blasStats.meanMs),
        p50_ms: fmt(blasStats.p50Ms),
        p95_ms: fmt(blasStats.p95Ms),
        min_ms: fmt(blasStats.minMs),
        max_ms: fmt(blasStats.maxMs),
      },
    ]);
    console.log(`speedup_vs_js=${speedup.toFixed(2)}x max_abs_diff=${diff.toExponential(3)}`);
  }

  // Side-effect guard: makes outputs dependent on real work and prevents accidental DCE assumptions.
  console.log(`\nbenchmark_checksum=${globalChecksum.toFixed(6)}`);
}

if (import.meta.main) {
  main();
}
