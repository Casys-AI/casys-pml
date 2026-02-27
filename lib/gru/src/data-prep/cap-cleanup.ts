/**
 * Data-prep: capability cleanup functions.
 *
 * Pure functions — no DB, no runtime-specific imports.
 * Handles exec_hash resolution, canonicalization, and L2+ hierarchy walk.
 *
 * @module gru/data-prep/cap-cleanup
 */

export interface CapData {
  id: string;
  embedding: number[];
  toolChildren: string[];
  level: number;
  usageCount: number;
}

/**
 * Resolve stale code:exec_HASH refs in cap toolChildren using code_hash→cap_name map.
 *
 * When a cap calls another cap, tools_used stores the callee's original name (code:exec_HASH).
 * If the callee was later renamed, the caller's tools_used still has the old exec_ reference.
 *
 * Returns count of resolved references.
 */
export function resolveExecHashRefs(
  caps: CapData[],
  execHashToCapName: Map<string, string>,
): { resolved: number } {
  const execPattern = /^(?:code|std|filesystem):exec_([a-f0-9]{8})/;
  let resolved = 0;
  for (const cap of caps) {
    cap.toolChildren = cap.toolChildren.map((child) => {
      const m = child.match(execPattern);
      if (m) {
        const capName = execHashToCapName.get(m[1]);
        if (capName) {
          resolved++;
          return capName;
        }
      }
      return child;
    });
  }
  return { resolved };
}

/**
 * Canonicalize caps by sorted toolset: group → elect canonical → remap.
 *
 * Multiple caps can share the same toolset (cross-org dupes, test artifacts).
 * Instead of adding all as separate vocab entries (softmax dilution), we:
 *   1. Group by sorted toolset
 *   2. Elect the highest-usage cap as canonical
 *   3. Remap non-canonical → canonical (keeps all intents, single vocab entry)
 *
 * Mutates `caps` array in-place (removes non-canonical entries, remaps children).
 * Returns the canonical mapping and stats.
 */
export function canonicalizeCaps(
  caps: CapData[],
): { canonicalMap: Map<string, string>; groupCount: number; remapped: number } {
  const canonicalMap = new Map<string, string>();

  // Group caps by sorted toolset signature
  const toolsetGroups = new Map<
    string,
    Array<{ id: string; usageCount: number; idx: number }>
  >();
  for (let i = 0; i < caps.length; i++) {
    const cap = caps[i];
    const sig = [...cap.toolChildren].sort().join(",");
    if (!toolsetGroups.has(sig)) toolsetGroups.set(sig, []);
    toolsetGroups.get(sig)!.push({
      id: cap.id,
      usageCount: cap.usageCount,
      idx: i,
    });
  }

  let groupCount = 0;
  let remapped = 0;
  const capsToRemove = new Set<number>();

  for (const [_sig, group] of toolsetGroups) {
    if (group.length <= 1) continue;
    groupCount++;
    // Elect canonical: highest usage, then alphabetical for determinism
    group.sort(
      (a, b) => b.usageCount - a.usageCount || a.id.localeCompare(b.id),
    );
    const canonical = group[0];
    for (let i = 1; i < group.length; i++) {
      canonicalMap.set(group[i].id, canonical.id);
      capsToRemove.add(group[i].idx);
      remapped++;
    }
  }

  // Remove non-canonical caps (reverse order to preserve indices)
  if (capsToRemove.size > 0) {
    const sortedIndices = [...capsToRemove].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      caps.splice(idx, 1);
    }
    // Remap toolChildren references in remaining caps (L2 caps may reference non-canonical L1)
    for (const cap of caps) {
      cap.toolChildren = cap.toolChildren.map(
        (c) => canonicalMap.get(c) ?? c,
      );
    }
  }

  return { canonicalMap, groupCount, remapped };
}

/**
 * Walk L2+ caps down to L0 tools via BFS on their toolChildren.
 *
 * L2 caps have children = cap names (L1), not tool IDs. Without resolution,
 * they get silently skipped when filtering by toolVocab.
 * Fix: walk down the hierarchy until we reach tools in toolVocab.
 *
 * Needs a capChildrenMap for looking up sub-caps. Builds it from caps array.
 * Mutates caps in-place: replaces toolChildren of L2+ caps with resolved L0 tools.
 *
 * Returns count of resolved L2+ caps.
 */
export function resolveL2Hierarchy(
  caps: CapData[],
  toolVocab: Set<string>,
): { resolved: number } {
  // Build capChildrenMap from caps array
  const capChildrenMap = new Map<string, string[]>();
  for (const cap of caps) {
    capChildrenMap.set(cap.id, cap.toolChildren);
  }

  let resolved = 0;
  for (const cap of caps) {
    if (cap.level < 2) continue;
    const resolvedTools = new Set<string>();
    const queue = [...cap.toolChildren];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const child = queue.shift()!;
      if (visited.has(child)) continue;
      visited.add(child);
      if (toolVocab.has(child)) {
        resolvedTools.add(child);
      } else {
        const grandChildren = capChildrenMap.get(child);
        if (grandChildren) {
          queue.push(...grandChildren);
        }
        // else: child not in toolVocab and not a known cap — silently dropped
      }
    }
    if (resolvedTools.size > 0) {
      cap.toolChildren = [...resolvedTools];
      resolved++;
    }
  }
  return { resolved };
}
