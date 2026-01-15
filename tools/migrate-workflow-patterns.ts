#!/usr/bin/env -S deno run --allow-all
/**
 * One-shot migration: regenerate priorPatterns with correct tool IDs
 * Uses rawPatterns as source and applies correct DB tool ID mapping
 */

const TOOL_ID_MAP: Record<string, string> = {
  // HTTP → std (MCP tools)
  "http:http_get": "std:http_get",
  "http:http_post": "std:http_post",
  "http:http_request": "std:http_request",

  // Database → std (MCP tools)
  "database:psql_query": "std:psql_query",
  "database:redis_cli": "std:redis_cli",

  // Code operations: KEEP AS-IS!
  // Traces use code:* (traced JS ops), NOT std:array_* (MCP tools)
  // These are different things - don't map them!

  // Slack → slack:slack_*
  "slack:post_message": "slack:slack_post_message",

  // These exist as-is in DB
  "fetch:fetch": "fetch:fetch",
  "filesystem:read_text_file": "filesystem:read_text_file",
  "google-sheets:sheets_get_values": "google-sheets:sheets_get_values",
  "google-sheets:sheets_update_values": "google-sheets:sheets_update_values",
  "memory:create_entities": "memory:create_entities",
  "telegram:SEND_MESSAGE": "telegram:SEND_MESSAGE",

  // sampling → std:agent_* (LLM generation MCP tools)
  "sampling:createMessage": "std:agent_generate",
};

// Load workflow patterns
const patternsPath = "config/workflow-patterns.json";
const data = JSON.parse(await Deno.readTextFile(patternsPath));

console.log(`Loaded ${data.rawPatterns.length} raw patterns`);

// Regenerate priorPatterns from rawPatterns with correct tool IDs
// Use Map to deduplicate and aggregate frequencies
const patternMap = new Map<string, { from: string; to: string; frequency: number }>();
let skipped = 0;
let selfLoops = 0;

for (const raw of data.rawPatterns) {
  // Skip if no MCP mapping in raw pattern
  if (!raw.fromMcp || !raw.toMcp) {
    skipped++;
    continue;
  }

  // Apply our tool ID normalization
  const fromNormalized = TOOL_ID_MAP[raw.fromMcp] || raw.fromMcp;
  const toNormalized = TOOL_ID_MAP[raw.toMcp] || raw.toMcp;

  // Skip self-loops (A → A) - not useful for co-occurrence
  if (fromNormalized === toNormalized) {
    selfLoops++;
    continue;
  }

  // Aggregate duplicates by summing frequencies
  const key = `${fromNormalized}→${toNormalized}`;
  const existing = patternMap.get(key);
  if (existing) {
    existing.frequency += raw.frequency;
  } else {
    patternMap.set(key, {
      from: fromNormalized,
      to: toNormalized,
      frequency: raw.frequency,
    });
  }
}

// Convert to array with calculated weights
const priorPatterns = Array.from(patternMap.values()).map((p) => {
  const freqBoost = Math.log10(p.frequency + 1);
  const confidence = 0.9;
  const weight = 2.0 / (freqBoost * confidence);

  return {
    from: p.from,
    to: p.to,
    weight: Math.round(weight * 100) / 100,
    frequency: p.frequency,
    mappingConfidence: confidence,
    source: "n8n",
    isOfficial: false,
  };
});

// Sort by weight (best first = lowest weight)
priorPatterns.sort((a, b) => a.weight - b.weight);

console.log(`Generated: ${priorPatterns.length} unique patterns`);
console.log(`Skipped: ${skipped} (no MCP mapping), ${selfLoops} self-loops`);

// Update data
data.priorPatterns = priorPatterns;
data.migratedAt = new Date().toISOString();

// Save
await Deno.writeTextFile(patternsPath, JSON.stringify(data, null, 2));
console.log(`Saved to ${patternsPath}`);

// Show unique tool IDs
const allTools = new Set([...priorPatterns.map(p => p.from), ...priorPatterns.map(p => p.to)]);
console.log(`\nUnique tools in patterns: ${allTools.size}`);
console.log([...allTools].sort().join("\n"));
