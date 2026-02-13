/**
 * Shared dataset loader for SHGAT retraining.
 *
 * Loads the same data as benchmark-e2e.ts and returns:
 * - A flat `nodes` array ({ id, embedding, children }) for SHGATBuilder
 * - Training examples (prod + n8n) for the training loop
 *
 * SHGATBuilder rebuilds the full hierarchy (levels, matrices) from children.
 *
 * @module gru/shgat/bench-dataset
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as arrow from "apache-arrow";
import parquetWasmModule from "parquet-wasm";
import { readParquet, Table as WasmTable } from "parquet-wasm";
import pako from "pako";
import type { Sql } from "postgres";

import type { TransitionExample } from "../transition/types.ts";
import type { TaskResultWithLayer } from "../training-utils.ts";
import { buildDAGAwareExamples } from "../training-utils.ts";

/**
 * Memory-compact training example for n8n data.
 * - intentEmbedding as Float32Array (4 bytes/float vs 8 for number[])
 * - softTargetSparse stores only non-zero [index, prob] pairs (~10 vs 1901)
 * Saves ~5x memory: ~187MB vs ~1GB for 44K examples.
 */
export interface CompactExample {
  intentEmbedding: Float32Array;
  contextToolIds: string[];
  targetToolId: string;
  isTerminal: number;
  softTargetSparse: [number, number][];
}

// ============================================================================
// Types
// ============================================================================

interface N8nWorkflowPair {
  intentEmbedding: number[];
  positiveToolIds: string[];
  workflowId: number;
  workflowName: string;
}

/** A node for SHGATBuilder: { id, embedding, children } */
export interface NodeInput {
  id: string;
  embedding: number[];
  children: string[];
}

export interface BenchDatasetOptions {
  expandedVocabPath: string;
  n8nPairsPath: string;
  n8nDataDir: string;
  maxN8nWorkflows: number;
  prodOversample: number;
  splitSeed: number;
}

export interface BenchDataset {
  /** Flat list of all nodes (leaves + higher). SHGATBuilder infers levels. */
  nodes: NodeInput[];
  /** Leaf embeddings keyed by id (for training example lookup) */
  leafEmbeddings: Map<string, number[]>;
  leafIds: string[];
  leafIdToIdx: Map<string, number>;
  embeddingDim: number;
  /** Co-occurrence lists for V→V enrichment */
  workflowToolLists: string[][];
  /** Production training/test examples */
  prodTrain: (TransitionExample & { _traceId: string })[];
  prodTest: (TransitionExample & { _traceId: string })[];
  tracePathsForEval: Array<{
    intentEmbedding: number[];
    actualPath: string[];
    traceId: string;
  }>;
  /** n8n training/eval examples (compact: Float32Array + sparse probs) */
  n8nTrain: CompactExample[];
  n8nEval: CompactExample[];
}

type DbSql = Sql<Record<string, never>>;

// ============================================================================
// Helpers
// ============================================================================

function parseEmbedding(embStr: string): number[] | null {
  if (!embStr) return null;
  if (embStr.startsWith("[")) return JSON.parse(embStr);
  return embStr.replace(/^\[|\]$/g, "").split(",").map(Number);
}

