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

interface CapabilityEntry {
  id: string;
  name: string;
  action: string | null;
  description: string | null;
  routing: "local" | "cloud";
  code: string | null;
}

interface NamespaceDetailData {
  namespace: string;
  capabilities: CapabilityEntry[];
  isCloudMode: boolean;
  user: AuthState["user"];
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
    }>(`
      SELECT
        pr.id,
        pr.name,
        pr.action,
        pr.description,
        pr.routing,
        wp.code_snippet as code
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
    }));
  } catch (error) {
    console.error("Error loading namespace capabilities:", error);
    return [];
  }
}

export const handler = {
  async GET(ctx: FreshContext<AuthState>) {
    const namespace = ctx.params.namespace;
    const capabilities = await loadNamespaceCapabilities(namespace);

    return page({
      namespace,
      capabilities,
      isCloudMode: ctx.state.isCloudMode,
      user: ctx.state.user,
    });
  },
};

export default function NamespaceDetailPage({ data }: { data: NamespaceDetailData }) {
  const { namespace, capabilities, isCloudMode, user } = data;

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
      />
    </>
  );
}
