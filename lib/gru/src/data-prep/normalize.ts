/**
 * Data-prep: normalization functions for tool IDs and embeddings.
 *
 * Pure functions — no DB, no runtime-specific imports.
 * Used by benchmark-e2e.ts (Node/tsx) and potentially train-gru-with-caps.ts (Deno).
 *
 * @module gru/data-prep/normalize
 */

/**
 * Normalize FQDN → namespace:action.
 *
 * Handles all known formats:
 * - FQDN 4-5 parts: org.project.namespace.action[.hash] → namespace:action
 * - mcp.server.action → server:action
 * - mcp__server__action → server:action
 * - pml.mcp.server.action.hash → server:action
 * - local.project.server.action.hash → server:action
 * - Already canonical (namespace:action) → pass-through
 *
 * Copied from src/capabilities/routing-resolver.ts to avoid Deno-specific imports.
 */
export function normalizeToolId(toolId: string): string {
  if (!toolId || typeof toolId !== "string") return "";

  // FQDN format (org.project.namespace.action.hash) — 4+ dot parts, NOT mcp.*
  const dotParts = toolId.split(".");
  if (dotParts.length >= 4 && !toolId.startsWith("mcp.")) {
    // FQDN: org.project.namespace.action[.hash] -> namespace:action
    const namespace = dotParts[2];
    const action = dotParts[3];
    return `${namespace}:${action}`;
  }

  // mcp.server.action format (JavaScript dot notation from sandbox code)
  if (toolId.startsWith("mcp.")) {
    const parts = toolId.split(".");
    if (parts.length >= 3) {
      // mcp.server.action -> server:action
      const server = parts[1];
      const action = parts.slice(2).join("_");
      return `${server}:${action}`;
    }
    return parts[1] || toolId;
  }

  // mcp__server__action format (internal capability format)
  if (toolId.startsWith("mcp__")) {
    const parts = toolId.split("__");
    if (parts.length >= 3) {
      return `${parts[1]}:${parts[2]}`;
    }
    return parts[1] || toolId;
  }

  // Already in canonical format or bare server name
  return toolId;
}

/**
 * L2-normalize a vector. No-op if already unit-length (within tolerance).
 */
export function l2Normalize(vec: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm < 1e-12) return vec;
  const inv = 1.0 / norm;
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] * inv;
  return out;
}

/**
 * L2-normalize a map of embeddings in-place. Returns count of re-normalized entries.
 */
export function l2NormalizeMap(
  embeddings: Map<string, number[]>,
  tolerance = 0.001,
): number {
  let count = 0;
  for (const [key, emb] of embeddings) {
    let norm = 0;
    for (let i = 0; i < emb.length; i++) norm += emb[i] * emb[i];
    norm = Math.sqrt(norm);
    if (Math.abs(norm - 1.0) > tolerance) {
      embeddings.set(key, l2Normalize(emb));
      count++;
    }
  }
  return count;
}
