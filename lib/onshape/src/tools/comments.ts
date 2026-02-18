/**
 * Onshape Comment Tools
 *
 * MCP tools for comment operations: create, list, resolve, delete.
 *
 * Onshape API Reference:
 *   - Create: POST /comments
 *   - List: GET /comments?documentId=...
 *   - Resolve: POST /comments/{cid}/resolve
 *   - Delete: DELETE /comments/{cid}
 *
 * @module lib/onshape/tools/comments
 */

import type { OnshapeTool } from "./types.ts";

export const commentTools: OnshapeTool[] = [
  // ── Comment CRUD ──────────────────────────────────────────────────────────

  {
    name: "onshape_comment_create",
    description:
      "Create a comment on an Onshape document. Requires documentId and message. " +
      "Optionally target a specific object (element, part) via objectId and objectType.",
    category: "comments",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Document ID (24-char hex)" },
        message: { type: "string", description: "Comment text content" },
        objectId: {
          type: "string",
          description: "Target object ID (element, part, etc.) — optional",
        },
        objectType: {
          type: "string",
          description: "Target object type (e.g. 'element', 'part') — optional",
        },
      },
      required: ["documentId", "message"],
    },
    handler: async (input, ctx) => {
      if (!input.documentId) {
        throw new Error("[onshape_comment_create] 'documentId' is required");
      }
      if (!input.message) {
        throw new Error("[onshape_comment_create] 'message' is required");
      }

      const body: Record<string, unknown> = {
        documentId: input.documentId as string,
        message: input.message as string,
      };
      if (input.objectId !== undefined) body.objectId = input.objectId as string;
      if (input.objectType !== undefined) body.objectType = input.objectType as string;

      const result = await ctx.client.post<{ id: string }>("/comments", body);
      return {
        data: result,
        message: `Comment ${result.id} created`,
      };
    },
  },

  {
    name: "onshape_comment_list",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
    description:
      "List comments on an Onshape document. Requires documentId. " +
      "Returns a paginated list of comments with author, message, date, and resolved status.",
    category: "comments",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Document ID (24-char hex) — required" },
        offset: { type: "number", description: "Pagination offset (default 0)" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["documentId"],
    },
    handler: async (input, ctx) => {
      if (!input.documentId) {
        throw new Error("[onshape_comment_list] 'documentId' is required");
      }

      const result = await ctx.client.get<{ items?: unknown[] }>(
        "/comments",
        {
          documentId: input.documentId as string,
          offset: (input.offset as number) ?? 0,
          limit: (input.limit as number) ?? 20,
        },
      );

      const items = result.items ?? (Array.isArray(result) ? result : []);
      return {
        count: items.length,
        data: items,
        _meta: { ui: "doclist-viewer" },
      };
    },
  },

  {
    name: "onshape_comment_resolve",
    description:
      "Resolve (close) a comment by its comment ID. Marks the comment as resolved " +
      "so it no longer appears as an active discussion thread.",
    category: "comments",
    inputSchema: {
      type: "object",
      properties: {
        cid: { type: "string", description: "Comment ID to resolve" },
      },
      required: ["cid"],
    },
    handler: async (input, ctx) => {
      if (!input.cid) {
        throw new Error("[onshape_comment_resolve] 'cid' is required");
      }

      const result = await ctx.client.post(`/comments/${input.cid as string}/resolve`);
      return {
        data: result ?? { resolved: true, cid: input.cid as string },
        message: `Comment ${input.cid as string} resolved`,
      };
    },
  },

  {
    name: "onshape_comment_delete",
    description:
      "Permanently delete a comment by its comment ID. This action cannot be undone.",
    category: "comments",
    inputSchema: {
      type: "object",
      properties: {
        cid: { type: "string", description: "Comment ID to delete" },
      },
      required: ["cid"],
    },
    handler: async (input, ctx) => {
      if (!input.cid) {
        throw new Error("[onshape_comment_delete] 'cid' is required");
      }

      await ctx.client.del(`/comments/${input.cid as string}`);
      return {
        data: { deleted: true, cid: input.cid as string },
        message: `Comment ${input.cid as string} deleted`,
      };
    },
  },
];
