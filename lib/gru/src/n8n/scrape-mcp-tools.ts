/**
 * Scrape MCP tool catalog from Smithery registry
 *
 * Fetches all MCP servers and their tools (name + description) from
 * the Smithery public API. Uses parallel fetches to handle slow API (~12s/req).
 * Output is used to expand the PML tool catalog for better n8n → MCP mapping.
 *
 * Output: lib/gru/data/smithery-mcp-tools.json
 *
 * Usage: npx tsx src/n8n/scrape-mcp-tools.ts [--concurrency=20]
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as arrow from "apache-arrow";
import { initParquetWasm, writeParquetFile } from "./parquet-utils.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, "../../data");
const OUTPUT_PATH = resolve(DATA_DIR, "smithery-mcp-tools.json");
const OUTPUT_PARQUET_PATH = resolve(DATA_DIR, "smithery-mcp-tools.parquet");
const CHECKPOINT_PATH = resolve(DATA_DIR, "smithery-mcp-tools.checkpoint.json");

const SMITHERY_API = "https://registry.smithery.ai";
const PAGE_SIZE = 100;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "20", 10);
const TIMEOUT_MS = 30_000; // 30s timeout per request
const MAX_RETRIES = 2;

interface ScrapedTool {
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown> | null;
  serverName: string;
  serverDisplayName: string;
  serverDescription: string;
  id: string;
}

async function fetchJSON(url: string, retries = MAX_RETRIES): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 2000));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}

/** Process a batch of servers concurrently */
async function fetchBatch(
  servers: Array<{ qualifiedName: string; displayName: string; description: string }>,
  processedServers: Set<string>,
): Promise<ScrapedTool[]> {
  const promises = servers
    .filter((s) => !processedServers.has(s.qualifiedName))
    .map(async (server) => {
      const tools: ScrapedTool[] = [];
      const detail = await fetchJSON(
        `${SMITHERY_API}/servers/${encodeURIComponent(server.qualifiedName)}`,
      );
      if (detail?.tools?.length) {
        for (const tool of detail.tools) {
          if (!tool.name || !tool.description) continue;
          tools.push({
            toolName: tool.name,
            toolDescription: tool.description,
            inputSchema: tool.inputSchema || null,
            serverName: server.qualifiedName,
            serverDisplayName: server.displayName || server.qualifiedName,
            serverDescription: server.description || "",
            id: `${server.qualifiedName}:${tool.name}`,
          });
        }
      }
      processedServers.add(server.qualifiedName);
      return tools;
    });

  const results = await Promise.all(promises);
  return results.flat();
}

