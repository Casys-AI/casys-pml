import type { IVaultStore } from "../db/types.ts";
import type { ExecutionTrace } from "./types.ts";

/** Record an execution trace to the vault store. */
export async function recordTrace(
  db: IVaultStore,
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
