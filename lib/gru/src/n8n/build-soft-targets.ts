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
import { createWriteStream, existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encode as msgpackEncode } from "@msgpack/msgpack";
import pako from "pako";
import * as arrow from "apache-arrow";
import { initParquetWasm, embeddingToBytes, softTargetToBytes, writeParquetFile } from "./parquet-utils.ts";
import type { N8nScrapedWorkflow } from "./types.ts";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, "../../data");
const WORKFLOWS_PATH = resolve(DATA_DIR, "n8n-workflows.json");
const EMBEDDINGS_PATH = resolve(DATA_DIR, "n8n-node-embeddings.json");
const WF_EMBEDDINGS_PATH = resolve(DATA_DIR, "n8n-workflow-description-embeddings.json");
const _OUTPUT_PATH = resolve(DATA_DIR, "n8n-training-examples.json"); // legacy JSON format
const OUTPUT_PATH_BIN = resolve(DATA_DIR, "n8n-training-examples.msgpack.gz");
const OUTPUT_PARQUET_PATH = resolve(DATA_DIR, "n8n-training-examples.parquet");
const SHGAT_PAIRS_PATH = resolve(DATA_DIR, "n8n-shgat-contrastive-pairs.json");
const SMITHERY_EMB_PATH = resolve(DATA_DIR, "smithery-mcp-embeddings.json");
const EXPANDED_VOCAB_PATH = resolve(DATA_DIR, "expanded-vocab.json");

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

// ---------------------------------------------------------------------------
// Schema (parameter) similarity helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a parameter name into a set of lowercase tokens.
 * Handles camelCase, snake_case, kebab-case, and dot.notation.
 * Example: "contextMaxCharacters" → {"context", "max", "characters"}
 */
function normalizeParamName(s: string): string[] {
  return s
    .replace(/([a-z])([A-Z])/g, "$1_$2") // camelCase → camel_Case
    .toLowerCase()
    .split(/[_\-.]/)
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Service-aware matching (Tier 1) — restricts candidate pool to same service
// ---------------------------------------------------------------------------

/**
 * Explicit aliases for cases where names differ between n8n and MCP.
 * Most services match automatically via identity or fuzzy prefix;
 * only add here when the names are genuinely different.
 */
const SERVICE_ALIASES: Record<string, string[]> = {
  google_sheets: ["googlesheets", "googlesuper", "gsheets", "google_sheets"],
  google_drive: ["googledrive", "gdrive", "google_drive"],
  google_calendar: ["googlecalendar", "gcal", "google_calendar"],
  google_tasks: ["googletasks", "google_tasks"],
  google_slides: ["googleslides", "google_slides"],
  google_docs: ["googledocs", "google_docs"],
  slack: ["slack", "slackbot"],
  discord: ["discord", "discordbot"],
  postgres: ["postgres", "postgresql"],
  mysql: ["mysql", "mariadb"],
  mongodb: ["mongodb", "mongo"],
  jira: ["jira", "atlassian"],
  outlook: ["microsoft_outlook", "microsoftoutlook"],
  whatsapp: ["whats_app", "whatsapp"],
  hackernews: ["hacker_news", "hackernews"],
  quickbooks: ["quick_books", "quickbooks"],
  microsoft_teams: ["microsoft_teams", "microsoftteams"],
  // Generic operation nodes — mapped to virtual service groups
  http: ["httprequest", "http_request", "http_request_tool", "tool_http_request"],
  file_reader: ["extractfromfile", "extract_from_file", "html_extract", "htmlextract"],
};

/**
 * Tool-level service overrides for tools where server name is too generic.
 * Applies AFTER the normal server-based extraction (e.g. std:* tools where
 * "std" is filtered out). Checked in order, first match wins.
 */
const TOOL_SERVICE_OVERRIDES: [RegExp, string][] = [
  [/^std:http_/, "http"],
  [/^std:curl_fetch$/, "http"],
  [/^fetch:fetch$/, "http"],
  [/^smithery-ai\/fetch:fetch_url$/, "http"],
  [/^filesystem:read_/, "file_reader"],
  [/^xiaobenyang.*:read_pdf$/, "file_reader"],
  [/^kodeyai.*pdf.*:/, "file_reader"],
  [/^std:transform_csv_parse$/, "file_reader"],
  [/^std:jq$/, "file_reader"],
  [/^std:format_xml$/, "file_reader"],
];

/** Reverse lookup: alias → canonical service name */
const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(SERVICE_ALIASES)) {
  for (const alias of aliases) ALIAS_TO_CANONICAL.set(alias, canonical);
}

/**
 * Normalize a service-like string to a canonical form:
 * 1. Check explicit alias table (for non-obvious mappings)
 * 2. Return as-is if ≥ 3 chars (identity match — "gmail" = "gmail")
 */
function normalizeServiceName(raw: string): string | null {
  const lower = raw.toLowerCase();
  const aliased = ALIAS_TO_CANONICAL.get(lower);
  if (aliased) return aliased;
  return lower.length >= 3 ? lower : null;
}

/**
 * Extract service name from an MCP tool ID.
 * Handles: "gmail:GMAIL_*", "org/repo-name:tool", "std:tool"
 * Strips common suffixes: -mcp, -server, -bot, -api
 */
