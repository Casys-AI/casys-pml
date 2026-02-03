/**
 * Dependency Graph UI for MCP Apps
 *
 * Visualizes project dependencies with:
 * - Production/Dev/Peer grouping
 * - Search/filter
 * - Click to select
 *
 * @module lib/std/src/ui/dependency-graph
 */

import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface Dependency {
  name: string;
  version: string;
  type: "prod" | "dev" | "peer" | "optional";
  dependencies?: string[];
}

interface DependencyData {
  name: string;
  version: string;
  dependencies: Dependency[];
  devDependencies?: Dependency[];
  totalCount?: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Dependency Graph", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: css({
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: "16px",
    maxWidth: "900px",
    margin: "0 auto",
    color: "#e4e4e7",
    backgroundColor: "#18181b",
    minHeight: "100vh",
  }),
  header: css({
    marginBottom: "20px",
  }),
  title: css({
    fontSize: "18px",
    fontWeight: "600",
    marginBottom: "8px",
  }),
  subtitle: css({
    color: "#a1a1aa",
    fontSize: "14px",
  }),
  stats: css({
    display: "flex",
    gap: "16px",
    marginBottom: "20px",
    flexWrap: "wrap",
  }),
  stat: css({
    padding: "12px 20px",
    backgroundColor: "#27272a",
    borderRadius: "8px",
    textAlign: "center",
  }),
  statValue: css({
    fontSize: "24px",
    fontWeight: "700",
    color: "#60a5fa",
  }),
  statLabel: css({
    fontSize: "12px",
    color: "#a1a1aa",
    marginTop: "4px",
  }),
  section: css({
    marginBottom: "24px",
  }),
  sectionTitle: css({
    fontSize: "14px",
    fontWeight: "600",
    color: "#a1a1aa",
    marginBottom: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  }),
  grid: css({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "8px",
  }),
  depCard: css({
    padding: "10px 14px",
    backgroundColor: "#27272a",
    borderRadius: "6px",
    borderLeft: "3px solid #3b82f6",
    cursor: "pointer",
    transition: "all 0.15s",
    _hover: {
      backgroundColor: "#3f3f46",
    },
  }),
  devCard: css({
    borderLeftColor: "#a855f7",
  }),
  peerCard: css({
    borderLeftColor: "#f59e0b",
  }),
  depName: css({
    fontWeight: "500",
    fontSize: "14px",
    marginBottom: "2px",
  }),
  depVersion: css({
    fontSize: "12px",
    color: "#71717a",
    fontFamily: "monospace",
  }),
  searchBox: css({
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "#27272a",
    border: "1px solid #3f3f46",
    borderRadius: "6px",
    color: "#e4e4e7",
    fontSize: "14px",
    marginBottom: "16px",
    outline: "none",
    _focus: {
      borderColor: "#3b82f6",
    },
  }),
  empty: css({
    textAlign: "center",
    padding: "40px",
    color: "#71717a",
  }),
};

// ============================================================================
// Component
// ============================================================================

function DependencyGraph() {
  const [data, setData] = useState<DependencyData | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Connect to MCP host
    app.connect().then(() => {
      appConnected = true;
      console.log("[dependency-graph] Connected to MCP host");
    }).catch(() => {
      console.log("[dependency-graph] No MCP host (standalone mode)");
      // Demo data for standalone mode
      setData({
        name: "my-project",
        version: "1.0.0",
        dependencies: [
          { name: "preact", version: "^10.19.0", type: "prod" },
          { name: "express", version: "^4.18.0", type: "prod" },
          { name: "lodash", version: "^4.17.21", type: "prod" },
        ],
        devDependencies: [
          { name: "typescript", version: "^5.3.0", type: "dev" },
          { name: "vite", version: "^5.0.0", type: "dev" },
          { name: "eslint", version: "^8.55.0", type: "dev" },
        ],
        totalCount: 6,
      });
      setLoading(false);
    });

    // Handle tool results
    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      if (result.content) {
        for (const item of result.content) {
          if (item.type === "text" && item.text) {
            try {
              const parsed = JSON.parse(item.text);
              setData(parsed as DependencyData);
              return;
            } catch {
              // Not JSON, continue
            }
          }
        }
      }
      // Try direct result
      if (typeof result === "object" && "name" in (result as object)) {
        setData(result as unknown as DependencyData);
      }
    };
  }, []);

  const handleSelect = (dep: Dependency) => {
    notifyModel("selected", { dependency: dep });
  };

  if (loading && !data) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>Loading dependencies...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>No data received</div>
      </div>
    );
  }

  const allDeps = [
    ...(data.dependencies || []),
    ...(data.devDependencies || []),
  ];

  const filteredDeps = allDeps.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const prodDeps = filteredDeps.filter(d => d.type === "prod");
  const devDeps = filteredDeps.filter(d => d.type === "dev");
  const peerDeps = filteredDeps.filter(d => d.type === "peer");

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>{data.name}</div>
        <div className={styles.subtitle}>v{data.version}</div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{data.dependencies?.length || 0}</div>
          <div className={styles.statLabel}>Production</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{data.devDependencies?.length || 0}</div>
          <div className={styles.statLabel}>Development</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{data.totalCount || allDeps.length}</div>
          <div className={styles.statLabel}>Total</div>
        </div>
      </div>

      <input
        type="text"
        className={styles.searchBox}
        placeholder="Search dependencies..."
        value={search}
        onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
      />

      {prodDeps.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Production Dependencies</div>
          <div className={styles.grid}>
            {prodDeps.map((dep) => (
              <div
                key={dep.name}
                className={styles.depCard}
                onClick={() => handleSelect(dep)}
              >
                <div className={styles.depName}>{dep.name}</div>
                <div className={styles.depVersion}>{dep.version}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {devDeps.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Dev Dependencies</div>
          <div className={styles.grid}>
            {devDeps.map((dep) => (
              <div
                key={dep.name}
                className={`${styles.depCard} ${styles.devCard}`}
                onClick={() => handleSelect(dep)}
              >
                <div className={styles.depName}>{dep.name}</div>
                <div className={styles.depVersion}>{dep.version}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {peerDeps.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Peer Dependencies</div>
          <div className={styles.grid}>
            {peerDeps.map((dep) => (
              <div
                key={dep.name}
                className={`${styles.depCard} ${styles.peerCard}`}
                onClick={() => handleSelect(dep)}
              >
                <div className={styles.depName}>{dep.name}</div>
                <div className={styles.depVersion}>{dep.version}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredDeps.length === 0 && (
        <div className={styles.empty}>No dependencies found</div>
      )}
    </div>
  );
}

render(<DependencyGraph />, document.getElementById("app")!);
