/**
 * n8n Workflow Scraper — Enhanced for GRU data augmentation
 *
 * Scrapes n8n public workflow templates and captures enriched node metadata:
 * displayName, type, operation, resource, parameter names.
 *
 * Output: lib/gru/data/n8n-workflows.json
 *
 * Usage: npx tsx src/n8n/scrape-n8n.ts [--max=1000] [--min-views=50]
 */

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { N8nScrapedNode, N8nScrapedEdge, N8nScrapedWorkflow } from "./types.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const N8N_API_BASE = "https://api.n8n.io/templates";

const UTILITY_NODE_TYPES = new Set([
  "n8n-nodes-base.stickyNote",
  "n8n-nodes-base.noOp",
  "n8n-nodes-base.start",
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.scheduleTrigger",
  "n8n-nodes-base.webhookTrigger",
  "n8n-nodes-base.errorTrigger",
  "n8n-nodes-base.executeWorkflowTrigger",
  "n8n-nodes-base.respondToWebhook",
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, "../../data");
const OUTPUT_PATH = resolve(DATA_DIR, "n8n-workflows.json");
const CHECKPOINT_PATH = resolve(DATA_DIR, "n8n-scrape-checkpoint.json");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(): { maxWorkflows: number; minViews: number; resume: boolean } {
  const args = process.argv.slice(2);
  let maxWorkflows = 8000;
  let minViews = 50;
  let resume = false;

  for (const arg of args) {
    if (arg.startsWith("--max=")) maxWorkflows = parseInt(arg.slice(6), 10);
    if (arg.startsWith("--min-views=")) minViews = parseInt(arg.slice(12), 10);
    if (arg === "--resume") resume = true;
  }

  return { maxWorkflows, minViews, resume };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractOperation(params: Record<string, unknown> | undefined): string | undefined {
  if (!params) return undefined;
  const op = params.operation || params.method || params.resource || params.action || params.language;
  return typeof op === "string" ? op.toLowerCase() : undefined;
}

function extractResource(params: Record<string, unknown> | undefined): string | undefined {
  if (!params) return undefined;
  const res = params.resource;
  return typeof res === "string" ? res.toLowerCase() : undefined;
}

function extractParamNames(params: Record<string, unknown> | undefined): string[] {
  if (!params) return [];
  // Skip internal/meta keys
  const skip = new Set(["position", "color", "notes", "notesInFlow", "alwaysOutputData", "executeOnce", "retryOnFail", "maxTries", "waitBetweenTries", "continueOnFail"]);
  return Object.keys(params).filter((k) => !skip.has(k) && !k.startsWith("__"));
}

function isUtility(type: string): boolean {
  return UTILITY_NODE_TYPES.has(type);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function fetchSearchPage(page: number, pageSize: number): Promise<{ workflows: Array<{ id: number; totalViews: number; name: string }> } | null> {
  const url = `${N8N_API_BASE}/search?rows=${pageSize}&page=${page}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[scrape] Search API error: ${res.status}`);
      return null;
    }
    return await res.json() as { workflows: Array<{ id: number; totalViews: number; name: string }> };
  } catch (err) {
    console.error(`[scrape] Search fetch error: ${err}`);
    return null;
  }
}

interface RawN8nNode {
  name: string;
  type: string;
  typeVersion?: number;
  displayName?: string;
  parameters?: Record<string, unknown>;
  position?: [number, number];
}

interface RawConnectionTarget {
  node: string;
  type?: string;
  index?: number;
}

