import { page } from "fresh";
import { Head } from "fresh/runtime";
import GraphExplorer from "../islands/GraphExplorer.tsx";
import MetricsPanel from "../islands/MetricsPanel.tsx";

export const handler = {
  GET(_ctx: any) {
    return page();
  },
};

export default function Dashboard() {
  const apiBase = "http://localhost:3001";

  return (
    <>
      <Head>
        <title>AgentCards - Graph Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="/styles.css" />
        <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
      </Head>

      <div class="flex w-screen h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 font-sans">
        {/* Graph Section */}
        <div class="flex-1 relative min-w-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.03)_0%,transparent_70%)]">
          <GraphExplorer />
        </div>

        {/* Metrics Panel */}
        <MetricsPanel apiBase={apiBase} position="sidebar" />
      </div>
    </>
  );
}
