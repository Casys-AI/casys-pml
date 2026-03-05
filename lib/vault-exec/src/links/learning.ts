import type {
  IVaultStore,
  VirtualEdgeRow,
  VirtualEdgeUpdate,
} from "../core/types.ts";

export function nextVirtualEdgeRow(
  existing: VirtualEdgeRow | null,
  update: VirtualEdgeUpdate,
  now: string,
): VirtualEdgeRow {
  const supportInc = update.scoreDelta > 0 ? 1 : 0;
  const rejectInc = update.scoreDelta < 0 ? 1 : 0;
  return {
    source: update.source,
    target: update.target,
    score: (existing?.score ?? 0) + update.scoreDelta,
    support: (existing?.support ?? 0) + supportInc,
    rejects: (existing?.rejects ?? 0) + rejectInc,
    status: existing?.status ?? "candidate",
    promotedAt: existing?.promotedAt,
    updatedAt: now,
  };
}

export async function applyVirtualEdgeUpdate(
  store: IVaultStore,
  update: VirtualEdgeUpdate,
  now = new Date().toISOString(),
): Promise<VirtualEdgeRow> {
  const existing = await store.getVirtualEdge(update.source, update.target);
  const next = nextVirtualEdgeRow(existing, update, now);
  await store.saveVirtualEdge(next);
  return next;
}

export async function applyVirtualEdgeDecay(
  store: IVaultStore,
  factor: number,
  now = new Date().toISOString(),
): Promise<number> {
  if (!(factor > 0 && factor <= 1)) return 0;
  const edges = await store.listVirtualEdges();
  for (const row of edges) {
    await store.saveVirtualEdge({
      ...row,
      score: row.score * factor,
      updatedAt: now,
    });
  }
  return edges.length;
}
