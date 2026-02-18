/**
 * Onshape User & Team Tools
 *
 * MCP tools for user and team operations: session info, team details, team members.
 *
 * Onshape API Reference:
 *   - Session Info: GET /users/sessioninfo
 *   - Team: GET /teams/{tid}
 *   - Team Members: GET /teams/{tid}/members
 *
 * @module lib/onshape/tools/users
 */

import type { OnshapeTool } from "./types.ts";

export const userTools: OnshapeTool[] = [
  // ── Users ─────────────────────────────────────────────────────────────────

  {
    name: "onshape_user_session_info",
    description:
      "Get the current authenticated user's session information. Returns user ID, name, email, " +
      "company info, and permissions. Useful for verifying API credentials and user context.",
    category: "users",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (_input, ctx) => {
      const result = await ctx.client.get("/users/sessioninfo");
      return { data: result };
    },
  },

  // ── Teams ─────────────────────────────────────────────────────────────────

  {
    name: "onshape_team_get",
    description:
      "Get a team by its team ID. Returns team details including name, description, " +
      "and owner information.",
    category: "users",
    inputSchema: {
      type: "object",
      properties: {
        tid: { type: "string", description: "Team ID" },
      },
      required: ["tid"],
    },
    handler: async (input, ctx) => {
      if (!input.tid) {
        throw new Error("[onshape_team_get] 'tid' is required");
      }
      const result = await ctx.client.get(`/teams/${input.tid as string}`);
      return { data: result };
    },
  },

  {
    name: "onshape_team_members",
    _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
    description:
      "Get members of a team by team ID. Returns a list of team members " +
      "with user ID, name, email, and role within the team.",
    category: "users",
    inputSchema: {
      type: "object",
      properties: {
        tid: { type: "string", description: "Team ID" },
      },
      required: ["tid"],
    },
    handler: async (input, ctx) => {
      if (!input.tid) {
        throw new Error("[onshape_team_members] 'tid' is required");
      }

      const result = await ctx.client.get<unknown[]>(
        `/teams/${input.tid as string}/members`,
      );

      const items = Array.isArray(result) ? result : [];
      return {
        count: items.length,
        data: items,
        _meta: { ui: { resourceUri: "ui://mcp-onshape/doclist-viewer" } },
      };
    },
  },
];
