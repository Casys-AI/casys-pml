/**
 * Shared Constants for CLI Commands
 *
 * @module cli/shared/constants
 */

/** PML configuration file name */
export const PML_CONFIG_FILE = ".pml.json";

/** Package version for registration */
export const PACKAGE_VERSION = "0.2.0";

/** Silent logger for initialization (stdio must be clean for JSON-RPC) */
export const SILENT_LOGGER = {
  info: () => {},
  warn: () => {},
};

/**
 * PML base tools - forwarded to cloud server.
 * Names match src/mcp/tools/definitions.ts (pml:discover, pml:execute)
 */
export const PML_TOOLS = [
  {
    name: "pml_discover",
    description: "Search tools",
    inputSchema: {
      type: "object",
      properties: {
        intent: { type: "string" },
      },
      required: ["intent"],
    },
  },
  {
    name: "pml_execute",
    description: "Execute code",
    inputSchema: {
      type: "object",
      properties: {
        intent: { type: "string" },
        code: { type: "string" },
        continue_workflow: {
          type: "object",
          properties: {
            approved: { type: "boolean" },
            workflow_id: { type: "string" },
          },
        },
      },
    },
  },
];

/**
 * Full PML tools with detailed descriptions (for stdio mode).
 */
export const PML_TOOLS_FULL = [
  {
    name: "pml:discover",
    description: "Search MCP tools and learned capabilities by intent. Returns ranked results.",
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "What do you want to accomplish? Natural language description.",
        },
        filter: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["tool", "capability", "all"] },
            minScore: { type: "number" },
          },
        },
        limit: {
          type: "number",
          description: "Maximum results (default: 1, max: 50)",
        },
      },
      required: ["intent"],
    },
  },
  {
    name: "pml:execute",
    description:
      "Execute intent with optional code. With code: runs and learns. Without: returns suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "Natural language description of what you want to accomplish.",
        },
        code: {
          type: "string",
          description: "TypeScript code. MCP tools via mcp.server.tool(). Triggers Direct Mode.",
        },
        options: {
          type: "object",
          properties: {
            timeout: { type: "number" },
            per_layer_validation: { type: "boolean" },
          },
        },
        accept_suggestion: {
          type: "object",
          properties: {
            callName: { type: "string" },
            args: { type: "object" },
          },
        },
        continue_workflow: {
          type: "object",
          properties: {
            workflow_id: { type: "string" },
            approved: { type: "boolean" },
          },
        },
      },
    },
  },
];
