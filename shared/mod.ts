/**
 * @casys/pml-types — Shared type contract between PML client and server.
 *
 * This package contains ONLY types that cross the HTTP/JSON-RPC wire.
 * No runtime logic, no dependencies.
 *
 * - PML client (packages/pml/) imports and extends for sandbox/UI specifics
 * - Server (src/) imports and extends for Phase 2a, ML, and persistence specifics
 *
 * @module @casys/pml-types
 */

// Tracing contract
export type {
  BaseExecutionTrace,
  BranchDecision,
  JsonValue,
  TraceTaskResult,
} from "./tracing/types.ts";

// UI contract
export type { FetchedUiHtml, ToolUiMeta } from "./ui/types.ts";

// Discovery contract
export type { McpToolInfo } from "./discovery/types.ts";

// Routing contract
export type { RoutingConfig, ToolRouting } from "./routing/types.ts";

// Execution contract
export type { ApprovalType, DAGTask } from "./execution/types.ts";
