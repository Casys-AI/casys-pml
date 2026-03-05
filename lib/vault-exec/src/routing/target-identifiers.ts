export interface TargetIdentifier {
  name: string;
  id: string;
  alias: string;
}

export interface TargetIdentifierIndex {
  entries: TargetIdentifier[];
  byName: Map<string, TargetIdentifier>;
  byId: Map<string, TargetIdentifier>;
  byAlias: Map<string, TargetIdentifier>;
}

function sanitizeBaseId(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Default normalized identifier for target names.
 * Example: "Équipe Vente Nord" -> "equipe-vente-nord".
 */
export function normalizeTargetIdentifier(name: string): string {
  const base = sanitizeBaseId(name);
  return base.length > 0 ? base : "target";
}

/**
 * Deterministic shorthand alias from normalized id.
 * Example: "bench-tier-target" -> "b-t-t".
 */
export function shorthandTargetIdentifier(id: string): string {
  const parts = id.split("-").filter(Boolean);
  if (parts.length === 0) return "t";
  return parts.map((part) => part[0]).join("-");
}

export function buildTargetIdentifierIndex(
  targetNames: string[],
): TargetIdentifierIndex {
  const sortedNames = [...targetNames].sort((a, b) => {
    const byNorm = normalizeTargetIdentifier(a).localeCompare(
      normalizeTargetIdentifier(b),
    );
    if (byNorm !== 0) return byNorm;
    return a.localeCompare(b);
  });

  const idCounts = new Map<string, number>();
  const aliasCounts = new Map<string, number>();
  const entries: TargetIdentifier[] = [];

  for (const name of sortedNames) {
    const baseId = normalizeTargetIdentifier(name);
    const idCount = (idCounts.get(baseId) ?? 0) + 1;
    idCounts.set(baseId, idCount);
    const id = idCount === 1 ? baseId : `${baseId}-${idCount}`;

    const baseAlias = shorthandTargetIdentifier(baseId);
    const aliasCount = (aliasCounts.get(baseAlias) ?? 0) + 1;
    aliasCounts.set(baseAlias, aliasCount);
    const alias = aliasCount === 1 ? baseAlias : `${baseAlias}-${aliasCount}`;

    entries.push({ name, id, alias });
  }

  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const byAlias = new Map(entries.map((entry) => [entry.alias, entry]));

  return { entries, byName, byId, byAlias };
}

/**
 * Resolution order keeps exact-note compatibility first.
 */
export function resolveTargetIdentifier(
  reference: string,
  index: TargetIdentifierIndex,
): TargetIdentifier | undefined {
  return index.byName.get(reference) ?? index.byId.get(reference) ??
    index.byAlias.get(reference);
}
