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
  traceSourcesConfigured: number;
  traceFilesChanged: number;
  traceFilesUnchanged: number;
  traceSessionsImported: number;
  traceToolCallsStored: number;
  traceWarnings: string[];
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
const SERVICE_METHOD_SET: ReadonlySet<ServiceMethod> = new Set([
  "status",
  "sync",
  "stop",
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

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
      throw new Error(
        "Connection closed before newline-delimited JSON message",
      );
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
  if (!isObjectRecord(value)) return false;
  const v = value;
  return typeof v.running === "boolean" &&
    typeof v.pid === "number" &&
    typeof v.vaultPath === "string" &&
    typeof v.socketPath === "string";
}

export function isServiceMethod(value: unknown): value is ServiceMethod {
  return typeof value === "string" &&
    SERVICE_METHOD_SET.has(value as ServiceMethod);
}

export function isServiceRequest(value: unknown): value is ServiceRequest {
  if (!isObjectRecord(value)) return false;
  return typeof value.id === "string" &&
    value.id.length > 0 &&
    isServiceMethod(value.method);
}

export function isSyncResponse(value: unknown): value is SyncResponse {
  if (!isObjectRecord(value)) return false;
  if (
    typeof value.ok !== "boolean" ||
    typeof value.tracesUsed !== "number" ||
    typeof value.notesReindexed !== "number" ||
    typeof value.gruTrained !== "boolean" ||
    typeof value.gruAccuracy !== "number" ||
    typeof value.gnnUpdated !== "boolean" ||
    typeof value.traceSourcesConfigured !== "number" ||
    typeof value.traceFilesChanged !== "number" ||
    typeof value.traceFilesUnchanged !== "number" ||
    typeof value.traceSessionsImported !== "number" ||
    typeof value.traceToolCallsStored !== "number" ||
    !Array.isArray(value.traceWarnings) ||
    value.traceWarnings.some((warning) => typeof warning !== "string")
  ) {
    return false;
  }
  if (!value.ok && typeof value.error !== "string") {
    return false;
  }
  return true;
}

export function isServiceResponse(value: unknown): value is ServiceResponse {
  if (!isObjectRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.ok !== "boolean") {
    return false;
  }
  if (value.ok) {
    return "result" in value;
  }
  return typeof value.error === "string";
}
