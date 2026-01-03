/**
 * Server Detail Page
 *
 * Shows all tools from a specific server with:
 * - Left panel: tools list
 * - Right panel: selected tool schema viewer
 *
 * URL: /catalog/:serverId
 * - For std tools: /catalog/std-database, /catalog/std-docker, etc.
 * - For other servers: /catalog/serena, /catalog/playwright, etc.
 *
 * @module web/routes/catalog/[serverId]
 */

import { page } from "fresh";
import type { FreshContext } from "fresh";
import { Head } from "fresh/runtime";
import type { AuthState } from "../_middleware.ts";
import { getRawDb } from "../../../server/auth/db.ts";
import ServerDetailIsland from "../../islands/ServerDetailIsland.tsx";

interface ToolEntry {
  id: string;
  name: string;
  description: string | null;
  routing: "local" | "cloud";
  inputSchema: Record<string, unknown> | null;
}

interface ServerDetailData {
  serverId: string;
  displayName: string;
  description: string;
  tools: ToolEntry[];
  isCloudMode: boolean;
  user: AuthState["user"];
}

/**
 * Get display name for a server (minimal logic - descriptions come from DB)
 */
function getDisplayName(serverId: string): string {
  // Handle std-{category} format
  if (serverId.startsWith("std-")) {
    const category = serverId.substring(4);
    return category.charAt(0).toUpperCase() + category.slice(1);
  }
  return serverId;
}

/**
 * Generate description from first few tool descriptions
 */
function generateDescription(tools: ToolEntry[], displayName: string): string {
  // Get first tool with a description
  const withDesc = tools.find((t) => t.description);
  if (withDesc && withDesc.description) {
    // Use first sentence or truncate
    const firstSentence = withDesc.description.split(".")[0];
    if (firstSentence.length < 100) {
      return `${displayName} tools: ${firstSentence.toLowerCase()}`;
    }
  }
  return `${tools.length} tools from ${displayName}`;
}

/**
 * Query tools for a specific server
 */
async function loadServerTools(serverId: string): Promise<ToolEntry[]> {
  try {
    const db = await getRawDb();

    // Handle std-{category} format
    let whereClause: string;
    let params: unknown[];

    if (serverId.startsWith("std-")) {
      const category = serverId.substring(4);
      // Match tools that start with category_
      whereClause = "server_id = 'std' AND name LIKE $1";
      params = [`${category}_%`];
    } else {
      whereClause = "server_id = $1";
      params = [serverId];
    }

    const rows = await db.query<{
      tool_id: string;
      name: string;
      description: string | null;
      routing: "local" | "cloud";
      input_schema: Record<string, unknown> | null;
    }>(`
      SELECT
        tool_id,
        name,
        description,
        routing,
        input_schema
      FROM tool_schema
      WHERE ${whereClause}
      ORDER BY name
    `, params);

    return rows.map((row) => ({
      id: row.tool_id,
      name: row.name,
      description: row.description,
      routing: row.routing,
      // input_schema is already parsed as JSONB from PostgreSQL
      inputSchema: row.input_schema as Record<string, unknown> | null,
    }));
  } catch (error) {
    console.error("Error loading server tools:", error);
    return [];
  }
}

export const handler = {
  async GET(ctx: FreshContext<AuthState>) {
    const serverId = ctx.params.serverId;
    const tools = await loadServerTools(serverId);
    const displayName = getDisplayName(serverId);
    const description = generateDescription(tools, displayName);

    return page({
      serverId,
      displayName,
      description,
      tools,
      isCloudMode: ctx.state.isCloudMode,
      user: ctx.state.user,
    });
  },
};

export default function ServerDetailPage({ data }: { data: ServerDetailData }) {
  const { serverId, displayName, description, tools, isCloudMode, user } = data;

  return (
    <>
      <Head>
        <title>{displayName} - MCP Server - Casys PML</title>
        <meta
          name="description"
          content={`${description}. Browse ${tools.length} MCP tools with input schemas.`}
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>

      <ServerDetailIsland
        serverId={serverId}
        displayName={displayName}
        description={description}
        tools={tools}
        user={user}
        isCloudMode={isCloudMode}
      />
    </>
  );
}
