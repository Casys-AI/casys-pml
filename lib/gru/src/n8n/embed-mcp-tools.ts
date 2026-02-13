/**
 * Embed scraped MCP tools (from Smithery) with BGE-M3
 *
 * Reads the scraped tool catalog and generates 1024D embeddings for each
 * unique tool using a structured text template. Supports resume/checkpoint.
 *
 * Input:  lib/gru/data/smithery-mcp-tools.json
 * Output: lib/gru/data/smithery-mcp-embeddings.json
 *
 * Usage: npx tsx src/n8n/embed-mcp-tools.ts
 *        npx tsx src/n8n/embed-mcp-tools.ts --force  (delete old embeddings, re-embed all)
 */

import { existsSync, readFileSync, writeFileSync, statSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";
import * as arrow from "apache-arrow";
import { initParquetWasm, embeddingToBytes, writeParquetFile } from "./parquet-utils.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, "../../data");
const INPUT_PATH = resolve(DATA_DIR, "smithery-mcp-tools.json");
const OUTPUT_PATH = resolve(DATA_DIR, "smithery-mcp-embeddings.json");
const OUTPUT_PARQUET_PATH = resolve(DATA_DIR, "smithery-mcp-embeddings.parquet");

/** JSON Schema property descriptor */
interface SchemaProperty {
  type?: string;
  enum?: string[];
  description?: string;
  items?: { type?: string };
}

/** inputSchema as found in smithery-mcp-tools.json */
interface InputSchema {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

/**
 * Format a single parameter for the embedding text.
 * Examples: "query (string)", "type (enum: auto|fast|deep)"
 */
function formatParam(name: string, prop: SchemaProperty): string {
  if (prop.enum && prop.enum.length > 0) {
    // Show top 3 enum values to keep text short
    const vals = prop.enum.slice(0, 3).join("|");
    const suffix = prop.enum.length > 3 ? "|..." : "";
    return `${name} (enum: ${vals}${suffix})`;
  }
  const type = prop.type || "any";
  return `${name} (${type})`;
}

/**
 * Build structured text for embedding — includes parameter names and types
 * from inputSchema for richer semantic signal.
 *
 * Format: Tool: {name}. Server: {server}. {description}. Parameters: p1 (type), p2 (enum: a|b|c).
 * Total text is capped at 500 chars to avoid embedding quality degradation.
 */
function buildToolText(tool: {
  toolName: string;
  toolDescription: string;
  serverDisplayName: string;
  inputSchema?: InputSchema;
}): string {
  // Header: "Tool: name. Server: server."
  const header = `Tool: ${tool.toolName}. Server: ${tool.serverDisplayName}.`;

  // Description — truncated to leave room for params
  const maxDescLen = 250;
  const desc = tool.toolDescription.length > maxDescLen
    ? tool.toolDescription.slice(0, maxDescLen) + "..."
    : tool.toolDescription;

  // Extract and format parameters from inputSchema
  const props = tool.inputSchema?.properties;
  let paramSuffix = "";
  if (props && Object.keys(props).length > 0) {
    const required = new Set(tool.inputSchema?.required ?? []);
    // Sort: required params first, then alphabetical
    const paramNames = Object.keys(props).sort((a, b) => {
      const aReq = required.has(a) ? 0 : 1;
      const bReq = required.has(b) ? 0 : 1;
      if (aReq !== bReq) return aReq - bReq;
      return a.localeCompare(b);
    });

    const formatted: string[] = [];
    for (const name of paramNames) {
      formatted.push(formatParam(name, props[name]));
    }
    paramSuffix = ` Parameters: ${formatted.join(", ")}.`;
  }

  // Assemble and enforce 500 char limit
  let text = `${header} ${desc}${paramSuffix}`;
  if (text.length > 500) {
    text = text.slice(0, 497) + "...";
  }
  return text;
}

async function main() {
  if (!existsSync(INPUT_PATH)) {
    console.error(`[embed-mcp] Input not found: ${INPUT_PATH}`);
    console.error("[embed-mcp] Run 'npx tsx src/n8n/scrape-mcp-tools.ts' first.");
    process.exit(1);
  }

  // --force: delete old embeddings to re-embed from scratch
  const forceMode = process.argv.includes("--force");
  if (forceMode) {
    for (const p of [OUTPUT_PATH, OUTPUT_PARQUET_PATH]) {
      if (existsSync(p)) {
        unlinkSync(p);
        console.log(`[embed-mcp] --force: deleted ${p}`);
      }
    }
  }

  const catalog = JSON.parse(readFileSync(INPUT_PATH, "utf-8"));
  const tools: Array<{
    id: string;
    toolName: string;
    toolDescription: string;
    serverName: string;
    serverDisplayName: string;
    inputSchema?: InputSchema;
  }> = catalog.tools;

  console.log(`[embed-mcp] ${tools.length} tools to embed`);

  // Resume from checkpoint
  const embeddings: Record<string, number[]> = existsSync(OUTPUT_PATH)
    ? JSON.parse(readFileSync(OUTPUT_PATH, "utf-8"))
    : {};
  const alreadyDone = Object.keys(embeddings).length;
  if (alreadyDone > 0) {
    console.log(`[embed-mcp] Resuming: ${alreadyDone} existing embeddings, skipping those`);
  }

  // Load BGE-M3
  console.log("[embed-mcp] Loading BGE-M3 model...");
  const startLoad = performance.now();
  // deno-lint-ignore no-explicit-any
  const model = await pipeline("feature-extraction", "Xenova/bge-m3") as any;
  console.log(`[embed-mcp] Model loaded in ${((performance.now() - startLoad) / 1000).toFixed(1)}s`);

  let done = 0;
  let skipped = 0;
  const startEmbed = performance.now();

  for (const tool of tools) {
    if (embeddings[tool.id]) {
      skipped++;
      continue;
    }

    const text = buildToolText(tool);
    const output = await model(text, { pooling: "mean", normalize: true });
    const vec = Array.from(output.data as Float32Array);

    if (vec.length !== 1024) {
      console.warn(`[embed-mcp] WARNING: ${tool.id} → ${vec.length}D (expected 1024), skipping`);
      continue;
    }

    embeddings[tool.id] = vec;
    done++;

    if (done % 200 === 0) {
      writeFileSync(OUTPUT_PATH, JSON.stringify(embeddings));
      const elapsed = ((performance.now() - startEmbed) / 1000).toFixed(1);
      const rate = (done / parseFloat(elapsed)).toFixed(1);
      const eta = ((tools.length - skipped - done) / parseFloat(rate || "1")).toFixed(0);
      console.log(
        `[embed-mcp] ${done + skipped}/${tools.length} (${done} new, ${skipped} resumed, ${rate}/s, ETA ${eta}s) [checkpoint]`,
      );
    }
  }

  // Final save (JSON)
  writeFileSync(OUTPUT_PATH, JSON.stringify(embeddings));
  const totalEmb = Object.keys(embeddings).length;
  const elapsed = ((performance.now() - startEmbed) / 1000).toFixed(1);
  const fileSizeMB = (Buffer.byteLength(JSON.stringify(embeddings)) / 1024 / 1024).toFixed(1);
  console.log(`\n[embed-mcp] Done: ${totalEmb} embeddings (${done} new + ${skipped} resumed)`);
  console.log(`[embed-mcp] Output (JSON): ${OUTPUT_PATH} (${fileSizeMB} MB)`);
  console.log(`[embed-mcp] Time: ${elapsed}s`);

  // Save Parquet — columns: tool_id (Utf8), embedding (Binary 4096 bytes)
  console.log("[embed-mcp] Writing Parquet...");
  await initParquetWasm();
  {
    const keys = Object.keys(embeddings);
    const n = keys.length;
    const toolIds: string[] = new Array(n);
    const embBuilder = arrow.makeBuilder({ type: new arrow.Binary(), nullValues: [null] });

    for (let i = 0; i < n; i++) {
      toolIds[i] = keys[i];
      embBuilder.append(embeddingToBytes(embeddings[keys[i]]));
    }
    embBuilder.finish();

    const table = new arrow.Table({
      tool_id: arrow.vectorFromArray(toolIds, new arrow.Utf8()),
      embedding: embBuilder.toVector(),
    });

    writeParquetFile(table, OUTPUT_PARQUET_PATH);
    const stat = statSync(OUTPUT_PARQUET_PATH);
    console.log(`[embed-mcp] Output (Parquet): ${OUTPUT_PARQUET_PATH} (${(stat.size / 1e6).toFixed(1)}MB)`);
  }
}

main().catch(console.error);
