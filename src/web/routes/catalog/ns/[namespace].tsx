/**
 * Namespace Detail Page
 *
 * Shows all capabilities from a specific namespace with:
 * - Left panel: capabilities list
 * - Right panel: selected capability details
 *
 * URL: /catalog/ns/:namespace
 *
 * @module web/routes/catalog/ns/[namespace]
 */

import { page } from "fresh";
import type { FreshContext } from "fresh";
import { Head } from "fresh/runtime";
import type { AuthState } from "../../_middleware.ts";
import { getRawDb } from "../../../../server/auth/db.ts";
import NamespaceDetailIsland from "../../../islands/NamespaceDetailIsland.tsx";

interface ParametersSchema {
  type: string;
  properties?: Record<string, {
    type: string;
    examples?: unknown[];
    description?: string;
  }>;
  required?: string[];
}

interface CapabilityEntry {
  id: string;
  name: string;
  action: string | null;
  description: string | null;
  routing: "local" | "cloud";
  code: string | null;
  toolsUsed: string[];
  inputSchema: ParametersSchema | null;
}

interface NodeNavItem {
  id: string;
  name: string;
  icon: string;
  toolCount: number;
}

interface NamespaceDetailData {
  namespace: string;
  capabilities: CapabilityEntry[];
  isCloudMode: boolean;
  user: AuthState["user"];
  allNodes: NodeNavItem[];
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
  // Capability namespaces
  fake: "⚡", fs: "⚡", meta: "⚡", db: "⚡",
};

function getNodeIcon(name: string): string {
  const lower = name.toLowerCase();
  return NODE_ICONS[lower] || "⚡";
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
 * Query public capabilities for a specific namespace
 * Uses pml_registry VIEW + workflow_pattern for code
 */
async function loadNamespaceCapabilities(namespace: string): Promise<CapabilityEntry[]> {
  try {
    const db = await getRawDb();

    const rows = await db.query<{
      id: string;
      name: string;
      action: string | null;
      description: string | null;
      routing: "local" | "cloud";
      code: string | null;
      tools_used: string[] | null;
      parameters_schema: ParametersSchema | null;
    }>(`
      SELECT
        pr.id,
        pr.name,
        pr.action,
        pr.description,
        pr.routing,
        wp.code_snippet as code,
        wp.dag_structure->'tools_used' as tools_used,
        wp.parameters_schema
      FROM pml_registry pr
      LEFT JOIN workflow_pattern wp ON pr.workflow_pattern_id = wp.pattern_id
      WHERE pr.record_type = 'capability'
        AND pr.namespace = $1
        AND pr.visibility = 'public'
      ORDER BY pr.action, pr.name
    `, [namespace]);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      action: row.action,
      description: row.description,
      routing: row.routing,
      code: row.code,
      toolsUsed: row.tools_used || [],
      inputSchema: row.parameters_schema,
    }));
  } catch (error) {
    console.error("Error loading namespace capabilities:", error);
    return [];
  }
}

export const handler = {
  async GET(ctx: FreshContext<AuthState>) {
    const namespace = ctx.params.namespace;

    const [capabilities, allNodes] = await Promise.all([
      loadNamespaceCapabilities(namespace),
      loadAllNodes(),
    ]);

    return page({
      namespace,
      capabilities,
      isCloudMode: ctx.state.isCloudMode,
      user: ctx.state.user,
      allNodes,
    });
  },
};

export default function NamespaceDetailPage({ data }: { data: NamespaceDetailData }) {
  const { namespace, capabilities, isCloudMode, user, allNodes } = data;

  return (
    <>
      <Head>
        <title>{namespace} - Capabilities - Casys PML</title>
        <meta
          name="description"
          content={`Browse ${capabilities.length} learned capabilities in the ${namespace} namespace.`}
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <style>{`html,body{background:#0a0908;margin:0}`}</style>
      </Head>

      <NamespaceDetailIsland
        namespace={namespace}
        capabilities={capabilities}
        user={user}
        isCloudMode={isCloudMode}
        allNodes={allNodes}
      />
    </>
  );
}
