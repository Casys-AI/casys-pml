/**
 * Registry Catalog Page
 *
 * Cloud-only: public catalog of available MCP tools and capabilities.
 * Uses CatalogLayout with vitrine header and left sidebar filters.
 * Data loaded dynamically from pml_registry VIEW.
 *
 * @module web/routes/catalog
 */

import { page } from "fresh";
import type { FreshContext } from "fresh";
import { Head } from "fresh/runtime";
import type { CatalogEntry } from "../../cloud/ui/catalog/types.ts";
import CatalogPageIsland from "../islands/CatalogPageIsland.tsx";
import type { AuthState } from "./_middleware.ts";
import { getRawDb } from "../../server/auth/db.ts";

interface CatalogData {
  entries: CatalogEntry[];
  isCloudMode: boolean;
  user: AuthState["user"];
}

/**
 * Query pml_registry VIEW for catalog entries
 */
async function loadCatalogEntries(): Promise<CatalogEntry[]> {
  try {
    const db = await getRawDb();
    const rows = await db.query<{
      record_type: "mcp-tool" | "capability";
      id: string;
      name: string;
      description: string | null;
      routing: "local" | "cloud";
      server_id: string | null;
      namespace: string | null;
      action: string | null;
    }>(`
      SELECT
        record_type,
        id,
        name,
        description,
        routing,
        server_id,
        namespace,
        action
      FROM pml_registry
      WHERE visibility = 'public'
      ORDER BY record_type, name
      LIMIT 500
    `);

    return rows.map((row) => ({
      recordType: row.record_type,
      id: row.id,
      name: row.name,
      description: row.description,
      routing: row.routing,
      serverId: row.server_id,
      namespace: row.namespace,
      action: row.action,
    }));
  } catch (error) {
    console.error("Error loading catalog entries:", error);
    return [];
  }
}

export const handler = {
  async GET(ctx: FreshContext<AuthState>) {
    const entries = await loadCatalogEntries();

    return page({
      entries,
      isCloudMode: ctx.state.isCloudMode,
      user: ctx.state.user,
    });
  },
};

export default function CatalogPage({ data }: { data: CatalogData }) {
  const { entries, isCloudMode, user } = data;

  return (
    <>
      <Head>
        <title>Registry Catalog - Casys PML</title>
        <meta
          name="description"
          content="Browse available MCP tools and capabilities from the PML registry. Discover tools for AI agents."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Critical CSS to prevent white flash on navigation */}
        <style>{`html,body{background:#0a0908;margin:0}`}</style>
      </Head>

      <CatalogPageIsland entries={entries} user={user} isCloudMode={isCloudMode} />
    </>
  );
}
