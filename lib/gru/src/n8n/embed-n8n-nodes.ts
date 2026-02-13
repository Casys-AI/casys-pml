/**
 * n8n Node Embedder — BGE-M3 embeddings for unique n8n node types
 *
 * Reads scraped workflows, deduplicates node types, and generates
 * 1024D embeddings using structured template (Option C from panel).
 *
 * Output: lib/gru/data/n8n-node-embeddings.json
 *
 * Usage: npx tsx src/n8n/embed-n8n-nodes.ts
 */

import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";
import * as arrow from "apache-arrow";
import { initParquetWasm, embeddingToBytes, writeParquetFile } from "./parquet-utils.ts";
import type { N8nScrapedNode, N8nScrapedWorkflow } from "./types.ts";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, "../../data");
const INPUT_PATH = resolve(DATA_DIR, "n8n-workflows.json");
const OUTPUT_PATH = resolve(DATA_DIR, "n8n-node-embeddings.json");
const OUTPUT_PARQUET_PATH = resolve(DATA_DIR, "n8n-node-embeddings.parquet");
const WF_EMBEDDINGS_PATH = resolve(DATA_DIR, "n8n-workflow-description-embeddings.json");
const WF_EMBEDDINGS_PARQUET_PATH = resolve(DATA_DIR, "n8n-workflow-description-embeddings.parquet");

// ---------------------------------------------------------------------------
// Template (Option C — structured, explicit field labels)
// ---------------------------------------------------------------------------

function buildEmbeddingText(node: N8nScrapedNode): string {
  const parts: string[] = [];

  // Clean displayName from n8n package prefix
  const cleanType = node.type.replace(/^n8n-nodes-base\./, "").replace(/^@n8n\/n8n-nodes-/, "");
  parts.push(`Tool: ${node.displayName}`);
  parts.push(`Type: ${cleanType}`);

  if (node.operation) parts.push(`Operation: ${node.operation}`);
  if (node.resource) parts.push(`Resource: ${node.resource}`);

  const relevantParams = node.paramNames.filter(
    (p) => !["operation", "resource", "method", "action", "language"].includes(p),
  );
  if (relevantParams.length > 0) {
    parts.push(`Parameters: ${relevantParams.join(", ")}`);
  }

  return parts.join(". ") + ".";
}

/**
 * Node type key — matches the fromN8n/toN8n format in the existing scraper
 */
