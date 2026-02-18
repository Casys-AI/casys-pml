/**
 * Onshape Document Tools
 *
 * MCP tools for document operations: CRUD, sharing, elements, history, permissions.
 *
 * Onshape API Reference:
 *   - Documents: GET/POST/DELETE /documents, /documents/{did}
 *   - Elements: GET /documents/d/{did}/w/{wid}/elements
 *   - Sharing: POST/DELETE /documents/{did}/share
 *   - ACL: GET /documents/{did}/acl
 *   - Units: GET /documents/d/{did}/w/{wid}/unitinfo
 *   - History: GET /documents/{did}/history
 *
 * @module lib/onshape/tools/documents
 */

import type { OnshapeTool } from "./types.ts";

export const documentTools: OnshapeTool[] = [
  // ── Document CRUD ──────────────────────────────────────────────────────────

  {
    name: "onshape_document_list",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
    description:
      "List Onshape documents. Filterable by search query, owner, sort. " +
      "Returns a paginated list of documents with id, name, owner, createdAt, modifiedAt.",
    category: "documents",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query to filter documents by name" },
        offset: { type: "number", description: "Pagination offset (default 0)" },
        limit: { type: "number", description: "Max results (default 20)" },
        owner: { type: "string", description: "Owner user ID to filter by" },
        sortColumn: {
          type: "string",
          description: "Column to sort by (e.g. 'createdAt', 'modifiedAt', 'name')",
        },
        sortOrder: {
          type: "string",
          description: "Sort direction: 'asc' or 'desc'",
          enum: ["asc", "desc"],
        },
      },
    },
    handler: async (input, ctx) => {
      const result = await ctx.client.get<{ items: unknown[]; next?: string }>(
        "/documents",
        {
          q: input.q as string | undefined,
          offset: (input.offset as number) ?? 0,
          limit: (input.limit as number) ?? 20,
          owner: input.owner as string | undefined,
          sortColumn: input.sortColumn as string | undefined,
          sortOrder: input.sortOrder as string | undefined,
        },
      );

      const items = result.items ?? [];
      return {
        count: items.length,
        data: items,
        _meta: { ui: "doclist-viewer" },
      };
    },
  },

  {
    name: "onshape_document_get",
    description:
      "Get a single Onshape document by its document ID (24-char hex). " +
      "Returns the full document object including name, owner, default workspace, created/modified dates.",
    category: "documents",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex string)" },
      },
      required: ["did"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_document_get] 'did' is required");
      }
      const doc = await ctx.client.get(`/documents/${input.did as string}`);
      return { data: doc };
    },
  },

  {
    name: "onshape_document_create",
    description:
      "Create a new Onshape document. Requires a name. Optionally set description, " +
      "visibility (isPublic), and owner. Returns the created document with its new ID.",
    category: "documents",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Document name" },
        description: { type: "string", description: "Document description" },
        isPublic: {
          type: "boolean",
          description: "Whether the document is publicly visible (default false)",
        },
        ownerId: {
          type: "string",
          description: "Owner user/company ID. Defaults to the authenticated user.",
        },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[onshape_document_create] 'name' is required");
      }

      const body: Record<string, unknown> = { name: input.name as string };
      if (input.description !== undefined) body.description = input.description as string;
      if (input.isPublic !== undefined) body.isPublic = input.isPublic as boolean;
      if (input.ownerId !== undefined) body.ownerId = input.ownerId as string;

      const doc = await ctx.client.post<{ id: string; name: string }>("/documents", body);
      return {
        data: doc,
        message: `Document '${doc.name}' created (id: ${doc.id})`,
      };
    },
  },

  {
    name: "onshape_document_delete",
    description:
      "Permanently delete an Onshape document by its document ID. This action cannot be undone.",
    category: "documents",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID to delete (24-char hex)" },
      },
      required: ["did"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_document_delete] 'did' is required");
      }
      await ctx.client.del(`/documents/${input.did as string}`);
      return {
        data: { deleted: true, did: input.did as string },
        message: `Document ${input.did as string} deleted`,
      };
    },
  },

  {
    name: "onshape_document_update",
    description:
      "Update an Onshape document's name or description. " +
      "Onshape uses POST (not PUT/PATCH) for updates. At least one field must be provided.",
    category: "documents",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID to update (24-char hex)" },
        name: { type: "string", description: "New document name" },
        description: { type: "string", description: "New document description" },
      },
      required: ["did"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_document_update] 'did' is required");
      }

      const body: Record<string, unknown> = {};
      if (input.name !== undefined) body.name = input.name as string;
      if (input.description !== undefined) body.description = input.description as string;

      if (Object.keys(body).length === 0) {
        throw new Error(
          "[onshape_document_update] At least one of 'name' or 'description' must be provided",
        );
      }

      const doc = await ctx.client.post(`/documents/${input.did as string}`, body);
      return { data: doc };
    },
  },

  // ── Elements & History ─────────────────────────────────────────────────────

  {
    name: "onshape_document_elements",
    description:
      "List all elements (Part Studios, Assemblies, Drawings, etc.) in a document workspace. " +
      "Requires both document ID and workspace ID.",
    category: "documents",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wid: { type: "string", description: "Workspace ID (24-char hex)" },
      },
      required: ["did", "wid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_document_elements] 'did' is required");
      }
      if (!input.wid) {
        throw new Error("[onshape_document_elements] 'wid' is required");
      }

      const elements = await ctx.client.get<unknown[]>(
        `/documents/d/${input.did as string}/w/${input.wid as string}/elements`,
      );

      return {
        count: elements.length,
        data: elements,
      };
    },
  },

  {
    name: "onshape_document_history",
    description:
      "Get the change history of a document. Returns a paginated list of history entries " +
      "with user, date, and description of each change.",
    category: "documents",
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
        throw new Error("[onshape_document_history] 'did' is required");
      }

      const result = await ctx.client.get<unknown[]>(
        `/documents/${input.did as string}/history`,
        {
          offset: (input.offset as number) ?? 0,
          limit: (input.limit as number) ?? 20,
        },
      );

      const entries = Array.isArray(result) ? result : [];
      return {
        count: entries.length,
        data: entries,
      };
    },
  },

  // ── Sharing & Permissions ──────────────────────────────────────────────────

  {
    name: "onshape_document_share",
    description:
      "Share a document with one or more users. Each entry requires an email and a permission level. " +
      "Permissions: OWNER, WRITE, READ, LINK, COPY, COMMENT, RESHARE, FULL, ANONYMOUS.",
    category: "documents",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID to share (24-char hex)" },
        entries: {
          type: "array",
          description: "Share entries: [{email, userId?, permission}]",
          items: {
            type: "object",
            properties: {
              email: { type: "string", description: "User email to share with" },
              userId: { type: "string", description: "User ID (optional, alternative to email)" },
              permission: {
                type: "string",
                description: "Permission level (e.g. READ, WRITE, FULL)",
              },
            },
            required: ["email", "permission"],
          },
        },
      },
      required: ["did", "entries"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_document_share] 'did' is required");
      }
      if (!input.entries || !Array.isArray(input.entries) || input.entries.length === 0) {
        throw new Error("[onshape_document_share] 'entries' must be a non-empty array");
      }

      const entries = (
        input.entries as Array<{ email: string; userId?: string; permission: string }>
      ).map((entry) => {
        if (!entry.email || !entry.permission) {
          throw new Error(
            "[onshape_document_share] Each entry must have 'email' and 'permission'",
          );
        }
        const mapped: Record<string, string> = {
          email: entry.email,
          permission: entry.permission,
        };
        if (entry.userId) mapped.userId = entry.userId;
        return mapped;
      });

      const result = await ctx.client.post(
        `/documents/${input.did as string}/share`,
        { entries },
      );
      return { data: result };
    },
  },

  {
    name: "onshape_document_unshare",
    description:
      "Remove a share entry from a document. Requires the document ID and the share entry ID " +
      "(obtained from the ACL/permissions endpoint).",
    category: "documents",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        eid: { type: "string", description: "Share entry ID to remove" },
      },
      required: ["did", "eid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_document_unshare] 'did' is required");
      }
      if (!input.eid) {
        throw new Error("[onshape_document_unshare] 'eid' is required");
      }

      await ctx.client.del(
        `/documents/${input.did as string}/share/${input.eid as string}`,
      );
      return {
        data: { unshared: true, did: input.did as string, eid: input.eid as string },
        message: `Share entry ${input.eid as string} removed from document ${input.did as string}`,
      };
    },
  },

  // ── Search ─────────────────────────────────────────────────────────────────

  {
    name: "onshape_document_search",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
    description:
      "Search Onshape documents by name/keyword. Uses the same endpoint as document_list " +
      "but focused on the search query. Returns matching documents with id, name, owner.",
    category: "documents",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query (searches document names)" },
        offset: { type: "number", description: "Pagination offset (default 0)" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["q"],
    },
    handler: async (input, ctx) => {
      if (!input.q) {
        throw new Error("[onshape_document_search] 'q' (search query) is required");
      }

      const result = await ctx.client.get<{ items: unknown[]; next?: string }>(
        "/documents",
        {
          q: input.q as string,
          offset: (input.offset as number) ?? 0,
          limit: (input.limit as number) ?? 20,
        },
      );

      const items = result.items ?? [];
      return {
        count: items.length,
        data: items,
        _meta: { ui: "doclist-viewer" },
      };
    },
  },

  // ── Permissions & Units ────────────────────────────────────────────────────

  {
    name: "onshape_document_permissions",
    description:
      "Get the access control list (ACL) for a document. Returns all share entries " +
      "with user info, permission levels, and entry IDs (useful for unshare).",
    category: "documents",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
      },
      required: ["did"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_document_permissions] 'did' is required");
      }

      const acl = await ctx.client.get(`/documents/${input.did as string}/acl`);
      return { data: acl };
    },
  },

  {
    name: "onshape_document_units",
    description:
      "Get the unit system configuration for a document workspace. " +
      "Returns length, mass, angle, and other unit settings.",
    category: "documents",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Document ID (24-char hex)" },
        wid: { type: "string", description: "Workspace ID (24-char hex)" },
      },
      required: ["did", "wid"],
    },
    handler: async (input, ctx) => {
      if (!input.did) {
        throw new Error("[onshape_document_units] 'did' is required");
      }
      if (!input.wid) {
        throw new Error("[onshape_document_units] 'wid' is required");
      }

      const units = await ctx.client.get(
        `/documents/d/${input.did as string}/w/${input.wid as string}/unitinfo`,
      );
      return { data: units };
    },
  },
];
