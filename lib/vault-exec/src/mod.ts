/**
 * @module @casys/vault-exec
 *
 * Public API surface for vault-exec.
 * Obsidian vault -> executable DAG with GNN routing.
 */

// ── Core primitives ─────────────────────────────────────────────────────────

export { parseNote, parseVault } from "./core/parser.ts";
export { buildGraph, detectCycles, topologicalSort } from "./core/graph.ts";
export { validate } from "./core/validator.ts";
export { executeGraph } from "./core/executor.ts";

// ── Core types ──────────────────────────────────────────────────────────────

export type {
  CompiledNode,
  ExecutionTrace,
  IVaultStore,
  NodeType,
  NoteRow,
  ResultMap,
  TraceRow,
  ValidationError,
  VaultGraph,
  VaultNote,
  VaultReader,
  VirtualEdgeRow,
  VirtualEdgeUpdate,
} from "./core/types.ts";

export type { VaultWriter } from "./core/io.ts";

// ── Workflows ───────────────────────────────────────────────────────────────

export { runVaultCommand } from "./workflows/run.ts";
export type { RunCommandOptions } from "./workflows/run.ts";

export { initVaultWithTraceImport } from "./workflows/init.ts";
export type {
  InitResult,
  InitWithTraceImportResult,
} from "./workflows/init.ts";

// ── DB / Store ──────────────────────────────────────────────────────────────

export { openVaultStore } from "./db/index.ts";

// ── CLI runtime ─────────────────────────────────────────────────────────────

export { errorJson, eventJson } from "./cli-runtime/output.ts";
export type { ErrorCategory } from "./cli-runtime/output.ts";
export {
  EXIT_CODE_RUNTIME,
  EXIT_CODE_VALIDATION,
} from "./cli-runtime/exit-codes.ts";