function nodeTypeKey(type: string, operation?: string): string {
  return operation ? `${type}:${operation}` : type;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const PHASE2_ONLY = process.argv.includes("--phase2-only");

async function main() {
  // Load scraped workflows
  if (!existsSync(INPUT_PATH)) {
    console.error(`[embed] Input not found: ${INPUT_PATH}`);
    console.error("[embed] Run 'npm run n8n:scrape' first.");
    process.exit(1);
  }

  const workflows: N8nScrapedWorkflow[] = JSON.parse(readFileSync(INPUT_PATH, "utf-8"));
  console.log(`[embed] Loaded ${workflows.length} workflows`);

  // Load BGE-M3 model
  console.log("[embed] Loading BGE-M3 model (may take 60-90s on first run)...");
  const startLoad = performance.now();
  // deno-lint-ignore no-explicit-any
  const model = await pipeline("feature-extraction", "Xenova/bge-m3") as any;
  console.log(`[embed] Model loaded in ${((performance.now() - startLoad) / 1000).toFixed(1)}s`);

  // -----------------------------------------------------------------------
  // Phase 1: Node type embeddings (skip if --phase2-only)
  // -----------------------------------------------------------------------
  if (!PHASE2_ONLY) {
    // Deduplicate node types across all workflows
    // Keep the richest metadata (most paramNames)
    const nodeMap = new Map<string, N8nScrapedNode>();

    for (const wf of workflows) {
      for (const node of wf.nodes) {
        const key = nodeTypeKey(node.type, node.operation);
        const existing = nodeMap.get(key);
        if (!existing || node.paramNames.length > existing.paramNames.length) {
          nodeMap.set(key, node);
        }
      }
    }

    console.log(`[embed] Unique node types: ${nodeMap.size}`);

    // Also collect node types referenced in edges but not in nodes (edge-only)
    for (const wf of workflows) {
      for (const edge of wf.edges) {
        const fromKey = nodeTypeKey(edge.fromType, edge.fromOp);
        if (!nodeMap.has(fromKey)) {
          nodeMap.set(fromKey, {
            type: edge.fromType,
            displayName: edge.fromType.split(".").pop() || edge.fromType,
            operation: edge.fromOp,
            paramNames: [],
          });
        }
        const toKey = nodeTypeKey(edge.toType, edge.toOp);
        if (!nodeMap.has(toKey)) {
          nodeMap.set(toKey, {
            type: edge.toType,
            displayName: edge.toType.split(".").pop() || edge.toType,
            operation: edge.toOp,
            paramNames: [],
          });
        }
      }
    }

    console.log(`[embed] Total node types (incl. edge-only): ${nodeMap.size}`);

    // Generate embeddings
    const embeddings: Record<string, number[]> = {};
    const entries = Array.from(nodeMap.entries());
    let done = 0;
    const startEmbed = performance.now();

    for (const [key, node] of entries) {
      const text = buildEmbeddingText(node);
      const output = await model(text, { pooling: "mean", normalize: true });
      const vec = Array.from(output.data as Float32Array);

      if (vec.length !== 1024) {
        console.warn(`[embed] WARNING: ${key} produced ${vec.length}D vector, expected 1024`);
        continue;
      }

      embeddings[key] = vec;
      done++;

      if (done % 50 === 0 || done === entries.length) {
        const elapsed = ((performance.now() - startEmbed) / 1000).toFixed(1);
        const rate = (done / parseFloat(elapsed)).toFixed(1);
        console.log(`[embed] ${done}/${entries.length} embedded (${elapsed}s, ${rate}/s)`);
      }
    }

    // Save JSON
    writeFileSync(OUTPUT_PATH, JSON.stringify(embeddings));
    const fileSizeMB = (Buffer.byteLength(JSON.stringify(embeddings)) / 1024 / 1024).toFixed(1);
    console.log(`\n[embed] Phase 1 Done!`);
    console.log(`  Embeddings: ${Object.keys(embeddings).length}`);
    console.log(`  Dimension: 1024`);
    console.log(`  File size (JSON): ${fileSizeMB} MB`);
    console.log(`  Output (JSON): ${OUTPUT_PATH}`);

    // Save Parquet — columns: node_type_key (Utf8), embedding (Binary 4096 bytes)
    await initParquetWasm();
    {
      const keys = Object.keys(embeddings);
      const n = keys.length;
      const nodeTypeKeys: string[] = new Array(n);
      const embBuilder = arrow.makeBuilder({ type: new arrow.Binary(), nullValues: [null] });

      for (let i = 0; i < n; i++) {
        nodeTypeKeys[i] = keys[i];
        embBuilder.append(embeddingToBytes(embeddings[keys[i]]));
      }
      embBuilder.finish();

      const table = new arrow.Table({
        node_type_key: arrow.vectorFromArray(nodeTypeKeys, new arrow.Utf8()),
        embedding: embBuilder.toVector(),
      });

      writeParquetFile(table, OUTPUT_PARQUET_PATH);
      const stat = statSync(OUTPUT_PARQUET_PATH);
      console.log(`  Output (Parquet): ${OUTPUT_PARQUET_PATH} (${(stat.size / 1e6).toFixed(1)}MB)`);
    }

    // Print a few examples
    console.log("\n[embed] Sample texts:");
    for (const [key, node] of entries.slice(0, 5)) {
      console.log(`  ${key} → "${buildEmbeddingText(node)}"`);
    }
  } else {
    console.log("[embed] Skipping Phase 1 (--phase2-only)");
  }

  // -------------------------------------------------------------------
  // Phase 2: Workflow intent embeddings (name + description if available)
  // -------------------------------------------------------------------
  console.log("\n[embed] Phase 2: Embedding workflow intents (name + description)...");

  const wfWithDesc = workflows.filter((wf) => wf.description && wf.description.trim().length > 0);
  console.log(`[embed] Workflows with description: ${wfWithDesc.length}/${workflows.length}`);
  console.log(
    `[embed] Workflows name-only: ${workflows.length - wfWithDesc.length}/${workflows.length}`,
  );

  // Resume support: load existing embeddings if available
  const wfEmbeddings: Record<string, number[]> = existsSync(WF_EMBEDDINGS_PATH)
    ? JSON.parse(readFileSync(WF_EMBEDDINGS_PATH, "utf-8"))
    : {};
  const alreadyDone = Object.keys(wfEmbeddings).length;
  if (alreadyDone > 0) {
    console.log(`[embed] Resuming: ${alreadyDone} existing embeddings loaded, skipping those`);
  }

  let wfDone = 0;
  let wfSkipped = 0;
  const startWfEmbed = performance.now();

  for (const wf of workflows) {
    const wfId = String(wf.id);
    if (wfEmbeddings[wfId]) {
      wfSkipped++;
      continue;
    }

    const desc = wf.description?.trim();
    const text = desc ? `${wf.name}. ${desc}` : wf.name;
    const output = await model(text, { pooling: "mean", normalize: true });
    const vec = Array.from(output.data as Float32Array);

    if (vec.length !== 1024) {
      console.warn(
        `[embed] WARNING: workflow ${wf.id} produced ${vec.length}D vector, expected 1024`,
      );
      continue;
    }

    wfEmbeddings[wfId] = vec;
    wfDone++;

    // Incremental save every 200 new embeddings
    if (wfDone % 200 === 0) {
      writeFileSync(WF_EMBEDDINGS_PATH, JSON.stringify(wfEmbeddings));
      const elapsed = ((performance.now() - startWfEmbed) / 1000).toFixed(1);
      const rate = (wfDone / parseFloat(elapsed)).toFixed(1);
      console.log(
        `[embed] ${
          wfSkipped + wfDone
        }/${workflows.length} workflow intents (${wfDone} new, ${elapsed}s, ${rate}/s) [checkpoint saved]`,
      );
    }
  }

  // Save workflow intent embeddings (JSON)
  writeFileSync(WF_EMBEDDINGS_PATH, JSON.stringify(wfEmbeddings));
  const wfFileSizeMB = (Buffer.byteLength(JSON.stringify(wfEmbeddings)) / 1024 / 1024).toFixed(1);
  console.log(`\n[embed] Workflow intent embeddings done!`);
  console.log(`  Embeddings: ${Object.keys(wfEmbeddings).length}`);
  console.log(`  File size (JSON): ${wfFileSizeMB} MB`);
  console.log(`  Output (JSON): ${WF_EMBEDDINGS_PATH}`);

  // Save workflow intent embeddings (Parquet)
  await initParquetWasm();
  {
    const wfIds = Object.keys(wfEmbeddings);
    const n = wfIds.length;
    const idArr: string[] = new Array(n);
    const embBuilder = arrow.makeBuilder({ type: new arrow.Binary(), nullValues: [null] });

    for (let i = 0; i < n; i++) {
      idArr[i] = wfIds[i];
      embBuilder.append(embeddingToBytes(wfEmbeddings[wfIds[i]]));
    }
    embBuilder.finish();

    const table = new arrow.Table({
      workflow_id: arrow.vectorFromArray(idArr, new arrow.Utf8()),
      embedding: embBuilder.toVector(),
    });

    writeParquetFile(table, WF_EMBEDDINGS_PARQUET_PATH);
    const stat = statSync(WF_EMBEDDINGS_PARQUET_PATH);
    console.log(`  Output (Parquet): ${WF_EMBEDDINGS_PARQUET_PATH} (${(stat.size / 1e6).toFixed(1)}MB)`);
  }
}

main().catch((err) => {
  console.error("[embed] Fatal error:", err);
  process.exit(1);
});
