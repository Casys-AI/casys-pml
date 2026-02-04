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
  uiMeta: {
    resourceUri: string;
    emits?: string[];
    accepts?: string[];
  } | null;
}

interface NodeNavItem {
  id: string;
  name: string;
  icon: string;
  toolCount: number;
}

interface ServerDetailData {
  serverId: string;
  displayName: string;
  description: string;
  tools: ToolEntry[];
  isCloudMode: boolean;
  user: AuthState["user"];
  allNodes: NodeNavItem[];
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

/** Icons for nodes */
const NODE_ICONS: Record<string, string> = {
  docker: "🐳", git: "📦", database: "🗄️", network: "🌐", process: "⚙️",
  archive: "📁", ssh: "🔐", kubernetes: "☸️", media: "🎬", cloud: "☁️",
  sysinfo: "💻", packages: "📦", text: "📝", json: "{ }", math: "🔢",
  datetime: "📅", crypto: "🔒", collections: "📚", vfs: "💾", http: "🌍",
  validation: "✓", format: "📋", transform: "🔄", algo: "🧮", color: "🎨",
  string: "🔤", path: "📂", faker: "🎭", geo: "🌍", qrcode: "📱",
  resilience: "🛡️", schema: "📐", diff: "↔️", agent: "🤖", pml: "⚡",
  python: "🐍", pglite: "🐘", memory: "🧠", filesystem: "📁", playwright: "🎭",
  "chrome-devtools": "🔧", exa: "🔍", fetch: "🌐",
};

function getNodeIcon(name: string): string {
  const lower = name.toLowerCase();
  return NODE_ICONS[lower] || "◆";
}

/**
 * Load all nodes for navigation (tools + capabilities)
 */
async function loadAllNodes(): Promise<NodeNavItem[]> {
  try {
    const db = await getRawDb();

    // Query both tool servers AND capability namespaces
    const rows = await db.query<{
      node_id: string;
      node_name: string;
      tool_count: number;
      node_type: "tool" | "capability";
    }>(`
      -- Tool servers
      SELECT
        CASE
          WHEN server_id = 'std' THEN 'std-' || split_part(name, '_', 1)
          ELSE server_id
        END as node_id,
        CASE
          WHEN server_id = 'std' THEN initcap(split_part(name, '_', 1))
          ELSE server_id
        END as node_name,
        COUNT(*) as tool_count,
        'tool'::text as node_type
      FROM tool_schema
      GROUP BY node_id, node_name

      UNION ALL

      -- Capability namespaces
      SELECT
        'ns/' || namespace as node_id,
        namespace as node_name,
        COUNT(*) as tool_count,
        'capability'::text as node_type
      FROM pml_registry
      WHERE record_type = 'capability'
        AND visibility = 'public'
      GROUP BY namespace

      ORDER BY tool_count DESC, node_name
    `);

    return rows.map((row) => ({
      id: row.node_id,
      name: row.node_name,
      icon: row.node_type === "capability" ? "⚡" : getNodeIcon(row.node_name),
      toolCount: Number(row.tool_count),
    }));
  } catch (error) {
    console.error("Error loading nodes:", error);
    return [];
  }
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
      ui_meta: { resourceUri: string; emits?: string[]; accepts?: string[] } | null;
    }>(`
      SELECT
        tool_id,
        name,
        description,
        routing,
        input_schema,
        ui_meta
      FROM tool_schema
      WHERE ${whereClause}
      ORDER BY name
    `, params);

    return rows.map((row) => {
      // Handle double-encoded JSON (string inside JSONB)
      let uiMeta = row.ui_meta;
      if (typeof uiMeta === "string") {
        try {
          uiMeta = JSON.parse(uiMeta);
        } catch {
          uiMeta = null;
        }
      }
      return {
        id: row.tool_id,
        name: row.name,
        description: row.description,
        routing: row.routing,
        inputSchema: row.input_schema as Record<string, unknown> | null,
        uiMeta,
      };
    });
  } catch (error) {
    console.error("Error loading server tools:", error);
    return [];
  }
}

export const handler = {
  async GET(ctx: FreshContext<AuthState>) {
    const serverId = ctx.params.serverId;

    // Load tools and nodes in parallel
    const [tools, allNodes] = await Promise.all([
      loadServerTools(serverId),
      loadAllNodes(),
    ]);

    const displayName = getDisplayName(serverId);
    const description = generateDescription(tools, displayName);

    return page({
      serverId,
      displayName,
      description,
      tools,
      isCloudMode: ctx.state.isCloudMode,
      user: ctx.state.user,
      allNodes,
    });
  },
};

export default function ServerDetailPage({ data }: { data: ServerDetailData }) {
  const { serverId, displayName, description, tools, isCloudMode, user, allNodes } = data;

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
        allNodes={allNodes}
      />
    </>
  );
}
