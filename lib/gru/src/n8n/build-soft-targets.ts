/**
 * Build Soft Targets — n8n examples with cosine similarity distributions
 *
 * For each n8n workflow edge (nodeA → nodeB), create a TransitionExample
 * where the target is a soft probability distribution over all MCP tools
 * (computed via cosine similarity between n8n node embedding and MCP tool embeddings).
 *
 * Output: lib/gru/data/n8n-training-examples.json
 *
 * Usage: npx tsx src/n8n/build-soft-targets.ts
 */

import "dotenv/config";
import postgres from "postgres";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { N8nScrapedWorkflow } from "./types.ts";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, "../../data");
const WORKFLOWS_PATH = resolve(DATA_DIR, "n8n-workflows.json");
const EMBEDDINGS_PATH = resolve(DATA_DIR, "n8n-node-embeddings.json");
const OUTPUT_PATH = resolve(DATA_DIR, "n8n-training-examples.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SoftTargetExample {
  /** Embedding of the intent (workflow-level, derived from first node). */
  intentEmbedding: number[];
  /** Context tool IDs executed so far. */
  contextToolIds: string[];
  /** Best-match MCP tool ID (top-1 from soft target distribution). */
  targetToolId: string;
  /** 1 if terminal step, 0 otherwise. */
  isTerminal: number;
  /** Always false for n8n multi-step examples. */
  isSingleTool: boolean;
  /** Soft probability distribution over MCP tools [numTools]. */
  softTargetProbs: number[];
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

function softmax(logits: number[], temperature: number): number[] {
  const scaled = logits.map((l) => l / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function nodeTypeKey(type: string, operation?: string): string {
  return operation ? `${type}:${operation}` : type;
}

/**
 * n8n node type prefixes that have no MCP equivalent.
 * These are AI/LLM orchestration, triggers, and internal plumbing nodes
 * that would pollute the training data with low-similarity noise.
 */
const EXCLUDED_N8N_PREFIXES = [
  // LangChain agent/LLM/memory nodes — no MCP equivalent
  "@n8n/n8n-nodes-langchain.",
  // Trigger nodes — already partially filtered at scrape time, catch remaining
  "n8n-nodes-base.webhook",
  "n8n-nodes-base.cronTrigger",
  "n8n-nodes-base.intervalTrigger",
  "n8n-nodes-base.pollingTrigger",
  "n8n-nodes-base.emailReadImap",    // trigger variant
  "n8n-nodes-base.formTrigger",
  // Internal plumbing
  "n8n-nodes-base.wait",
  "n8n-nodes-base.merge",
  "n8n-nodes-base.splitInBatches",
  "n8n-nodes-base.itemLists",
  "n8n-nodes-base.switch",
  "n8n-nodes-base.if",
  "n8n-nodes-base.set",
  "n8n-nodes-base.function",
  "n8n-nodes-base.functionItem",
  "n8n-nodes-base.code",
];

function isExcludedN8nNode(n8nKey: string): boolean {
  return EXCLUDED_N8N_PREFIXES.some((prefix) => n8nKey.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Validate inputs
  for (const [path, name] of [[WORKFLOWS_PATH, "workflows"], [EMBEDDINGS_PATH, "embeddings"]] as const) {
    if (!existsSync(path)) {
      console.error(`[targets] Missing ${name}: ${path}`);
      console.error(`[targets] Run 'npm run n8n:scrape' and 'npm run n8n:embed' first.`);
      process.exit(1);
    }
  }

  // Load n8n data
  const workflows: N8nScrapedWorkflow[] = JSON.parse(readFileSync(WORKFLOWS_PATH, "utf-8"));
  const n8nEmbeddings: Record<string, number[]> = JSON.parse(readFileSync(EMBEDDINGS_PATH, "utf-8"));
  console.log(`[targets] Loaded ${workflows.length} workflows, ${Object.keys(n8nEmbeddings).length} n8n embeddings`);

  // Load MCP tool embeddings from database
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error(
      "[targets] DATABASE_URL environment variable is required. " +
      "Set it in .env or export it before running this script.",
    );
  }
  const sql = postgres(DATABASE_URL);

  const mcpToolIds: string[] = [];
  const mcpEmbeddings: number[][] = [];

  try {
    console.log("[targets] Loading MCP tool embeddings from DB...");
    const toolRows = await sql`
      SELECT tool_id, embedding::text
      FROM tool_embedding
      ORDER BY tool_id
    `;

    for (const row of toolRows) {
      const emb = row.embedding?.startsWith("[")
        ? JSON.parse(row.embedding)
        : row.embedding?.replace(/^\[|\]$/g, "").split(",").map(Number);

      if (emb && emb.length === 1024) {
        mcpToolIds.push(row.tool_id);
        mcpEmbeddings.push(emb);
      }
    }

    console.log(`[targets] Loaded ${mcpToolIds.length} MCP tool embeddings`);
  } finally {
    await sql.end();
  }

  // Pre-compute soft target distributions for each n8n node type
  // n8nKey → softmax distribution over MCP tools
  // T=0.005: sharp distribution — cosine sims in ~0.6-0.85 range need very low T
  // to concentrate mass on the actual best match (T=0.1 was quasi-uniform)
  const TEMPERATURE = 0.005;
  const softTargetCache = new Map<string, { probs: number[]; topToolId: string; topSim: number }>();

  // Minimum cosine similarity threshold — nodes below this have no good MCP match
  // and would inject noise into training. 0.70 keeps ~200+ nodes while filtering
  // truly unrelated ones. T=0.005 already concentrates mass on best match.
  const MIN_COSINE_SIM = 0.70;

  console.log(`[targets] Computing soft target distributions (T=${TEMPERATURE}, minSim=${MIN_COSINE_SIM})...`);
  let computed = 0;
  let excludedType = 0;
  let excludedLowSim = 0;

  for (const [n8nKey, n8nEmb] of Object.entries(n8nEmbeddings)) {
    // Skip nodes with no MCP equivalent (langchain agents, triggers, plumbing)
    if (isExcludedN8nNode(n8nKey)) {
      excludedType++;
      continue;
    }

    const similarities = mcpEmbeddings.map((mcpEmb) => cosineSimilarity(n8nEmb, mcpEmb));

    // Find top-1
    let maxIdx = 0;
    for (let i = 1; i < similarities.length; i++) {
      if (similarities[i] > similarities[maxIdx]) maxIdx = i;
    }

    // Skip if best MCP match is below similarity threshold
    if (similarities[maxIdx] < MIN_COSINE_SIM) {
      excludedLowSim++;
      continue;
    }

    const probs = softmax(similarities, TEMPERATURE);

    softTargetCache.set(n8nKey, {
      probs,
      topToolId: mcpToolIds[maxIdx],
      topSim: similarities[maxIdx],
    });

    computed++;
    if (computed % 100 === 0) {
      console.log(`[targets] Computed ${computed}/${Object.keys(n8nEmbeddings).length} distributions`);
    }
  }

  console.log(`[targets] Excluded: ${excludedType} by type (langchain/triggers/plumbing), ${excludedLowSim} by low sim (<${MIN_COSINE_SIM})`);
  console.log(`[targets] Kept: ${softTargetCache.size} node types with good MCP matches`);

  // Log a few examples of n8n → MCP mappings
  console.log("\n[targets] Sample mappings (n8n → best MCP match):");
  let shown = 0;
  for (const [key, { topToolId, topSim }] of softTargetCache) {
    if (shown >= 10) break;
    console.log(`  ${key} → ${topToolId} (sim=${topSim.toFixed(3)})`);
    shown++;
  }

  // Convert workflows to TransitionExamples
  console.log("\n[targets] Converting workflows to training examples...");
  const examples: SoftTargetExample[] = [];
  let skippedNoEmb = 0;

  for (const wf of workflows) {
    // Build ordered node sequence from edges, excluding non-MCP nodes
    const rawSequence = buildNodeSequence(wf);
    const nodeSequence = rawSequence.filter((key) =>
      !isExcludedN8nNode(key) && softTargetCache.has(key),
    );
    if (nodeSequence.length < 2) continue;

    // Intent embedding = 2nd node in sequence (1st is often a generic entry point;
    // the 2nd node better represents the workflow's actual intent).
    // Fallback to 1st if only 2 nodes or 2nd has no embedding.
    const intentKey = nodeSequence.length > 2
      ? (n8nEmbeddings[nodeSequence[1]] ? nodeSequence[1] : nodeSequence[0])
      : nodeSequence[0];
    const intentEmb = n8nEmbeddings[intentKey];
    if (!intentEmb) {
      skippedNoEmb++;
      continue;
    }

    // Generate step-by-step examples
    for (let step = 0; step < nodeSequence.length; step++) {
      const targetKey = nodeSequence[step];
      const targetData = softTargetCache.get(targetKey);
      if (!targetData) {
        skippedNoEmb++;
        continue;
      }

      const contextKeys = nodeSequence.slice(0, step);
      // Map context keys to their best MCP tool IDs
      const contextToolIds = contextKeys
        .map((k) => softTargetCache.get(k)?.topToolId)
        .filter((id): id is string => id !== undefined);

      examples.push({
        intentEmbedding: intentEmb,
        contextToolIds,
        targetToolId: targetData.topToolId,
        isTerminal: step === nodeSequence.length - 1 ? 1 : 0,
        isSingleTool: false,
        softTargetProbs: targetData.probs,
      });
    }
  }

  console.log(`[targets] Generated ${examples.length} training examples`);
  console.log(`[targets] Skipped (no embedding): ${skippedNoEmb}`);

  // Stats
  const termCount = examples.filter((e) => e.isTerminal === 1).length;
  console.log(`[targets] Terminal examples: ${termCount} (${((termCount / examples.length) * 100).toFixed(1)}%)`);

  // Average top-1 similarity
  const avgTopSim = Array.from(softTargetCache.values()).reduce((s, v) => s + v.topSim, 0) / softTargetCache.size;
  console.log(`[targets] Average top-1 cosine similarity: ${avgTopSim.toFixed(3)}`);

  // Save
  writeFileSync(OUTPUT_PATH, JSON.stringify({ mcpToolIds, examples }, null, 0));
  const fileSizeMB = (Buffer.byteLength(JSON.stringify({ mcpToolIds, examples })) / 1024 / 1024).toFixed(1);
  console.log(`\n[targets] Output: ${OUTPUT_PATH} (${fileSizeMB} MB)`);
}

/**
 * Build an ordered node sequence from workflow edges.
 * Uses a simple topological approach: find roots (no incoming), then BFS.
 */
function buildNodeSequence(wf: N8nScrapedWorkflow): string[] {
  const nodes = new Set<string>();
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const edge of wf.edges) {
    const from = nodeTypeKey(edge.fromType, edge.fromOp);
    const to = nodeTypeKey(edge.toType, edge.toOp);
    nodes.add(from);
    nodes.add(to);

    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    if (!inDegree.has(from)) inDegree.set(from, 0);

    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(to);
  }

  // Kahn's algorithm (topological sort)
  const queue: string[] = [];
  for (const node of nodes) {
    if ((inDegree.get(node) ?? 0) === 0) queue.push(node);
  }

  const result: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    result.push(node);

    for (const next of adj.get(node) ?? []) {
      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  // Add any remaining unvisited nodes (cycles)
  for (const node of nodes) {
    if (!visited.has(node)) result.push(node);
  }

  return result;
}

main().catch((err) => {
  console.error("[targets] Fatal error:", err);
  process.exit(1);
});