function extractServiceFromMcpId(toolId: string): string | null {
  const server = toolId.split(":")[0].toLowerCase();

  // Org-scoped: "org/repo-name" → clean the repo part first
  if (server.includes("/")) {
    const repo = server.split("/").pop()!
      .replace(/^mcp[-_]?/, "").replace(/[-_]?mcp$/, "")
      .replace(/[-_]?server$/, "").replace(/[-_]?bot$/, "")
      .replace(/[-_]?api$/, "");
    const cleaned = normalizeServiceName(repo);
    if (cleaned) return cleaned;
    // Fallback: use the full org/repo as identity (for unique servers)
    return server;
  }

  // Simple server name: "gmail", "slack", "std"
  const direct = normalizeServiceName(server);
  if (direct && direct !== "std" && direct !== "exa") return direct;

  // Tool-level overrides for generic servers (std:http_get → "http")
  for (const [regex, svc] of TOOL_SERVICE_OVERRIDES) {
    if (regex.test(toolId)) return svc;
  }

  return null;
}

/**
 * n8n node name suffixes that are NOT part of the service name.
 * These get stripped before matching: "telegramTrigger" → "telegram",
 * "gmailTool" → "gmail", "googleSheetsTool" → "google_sheets".
 */
const IGNORED_N8N_SUFFIXES = new Set([
  "trigger", "tool", "v2", "v3", "v4", "new",
]);

/**
 * Extract service name from an n8n node type key.
 * Handles: "n8n-nodes-base.gmail:send", "@n8n/n8n-nodes-langchain.openAi",
 *          "@custom/n8n-nodes-foo.bar", "n8n-nodes-base.telegramTrigger"
 *
 * Returns the FULL joined camelCase segments (minus non-service suffixes),
 * so "microsoftExcel" → "microsoft_excel" (not just "microsoft").
 * This prevents false matches like microsoft_excel → microsoft_teams.
 */
function extractServiceFromN8nKey(n8nKey: string): string | null {
  let base = n8nKey
    .replace(/^n8n-nodes-base\./, "")
    .replace(/^@n8n\/n8n-nodes-langchain\./, "")
    .replace(/^@[^/]+\/[^.]+\./, "");
  base = base.split(":")[0];
  const lower = base.toLowerCase();

  // 1. Check alias table for full name: "googleSheets" → "googlesheets" → alias "google_sheets"
  const aliased = ALIAS_TO_CANONICAL.get(lower);
  if (aliased) return aliased;

  // 2. Split camelCase: "microsoftExcel" → ["microsoft", "excel"]
  const segments = base.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().split("_");
  if (segments.length > 1) {
    // Remove non-service suffixes: "telegramTrigger" → ["telegram"]
    const filtered = segments.filter(s => !IGNORED_N8N_SUFFIXES.has(s));
    if (filtered.length === 0) return null;

    // Try full joined name in alias table: "microsoft_outlook" → "outlook"
    const fullJoined = filtered.join("_");
    const fullAliased = ALIAS_TO_CANONICAL.get(fullJoined);
    if (fullAliased) return fullAliased;

    // Return the full joined name: "microsoft_excel", "microsoft_teams", etc.
    // This prevents "microsoft" from matching unrelated Microsoft services
    return fullJoined.length >= 3 ? fullJoined : null;
  }

  // 3. Identity fallback for simple names: "gmail", "slack", "airtable"
  return lower.length >= 3 ? lower : null;
}

/**
 * Build a unified service index across both n8n and MCP tool IDs.
 * Uses fuzzy matching: if an n8n service name and MCP server name share
 * a common prefix ≥ 4 chars, they're considered the same service.
 * Returns Map<canonicalService, toolIndices[]>
 */
function buildServiceIndex(
  allToolIds: string[],
  n8nKeys: string[],
): { serviceToolIndices: Map<string, number[]>; n8nServiceMap: Map<string, string> } {
  // Step 1: Extract raw service names from MCP tools
  const mcpServiceRaw = new Map<number, string>(); // toolIdx → raw service
  for (let i = 0; i < allToolIds.length; i++) {
    const svc = extractServiceFromMcpId(allToolIds[i]);
    if (svc) mcpServiceRaw.set(i, svc);
  }

  // Step 2: Extract raw service names from n8n keys
  const n8nServiceRaw = new Map<string, string>(); // n8nKey → raw service
  for (const key of n8nKeys) {
    const svc = extractServiceFromN8nKey(key);
    if (svc) n8nServiceRaw.set(key, svc);
  }

  // Step 3: Build MCP service → indices
  const serviceToolIndices = new Map<string, number[]>();
  for (const [idx, svc] of mcpServiceRaw) {
    let arr = serviceToolIndices.get(svc);
    if (!arr) { arr = []; serviceToolIndices.set(svc, arr); }
    arr.push(idx);
  }

  // Step 4: For n8n services not directly in MCP index, try fuzzy prefix match
  const n8nServiceMap = new Map<string, string>(); // n8nKey → matched canonical service
  const mcpServices = [...serviceToolIndices.keys()];
  for (const [key, n8nSvc] of n8nServiceRaw) {
    if (serviceToolIndices.has(n8nSvc)) {
      // Direct match
      n8nServiceMap.set(key, n8nSvc);
    } else {
      // Fuzzy: find MCP service where one is prefix of the other
      // Requires: min 4 chars overlap AND ratio >= 0.65 (prevents "agent" → "agentmail")
      let bestMatch: string | null = null;
      let bestOverlap = 0;
      for (const mcpSvc of mcpServices) {
        const shorter = n8nSvc.length <= mcpSvc.length ? n8nSvc : mcpSvc;
        const longer = n8nSvc.length <= mcpSvc.length ? mcpSvc : n8nSvc;
        const ratio = shorter.length / longer.length;
        if (longer.startsWith(shorter) && shorter.length >= 4 && ratio >= 0.65 && shorter.length > bestOverlap) {
          bestMatch = mcpSvc;
          bestOverlap = shorter.length;
        }
      }
      if (bestMatch) {
        n8nServiceMap.set(key, bestMatch);
      }
    }
  }

  return { serviceToolIndices, n8nServiceMap };
}

