/**
 * Shared CLI Utilities
 *
 * Common functionality between serve-command and stdio-command.
 *
 * @module cli/shared
 */

// Types
export type {
  LocalExecutionResult,
  PendingApprovalState,
  ResolvedTool,
  ExecuteLocallyResponse,
  ContinueWorkflowParams,
  CloudForwardResult,
  Logger,
  AnyApprovalResult,
} from "./types.ts";

// Constants
export {
  PML_CONFIG_FILE,
  PACKAGE_VERSION,
  SILENT_LOGGER,
  PML_TOOLS,
  PML_TOOLS_FULL,
} from "./constants.ts";

// Cloud client
export { forwardToCloud } from "./cloud-client.ts";

// Workflow utilities
export {
  extractContinueWorkflow,
  parseExecuteLocallyResponse,
} from "./workflow-utils.ts";

// Approval formatter
export { formatApprovalRequired } from "./approval-formatter.ts";

// Local executor
export { executeLocalCode } from "./local-executor.ts";

// Response builder (Story 16.3: MCP response with _meta.ui)
export { buildMcpSuccessResult, buildMcpLocalResult, type ApprovalContext } from "./response-builder.ts";

// Capability resolver (--expose flag)
export {
  resolveExposedCapabilities,
  buildExposedToolDefinitions,
  sanitizeToolName,
  type ExposedCapability,
} from "./capability-resolver.ts";

// Exposed capability handler (--expose execution routing)
export {
  handleExposedCall,
  findExposedCapability,
  type ExposedCallResult,
  type ExposedCallContext,
} from "./exposed-handler.ts";
