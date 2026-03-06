import { resolveSessionDate } from "../session-date.ts";
import type { ParsedOpenClawSession } from "../types.ts";

export interface CanonicalToolCallRow {
  sourceId: string;
  sessionId: string;
  sessionDate: string;
  turnIndex: number;
  toolName: string;
  family: string | null;
  l2Hit: boolean;
  fallbackReason?: string;
  fingerprint: string;
}

function ensureBoundedString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`[canonicalize] Invalid ${field}`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`[canonicalize] Invalid ${field}`);
  }
  return normalized;
}

function ensureOptionalBoundedString(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  return ensureBoundedString(value, field, maxLength);
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function canonicalSessionId(sessionId: string): Promise<string> {
  const normalized = ensureBoundedString(sessionId, "sessionId", 512);
  return (await sha256Hex(normalized)).slice(0, 16);
}

export async function canonicalizeSession(
  session: ParsedOpenClawSession,
  sourceId: string,
): Promise<CanonicalToolCallRow[]> {
  const normalizedSourceId = ensureBoundedString(sourceId, "sourceId", 256);
  const canonicalSession = await canonicalSessionId(session.sessionId);
  const sessionDate = resolveSessionDate(session.startedAt);
  const rows: CanonicalToolCallRow[] = [];

  for (const turn of session.turns) {
    if (!Number.isInteger(turn.index) || turn.index <= 0) {
      throw new Error(`[canonicalize] Invalid turnIndex at turn ${turn.index}`);
    }

    for (let i = 0; i < turn.toolCalls.length; i++) {
      const call = turn.toolCalls[i];
      const toolName = ensureBoundedString(
        call.toolName,
        `toolName at turn ${turn.index} call ${i}`,
        128,
      );
      const family = call.family === null
        ? null
        : ensureBoundedString(
          call.family,
          `family at turn ${turn.index} call ${i}`,
          128,
        );
      const fallbackReason = ensureOptionalBoundedString(
        call.l2FallbackReason,
        `fallbackReason at turn ${turn.index} call ${i}`,
        128,
      );

      const fingerprint = await sha256Hex(JSON.stringify({
        sourceId: normalizedSourceId,
        sessionId: canonicalSession,
        sessionDate,
        turnIndex: turn.index,
        toolName,
        family,
        l2Hit: call.l2Hit,
        fallbackReason,
      }));

      rows.push({
        sourceId: normalizedSourceId,
        sessionId: canonicalSession,
        sessionDate,
        turnIndex: turn.index,
        toolName,
        family,
        l2Hit: call.l2Hit,
        fallbackReason,
        fingerprint,
      });
    }
  }

  return rows;
}