// ---------------------------------------------------------------------------
// CRUD verb matching (Tier 2) — boosts tools with matching operation verb
// ---------------------------------------------------------------------------

const CRUD_VERBS: Record<string, string[]> = {
  create: ["create", "add", "insert", "post", "new", "append"],
  read: ["get", "read", "fetch", "retrieve", "find", "search", "list", "query"],
  update: ["update", "edit", "modify", "patch", "set"],
  delete: ["delete", "remove", "destroy", "drop"],
  send: ["send", "publish", "notify", "forward"],
};

function extractCrudVerb(n8nKey: string): string | null {
  const parts = n8nKey.split(":");
  if (parts.length < 2) return null;
  const op = parts[1].toLowerCase();
  for (const [verb, synonyms] of Object.entries(CRUD_VERBS)) {
    if (synonyms.some((s) => op.includes(s))) return verb;
  }
  return null;
}

// ---------------------------------------------------------------------------

/**
 * n8n node type prefixes that have no MCP equivalent.
 * These are AI/LLM orchestration, triggers, and internal plumbing nodes
 * that would pollute the training data with low-similarity noise.
 */
const EXCLUDED_N8N_PREFIXES = [
  // Trigger nodes — already partially filtered at scrape time, catch remaining
  "n8n-nodes-base.webhook",
  "n8n-nodes-base.cronTrigger",
  "n8n-nodes-base.intervalTrigger",
  "n8n-nodes-base.pollingTrigger",
  "n8n-nodes-base.emailReadImap", // trigger variant
  "n8n-nodes-base.formTrigger",
  // Internal plumbing (flow control, not tools)
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
  // LLM provider/config nodes — these configure which model to use, not tool actions.
  // No MCP equivalent exists (MCP = tools, LLM = orchestrator). Keeping them
  // creates random mappings (openAi:chat → chatwork, gemini → random) that add noise.
  "@n8n/n8n-nodes-langchain.lmChat",       // lmChatOpenAi, lmChatAnthropic, lmChatGroq, etc.
  "@n8n/n8n-nodes-langchain.lmOpen",       // lmOpenAi, lmOpenHuggingFace
  "@n8n/n8n-nodes-langchain.embeddings",   // embeddingsOpenAi, embeddingsCohere, etc.
  "@n8n/n8n-nodes-langchain.openAi",       // openAi:chat, openAi:assistant, etc.
  "@n8n/n8n-nodes-langchain.googleGemini", // googleGemini:document, etc.
  "@n8n/n8n-nodes-langchain.anthropic",
  "@n8n/n8n-nodes-langchain.ollama",       // ollama LLM provider
  "@n8n/n8n-nodes-langchain.lmOllama",     // ollama LLM provider variant
  "@n8n/n8n-nodes-langchain.ollamaTool",   // ollama tool wrapper
  "@n8n/n8n-nodes-langchain.chat",         // chatTrigger → chatwork false positive
  "@n8n/n8n-nodes-langchain.chatTrigger",  // chat trigger
  "@n8n/n8n-nodes-langchain.manualChatTrigger", // manual trigger
  "@n8n/n8n-nodes-langchain.modelSelector", // model config, not a tool
  "n8n-nodes-base.openAi",                 // openAi:chatcompletion, etc.
  "n8n-nodes-base.mistralAi",
  // Browser automation with no MCP equivalent (airtop → airtable false positive)
  "n8n-nodes-base.airtop",
];

