import { page } from "fresh";
import type { FreshContext } from "fresh";
import { Head } from "fresh/runtime";
import GraphExplorer from "../islands/GraphExplorer.tsx";
import MetricsPanel from "../islands/MetricsPanel.tsx";
import type { AuthState } from "./_middleware.ts";

interface DashboardData {
  apiBase: string;
  isCloudMode: boolean;
  user: AuthState["user"];
}

export const handler = {
  GET(ctx: FreshContext<AuthState>) {
    // Read API base from env, default to localhost:3003 for dev
    const apiBase = Deno.env.get("API_BASE") || "http://localhost:3003";
    return page({
      apiBase,
      isCloudMode: ctx.state.isCloudMode,
      user: ctx.state.user,
    });
  },
};

export default function Dashboard({ data }: { data: DashboardData }) {
  const apiBase = data?.apiBase || "http://localhost:3003";
  const { isCloudMode, user } = data;

  return (
    <>
      <Head>
        <title>CAI - Graph Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
        <style>
          {`
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
            --font-sans: 'Geist', -apple-system, system-ui, sans-serif;
            --font-mono: 'Geist Mono', monospace;
            --font-display: 'Instrument Serif', Georgia, serif;
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
        `}
        </style>
      </Head>

      <div
        class="flex w-screen h-screen overflow-hidden font-sans"
        style={{
          background: "var(--bg)",
          fontFamily: "var(--font-sans)",
        }}
      >
        {/* Dashboard Header Bar */}
        <div
          class="absolute top-0 left-0 right-0 z-[200] flex items-center justify-between px-5 py-3"
          style={{
            background: "rgba(10, 9, 8, 0.9)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {/* Left: Back to Home */}
          <a
            href="/"
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-medium)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            CAI
          </a>

          {/* Right: User Info + Settings */}
          <div class="flex items-center gap-3">
            {user && (
              <div class="flex items-center gap-2">
                <img
                  src={user.avatarUrl || "/default-avatar.svg"}
                  alt={user.username}
                  class="w-7 h-7 rounded-full object-cover"
                  style={{ border: "1px solid var(--border)" }}
                />
                <span
                  class="text-sm font-medium"
                  style={{ color: "var(--text)" }}
                >
                  {user.username === "local" ? "Local User" : user.username}
                </span>
              </div>
            )}
            {!isCloudMode && (
              <span
                class="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono"
                style={{
                  color: "var(--success)",
                  background: "rgba(74, 222, 128, 0.1)",
                  border: "1px solid rgba(74, 222, 128, 0.2)",
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Local
              </span>
            )}
            <a
              href="/dashboard/settings"
              class="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = "var(--accent-medium)";
                e.currentTarget.style.color = "var(--accent)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
              title="Settings"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Graph Section */}
        <div
          class="flex-1 relative min-w-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255, 184, 111, 0.02) 0%, transparent 70%)",
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
