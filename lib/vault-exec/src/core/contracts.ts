/**
 * Stable contract surface for feature modules.
 * Feature slices should import shared core types from this file
 * instead of reaching into internal core implementation modules.
 */
export type {
  CompiledNode,
  IVaultStore,
  NodeType,
  NoteRow,
  ResultMap,
  TraceRow,
  ValidationError,
  VaultGraph,
  VaultNote,
  VaultReader,
} from "./types.ts";
export type { VaultWriter } from "./io.ts";