async function fetchWorkflow(id: number): Promise<{
  meta: { id: number; name: string; totalViews: number; description?: string };
  nodes: RawN8nNode[];
  connections: Record<string, Record<string, RawConnectionTarget[][][]>>;
} | null> {
  const url = `${N8N_API_BASE}/workflows/${id}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json() as {
      workflow: {
        id: number;
        name: string;
        totalViews?: number;
        description?: string;
        workflow?: { nodes?: RawN8nNode[]; connections?: Record<string, Record<string, RawConnectionTarget[][][]>> };
      };
    };

    const tmpl = data.workflow;
    if (!tmpl?.workflow) return null;

    return {
      meta: { id: tmpl.id, name: tmpl.name, totalViews: tmpl.totalViews ?? 0, description: tmpl.description },
      nodes: tmpl.workflow.nodes ?? [],
      connections: tmpl.workflow.connections ?? {},
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

function processWorkflow(
  meta: { id: number; name: string; totalViews: number },
  rawNodes: RawN8nNode[],
  connections: Record<string, Record<string, RawConnectionTarget[][][]>>,
): N8nScrapedWorkflow | null {
  // Build node lookup by instance name
  const nodeByName = new Map<string, RawN8nNode>();
  for (const n of rawNodes) nodeByName.set(n.name, n);

  // Extract enriched nodes (skip utility)
  const nodes: N8nScrapedNode[] = [];
  const seenTypes = new Set<string>();

  for (const n of rawNodes) {
    if (isUtility(n.type)) continue;

    const op = extractOperation(n.parameters);
    const key = op ? `${n.type}:${op}` : n.type;

    // Deduplicate within workflow (same type+op = same enriched node)
    if (seenTypes.has(key)) continue;
    seenTypes.add(key);

    nodes.push({
      type: n.type,
      displayName: n.displayName || n.name || n.type.split(".").pop() || n.type,
      operation: op,
      resource: extractResource(n.parameters),
      paramNames: extractParamNames(n.parameters),
    });
  }

  if (nodes.length < 2) return null;

  // Extract edges
  const edges: N8nScrapedEdge[] = [];
  for (const [sourceName, connTypes] of Object.entries(connections)) {
    const sourceNode = nodeByName.get(sourceName);
    if (!sourceNode || isUtility(sourceNode.type)) continue;

    for (const [, targetArrays] of Object.entries(connTypes)) {
      if (!Array.isArray(targetArrays)) continue;
      for (const targets of targetArrays) {
        if (!Array.isArray(targets)) continue;
        for (const target of targets.flat()) {
          if (!target || typeof target.node !== "string") continue;
          const targetNode = nodeByName.get(target.node);
          if (!targetNode || isUtility(targetNode.type)) continue;

          edges.push({
            fromType: sourceNode.type,
            fromOp: extractOperation(sourceNode.parameters),
            toType: targetNode.type,
            toOp: extractOperation(targetNode.parameters),
          });
        }
      }
    }
  }

  if (edges.length === 0) return null;

  return { id: meta.id, name: meta.name, views: meta.totalViews, nodes, edges };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { maxWorkflows, minViews, resume } = parseArgs();
  console.log(`[scrape] Config: max=${maxWorkflows}, minViews=${minViews}, resume=${resume}`);

  // Resume from checkpoint if available
  let workflows: N8nScrapedWorkflow[] = [];
  const seenIds = new Set<number>();
  let startPage = 1;

  if (resume && existsSync(CHECKPOINT_PATH)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf-8")) as {
      workflows: N8nScrapedWorkflow[];
      lastPage: number;
    };
    workflows = cp.workflows;
    startPage = cp.lastPage + 1;
    for (const w of workflows) seenIds.add(w.id);
    console.log(`[scrape] Resuming: ${workflows.length} workflows from checkpoint, starting page ${startPage}`);
  }

  // Phase 1: Collect workflow IDs from search
  console.log("[scrape] Phase 1: Collecting workflow IDs...");
  const candidates: Array<{ id: number; totalViews: number }> = [];
  let page = startPage;
  let consecutiveEmpty = 0;

  while (candidates.length + seenIds.size < maxWorkflows) {
    const data = await fetchSearchPage(page, 100);
    if (!data || data.workflows.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 3) break;
      page++;
      await delay(200);
      continue;
    }
    consecutiveEmpty = 0;

    for (const w of data.workflows) {
      if (w.totalViews >= minViews && !seenIds.has(w.id)) {
        candidates.push({ id: w.id, totalViews: w.totalViews });
      }
    }

    console.log(`[scrape] Page ${page}: ${data.workflows.length} results, ${candidates.length} candidates total`);
    page++;
    await delay(100);
  }

  console.log(`[scrape] Found ${candidates.length} new candidates`);

  // Phase 2: Fetch and process each workflow
  console.log("[scrape] Phase 2: Fetching workflow details...");
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const { id, totalViews } of candidates) {
    const wf = await fetchWorkflow(id);
    if (!wf) {
      errors++;
      await delay(100);
      continue;
    }

    const result = processWorkflow(
      { id, name: wf.meta.name, totalViews },
      wf.nodes,
      wf.connections,
    );

    if (result) {
      workflows.push(result);
    } else {
      skipped++;
    }

    processed++;

    if (processed % 100 === 0) {
      console.log(`[scrape] Progress: ${processed}/${candidates.length} fetched, ${workflows.length} valid, ${skipped} skipped, ${errors} errors`);

      // Save checkpoint every 100
      writeFileSync(CHECKPOINT_PATH, JSON.stringify({ workflows, lastPage: page - 1 }, null, 0));
    }

    await delay(100);
  }

  // Save final output
  writeFileSync(OUTPUT_PATH, JSON.stringify(workflows, null, 2));
  console.log(`\n[scrape] Done!`);
  console.log(`  Workflows saved: ${workflows.length}`);
  console.log(`  Total edges: ${workflows.reduce((s, w) => s + w.edges.length, 0)}`);
  console.log(`  Unique node types: ${new Set(workflows.flatMap((w) => w.nodes.map((n) => n.type))).size}`);
  console.log(`  Output: ${OUTPUT_PATH}`);

  // Cleanup checkpoint
  if (existsSync(CHECKPOINT_PATH)) {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(CHECKPOINT_PATH);
  }
}

main().catch((err) => {
  console.error("[scrape] Fatal error:", err);
  process.exit(1);
});
