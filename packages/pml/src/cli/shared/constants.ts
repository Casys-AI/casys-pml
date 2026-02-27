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
        offset: { type: "number" },
        include_related: { type: "boolean" },
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
            workflow_id: { type: "string" },
            approved: { type: "boolean" },
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
        new_namespace: { type: "string" },
        new_action: { type: "string" },
        description: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        visibility: { type: "string", enum: ["private", "project", "org", "public"] },
        prefer_source_code: { type: "boolean" },
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
      "Search, list, lookup, or get details for MCP tools and learned capabilities. " +
      "Supports semantic search (intent), glob listing (pattern), exact lookup (name), and full metadata (id).",
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
        details: {
          type: "boolean",
          description: "Include full metadata (parameters, code, embeddings) in results.",
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
        include_related: {
          type: "boolean",
          description: "Include related tools/capabilities in results.",
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
    description:
      "Manage capabilities: rename, merge.\n" +
      "RENAME: Provide 'target' (current name) and at least one of 'new_namespace' or 'new_action'.\n" +
      "  Example: {action:'rename', target:'code:exec_abc123', new_namespace:'syson', new_action:'createProject', description:'Create a SysON project'}\n" +
      "MERGE: Provide 'target' (capability to keep) and 'source' (capability to delete).\n" +
      "  Example: {action:'merge', target:'syson:createProject', source:'code:exec_abc123'}",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["rename", "merge"],
          description: "Operation type: 'rename' to update a capability, 'merge' to combine two capabilities.",
        },
        target: {
          type: "string",
          description:
            "The capability to operate on (namespace:action format or UUID). " +
            "For RENAME: the capability to modify. For MERGE: the capability to KEEP.",
        },
        new_namespace: {
          type: "string",
          description: "RENAME: New namespace (lowercase letters/numbers, must start with letter). E.g. 'syson', 'db', 'git'.",
        },
        new_action: {
          type: "string",
          description: "RENAME: New action name (camelCase or snake_case). E.g. 'createProject', 'list_tables'.",
        },
        description: {
          type: "string",
          description: "RENAME: New description for the capability.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "RENAME: New tags for the capability.",
        },
        visibility: {
          type: "string",
          enum: ["private", "project", "org", "public"],
          description: "RENAME: New visibility level.",
        },
        source: {
          type: "string",
          description: "MERGE: Capability to DELETE and merge into target (namespace:action, UUID, or FQDN).",
        },
        prefer_source_code: {
          type: "boolean",
          description: "MERGE: If true, use source's code even if older. Default: use newest.",
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
