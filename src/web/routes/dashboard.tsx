import { page } from "fresh";
import { Head } from "fresh/runtime";
import GraphVisualization from "../islands/GraphVisualization.tsx";

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
        <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js"></script>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #030712; font-family: system-ui, sans-serif; }
          .graph-container { width: 100vw; height: 100vh; overflow: hidden; position: relative; }
          .graph-canvas { width: 100%; height: 100%; }
          .legend { position: absolute; top: 20px; right: 20px; background: rgba(0,0,0,0.8); padding: 16px; border-radius: 8px; border: 1px solid #374151; backdrop-filter: blur(8px); }
          .legend h3 { font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px; }
          .legend-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; }
          .legend-item.hidden { opacity: 0.3; }
          .legend-dot { width: 12px; height: 12px; border-radius: 50%; }
          .legend-label { color: #e5e7eb; font-size: 14px; }
          .node-details { position: absolute; bottom: 20px; left: 20px; background: rgba(0,0,0,0.9); padding: 16px; border-radius: 8px; border: 1px solid #374151; min-width: 250px; }
          .node-details h3 { color: #3b82f6; font-size: 18px; margin-bottom: 8px; }
          .node-details p { color: #9ca3af; font-size: 14px; margin: 4px 0; }
          .node-details .close { position: absolute; top: 8px; right: 8px; color: #6b7280; cursor: pointer; }
        `}</style>
      </Head>

      <div class="graph-container">
        <GraphVisualization apiBase={apiBase} />
      </div>
    </>
  );
}
