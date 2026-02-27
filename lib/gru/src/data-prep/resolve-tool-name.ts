/**
 * Data-prep: 3-step tool name resolver factory.
 *
 * Pure functions — no DB, no runtime-specific imports.
 * Resolves: exec_hash → rename chain → canonical remap.
 *
 * @module gru/data-prep/resolve-tool-name
 */

/**
 * Build a rename chain map with transitive resolution (A→B, B→C => A→C).
 * Includes cycle protection.
 */
export function buildRenameChain(
  rows: Array<{
    old_name: string;
    new_name: string;
    old_fqdn?: string | null;
  }>,
): Map<string, string> {
  const renameMap = new Map<string, string>();
  for (const row of rows) {
    renameMap.set(row.old_name, row.new_name);
    if (row.old_fqdn) renameMap.set(row.old_fqdn, row.new_name);
  }
  // Follow chains: if A->B and B->C, resolve A->C (with cycle protection)
  for (const [oldName, newName] of renameMap) {
    let current = newName;
    const visited = new Set<string>([oldName]);
    while (renameMap.has(current) && !visited.has(current)) {
      visited.add(current);
      current = renameMap.get(current)!;
    }
    if (current !== newName) renameMap.set(oldName, current);
  }
  return renameMap;
}

/**
 * Build a 3-step tool name resolver: exec_hash → rename chain → canonical remap.
 * Returns a function (name: string) => string.
 */
export function buildToolNameResolver(
  execHashToCapName: Map<string, string>,
  renameMap: Map<string, string>,
  canonicalMap: Map<string, string>,
): (name: string) => string {
  const execPattern = /^(?:code|std|filesystem):exec_([a-f0-9]{8})/;

  return (name: string): string => {
    // Step 1: resolve stale code:exec_HASH to real cap name
    let resolved = name;
    const m = name.match(execPattern);
    if (m) {
      resolved = execHashToCapName.get(m[1]) ?? name;
    }
    // Step 2: rename chain
    const renamed = renameMap.get(resolved) ?? resolved;
    // Step 3: canonical remap
    return canonicalMap.get(renamed) ?? renamed;
  };
}