function seededRng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(array: T[], rng: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function intentHash(emb: ArrayLike<number>): string {
  return Array.from(emb).slice(0, 12).map((v) => v.toFixed(3)).join(",");
}

// ============================================================================
// Loaders
// ============================================================================

async function loadLeafEmbeddings(
  sql: DbSql,
  expandedVocabPath: string,
): Promise<{ leafEmbeddings: Map<string, number[]>; embeddingDim: number }> {
  console.log("\n[1/5] Loading leaf embeddings (tools)...");
  const toolRows = await sql`
    SELECT tool_id, embedding::text FROM tool_embedding ORDER BY tool_id
  `;
  const leafEmbeddings = new Map<string, number[]>();
  for (const row of toolRows) {
    const embedding = parseEmbedding(row.embedding);
    if (embedding && embedding.length > 0) leafEmbeddings.set(row.tool_id, embedding);
  }
  console.log(`      ${leafEmbeddings.size} PML leaves`);

  if (existsSync(expandedVocabPath)) {
    const expandedVocab = JSON.parse(readFileSync(expandedVocabPath, "utf-8"));
    const smIds: string[] = expandedVocab.smitheryToolIds;
    const smEmbs: number[][] = expandedVocab.smitheryToolEmbeddings;
    let added = 0;
    for (let i = 0; i < smIds.length; i++) {
      if (!leafEmbeddings.has(smIds[i])) {
        leafEmbeddings.set(smIds[i], smEmbs[i]);
        added++;
      }
    }
    console.log(`      + ${added} Smithery leaves → ${leafEmbeddings.size} total`);
  }

  const embeddingDim = leafEmbeddings.values().next().value?.length || 1024;
  return { leafEmbeddings, embeddingDim };
}

/**
 * Build all nodes from leaves + n8n workflows + DB hierarchy.
 * Returns a flat NodeInput[] — SHGATBuilder infers levels from children.
 */
function buildAllNodes(
  leafEmbeddings: Map<string, number[]>,
  n8nPairs: N8nWorkflowPair[],
  maxN8nWorkflows: number,
  hierarchyRows: Array<{
    from_id: string;
    from_emb: string;
    to_id: string;
    to_emb: string;
  }>,
): { nodes: NodeInput[]; workflowToolLists: string[][] } {
  console.log("\n[2/5] Building node graph...");

  // Children map: nodeId → list of child IDs
  const childrenMap = new Map<string, string[]>();
  // Embeddings for non-leaf nodes
  const nodeEmbeddings = new Map<string, number[]>();

  // --- n8n workflows as nodes (children = tools used) ---
  const scored = n8nPairs
    .map((pair) => ({
      pair,
      validTools: pair.positiveToolIds.filter((t) => leafEmbeddings.has(t)),
    }))
    .filter((s) => s.validTools.length >= 2)
    .sort((a, b) => b.validTools.length - a.validTools.length)
    .slice(0, maxN8nWorkflows);

  const workflowToolLists: string[][] = [];
  for (const { pair, validTools } of scored) {
    const nodeId = `n8n:wf:${pair.workflowId}`;
    nodeEmbeddings.set(nodeId, pair.intentEmbedding);
    childrenMap.set(nodeId, validTools);
    workflowToolLists.push(validTools);
  }
  console.log(`      ${scored.length} n8n workflow nodes`);

  // --- DB hierarchy (parent→child pattern relations) ---
  let dbEdges = 0;
  for (const row of hierarchyRows) {
    const parentEmb = parseEmbedding(row.from_emb);
    const childEmb = parseEmbedding(row.to_emb);
    if (!parentEmb || !childEmb) continue;

    if (!nodeEmbeddings.has(row.from_id)) nodeEmbeddings.set(row.from_id, parentEmb);
    if (!nodeEmbeddings.has(row.to_id)) nodeEmbeddings.set(row.to_id, childEmb);

    const existing = childrenMap.get(row.from_id) ?? [];
    if (!existing.includes(row.to_id)) {
      existing.push(row.to_id);
      childrenMap.set(row.from_id, existing);
    }
    dbEdges++;
  }
  console.log(`      ${dbEdges} DB hierarchy edges, ${nodeEmbeddings.size} total non-leaf nodes`);

  // --- Assemble flat nodes array ---
  const nodes: NodeInput[] = [];

  // Leaves (children = [])
  for (const [id, embedding] of leafEmbeddings) {
    nodes.push({ id, embedding, children: [] });
  }

  // Non-leaf nodes (children from map)
  for (const [id, embedding] of nodeEmbeddings) {
    nodes.push({ id, embedding, children: childrenMap.get(id) ?? [] });
  }

  console.log(
    `      ${nodes.length} total nodes (${leafEmbeddings.size} leaves + ${nodeEmbeddings.size} non-leaf)`,
  );
  return { nodes, workflowToolLists };
}

function loadProdExamples(
  traceRows: Array<{
    id: string;
    task_results: TaskResultWithLayer[];
    success: boolean;
    intent_embedding: string;
  }>,
  leafEmbeddings: Map<string, number[]>,
  rng: () => number,
) {
  const prodExamples: (TransitionExample & { _traceId: string })[] = [];
  const tracePathsForEval: Array<{
    intentEmbedding: number[];
    actualPath: string[];
    traceId: string;
  }> = [];
  const singleToolSeen = new Set<string>();
  const validLeafIdSet = new Set(leafEmbeddings.keys());

  const embedHash = (emb: number[]) => emb.slice(0, 8).map((v) => v.toFixed(4)).join(",");

  for (const trace of traceRows) {
    const intentEmbedding = parseEmbedding(trace.intent_embedding);
    if (!intentEmbedding) continue;

    const traceResult = buildDAGAwareExamples(
      trace.id,
      intentEmbedding,
      trace.task_results,
      validLeafIdSet,
      singleToolSeen,
      embedHash,
    );

    if (traceResult.isMultiTool) {
      const toolSequence = trace.task_results
        .map((t) => t.tool)
        .filter((t): t is string => !!t && validLeafIdSet.has(t));
      tracePathsForEval.push({
        intentEmbedding,
        actualPath: toolSequence,
        traceId: trace.id,
      });
    }

    prodExamples.push(...traceResult.examples);
  }

  const uniqueTraceIds = [...new Set(prodExamples.map((ex) => ex._traceId))];
  const shuffledTraceIds = shuffle(uniqueTraceIds, rng);
  const splitIdx = Math.floor(shuffledTraceIds.length * 0.8);
  const trainTraceIds = new Set(shuffledTraceIds.slice(0, splitIdx));
  const testTraceIds = new Set(shuffledTraceIds.slice(splitIdx));

  const prodTrain = prodExamples.filter((ex) => trainTraceIds.has(ex._traceId));
  const prodTest = prodExamples.filter((ex) => testTraceIds.has(ex._traceId));

  return { prodTrain, prodTest, tracePathsForEval };
}

async function loadN8nExamples(
  dataDir: string,
  leafEmbeddings: Map<string, number[]>,
  leafIdToIdx: Map<string, number>,
  expandedVocabPath: string,
  rng: () => number,
) {
  const parquetPath = resolve(dataDir, "n8n-training-examples.parquet");
  const binPath = resolve(dataDir, "n8n-training-examples.msgpack.gz");
  const jsonPath = resolve(dataDir, "n8n-training-examples.json");
  const n8nExamples: CompactExample[] = [];

  /** Remap n8n tool indices → model indices, returning sparse [idx, prob] pairs. */
  const remapProbsSparse = (
    probs: ArrayLike<number>,
    n8nToModelIdx: Map<number, number>,
  ): [number, number][] | null => {
    const sparse: [number, number][] = [];
    let total = 0;
    for (let i = 0; i < probs.length; i++) {
      if (probs[i] > 0) {
        const modelIdx = n8nToModelIdx.get(i);
        if (modelIdx !== undefined) {
          sparse.push([modelIdx, probs[i]]);
          total += probs[i];
        }
      }
    }
    if (total > 0) {
      for (let i = 0; i < sparse.length; i++) sparse[i][1] /= total;
    }
    return total > 0 ? sparse : null;
  };

  /**
   * Build the n8n vocab → model index mapping from expanded-vocab.json.
   * The n8n vocab order is: PML tools (sorted by tool_id from DB) then Smithery tools.
   * leafIdToIdx is built in the same order by loadLeafEmbeddings().
   */
  const buildN8nToModelIdx = (): Map<number, number> => {
    const n8nToModelIdx = new Map<number, number>();
    // Reconstruct the n8n vocab order: PML leaves first, then Smithery
    // PML leaves are the first entries in leafIdToIdx (added from DB ORDER BY tool_id)
    if (!existsSync(expandedVocabPath)) {
      // No expanded vocab → n8n vocab == PML tools only, same order as leafIdToIdx
      for (const [id, idx] of leafIdToIdx) {
        n8nToModelIdx.set(idx, idx);
      }
      return n8nToModelIdx;
    }
    const expandedVocab = JSON.parse(readFileSync(expandedVocabPath, "utf-8")) as {
      pmlToolCount: number;
      smitheryToolIds: string[];
    };
    // PML tool IDs: the first pmlToolCount entries in leafIdToIdx iteration order
    const leafIds = [...leafIdToIdx.keys()];
    let n8nIdx = 0;
    // Map PML tools (indices 0..pmlToolCount-1)
    for (let i = 0; i < Math.min(expandedVocab.pmlToolCount, leafIds.length); i++) {
      const modelIdx = leafIdToIdx.get(leafIds[i]);
      if (modelIdx !== undefined) {
        n8nToModelIdx.set(n8nIdx, modelIdx);
      }
      n8nIdx++;
    }
    // Map Smithery tools (indices pmlToolCount..N-1)
    for (const smId of expandedVocab.smitheryToolIds) {
      const modelIdx = leafIdToIdx.get(smId);
      if (modelIdx !== undefined) {
        n8nToModelIdx.set(n8nIdx, modelIdx);
      }
      n8nIdx++;
    }
    return n8nToModelIdx;
  };

  /** Reinterpret a msgpack-decoded Uint8Array as Float32Array.
   *  msgpack shares a single large ArrayBuffer so byteOffset may not be 4-byte aligned.
   *  We copy the bytes into a fresh aligned buffer before reinterpreting. */
  const asFloat32 = (raw: Uint8Array | Float32Array): Float32Array => {
    if (raw instanceof Float32Array) return raw;
    const aligned = new Uint8Array(raw.byteLength);
    aligned.set(raw);
    return new Float32Array(aligned.buffer, 0, raw.byteLength / 4);
  };

  console.log("\n[4/5] Loading n8n training examples...");

  if (existsSync(parquetPath)) {
    // ---- Parquet: streaming row-by-row, low memory (~500MB vs ~12GB for msgpack) ----
    // FAIL-FAST: if Parquet exists but fails to load, throw — no silent fallback
    console.log(`      Loading Parquet: ${parquetPath}`);
    const t0 = performance.now();

    if (typeof parquetWasmModule === "function") {
      await (parquetWasmModule as unknown as () => Promise<void>)();
    }

    const parquetBytes = new Uint8Array(readFileSync(parquetPath));
    const wasmTable: WasmTable = readParquet(parquetBytes);
    const ipcStream = wasmTable.intoIPCStream();
    const arrowTable: arrow.Table = arrow.tableFromIPC(ipcStream);
    const numRows = arrowTable.numRows;
    console.log(`      Parquet: ${numRows} rows, reading...`);

    const n8nToModelIdx = buildN8nToModelIdx();

    const colEmb = arrowTable.getChild("intent_embedding")!;
    const colCtx = arrowTable.getChild("context_tool_ids_json")!;
    const colTarget = arrowTable.getChild("target_tool_id")!;
    const colTerm = arrowTable.getChild("is_terminal")!;
    const colIndices = arrowTable.getChild("soft_target_indices")!;
    const colProbs = arrowTable.getChild("soft_target_probs")!;

    let skipped = 0;
    for (let i = 0; i < numRows; i++) {
      const targetToolId = colTarget.get(i) as string;
      if (!leafEmbeddings.has(targetToolId)) { skipped++; continue; }

      const contextToolIds: string[] = JSON.parse(colCtx.get(i) as string);
      if (contextToolIds.some((id) => !leafEmbeddings.has(id))) { skipped++; continue; }

      const embBytes = colEmb.get(i) as Uint8Array;
      const aligned = new Uint8Array(embBytes.byteLength);
      aligned.set(embBytes);
      const intentEmbedding = new Float32Array(aligned.buffer, 0, aligned.byteLength / 4);

      const indicesBytes = colIndices.get(i) as Uint8Array;
      const probsBytes = colProbs.get(i) as Uint8Array;

      if (!indicesBytes || indicesBytes.byteLength === 0) { skipped++; continue; }

      const idxAligned = new Uint8Array(indicesBytes.byteLength);
      idxAligned.set(indicesBytes);
      const indices = new Int32Array(idxAligned.buffer, 0, idxAligned.byteLength / 4);

      const probAligned = new Uint8Array(probsBytes.byteLength);
      probAligned.set(probsBytes);
      const probs = new Float32Array(probAligned.buffer, 0, probAligned.byteLength / 4);

      const sparse: [number, number][] = [];
      let total = 0;
      for (let j = 0; j < indices.length; j++) {
        const modelIdx = n8nToModelIdx.get(indices[j]);
        if (modelIdx !== undefined && probs[j] > 0) {
          sparse.push([modelIdx, probs[j]]);
          total += probs[j];
        }
      }
      if (total === 0) { skipped++; continue; }
      for (let j = 0; j < sparse.length; j++) sparse[j][1] /= total;

      n8nExamples.push({
        intentEmbedding,
        contextToolIds,
        targetToolId,
        isTerminal: (colTerm.get(i) as number) || 0,
        softTargetSparse: sparse,
      });
    }
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`      ${n8nExamples.length} n8n examples loaded (parquet, ${elapsed}s, ${skipped} skipped)`);
    if (n8nExamples.length > 0) {
      console.log(
        `      intentEmbedding dim: ${n8nExamples[0].intentEmbedding.length}, sparse entries: ${n8nExamples[0].softTargetSparse.length}`,
      );
    }
  } else if (existsSync(binPath)) {
    const { decode: msgpackDecode } = await import(
      /* @vite-ignore */ "@msgpack/msgpack"
    );
    console.log(`      Loading msgpack+gzip: ${binPath} (fallback — prefer .parquet)`);
    let compressed: Uint8Array | null = new Uint8Array(readFileSync(binPath));
    let decompressed: Uint8Array | null = pako.ungzip(compressed);
    compressed = null; // free compressed (~60MB)
    const n8nData = msgpackDecode(decompressed) as unknown as {
      mcpToolIds: string[];
      examples: Array<
        {
          tid: string;
          ctx: string[];
          ie: Uint8Array; // msgpack decodes Float32Array as raw bytes
          probs: Uint8Array; // same — must reinterpret via asFloat32()
          term: boolean;
        } | null
      >;
    };
    decompressed = null; // free decompressed buffer (~500MB)

    const n8nToolIds: string[] = n8nData.mcpToolIds;
    const n8nToModelIdx = new Map<number, number>();
    for (let i = 0; i < n8nToolIds.length; i++) {
      const modelIdx = leafIdToIdx.get(n8nToolIds[i]);
      if (modelIdx !== undefined) n8nToModelIdx.set(i, modelIdx);
    }

    // Process each example and null it out immediately to free the msgpack view
    for (let i = 0; i < n8nData.examples.length; i++) {
      const ex = n8nData.examples[i];
      if (!ex) continue;
      const targetToolId: string = ex.tid;
      const contextToolIds: string[] = ex.ctx;
      if (!leafEmbeddings.has(targetToolId)) {
        n8nData.examples[i] = null;
        continue;
      }
      if (contextToolIds.some((id) => !leafEmbeddings.has(id))) {
        n8nData.examples[i] = null;
        continue;
      }

      const probs = asFloat32(ex.probs);
      const sparse = remapProbsSparse(probs, n8nToModelIdx);
      n8nData.examples[i] = null; // release raw example immediately
      if (!sparse) continue;
      n8nExamples.push({
        intentEmbedding: new Float32Array(asFloat32(ex.ie)), // copy to detach from buffer
        contextToolIds,
        targetToolId,
        isTerminal: ex.term ? 1 : 0,
        softTargetSparse: sparse,
      });
    }
    console.log(`      ${n8nExamples.length} n8n examples loaded (msgpack, compact)`);
    // Verify dimensions on first example
    if (n8nExamples.length > 0) {
      console.log(
        `      intentEmbedding dim: ${n8nExamples[0].intentEmbedding.length}, sparse entries: ${
          n8nExamples[0].softTargetSparse.length
        }`,
      );
    }
  } else if (existsSync(jsonPath)) {
    console.log(`      Loading JSON: ${jsonPath} (fallback — prefer .parquet)`);
    const raw = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
      sparse?: boolean;
      mcpToolIds: string[];
      examples: Array<{
        targetToolId: string;
        contextToolIds: string[];
        intentEmbedding: number[];
        isTerminal: boolean;
        softTargetProbs?: number[];
        sp?: [number, number][];
      }>;
    };
    const n8nToolIds: string[] = raw.mcpToolIds;
    const n8nToModelIdx = new Map<number, number>();
    for (let i = 0; i < n8nToolIds.length; i++) {
      const modelIdx = leafIdToIdx.get(n8nToolIds[i]);
      if (modelIdx !== undefined) n8nToModelIdx.set(i, modelIdx);
    }

    for (const ex of raw.examples) {
      if (!leafEmbeddings.has(ex.targetToolId)) continue;
      if (ex.contextToolIds.some((id: string) => !leafEmbeddings.has(id))) {
        continue;
      }

      let sparse: [number, number][] | null = null;
      if (raw.sparse && ex.sp) {
        const dense = new Array(n8nToolIds.length).fill(0);
        for (const [idx, prob] of ex.sp) dense[idx] = prob;
        sparse = remapProbsSparse(dense, n8nToModelIdx);
      } else if (ex.softTargetProbs) {
        sparse = remapProbsSparse(ex.softTargetProbs, n8nToModelIdx);
      }
      if (!sparse) continue;

      n8nExamples.push({
        intentEmbedding: new Float32Array(ex.intentEmbedding),
        contextToolIds: ex.contextToolIds,
        targetToolId: ex.targetToolId,
        isTerminal: ex.isTerminal ? 1 : 0,
        softTargetSparse: sparse,
      });
    }
    console.log(`      ${n8nExamples.length} n8n examples loaded (json, compact)`);
  } else {
    console.warn("      WARNING: n8n data not found (parquet/msgpack/json)");
  }

  // Split by workflow
  const n8nByWorkflow = new Map<string, CompactExample[]>();
  for (const ex of n8nExamples) {
    const key = intentHash(ex.intentEmbedding);
    if (!n8nByWorkflow.has(key)) n8nByWorkflow.set(key, []);
    n8nByWorkflow.get(key)!.push(ex);
  }

  const keysShuffled = shuffle([...n8nByWorkflow.keys()], rng);
  const splitIdx = Math.floor(keysShuffled.length * 0.8);
  const trainKeys = new Set(keysShuffled.slice(0, splitIdx));

  const n8nTrain: CompactExample[] = [];
  const n8nEval: CompactExample[] = [];
  for (const [key, exs] of n8nByWorkflow) {
    if (trainKeys.has(key)) n8nTrain.push(...exs);
    else n8nEval.push(...exs);
  }

  console.log(
    `      n8n split: ${n8nByWorkflow.size} workflows → train ${n8nTrain.length} / eval ${n8nEval.length}`,
  );

  return { n8nTrain, n8nEval };
}

