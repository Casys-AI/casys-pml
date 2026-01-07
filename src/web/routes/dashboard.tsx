import { page } from "fresh";
import type { FreshContext } from "fresh";
import { Head } from "fresh/runtime";
import GraphExplorer from "../islands/GraphExplorer.tsx";
import MetricsPanel from "../islands/MetricsPanel.tsx";
import TracingPanel from "../islands/TracingPanel.tsx";
import { DashboardLayout } from "../components/layout/mod.ts";
import type { AuthState } from "./_middleware.ts";

interface DashboardData {
  apiBase: string;
  apiKey: string | null;
  isCloudMode: boolean;
  user: AuthState["user"];
}

export const handler = {
  GET(ctx: FreshContext<AuthState>) {
    // Read API base from env, default to localhost:3003 for dev
    const apiBase = Deno.env.get("API_BASE") || "http://localhost:3003";
    // Pass API key for authenticated API calls (local dev only - production uses session tokens)
    const apiKey = Deno.env.get("PML_API_KEY") || null;
    return page({
      apiBase,
      apiKey,
      isCloudMode: ctx.state.isCloudMode,
      user: ctx.state.user,
    });
  },
};

export default function Dashboard({ data }: { data: DashboardData }) {
  const apiBase = data?.apiBase || "http://localhost:3003";
  const apiKey = data?.apiKey || null;
  const { isCloudMode, user } = data;

  return (
    <>
      <Head>
        <title>Casys PML - Graph Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Cytoscape.js for graph visualization - defer to not block render */}
        <script defer src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js">
        </script>
        {/* Dagre layout for hierarchical graphs */}
        <script defer src="https://cdn.jsdelivr.net/npm/dagre@0.8.5/dist/dagre.min.js"></script>
        <script
          defer
          src="https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.min.js"
        >
        </script>
        {/* Layout base dependencies */}
        <script defer src="https://unpkg.com/layout-base/layout-base.js"></script>
        <script defer src="https://unpkg.com/cose-base/cose-base.js"></script>
        {/* Cose-Bilkent layout for compound nodes */}
        <script
          defer
          src="https://unpkg.com/cytoscape-cose-bilkent@4.1.0/cytoscape-cose-bilkent.js"
        >
        </script>
        {/* fCoSE layout - faster with better component packing */}
        <script defer src="https://unpkg.com/cytoscape-fcose@2.2.0/cytoscape-fcose.js"></script>
        {/* Cola layout - D3-like force simulation with live physics */}
        <script defer src="https://unpkg.com/webcola@3.4.0/WebCola/cola.min.js"></script>
        <script defer src="https://unpkg.com/cytoscape-cola@2.5.1/cytoscape-cola.js"></script>
        {/* ECharts for emergence metrics visualization */}
        <script defer src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js">
        </script>
        <style>
          {`
          * {
            scrollbar-width: thin;
            scrollbar-color: var(--accent-dim) transparent;
          }

          *::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }

          *::-webkit-scrollbar-track {
            background: transparent;
          }

          *::-webkit-scrollbar-thumb {
            background: var(--accent-dim);
            border-radius: 3px;
          }

          *::-webkit-scrollbar-thumb:hover {
            background: var(--accent-medium);
          }
        `}
        </style>
      </Head>

      <DashboardLayout
        user={user}
        isCloudMode={isCloudMode}
        rightPanel={
          <>
            <MetricsPanel apiBase={apiBase} apiKey={apiKey} position="sidebar" />
            <TracingPanel apiBase={apiBase} apiKey={apiKey} />
          </>
        }
      >
        <GraphExplorer apiBase={apiBase} apiKey={apiKey} />
      </DashboardLayout>
    </>
  );
}
