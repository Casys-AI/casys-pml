import { page } from "fresh";
import { Head } from "fresh/runtime";
import GraphExplorer from "../islands/GraphExplorer.tsx";
import MetricsPanel from "../islands/MetricsPanel.tsx";

export const handler = {
  GET(_ctx: any) {
    // Read API base from env, default to localhost:3003 for dev
    const apiBase = Deno.env.get("API_BASE") || "http://localhost:3003";
    return page({ data: { apiBase } });
  },
};

export default function Dashboard({ data }: { data: { apiBase: string } }) {
  const apiBase = data?.apiBase || "http://localhost:3003";

  return (
    <>
      <Head>
        <title>CAI - Graph Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
        <style>{`
          :root {
            --bg: #0a0908;
            --bg-elevated: #12110f;
            --bg-surface: #1a1816;
            --accent: #FFB86F;
            --accent-dim: rgba(255, 184, 111, 0.1);
            --accent-medium: rgba(255, 184, 111, 0.2);
            --accent-strong: rgba(255, 184, 111, 0.3);
            --text: #f5f0ea;
            --text-muted: #d5c3b5;
            --text-dim: #8a8078;
            --border: rgba(255, 184, 111, 0.1);
            --border-strong: rgba(255, 184, 111, 0.2);
            --success: #4ade80;
            --warning: #fbbf24;
            --error: #f87171;
            --info: #60a5fa;
            --font-sans: 'DM Sans', -apple-system, sans-serif;
            --font-mono: 'JetBrains Mono', monospace;
          }

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
        `}</style>
      </Head>

      <div
        class="flex w-screen h-screen overflow-hidden font-sans"
        style={{
          background: 'var(--bg)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {/* Back to Home */}
        <a
          href="/"
          class="absolute top-5 left-5 z-[200] flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-medium)';
            e.currentTarget.style.color = 'var(--accent)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          CAI
        </a>

        {/* Graph Section */}
        <div
          class="flex-1 relative min-w-0"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(255, 184, 111, 0.02) 0%, transparent 70%)',
          }}
        >
          <GraphExplorer apiBase={apiBase} />
        </div>

        {/* Metrics Panel */}
        <MetricsPanel apiBase={apiBase} position="sidebar" />
      </div>
    </>
  );
}
