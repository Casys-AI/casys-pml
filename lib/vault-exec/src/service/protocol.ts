export type ServiceMethod = "status" | "sync" | "stop";

export interface ServiceStatus {
  running: boolean;
  pid: number;
  vaultPath: string;
  socketPath: string;
  idleSecs: number;
  startedAt: string;
  lastActivityAt: string;
  lastRunningAt: string | null;
  syncInProgress: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export interface SyncResponse {
  ok: boolean;
  tracesUsed: number;
  notesReindexed: number;
  gruTrained: boolean;
  gruAccuracy: number;
  gnnUpdated: boolean;
  error?: string;
}

export interface ServiceRequest {
  id: string;
  method: ServiceMethod;
}

export interface ServiceSuccessResponse {
  id: string;
  ok: true;
  result: ServiceStatus | SyncResponse | { stopped: true };
}

export interface ServiceErrorResponse {
  id: string;
  ok: false;
  error: string;
}

export type ServiceResponse = ServiceSuccessResponse | ServiceErrorResponse;

const encoder = new TextEncoder();

export function encodeJsonLine(payload: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(payload)}\n`);
}

export async function readJsonLine(conn: Deno.Conn): Promise<unknown> {
  const decoder = new TextDecoder();
  const buffer = new Uint8Array(1024);
  let acc = "";

  while (true) {
    const n = await conn.read(buffer);
    if (n === null) {
      throw new Error("Connection closed before newline-delimited JSON message");
    }

    acc += decoder.decode(buffer.subarray(0, n), { stream: true });
    const newlineIdx = acc.indexOf("\n");
    if (newlineIdx !== -1) {
      const line = acc.slice(0, newlineIdx).trim();
      if (!line) {
        throw new Error("Received empty JSONL frame");
      }
      return JSON.parse(line);
    }
  }
}

export function isServiceStatus(value: unknown): value is ServiceStatus {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.running === "boolean" &&
    typeof v.pid === "number" &&
    typeof v.vaultPath === "string" &&
    typeof v.socketPath === "string";
}
