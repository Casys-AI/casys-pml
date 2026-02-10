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

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";
import type { N8nScrapedNode, N8nScrapedWorkflow } from "./types.ts";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, "../../data");
const INPUT_PATH = resolve(DATA_DIR, "n8n-workflows.json");
const OUTPUT_PATH = resolve(DATA_DIR, "n8n-node-embeddings.json");
const WF_EMBEDDINGS_PATH = resolve(DATA_DIR, "n8n-workflow-description-embeddings.json");

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

async function main() {
  // Load scraped workflows
  if (!existsSync(INPUT_PATH)) {
    console.error(`[embed] Input not found: ${INPUT_PATH}`);
    console.error("[embed] Run 'npm run n8n:scrape' first.");
    process.exit(1);
  }

  const workflows: N8nScrapedWorkflow[] = JSON.parse(readFileSync(INPUT_PATH, "utf-8"));
  console.log(`[embed] Loaded ${workflows.length} workflows`);

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

  // Load BGE-M3 model
  console.log("[embed] Loading BGE-M3 model (may take 60-90s on first run)...");
  const startLoad = performance.now();
  // deno-lint-ignore no-explicit-any
  const model = await pipeline("feature-extraction", "Xenova/bge-m3") as any;
  console.log(`[embed] Model loaded in ${((performance.now() - startLoad) / 1000).toFixed(1)}s`);

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

  // Save
  writeFileSync(OUTPUT_PATH, JSON.stringify(embeddings));
  const fileSizeMB = (Buffer.byteLength(JSON.stringify(embeddings)) / 1024 / 1024).toFixed(1);
  console.log(`\n[embed] Done!`);
  console.log(`  Embeddings: ${Object.keys(embeddings).length}`);
  console.log(`  Dimension: 1024`);
  console.log(`  File size: ${fileSizeMB} MB`);
  console.log(`  Output: ${OUTPUT_PATH}`);

  // Print a few examples
  console.log("\n[embed] Sample texts:");
  for (const [key, node] of entries.slice(0, 5)) {
    console.log(`  ${key} → "${buildEmbeddingText(node)}"`);
  }

  // -------------------------------------------------------------------
  // Phase 2: Workflow description embeddings
  // -------------------------------------------------------------------
  console.log("\n[embed] Phase 2: Embedding workflow descriptions...");

  const wfWithDesc = workflows.filter((wf) => wf.description && wf.description.trim().length > 0);
  const wfWithoutDesc = workflows.length - wfWithDesc.length;

  if (wfWithoutDesc > 0) {
    console.warn(
      `[embed] WARNING: ${wfWithoutDesc}/${workflows.length} workflows have no description — ` +
      "these will use node embedding as intent fallback in build-soft-targets.",
    );
  }

  console.log(`[embed] Workflows with description: ${wfWithDesc.length}/${workflows.length}`);

  const wfEmbeddings: Record<string, number[]> = {};
  let wfDone = 0;
  const startWfEmbed = performance.now();

  for (const wf of wfWithDesc) {
    const text = `${wf.name}. ${wf.description!.trim()}`;
    const output = await model(text, { pooling: "mean", normalize: true });
    const vec = Array.from(output.data as Float32Array);

    if (vec.length !== 1024) {
      console.warn(`[embed] WARNING: workflow ${wf.id} produced ${vec.length}D vector, expected 1024`);
      continue;
    }

    wfEmbeddings[String(wf.id)] = vec;
    wfDone++;

    if (wfDone % 100 === 0 || wfDone === wfWithDesc.length) {
      const elapsed = ((performance.now() - startWfEmbed) / 1000).toFixed(1);
      const rate = (wfDone / parseFloat(elapsed)).toFixed(1);
      console.log(`[embed] ${wfDone}/${wfWithDesc.length} workflow descriptions embedded (${elapsed}s, ${rate}/s)`);
    }
  }

  // Save workflow description embeddings
  writeFileSync(WF_EMBEDDINGS_PATH, JSON.stringify(wfEmbeddings));
  const wfFileSizeMB = (Buffer.byteLength(JSON.stringify(wfEmbeddings)) / 1024 / 1024).toFixed(1);
  console.log(`\n[embed] Workflow description embeddings done!`);
  console.log(`  Embeddings: ${Object.keys(wfEmbeddings).length}`);
  console.log(`  File size: ${wfFileSizeMB} MB`);
  console.log(`  Output: ${WF_EMBEDDINGS_PATH}`);
}

main().catch((err) => {
  console.error("[embed] Fatal error:", err);
  process.exit(1);
});
