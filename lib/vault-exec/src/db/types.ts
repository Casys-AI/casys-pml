// Shared types for vault storage backends (VaultDB and VaultKV).
import type { VirtualEdgeRow, VirtualEdgeStatus, VirtualEdgeUpdate } from "../links/types.ts";

export interface NoteRow {
  name: string;
  path: string;
  bodyHash: string;
  level: number;
  embedding?: number[];
  gnnEmbedding?: number[];
}

export interface TraceRow {
  id?: number;
  intent?: string;
  intentEmbedding?: number[];
  targetNote: string;
  path: string[];
  success?: boolean;
  synthetic: boolean;
  executedAt?: string;
}

/** Common interface for vault storage backends. Implemented by VaultKV (Deno KV). */
export interface IVaultStore {
  close(): void;

  // Notes
  upsertNote(note: NoteRow): Promise<void>;
  getAllNotes(): Promise<NoteRow[]>;
  updateNoteEmbedding(name: string, embedding: number[]): Promise<void>;
  updateNoteGnnEmbedding(name: string, gnnEmbedding: number[]): Promise<void>;

  // Edges
  setEdges(source: string, targets: string[]): Promise<void>;
  getEdges(source: string): Promise<string[]>;

  // Traces
  insertTrace(trace: TraceRow): Promise<void>;
  getAllTraces(): Promise<TraceRow[]>;

  // Virtual edges
  upsertVirtualEdge(update: VirtualEdgeUpdate): Promise<VirtualEdgeRow>;
  listVirtualEdges(status?: VirtualEdgeStatus): Promise<VirtualEdgeRow[]>;
  setVirtualEdgeStatus(
    source: string,
    target: string,
    status: VirtualEdgeStatus,
  ): Promise<void>;
  applyVirtualEdgeDecay(factor: number): Promise<number>;

  // GNN params
  saveGnnParams(
    params: Uint8Array,
    epoch: number,
    accuracy: number,
  ): Promise<void>;
  getGnnParams(): Promise<{
    params: Uint8Array;
    epoch: number;
    accuracy: number;
  } | null>;

  // GRU weights
  saveGruWeights(
    weights: Uint8Array,
    vocabSize: number,
    epoch: number,
    accuracy: number,
  ): Promise<void>;
  getLatestWeights(): Promise<{
    blob: Uint8Array;
    vocabSize: number;
    epoch: number;
    accuracy: number;
  } | null>;
}