// ============================================================================
// Main entry point
// ============================================================================

export async function loadBenchDataset(
  sql: DbSql,
  options: BenchDatasetOptions,
): Promise<BenchDataset> {
  const rng = seededRng(options.splitSeed);

  // 1. Leaves
  const { leafEmbeddings, embeddingDim } = await loadLeafEmbeddings(
    sql,
    options.expandedVocabPath,
  );

  // 2. n8n pairs + DB hierarchy → flat nodes
  const n8nPairs: N8nWorkflowPair[] = JSON.parse(
    readFileSync(options.n8nPairsPath, "utf-8"),
  );

  const hierarchyRows = (await sql`
    SELECT
      wp1.pattern_id as from_id,
      wp1.intent_embedding::text as from_emb,
      wp2.pattern_id as to_id,
      wp2.intent_embedding::text as to_emb
    FROM capability_dependency cd
    JOIN workflow_pattern wp1 ON cd.from_capability_id = wp1.pattern_id
    JOIN workflow_pattern wp2 ON cd.to_capability_id = wp2.pattern_id
    WHERE wp1.intent_embedding IS NOT NULL
      AND wp2.intent_embedding IS NOT NULL
  `) as unknown as Array<{
    from_id: string;
    from_emb: string;
    to_id: string;
    to_emb: string;
  }>;

  const { nodes, workflowToolLists } = buildAllNodes(
    leafEmbeddings,
    n8nPairs,
    options.maxN8nWorkflows,
    hierarchyRows,
  );

  // 3. Production traces
  type TraceRow = {
    id: string;
    task_results: TaskResultWithLayer[];
    success: boolean;
    intent_embedding: string;
  };

  console.log("\n[3/5] Loading production traces...");
  const traceRows = (await sql<TraceRow[]>`
    SELECT
      et.id,
      et.task_results,
      et.success,
      wp.intent_embedding::text as intent_embedding
    FROM execution_trace et
    JOIN workflow_pattern wp ON et.capability_id = wp.pattern_id
    WHERE et.task_results IS NOT NULL
      AND jsonb_array_length(et.task_results) >= 1
      AND wp.intent_embedding IS NOT NULL
    ORDER BY et.executed_at DESC
  `) as unknown as TraceRow[];

  const { prodTrain: rawProdTrain, prodTest, tracePathsForEval } = loadProdExamples(
    traceRows,
    leafEmbeddings,
    rng,
  );

  // Oversample prod examples to balance with n8n data
  const prodTrain: typeof rawProdTrain = [];
  for (let i = 0; i < options.prodOversample; i++) prodTrain.push(...rawProdTrain);
  console.log(
    `      ${rawProdTrain.length} raw prod → ${prodTrain.length} (${options.prodOversample}x) / ${prodTest.length} test`,
  );

  // 4. n8n examples
  const leafIds = [...leafEmbeddings.keys()];
  const leafIdToIdx = new Map<string, number>();
  leafIds.forEach((id, idx) => leafIdToIdx.set(id, idx));

  const { n8nTrain, n8nEval } = await loadN8nExamples(
    options.n8nDataDir,
    leafEmbeddings,
    leafIdToIdx,
    options.expandedVocabPath,
    rng,
  );

  console.log("\n[5/5] Dataset ready.");

  return {
    nodes,
    leafEmbeddings,
    leafIds,
    leafIdToIdx,
    embeddingDim,
    workflowToolLists,
    prodTrain,
    prodTest,
    tracePathsForEval,
    n8nTrain,
    n8nEval,
  };
}
