/**
 * Data-prep: capability cleanup functions.
 *
 * Pure functions — no DB, no runtime-specific imports.
 * Handles exec_hash resolution and canonicalization.
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

  // Group caps by level + sorted toolset signature
  // Level in key prevents cross-level merges (L2 wrapping L1 ≠ L1 using L0 directly)
  const toolsetGroups = new Map<
    string,
    Array<{ id: string; usageCount: number; idx: number }>
  >();
  for (let i = 0; i < caps.length; i++) {
    const cap = caps[i];
    const sig = `L${cap.level}::` + [...cap.toolChildren].sort().join(",");
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
 * Flatten all cap children to L0 tools via recursive BFS.
 *
 * Handles arbitrary hierarchy depth: L2→L1→L0, L5→L4→...→L0, etc.
 * A child is considered L0 if it exists in `toolVocab`.
 * A child that is another cap (exists in caps array) is expanded further.
 * Children that are neither L0 tools nor known caps are dropped (dead refs).
 *
 * Mutates `caps` in-place (replaces toolChildren with resolved L0 tools).
 * Returns stats.
 */
export function flattenToL0(
  caps: CapData[],
  toolVocab: Set<string>,
): { flattened: number; totalL0: number; droppedRefs: number } {
  const capMap = new Map<string, CapData>();
  for (const cap of caps) capMap.set(cap.id, cap);

  let flattened = 0;
  let totalL0 = 0;
  let droppedRefs = 0;

  for (const cap of caps) {
    const l0Tools: string[] = [];
    const queue = [...cap.toolChildren];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const child = queue.shift()!;
      if (visited.has(child)) continue;
      visited.add(child);

      if (toolVocab.has(child)) {
        l0Tools.push(child);
      } else {
        const childCap = capMap.get(child);
        if (childCap) {
          queue.push(...childCap.toolChildren);
        } else {
          droppedRefs++;
        }
      }
    }

    const wasFlat = cap.toolChildren.length === l0Tools.length &&
      cap.toolChildren.every((c) => toolVocab.has(c));
    if (!wasFlat) flattened++;

    cap.toolChildren = l0Tools;
    totalL0 += l0Tools.length;
  }

  return { flattened, totalL0, droppedRefs };
}

