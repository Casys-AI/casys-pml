import type { VaultDB } from "../db/store.ts";
import type { ExecutionTrace } from "./types.ts";

/** Record an execution trace to DuckDB */
export async function recordTrace(
  db: VaultDB,
  trace: ExecutionTrace,
): Promise<void> {
  await db.insertTrace({
    intent: trace.intent,
    intentEmbedding: trace.intentEmbedding,
    targetNote: trace.targetNote,
    path: trace.path,
    success: trace.success,
    synthetic: trace.synthetic,
  });
}
