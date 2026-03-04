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
  type: "cycle" | "missing_dependency" | "unresolved_input" | "no_outputs" | "unknown_type";
  node: string;
  message: string;
}
