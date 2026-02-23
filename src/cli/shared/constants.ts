/**
 * Shared Constants for CLI Commands
 *
 * @module cli/shared/constants
 */

/** PML configuration file name */
export const PML_CONFIG_FILE = ".pml.json";

/** Package version for registration */
export const PACKAGE_VERSION = "0.2.11";

/** Silent logger for initialization (stdio must be clean for JSON-RPC) */
export const SILENT_LOGGER = {
  info: () => {},
  warn: () => {},
};

/**
 * PML base tools - forwarded to cloud server.
 * Names match src/mcp/tools/definitions.ts (pml_discover, pml_execute, pml_admin)
 */
export const PML_TOOLS = [
  {
    name: "discover",
    description: "Search, list, lookup, or get details for tools and capabilities",
    inputSchema: {
      type: "object",
      properties: {
        intent: { type: "string" },
        pattern: { type: "string" },
        name: { type: "string" },
        id: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "execute",
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
  {
    name: "admin",
    description: "Manage capabilities: rename, merge",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["rename", "merge"] },
        target: { type: "string" },
        source: { type: "string" },
        namespace: { type: "string" },
        action_name: { type: "string" },
      },
      required: ["action"],
    },
  },
];

/**
 * Full PML tools with detailed descriptions (for stdio mode).
 */
export const PML_TOOLS_FULL = [
  {
    name: "discover",
    description:
      "Search, list, lookup, or get details for MCP tools and learned capabilities. Supports semantic search (intent), glob listing (pattern), exact lookup (name), and full metadata (id).",
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "Semantic search: Natural language description of your goal.",
        },
        pattern: {
          type: "string",
          description: "List mode: Glob pattern (e.g., 'auth:*', 'fs:read_*').",
        },
        name: {
          type: "string",
          description: "Lookup mode: Exact name (namespace:action or server:tool).",
        },
        id: {
          type: "string",
          description: "Details mode: UUID or FQDN for full metadata.",
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
          description: "Maximum results (default: 1 for search, 50 for list).",
        },
        offset: {
          type: "number",
          description: "Pagination offset (for list mode).",
        },
      },
    },
  },
  {
    name: "execute",
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
  {
    name: "admin",
    description: "Manage capabilities: rename, merge. Administrative operations.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["rename", "merge"],
          description: "Admin action to perform.",
        },
        target: {
          type: "string",
          description: "Capability name (namespace:action) or UUID to modify.",
        },
        namespace: {
          type: "string",
          description: "New namespace (for rename).",
        },
        action_name: {
          type: "string",
          description: "New action name (for rename).",
        },
        description: {
          type: "string",
          description: "New description (for rename).",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "New tags (for rename).",
        },
        visibility: {
          type: "string",
          enum: ["private", "project", "org", "public"],
          description: "New visibility (for rename).",
        },
        source: {
          type: "string",
          description: "Source capability to merge from (will be deleted).",
        },
        prefer_source_code: {
          type: "boolean",
          description: "Use source code even if older (for merge).",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "abort",
    description: "Stop a running workflow immediately.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "Workflow ID to abort.",
        },
        reason: {
          type: "string",
          description: "Optional reason for abort.",
        },
      },
      required: ["workflow_id"],
    },
  },
  {
    name: "replan",
    description: "Add new tasks to a running workflow based on discovered context.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "Workflow ID to modify.",
        },
        new_tasks: {
          type: "array",
          items: { type: "object" },
          description: "New tasks to add to the workflow.",
        },
        reason: {
          type: "string",
          description: "Reason for replanning.",
        },
      },
      required: ["workflow_id", "new_tasks"],
    },
  },
];