function isExcludedN8nNode(n8nKey: string): boolean {
  return EXCLUDED_N8N_PREFIXES.some((prefix) => n8nKey.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Validate inputs
  for (
    const [path, name] of [[WORKFLOWS_PATH, "workflows"], [EMBEDDINGS_PATH, "embeddings"]] as const
  ) {
    if (!existsSync(path)) {
      console.error(`[targets] Missing ${name}: ${path}`);
      console.error(`[targets] Run 'npm run n8n:scrape' and 'npm run n8n:embed' first.`);
      process.exit(1);
    }
  }

  // Load n8n data
  const workflows: N8nScrapedWorkflow[] = JSON.parse(readFileSync(WORKFLOWS_PATH, "utf-8"));
  const n8nEmbeddings: Record<string, number[]> = JSON.parse(
    readFileSync(EMBEDDINGS_PATH, "utf-8"),
  );
  console.log(
    `[targets] Loaded ${workflows.length} workflows, ${
      Object.keys(n8nEmbeddings).length
    } n8n embeddings`,
  );

  // Load workflow description embeddings (optional — graceful warning if missing)
  let wfDescEmbeddings: Record<string, number[]> = {};
  if (existsSync(WF_EMBEDDINGS_PATH)) {
    wfDescEmbeddings = JSON.parse(readFileSync(WF_EMBEDDINGS_PATH, "utf-8"));
    console.log(
      `[targets] Loaded ${Object.keys(wfDescEmbeddings).length} workflow description embeddings`,
    );
  } else {
    console.warn(
      `[targets] WARNING: ${WF_EMBEDDINGS_PATH} not found — ` +
        "using node embedding as intent fallback. Run 'npm run n8n:embed' to generate workflow description embeddings.",
    );
  }

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

    console.log(`[targets] Loaded ${mcpToolIds.length} PML tool embeddings`);
  } finally {
    await sql.end();
  }

  // ---------------------------------------------------------------------------
  // Build EXPANDED VOCABULARY: PML tools + curated Smithery tools
  // Instead of filtering out n8n nodes without PML equivalents, we expand the
  // vocab to include the best Smithery MCP tool for each n8n node. This gives
  // the GRU a universal MCP vocabulary — not limited to PML's 644 tools.
  // ---------------------------------------------------------------------------

  const TEMPERATURE = 0.005;
  const MIN_COSINE_SIM = 0.80;

  // Combined vocab arrays — PML first (indices 0..643), then Smithery additions
  const allToolIds: string[] = [...mcpToolIds];
  const allToolEmbeddings: number[][] = [...mcpEmbeddings];
  const pmlToolCount = mcpToolIds.length;

  // Load Smithery embeddings for vocab expansion
  let smitheryIds: string[] = [];
  let smitheryVecs: number[][] = [];
  const smitheryToolNames: Record<string, string> = {};
  const smitheryToolParams: Record<string, string[]> = {};

  if (existsSync(SMITHERY_EMB_PATH)) {
    console.log("[targets] Loading Smithery MCP embeddings for vocab expansion...");
    const smitheryEmbs: Record<string, number[]> = JSON.parse(
      readFileSync(SMITHERY_EMB_PATH, "utf-8"),
    );
    smitheryIds = Object.keys(smitheryEmbs);
    smitheryVecs = smitheryIds.map((id) => smitheryEmbs[id]);
    console.log(`[targets] Loaded ${smitheryVecs.length} Smithery embeddings`);

    // Build display name lookup + param name lookup for schema similarity
    if (existsSync(resolve(DATA_DIR, "smithery-mcp-tools.json"))) {
      const catalog = JSON.parse(
        readFileSync(resolve(DATA_DIR, "smithery-mcp-tools.json"), "utf-8"),
      );
      for (const t of catalog.tools) {
        smitheryToolNames[t.id] = `${t.toolName} (${t.serverDisplayName})`;
        const props = t.inputSchema?.properties;
        if (props && typeof props === "object") {
          smitheryToolParams[t.id] = Object.keys(props);
        }
      }
      console.log(
        `[targets] Smithery params loaded: ${Object.keys(smitheryToolParams).length} tools with schema`,
      );
    }
  } else {
    console.log("[targets] No Smithery embeddings found — PML-only vocab (644 tools)");
  }

  // Build n8n node param lookup: nodeTypeKey → paramNames (deduplicated, longest wins)
  const n8nNodeParams = new Map<string, string[]>();
  for (const wf of workflows) {
    for (const node of wf.nodes) {
      const key = nodeTypeKey(node.type, node.operation);
      const existing = n8nNodeParams.get(key);
      // Keep the variant with the most params (some workflow instances have partial params)
      if (!existing || (node.paramNames && node.paramNames.length > existing.length)) {
        n8nNodeParams.set(key, node.paramNames || []);
      }
    }
  }
  console.log(
    `[targets] n8n node params loaded: ${n8nNodeParams.size} unique node types`,
  );

  // Phase 1: For each n8n node, find best match across PML + Smithery.
  // Collect unique Smithery tools that are best matches (to add to vocab).
  console.log("[targets] Phase 1: Building expanded vocabulary...");
  const smitheryToolsToAdd = new Map<string, number>(); // smitheryId → index in smitheryVecs
  let pmlWins = 0;
  let smitheryWins = 0;
  let excludedType = 0;

  const n8nEntries = Object.entries(n8nEmbeddings).filter(([key]) => {
    if (isExcludedN8nNode(key)) {
      excludedType++;
      return false;
    }
    return true;
  });

  for (const [, n8nEmb] of n8nEntries) {
    // Best PML match
    let pmlMax = -1;
    for (let i = 0; i < mcpEmbeddings.length; i++) {
      const s = cosineSimilarity(n8nEmb as number[], mcpEmbeddings[i]);
      if (s > pmlMax) pmlMax = s;
    }

    // Best Smithery match
    let smMax = -1;
    let smBestIdx = -1;
    for (let j = 0; j < smitheryVecs.length; j++) {
      const s = cosineSimilarity(n8nEmb as number[], smitheryVecs[j]);
      if (s > smMax) {
        smMax = s;
        smBestIdx = j;
      }
    }

    if (pmlMax >= smMax || smBestIdx < 0) {
      pmlWins++;
    } else {
      smitheryWins++;
      const smId = smitheryIds[smBestIdx];
      if (!smitheryToolsToAdd.has(smId)) {
        smitheryToolsToAdd.set(smId, smBestIdx);
      }
    }
  }

  // Add curated Smithery tools to vocab
  for (const [smId, smIdx] of smitheryToolsToAdd) {
    allToolIds.push(smId);
    allToolEmbeddings.push(smitheryVecs[smIdx]);
  }

  console.log(`[targets] PML wins: ${pmlWins}, Smithery wins: ${smitheryWins}`);
  console.log(`[targets] Smithery tools added: ${smitheryToolsToAdd.size}`);
  console.log(
    `[targets] Expanded vocab: ${pmlToolCount} PML + ${smitheryToolsToAdd.size} Smithery = ${allToolIds.length} total`,
  );
  console.log(`[targets] Excluded by type: ${excludedType}`);

  // Phase 2: Compute soft target distributions over EXPANDED vocab
  // Parse --schema-alpha CLI flag (default 0.8 = 80% cosine + 20% schema)
  const schemaAlphaArg = process.argv.find((a) => a.startsWith("--schema-alpha"));
  const SCHEMA_ALPHA = schemaAlphaArg
    ? parseFloat(schemaAlphaArg.split("=")[1] ?? process.argv[process.argv.indexOf(schemaAlphaArg) + 1])
    : 0.8;
  if (Number.isNaN(SCHEMA_ALPHA) || SCHEMA_ALPHA < 0 || SCHEMA_ALPHA > 1) {
    throw new Error(`[targets] Invalid --schema-alpha value. Must be between 0 and 1.`);
  }
  const useSchemaBlend = SCHEMA_ALPHA < 1.0;
  const useServiceMatch = !process.argv.includes("--no-service-match");

  console.log(
    `\n[targets] Phase 2: Computing soft target distributions (T=${TEMPERATURE}, vocab=${allToolIds.length}, schema_alpha=${SCHEMA_ALPHA}, service_match=${useServiceMatch})...`,
  );

  // Pre-compute normalized param token sets for all MCP tools in expanded vocab
  const allToolParamTokens: Set<string>[] = new Array(allToolIds.length);
  for (let i = 0; i < allToolIds.length; i++) {
    const toolId = allToolIds[i];
    const params = smitheryToolParams[toolId] || [];
    allToolParamTokens[i] = new Set(params.flatMap(normalizeParamName));
  }

  // Build service index with fuzzy matching between n8n and MCP service names
  let serviceToolIndices = new Map<string, number[]>();
  let n8nServiceMap = new Map<string, string>();
  if (useServiceMatch) {
    const svcResult = buildServiceIndex(allToolIds, n8nEntries.map(([k]) => k));
    serviceToolIndices = svcResult.serviceToolIndices;
    n8nServiceMap = svcResult.n8nServiceMap;
    console.log(
      `[targets] Service index: ${serviceToolIndices.size} services, ` +
        `${[...serviceToolIndices.values()].reduce((s, a) => s + a.length, 0)} tools indexed, ` +
        `${n8nServiceMap.size} n8n nodes matched`,
    );
    for (const [svc, indices] of [...serviceToolIndices.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
      console.log(`[targets]   ${svc}: ${indices.length} tools`);
    }
  }

  // Pre-compute lowercased tool IDs for CRUD verb matching
  const toolNameLower = allToolIds.map((id) => id.toLowerCase());

  const softTargetCache = new Map<string, { probs: number[]; topToolId: string; topSim: number }>();
  let computed = 0;
  let excludedLowSim = 0;
  let schemaChangedTopTool = 0;
  let tierCounts = [0, 0, 0]; // tier 1, 2, 3
  const tierServiceHits = new Map<string, number>(); // service → count for Tier 1

  for (const [n8nKey, n8nEmb] of n8nEntries) {
    const cosineSims = allToolEmbeddings.map((emb) => cosineSimilarity(n8nEmb as number[], emb));
    const n8nParams = n8nNodeParams.get(n8nKey) || [];
    const n8nTokens = n8nParams.length > 0 ? new Set(n8nParams.flatMap(normalizeParamName)) : null;

    let similarities: number[];
    let tier = 3;

    // ---- Tier 1: Service Name Match — restricted candidate pool ----
    if (useServiceMatch) {
      const n8nService = n8nServiceMap.get(n8nKey);
      const svcIndices = n8nService ? serviceToolIndices.get(n8nService) : undefined;

      if (svcIndices && svcIndices.length >= 2) {
        // Score within same-service tools: cosine + schema boost (never degrades)
        let bestIdx = -1;
        let bestScore = -Infinity;
        for (const idx of svcIndices) {
          let score = cosineSims[idx];
          // Schema Jaccard boosts the cosine score, never degrades it
          if (n8nTokens && allToolParamTokens[idx].size > 0) {
            let intersection = 0;
            for (const t of n8nTokens) {
              if (allToolParamTokens[idx].has(t)) intersection++;
            }
            const unionSize = new Set([...n8nTokens, ...allToolParamTokens[idx]]).size;
            const schemaScore = unionSize > 0 ? intersection / unionSize : 0;
            // Boost: cosine + 0.2 * schema (so schema can only add up to +0.2)
            score = cosineSims[idx] + 0.2 * schemaScore;
          }
          if (score > bestScore) { bestScore = score; bestIdx = idx; }
        }

        if (bestScore > 0.60 && bestIdx >= 0) {
          // Tier 1 success: softmax over service tools only (suppress others)
          similarities = new Array(cosineSims.length).fill(-10);
          for (const idx of svcIndices) {
            let score = cosineSims[idx];
            if (n8nTokens && allToolParamTokens[idx].size > 0) {
              let intersection = 0;
              for (const t of n8nTokens) {
                if (allToolParamTokens[idx].has(t)) intersection++;
              }
              const unionSize = new Set([...n8nTokens, ...allToolParamTokens[idx]]).size;
              const schemaScore = unionSize > 0 ? intersection / unionSize : 0;
              score = cosineSims[idx] + 0.2 * schemaScore;
            }
            similarities[idx] = score;
          }
          tier = 1;
          tierServiceHits.set(n8nService!, (tierServiceHits.get(n8nService!) || 0) + 1);
        }
      }
    }

    // ---- Tier 2: CRUD Boost + Schema blend (full vocab) ----
    if (tier === 3) {
      const crudVerb = extractCrudVerb(n8nKey);

      if (crudVerb || (useSchemaBlend && n8nTokens)) {
        const crudSynonyms = crudVerb ? CRUD_VERBS[crudVerb] : null;
        similarities = new Array(cosineSims.length);
        for (let i = 0; i < cosineSims.length; i++) {
          let score = cosineSims[i];
          // Schema blend
          if (n8nTokens && allToolParamTokens[i].size > 0) {
            let intersection = 0;
            for (const t of n8nTokens) {
              if (allToolParamTokens[i].has(t)) intersection++;
            }
            const unionSize = new Set([...n8nTokens, ...allToolParamTokens[i]]).size;
            const schemaSim = unionSize > 0 ? intersection / unionSize : 0;
            score = SCHEMA_ALPHA * cosineSims[i] + (1 - SCHEMA_ALPHA) * schemaSim;
          }
          // CRUD verb boost
          if (crudSynonyms && crudSynonyms.some((v) => toolNameLower[i].includes(v))) {
            score += 0.03;
          }
          similarities[i] = score;
        }
        tier = 2;
      } else {
        // Tier 3: pure cosine fallback
        similarities = cosineSims;
      }
    }

    tierCounts[tier - 1]++;

    // Find top-1
    let maxIdx = 0;
    for (let i = 1; i < similarities.length; i++) {
      if (similarities[i] > similarities[maxIdx]) maxIdx = i;
    }

    // Track how often the tier system changed the top-1 vs pure cosine
    {
      let cosMaxIdx = 0;
      for (let i = 1; i < cosineSims.length; i++) {
        if (cosineSims[i] > cosineSims[cosMaxIdx]) cosMaxIdx = i;
      }
      if (maxIdx !== cosMaxIdx) schemaChangedTopTool++;
    }

    if (similarities[maxIdx] < MIN_COSINE_SIM) {
      excludedLowSim++;
      continue;
    }

    const probs = softmax(similarities, TEMPERATURE);

    softTargetCache.set(n8nKey, {
      probs,
      topToolId: allToolIds[maxIdx],
      topSim: similarities[maxIdx],
    });

    computed++;
    if (computed % 200 === 0) {
      console.log(
        `[targets] Computed ${computed}/${n8nEntries.length} distributions`,
      );
    }
  }

  console.log(`[targets] Excluded by low sim (<${MIN_COSINE_SIM}): ${excludedLowSim}`);
  console.log(`[targets] Kept: ${softTargetCache.size} node types with good MCP matches`);
  console.log(
    `[targets] Tier dispatch: T1=${tierCounts[0]} (${
      n8nEntries.length > 0 ? ((tierCounts[0] / n8nEntries.length) * 100).toFixed(1) : 0
    }%) T2=${tierCounts[1]} (${
      n8nEntries.length > 0 ? ((tierCounts[1] / n8nEntries.length) * 100).toFixed(1) : 0
    }%) T3=${tierCounts[2]} (${
      n8nEntries.length > 0 ? ((tierCounts[2] / n8nEntries.length) * 100).toFixed(1) : 0
    }%)`,
  );
  if (tierServiceHits.size > 0) {
    console.log(
      `[targets] Tier 1 services: ${[...tierServiceHits.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([s, c]) => `${s}=${c}`)
        .join(", ")}`,
    );
  }
  console.log(
    `[targets] Top-1 changed vs cosine-only: ${schemaChangedTopTool}/${computed} (${
      computed > 0 ? ((schemaChangedTopTool / computed) * 100).toFixed(1) : 0
    }%)`,
  );

  // Log sample Tier 1 mappings (service-matched — most interesting)
  if (useServiceMatch && tierServiceHits.size > 0) {
    console.log("\n[targets] Tier 1 sample mappings (service-matched):");
    const shownServices = new Set<string>();
    let t1shown = 0;
    for (const [key, { topToolId, topSim }] of softTargetCache) {
      const svc = n8nServiceMap.get(key);
      if (!svc || shownServices.has(svc) || !tierServiceHits.has(svc)) continue;
      shownServices.add(svc);
      const displayName = smitheryToolNames[topToolId] || topToolId;
      console.log(`  [${svc}] ${key} → ${displayName} (sim=${topSim.toFixed(3)})`);
      if (++t1shown >= 20) break;
    }
  }

  // Log sample general mappings
  console.log("\n[targets] Sample mappings (n8n → best MCP match):");
  let shown = 0;
  for (const [key, { topToolId, topSim }] of softTargetCache) {
    if (shown >= 15) break;
    const displayName = smitheryToolNames[topToolId] || topToolId;
    console.log(`  ${key} → ${displayName} (sim=${topSim.toFixed(3)})`);
    shown++;
  }

  // Export mapping summary for notebook analysis
  const MAPPING_SUMMARY_PATH = resolve(DATA_DIR, "n8n-mcp-mapping-summary.json");
  {
    // Build per-node tier info
    const tierMap = new Map<string, number>();
    // Re-determine tiers (we tracked counts but not per-key — rebuild from n8nServiceMap)
    for (const [key] of n8nEntries) {
      if (!softTargetCache.has(key)) continue;
      const svc = n8nServiceMap.get(key);
      const svcIndices = svc ? serviceToolIndices.get(svc) : undefined;
      if (svcIndices && svcIndices.length >= 2) {
        tierMap.set(key, 1);
      } else {
        const crudVerb = extractCrudVerb(key);
        const n8nParams = n8nNodeParams.get(key) || [];
        if (crudVerb || (useSchemaBlend && n8nParams.length > 0)) {
          tierMap.set(key, 2);
        } else {
          tierMap.set(key, 3);
        }
      }
    }

    const mappings: Record<string, { mcp: string; tier: number; service: string | null; sim: number }> = {};
    for (const [key, { topToolId, topSim }] of softTargetCache) {
      mappings[key] = {
        mcp: topToolId,
        tier: tierMap.get(key) ?? 3,
        service: n8nServiceMap.get(key) ?? null,
        sim: parseFloat(topSim.toFixed(4)),
      };
    }

    const summary = {
      stats: {
        tier1: tierCounts[0], tier2: tierCounts[1], tier3: tierCounts[2],
        total: softTargetCache.size,
        avgTopSim: parseFloat((Array.from(softTargetCache.values()).reduce((s, v) => s + v.topSim, 0) / softTargetCache.size).toFixed(4)),
      },
      mappings,
    };
    writeFileSync(MAPPING_SUMMARY_PATH, JSON.stringify(summary));
    const sizeMB = (statSync(MAPPING_SUMMARY_PATH).size / 1024 / 1024).toFixed(1);
    console.log(`\n[targets] Mapping summary: ${MAPPING_SUMMARY_PATH} (${sizeMB} MB)`);
  }

  // Convert workflows to TransitionExamples
  const MAX_WF = parseInt(process.env.MAX_WF || "0", 10);
  const wfSlice = MAX_WF > 0 ? workflows.slice(0, MAX_WF) : workflows;
  console.log(
    `\n[targets] Converting ${wfSlice.length}/${workflows.length} workflows to training examples...`,
  );
  const examples: SoftTargetExample[] = [];
  let skippedNoEmb = 0;
  let usedDescEmb = 0;
  let usedNodeFallback = 0;

  for (const wf of wfSlice) {
    // Build ordered node sequence from edges, excluding non-MCP nodes
    const rawSequence = buildNodeSequence(wf);
    const nodeSequence = rawSequence.filter((key) =>
      !isExcludedN8nNode(key) && softTargetCache.has(key)
    );
    if (nodeSequence.length < 2) continue;

    // Intent embedding: prefer workflow description embedding (captures "what user wants to do")
    // over node embedding (captures "which tool is used").
    const wfDescEmb = wfDescEmbeddings[String(wf.id)];
    let intentEmb: number[];
    if (wfDescEmb) {
      intentEmb = wfDescEmb;
      usedDescEmb++;
    } else {
      // Fallback: 2nd node embedding (1st is often a generic entry point)
      const intentKey = nodeSequence.length > 2
        ? (n8nEmbeddings[nodeSequence[1]] ? nodeSequence[1] : nodeSequence[0])
        : nodeSequence[0];
      const nodeEmb = n8nEmbeddings[intentKey];
      if (!nodeEmb) {
        skippedNoEmb++;
        continue;
      }
      intentEmb = nodeEmb;
      usedNodeFallback++;
      if (wf.description) {
        // Has description but no embedding — embed script may need re-running
        console.warn(
          `[targets] WARNING: workflow ${wf.id} ("${wf.name}") has description but no description embedding — using node embedding as intent`,
        );
      }
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
  console.log(
    `[targets] Intent source: ${usedDescEmb} workflow description, ${usedNodeFallback} node fallback`,
  );
  console.log(`[targets] Skipped (no embedding): ${skippedNoEmb}`);

  // Stats
  const termCount = examples.filter((e) => e.isTerminal === 1).length;
  console.log(
    `[targets] Terminal examples: ${termCount} (${
      ((termCount / examples.length) * 100).toFixed(1)
    }%)`,
  );

  // Average top-1 similarity
  const avgTopSim = Array.from(softTargetCache.values()).reduce((s, v) => s + v.topSim, 0) /
    softTargetCache.size;
  console.log(`[targets] Average top-1 cosine similarity: ${avgTopSim.toFixed(3)}`);

  // Save as msgpack+gzip (consistent with SHGAT weight storage pattern)
  // Full distribution, no top-K truncation — compression handles the size
  // Use Float32Array for embeddings + probs to halve memory vs Float64
  const binExamples = examples.map((ex) => ({
    ie: new Float32Array(ex.intentEmbedding), // intentEmbedding
    ctx: ex.contextToolIds,
    tid: ex.targetToolId,
    term: ex.isTerminal,
    single: ex.isSingleTool,
    probs: new Float32Array(ex.softTargetProbs),
  }));

  // Include tool embeddings in output so training can reconstruct the full vocab
  const binToolEmbeddings = allToolEmbeddings.map((emb) => new Float32Array(emb));

  const payload = {
    mcpToolIds: allToolIds, // expanded: PML (0..643) + Smithery (644..)
    pmlToolCount, // how many are PML vs Smithery
    toolEmbeddings: binToolEmbeddings, // 1024D embeddings for each tool
    examples: binExamples,
  };
  console.log(`\n[targets] Encoding msgpack...`);
  const msgpackBytes = msgpackEncode(payload);
  console.log(`[targets] MessagePack size: ${(msgpackBytes.length / 1024 / 1024).toFixed(1)} MB`);

  const compressed = pako.gzip(msgpackBytes, { level: 6 });
  const compressedMB = (compressed.length / 1024 / 1024).toFixed(1);
  console.log(`[targets] Gzip size: ${compressedMB} MB`);

  writeFileSync(OUTPUT_PATH_BIN, compressed);
  console.log(`[targets] Output: ${OUTPUT_PATH_BIN} (${compressedMB} MB)`);
  console.log(
    `[targets] Format: msgpack+gzip, expanded vocab (${allToolIds.length} tools: ${pmlToolCount} PML + ${
      allToolIds.length - pmlToolCount
    } Smithery, ${allToolIds.length} probs/example)`,
  );

  // ---- Save Parquet output ----
  // Sparsify soft targets: only keep indices with prob > 1e-6 (same as export-to-parquet.ts).
  // Columns: intent_embedding (Binary), context_tool_ids_json (Utf8),
  //          target_tool_id (Utf8), is_terminal (Int32),
  //          soft_target_indices (Binary), soft_target_probs (Binary)
  console.log(`\n[targets] Writing Parquet (${examples.length} rows)...`);
  const t0Parquet = performance.now();
  await initParquetWasm();

  {
    const n = examples.length;
    const targetToolIds: string[] = new Array(n);
    const isTerminals = new Int32Array(n);
    const contextToolIdsJson: string[] = new Array(n);

    const embType = new arrow.Binary();
    const embBuilder = arrow.makeBuilder({ type: embType, nullValues: [null] });
    const indicesBuilder = arrow.makeBuilder({ type: new arrow.Binary(), nullValues: [null] });
    const probsBuilder = arrow.makeBuilder({ type: new arrow.Binary(), nullValues: [null] });

    for (let i = 0; i < n; i++) {
      const ex = examples[i];
      embBuilder.append(embeddingToBytes(ex.intentEmbedding));
      contextToolIdsJson[i] = JSON.stringify(ex.contextToolIds);
      targetToolIds[i] = ex.targetToolId;
      isTerminals[i] = ex.isTerminal;

      // Sparsify: keep only indices where prob > 1e-6
      const sparse: [number, number][] = [];
      for (let j = 0; j < ex.softTargetProbs.length; j++) {
        if (ex.softTargetProbs[j] > 1e-6) {
          sparse.push([j, ex.softTargetProbs[j]]);
        }
      }
      const { indicesBytes, probsBytes } = softTargetToBytes(sparse);
      indicesBuilder.append(indicesBytes);
      probsBuilder.append(probsBytes);
    }
    embBuilder.finish();
    indicesBuilder.finish();
    probsBuilder.finish();

    const table = new arrow.Table({
      intent_embedding: embBuilder.toVector(),
      context_tool_ids_json: arrow.vectorFromArray(contextToolIdsJson, new arrow.Utf8()),
      target_tool_id: arrow.vectorFromArray(targetToolIds, new arrow.Utf8()),
      is_terminal: arrow.makeVector(isTerminals),
      soft_target_indices: indicesBuilder.toVector(),
      soft_target_probs: probsBuilder.toVector(),
    });

    writeParquetFile(table, OUTPUT_PARQUET_PATH);
    const stat = statSync(OUTPUT_PARQUET_PATH);
    console.log(`[targets] Output (Parquet): ${OUTPUT_PARQUET_PATH} (${(stat.size / 1e6).toFixed(1)}MB, ${(performance.now() - t0Parquet).toFixed(0)}ms)`);
  }

  // Save expanded vocab as separate file for training script (lightweight, ~10 MB)
  // Contains only the Smithery additions — PML tools come from the database
  if (smitheryToolsToAdd.size > 0) {
    const expandedVocab = {
      pmlToolCount,
      smitheryToolIds: allToolIds.slice(pmlToolCount),
      smitheryToolEmbeddings: allToolEmbeddings.slice(pmlToolCount),
    };
    writeFileSync(EXPANDED_VOCAB_PATH, JSON.stringify(expandedVocab));
    const vocabMB = (Buffer.byteLength(JSON.stringify(expandedVocab)) / 1024 / 1024).toFixed(1);
    console.log(`[targets] Expanded vocab saved: ${EXPANDED_VOCAB_PATH} (${vocabMB} MB)`);
  }

  // -------------------------------------------------------------------
  // Phase 2: SHGAT Contrastive Pairs
  // -------------------------------------------------------------------
  // For each workflow with a description embedding, generate a contrastive pair:
  //   intentEmbedding = workflow description embedding (1024D)
  //   positiveToolIds = unique MCP tools mapped from the workflow's n8n nodes
  // This augments LiveMCPBench's 282 examples with thousands of n8n pairs.
  console.log("\n[targets] Phase 2: Generating SHGAT contrastive pairs...");

  interface ShgatContrastivePair {
    intentEmbedding: number[];
    positiveToolIds: string[];
    workflowId: number;
    workflowName: string;
  }

  const shgatPairs: ShgatContrastivePair[] = [];
  let shgatSkippedNoDesc = 0;
  let shgatSkippedNoTools = 0;

  for (const wf of wfSlice) {
    // Require workflow description embedding
    const descEmb = wfDescEmbeddings[String(wf.id)];
    if (!descEmb) {
      shgatSkippedNoDesc++;
      continue;
    }

    // Collect unique MCP tool IDs from all workflow nodes
    const positiveToolIds = new Set<string>();
    for (const node of wf.nodes) {
      const key = nodeTypeKey(node.type, node.operation);
      if (isExcludedN8nNode(key)) continue;
      const cached = softTargetCache.get(key);
      if (cached) {
        positiveToolIds.add(cached.topToolId);
      }
    }

    if (positiveToolIds.size === 0) {
      shgatSkippedNoTools++;
      continue;
    }

    shgatPairs.push({
      intentEmbedding: descEmb,
      positiveToolIds: Array.from(positiveToolIds),
      workflowId: wf.id,
      workflowName: wf.name,
    });
  }

  // Save SHGAT contrastive pairs
  const shgatWs = createWriteStream(SHGAT_PAIRS_PATH);
  shgatWs.write("[\n");
  for (let i = 0; i < shgatPairs.length; i++) {
    const line = JSON.stringify(shgatPairs[i]);
    shgatWs.write(i === 0 ? line : `,\n${line}`);
  }
  shgatWs.write("\n]\n");
  shgatWs.end();
  await new Promise<void>((res, rej) => {
    shgatWs.on("finish", res);
    shgatWs.on("error", rej);
  });

  const shgatFileSize = (await import("node:fs").then((fs) => fs.statSync(SHGAT_PAIRS_PATH))).size;
  const shgatFileSizeMB = (shgatFileSize / 1024 / 1024).toFixed(1);
  const avgToolsPerPair = shgatPairs.length > 0
    ? (shgatPairs.reduce((s, p) => s + p.positiveToolIds.length, 0) / shgatPairs.length).toFixed(1)
    : "0";
  const uniqueShgatTools = new Set(shgatPairs.flatMap((p) => p.positiveToolIds)).size;

  console.log(`[targets] SHGAT contrastive pairs: ${shgatPairs.length}`);
  console.log(
    `[targets] SHGAT skipped: ${shgatSkippedNoDesc} no description, ${shgatSkippedNoTools} no MCP tools`,
  );
  console.log(
    `[targets] SHGAT avg tools/pair: ${avgToolsPerPair}, unique tools: ${uniqueShgatTools}`,
  );
  console.log(`[targets] SHGAT output: ${SHGAT_PAIRS_PATH} (${shgatFileSizeMB} MB)`);
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
