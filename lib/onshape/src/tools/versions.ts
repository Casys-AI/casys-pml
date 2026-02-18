/**
 * Onshape Version & Workspace Tools
 *
 * MCP tools for version and workspace operations: create, list, delete, merge.
 *
 * Onshape API Reference:
 *   - Versions: GET/POST /documents/d/{did}/versions, GET /documents/d/{did}/versions/{vid}
 *   - Workspaces: GET/POST/DELETE /documents/d/{did}/workspaces
 *   - Merge: POST /documents/{did}/w/{wid}/merge, GET /documents/{did}/w/{wid}/mergePreview
 *
 * @module lib/onshape/tools/versions
 */

import type { OnshapeTool } from "./types.ts";

export const versionTools: OnshapeTool[] = [
  // ── Versions ───────────────────────────────────────────────────────────────

  {
    name: "onshape_version_create",
    description:
      "Create a named version (snapshot) of a document. Versions are immutable references " +
      "to a specific state of all elements in the document. Requires the document ID and a version name.",
    category: "versions",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        name: { type: "string", description: "Version name (e.g. 'V1', 'Release 2.0')" },
        description: { type: "string", description: "Optional version description" },
      },
      required: ["did", "name"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_version_create] 'did' is required");
      }
      if (!input.name) {
        throw new Error("[onshape_version_create] 'name' is required");
      }

      const body: Record<string, unknown> = {
        name: input.name as string,
        documentId: input.did as string,
      };
      if (input.description !== undefined) body.description = input.description as string;

      const version = await ctx.client.post<{ id: string; name: string }>(
        `/documents/d/${input.did as string}/versions`,
        body,
      );
      return {
        data: version,
        message: `Version '${version.name}' created (id: ${version.id})`,
      };
    },
  },

  {
    name: "onshape_version_list",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
    description:
      "List all versions of a document. Returns version name, ID, description, creator, " +
      "and creation date. Use offset/limit for pagination.",
    category: "versions",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        offset: { type: "number", description: "Pagination offset (default 0)" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["did"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_version_list] 'did' is required");
      }

      const result = await ctx.client.get<unknown[]>(
        `/documents/d/${input.did as string}/versions`,
        {
          offset: (input.offset as number) ?? 0,
          limit: (input.limit as number) ?? 20,
        },
      );

      const items = Array.isArray(result) ? result : [];
      return {
        count: items.length,
        data: items,
        _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
      };
    },
  },

  {
    name: "onshape_version_get",
    description:
      "Get a single version by document ID and version ID. Returns version details " +
      "including name, description, creator, creation date, and microversion.",
    category: "versions",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        vid: { type: "string", description: "Version ID (24-char hex)" },
      },
      required: ["did", "vid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_version_get] 'did' is required");
      }
      if (!input.vid) {
        throw new Error("[onshape_version_get] 'vid' is required");
      }

      const version = await ctx.client.get(
        `/documents/d/${input.did as string}/versions/${input.vid as string}`,
      );
      return { data: version };
    },
  },

  // ── Workspaces ─────────────────────────────────────────────────────────────

  {
    name: "onshape_workspace_create",
    description:
      "Create a new workspace (branch) in a document. Workspaces are mutable copies of the document " +
      "that can be edited independently and later merged back.",
    category: "versions",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        name: { type: "string", description: "Workspace name (e.g. 'feature-bracket-redesign')" },
        description: { type: "string", description: "Optional workspace description" },
      },
      required: ["did", "name"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_workspace_create] 'did' is required");
      }
      if (!input.name) {
        throw new Error("[onshape_workspace_create] 'name' is required");
      }

      const body: Record<string, unknown> = { name: input.name as string };
      if (input.description !== undefined) body.description = input.description as string;

      const workspace = await ctx.client.post<{ id: string; name: string }>(
        `/documents/d/${input.did as string}/workspaces`,
        body,
      );
      return {
        data: workspace,
        message: `Workspace '${workspace.name}' created (id: ${workspace.id})`,
      };
    },
  },

  {
    name: "onshape_workspace_list",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
    description:
      "List all workspaces in a document. Returns workspace name, ID, description, " +
      "creator, and whether it's the default workspace.",
    category: "versions",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
      },
      required: ["did"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_workspace_list] 'did' is required");
      }

      const result = await ctx.client.get<unknown[]>(
        `/documents/d/${input.did as string}/workspaces`,
      );

      const items = Array.isArray(result) ? result : [];
      return {
        count: items.length,
        data: items,
        _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
      };
    },
  },

  {
    name: "onshape_workspace_delete",
    description:
      "Delete a workspace from a document. The default workspace cannot be deleted. " +
      "Any unmerged changes in the workspace will be lost.",
    category: "versions",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wid: { type: "string", description: "Workspace ID to delete (24-char hex)" },
      },
      required: ["did", "wid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_workspace_delete] 'did' is required");
      }
      if (!input.wid) {
        throw new Error("[onshape_workspace_delete] 'wid' is required");
      }

      await ctx.client.del(
        `/documents/d/${input.did as string}/workspaces/${input.wid as string}`,
      );
      return {
        data: { deleted: true, did: input.did as string, wid: input.wid as string },
        message: `Workspace ${input.wid as string} deleted from document ${input.did as string}`,
      };
    },
  },

  // ── Merge ──────────────────────────────────────────────────────────────────

  {
    name: "onshape_workspace_merge",
    description:
      "Merge a workspace into a target version. This applies all changes from the workspace " +
      "to the specified version. Conflicts may require manual resolution.",
    category: "versions",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wid: { type: "string", description: "Source workspace ID to merge from (24-char hex)" },
        versionId: {
          type: "string",
          description: "Target version ID to merge into (24-char hex)",
        },
      },
      required: ["did", "wid", "versionId"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_workspace_merge] 'did' is required");
      }
      if (!input.wid) {
        throw new Error("[onshape_workspace_merge] 'wid' is required");
      }
      if (!input.versionId) {
        throw new Error("[onshape_workspace_merge] 'versionId' is required");
      }

      const result = await ctx.client.post(
        `/documents/${input.did as string}/w/${input.wid as string}/merge`,
        { versionId: input.versionId as string },
      );
      return { data: result };
    },
  },

  {
    name: "onshape_workspace_merge_preview",
    description:
      "Preview what would happen if a workspace were merged. Returns a list of changes, " +
      "conflicts, and affected elements without actually performing the merge.",
    category: "versions",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wid: { type: "string", description: "Workspace ID to preview merge for (24-char hex)" },
      },
      required: ["did", "wid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_workspace_merge_preview] 'did' is required");
      }
      if (!input.wid) {
        throw new Error("[onshape_workspace_merge_preview] 'wid' is required");
      }

      const preview = await ctx.client.get(
        `/documents/${input.did as string}/w/${input.wid as string}/mergePreview`,
      );
      return { data: preview };
    },
  },
];
