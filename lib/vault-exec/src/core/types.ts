/** The three node types in a vault program */
export type NodeType = "value" | "code" | "tool";

/** A parsed note from the vault */
export interface VaultNote {
  /** File path relative to vault root */
  path: string;
  /** Note title (from filename, without .md) */
  name: string;
  /** Raw markdown body (without frontmatter) */
  body: string;
  /** Parsed frontmatter */
  frontmatter: Record<string, unknown>;
  /** Wikilinks found in the note body: [[Target Note]] */
  wikilinks: string[];
}

/** A compiled node ready for execution */
export interface CompiledNode {
  name: string;
  type: NodeType;
  /** For value nodes: the literal value */
  value?: unknown;
  /** For code nodes: the JS expression to evaluate */
  code?: string;
  /** For tool nodes (Phase 2): MCP tool identifier */
  tool?: string;
  /** Input bindings: { paramName: "{{NoteName.output}}" } */
  inputs: Record<string, string>;
  /** Named outputs this node produces */
  outputs: string[];
  /** Optional JSON Schema fragment for runtime inputs (frontmatter: input_schema) */
  inputSchema?: Record<string, unknown>;
}

/** The executable graph */
export interface VaultGraph {
  nodes: Map<string, CompiledNode>;
  /** adjacency list: node name → names of nodes it depends on */
  edges: Map<string, string[]>;
}

/** Result of executing a node */
export type ResultMap = Map<string, Record<string, unknown>>;

/** Injectable I/O for reading vault files */
export interface VaultReader {
  listNotes(dir: string): Promise<string[]>;
  readNote(path: string): Promise<string>;
}

/** Validation error */
export interface ValidationError {
  type:
    | "cycle"
    | "missing_dependency"
    | "unresolved_input"
    | "no_outputs"
    | "unknown_type";
  node: string;
  message: string;
}

// ── Cross-feature relations/events/storage contracts ───────────────────────

export type VirtualEdgeStatus = "candidate" | "promoted" | "rejected";

export interface VirtualEdgeRow {
  source: string;
  target: string;
  score: number;
  support: number;
  rejects: number;
  status: VirtualEdgeStatus;
  promotedAt?: string;
  updatedAt: string;
}

export interface VirtualEdgeUpdate {
  source: string;
  target: string;
  scoreDelta: number;
  reason:
    | "selected_path"
    | "rejected_candidate"
    | "execution_success"
    | "execution_failure";
}

export interface ExecutionTrace {
  intent?: string;
  intentEmbedding?: number[];
  targetNote: string;
  path: string[];
  success: boolean;
  synthetic: boolean;
}

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

/** Storage port shared by workflows/features. */
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
  getVirtualEdge(
    source: string,
    target: string,
  ): Promise<VirtualEdgeRow | null>;
  saveVirtualEdge(row: VirtualEdgeRow): Promise<void>;
  listVirtualEdges(status?: VirtualEdgeStatus): Promise<VirtualEdgeRow[]>;
  setVirtualEdgeStatus(
    source: string,
    target: string,
    status: VirtualEdgeStatus,
  ): Promise<void>;

  // GNN params
  saveGnnParams(
    params: Uint8Array,
    epoch: number,
    accuracy: number,
  ): Promise<void>;
  getGnnParams(): Promise<
    {
      params: Uint8Array;
      epoch: number;
      accuracy: number;
    } | null
  >;

  // GRU weights
  saveGruWeights(
    weights: Uint8Array,
    vocabSize: number,
    epoch: number,
    accuracy: number,
  ): Promise<void>;
  getLatestWeights(): Promise<
    {
      blob: Uint8Array;
      vocabSize: number;
      epoch: number;
      accuracy: number;
    } | null
  >;
}