async function main() {
  console.log(`[scrape-mcp] Scraping Smithery MCP registry (concurrency=${CONCURRENCY})...`);

  // Resume from checkpoint
  let allTools: ScrapedTool[] = [];
  const processedServers = new Set<string>();

  if (existsSync(CHECKPOINT_PATH)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf-8"));
    allTools = cp.tools;
    for (const s of cp.processedServers) processedServers.add(s);
    console.log(
      `[scrape-mcp] Resuming: ${allTools.length} tools, ${processedServers.size} servers done`,
    );
  }

  // Phase 1: Get all server names (fast — paginated list)
  console.log("[scrape-mcp] Phase 1: Fetching server list...");
  const allServers: Array<
    { qualifiedName: string; displayName: string; description: string; useCount: number }
  > = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const data = await fetchJSON(`${SMITHERY_API}/servers?pageSize=${PAGE_SIZE}&page=${page}`);
    if (!data?.servers) break;
    allServers.push(...data.servers);
    totalPages = data.pagination?.totalPages || 1;
    if (page % 10 === 0 || page === totalPages) {
      console.log(`  Page ${page}/${totalPages} — ${allServers.length} servers`);
    }
    page++;
  }

  // Sort by popularity (better descriptions, more likely to have real tools)
  allServers.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));

  const pending = allServers.filter((s) => !processedServers.has(s.qualifiedName));
  console.log(
    `[scrape-mcp] ${allServers.length} total servers, ${pending.length} to fetch (${processedServers.size} already done)`,
  );

  // Phase 2: Fetch tool details in parallel batches
  console.log(`[scrape-mcp] Phase 2: Fetching tool details (${CONCURRENCY} concurrent)...`);
  const startTime = performance.now();
  let batchNum = 0;

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    const newTools = await fetchBatch(batch, processedServers);
    allTools.push(...newTools);
    batchNum++;

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(0);
    const done = Math.min(i + CONCURRENCY, pending.length);
    const rate = (done / parseFloat(elapsed)).toFixed(1);
    const eta = ((pending.length - done) / parseFloat(rate || "1")).toFixed(0);
    console.log(
      `  Batch ${batchNum}: ${done}/${pending.length} servers (${allTools.length} tools, ${rate}/s, ETA ${eta}s)`,
    );

    // Checkpoint every 5 batches
    if (batchNum % 5 === 0) {
      writeFileSync(
        CHECKPOINT_PATH,
        JSON.stringify({
          tools: allTools,
          processedServers: Array.from(processedServers),
        }),
      );
    }
  }

  // Deduplicate by tool name + first 100 chars of description
  const seen = new Set<string>();
  const uniqueTools: ScrapedTool[] = [];
  for (const tool of allTools) {
    const key = `${tool.toolName}|${tool.toolDescription.slice(0, 100)}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueTools.push(tool);
    }
  }

  console.log(`\n[scrape-mcp] Dedup: ${allTools.length} → ${uniqueTools.length} unique tools`);

  // Save
  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        scrapedAt: new Date().toISOString(),
        source: "smithery.ai",
        totalServers: allServers.length,
        totalTools: uniqueTools.length,
        tools: uniqueTools,
      },
      null,
      2,
    ),
  );

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(0);
  console.log(`[scrape-mcp] Output (JSON): ${OUTPUT_PATH}`);
  console.log(
    `[scrape-mcp] ${uniqueTools.length} unique tools from ${processedServers.size} servers in ${elapsed}s`,
  );

  // Save Parquet
  console.log("[scrape-mcp] Writing Parquet...");
  await initParquetWasm();
  {
    const n = uniqueTools.length;
    const ids: string[] = new Array(n);
    const toolNames: string[] = new Array(n);
    const toolDescs: string[] = new Array(n);
    const serverNames: string[] = new Array(n);
    const serverDisplayNames: string[] = new Array(n);
    const serverDescs: string[] = new Array(n);
    const inputSchemaJsonArr: string[] = new Array(n);

    for (let i = 0; i < n; i++) {
      const t = uniqueTools[i];
      ids[i] = t.id;
      toolNames[i] = t.toolName;
      toolDescs[i] = t.toolDescription;
      serverNames[i] = t.serverName;
      serverDisplayNames[i] = t.serverDisplayName;
      serverDescs[i] = t.serverDescription;
      inputSchemaJsonArr[i] = t.inputSchema ? JSON.stringify(t.inputSchema) : "";
    }

    const table = new arrow.Table({
      id: arrow.vectorFromArray(ids, new arrow.Utf8()),
      tool_name: arrow.vectorFromArray(toolNames, new arrow.Utf8()),
      tool_description: arrow.vectorFromArray(toolDescs, new arrow.Utf8()),
      server_name: arrow.vectorFromArray(serverNames, new arrow.Utf8()),
      server_display_name: arrow.vectorFromArray(serverDisplayNames, new arrow.Utf8()),
      server_description: arrow.vectorFromArray(serverDescs, new arrow.Utf8()),
      input_schema_json: arrow.vectorFromArray(inputSchemaJsonArr, new arrow.Utf8()),
    });

    writeParquetFile(table, OUTPUT_PARQUET_PATH);
    const stat = statSync(OUTPUT_PARQUET_PATH);
    console.log(`[scrape-mcp] Output (Parquet): ${OUTPUT_PARQUET_PATH} (${(stat.size / 1e6).toFixed(1)}MB)`);
  }

  // Clean up checkpoint
  if (existsSync(CHECKPOINT_PATH)) unlinkSync(CHECKPOINT_PATH);
}

main().catch(console.error);
