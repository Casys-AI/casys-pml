import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";

// ============================================================================
// Types
// ============================================================================

interface ContentItem {
  type: string;
  text?: string;
}

interface PortResult {
  port: number;
  state: "open" | "closed" | "filtered";
  service: string;
  latency?: number;
}

interface ScanData {
  host: string;
  ports: PortResult[];
  openCount: number;
  closedCount?: number;
  scanTime: number;
  error?: string;
}

// Inject Google Fonts and global styles
const injectStyles = () => {
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      background: #0a0a0f;
    }

    /* Scanlines overlay */
    .scanlines::before {
      content: "";
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      background: repeating-linear-gradient(
        0deg,
        rgba(0, 0, 0, 0.15),
        rgba(0, 0, 0, 0.15) 1px,
        transparent 1px,
        transparent 2px
      );
      z-index: 1000;
    }

    /* Keyframes */
    @keyframes pulse-glow {
      0%, 100% {
        box-shadow: 0 0 5px #00fff2, 0 0 10px #00fff2, 0 0 15px #00fff2;
      }
      50% {
        box-shadow: 0 0 10px #00fff2, 0 0 20px #00fff2, 0 0 30px #00fff2;
      }
    }

    @keyframes border-flow {
      0% {
        background-position: 0% 50%;
      }
      50% {
        background-position: 100% 50%;
      }
      100% {
        background-position: 0% 50%;
      }
    }

    @keyframes typing {
      from { width: 0; }
      to { width: 100%; }
    }

    @keyframes blink-cursor {
      0%, 50% { border-color: #00fff2; }
      51%, 100% { border-color: transparent; }
    }

    @keyframes fade-in-up {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes text-flicker {
      0%, 100% { opacity: 1; }
      92% { opacity: 1; }
      93% { opacity: 0.8; }
      94% { opacity: 1; }
      95% { opacity: 0.9; }
      96% { opacity: 1; }
    }

    @keyframes glow-pulse {
      0%, 100% {
        text-shadow: 0 0 5px currentColor, 0 0 10px currentColor;
      }
      50% {
        text-shadow: 0 0 10px currentColor, 0 0 20px currentColor, 0 0 30px currentColor;
      }
    }

    .row-animate {
      animation: fade-in-up 0.3s ease-out forwards;
      opacity: 0;
    }

    .pulse-open {
      animation: pulse-glow 2s ease-in-out infinite;
    }

    .typing-effect {
      overflow: hidden;
      white-space: nowrap;
      border-right: 2px solid #00fff2;
      animation: typing 0.8s steps(20, end) forwards, blink-cursor 0.8s step-end infinite;
    }

    .flicker {
      animation: text-flicker 3s linear infinite;
    }

    .stat-glow {
      animation: glow-pulse 2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
};

// Cyberpunk color palette
const colors = {
  bg: "#0a0a0f",
  bgCard: "#0d0d14",
  bgHover: "#12121a",
  cyan: "#00fff2",
  magenta: "#ff00ff",
  matrix: "#00ff41",
  warning: "#ffaa00",
  error: "#ff3366",
  text: "#c0c0d0",
  textMuted: "#606080",
  border: "#1a1a2e",
};

const styles = {
  container: {
    fontFamily: "'JetBrains Mono', 'Source Code Pro', monospace",
    padding: "20px",
    maxWidth: "900px",
    margin: "0 auto",
    color: colors.text,
    backgroundColor: colors.bg,
    minHeight: "100vh",
    position: "relative" as const,
  },
  terminal: {
    border: "1px solid transparent",
    borderRadius: "8px",
    background: `linear-gradient(${colors.bgCard}, ${colors.bgCard}) padding-box,
                 linear-gradient(135deg, ${colors.cyan}, ${colors.magenta}, ${colors.cyan}) border-box`,
    backgroundSize: "100% 100%, 200% 200%",
    animation: "border-flow 4s ease infinite",
    padding: "20px",
    position: "relative" as const,
  },
  terminalHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "20px",
    paddingBottom: "15px",
    borderBottom: `1px solid ${colors.border}`,
  },
  terminalDots: {
    display: "flex",
    gap: "6px",
  },
  dot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
  },
  dotRed: { backgroundColor: "#ff5f56" },
  dotYellow: { backgroundColor: "#ffbd2e" },
  dotGreen: { backgroundColor: "#27ca40" },
  prompt: {
    color: colors.cyan,
    fontSize: "14px",
    marginLeft: "12px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  promptSymbol: {
    color: colors.matrix,
    fontWeight: 700,
  },
  hostBadge: {
    display: "inline-block",
    color: colors.magenta,
    textShadow: `0 0 10px ${colors.magenta}`,
  },
  asciiSeparator: {
    color: colors.textMuted,
    fontSize: "10px",
    letterSpacing: "2px",
    textAlign: "center" as const,
    margin: "20px 0",
    opacity: 0.5,
  },
  stats: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap" as const,
    marginBottom: "24px",
  },
  stat: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "16px 24px",
    backgroundColor: colors.bgHover,
    borderRadius: "6px",
    border: `1px solid ${colors.border}`,
    minWidth: "110px",
  },
  statValue: {
    fontSize: "28px",
    fontWeight: 700,
    letterSpacing: "-1px",
  },
  statLabel: {
    fontSize: "11px",
    color: colors.textMuted,
    marginTop: "6px",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
  },
  statOpen: {
    color: colors.matrix,
    textShadow: `0 0 10px ${colors.matrix}, 0 0 20px ${colors.matrix}`,
  },
  statClosed: {
    color: colors.error,
    textShadow: `0 0 10px ${colors.error}`,
  },
  statTime: {
    color: colors.cyan,
    textShadow: `0 0 10px ${colors.cyan}`,
  },
  toolbar: {
    display: "flex",
    gap: "8px",
    marginBottom: "20px",
    flexWrap: "wrap" as const,
  },
  filterBtn: {
    padding: "8px 16px",
    borderRadius: "4px",
    border: `1px solid ${colors.border}`,
    backgroundColor: "transparent",
    color: colors.textMuted,
    cursor: "pointer",
    fontSize: "12px",
    fontFamily: "'JetBrains Mono', monospace",
    transition: "all 0.2s",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  filterBtnActive: {
    backgroundColor: colors.cyan,
    borderColor: colors.cyan,
    color: colors.bg,
    boxShadow: `0 0 10px ${colors.cyan}`,
  },
  copyBtn: {
    marginLeft: "auto",
    padding: "8px 16px",
    borderRadius: "4px",
    border: `1px solid ${colors.magenta}`,
    backgroundColor: "transparent",
    color: colors.magenta,
    cursor: "pointer",
    fontSize: "12px",
    fontFamily: "'JetBrains Mono', monospace",
    transition: "all 0.2s",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: "13px",
  },
  th: {
    textAlign: "left" as const,
    padding: "12px 16px",
    borderBottom: `1px solid ${colors.border}`,
    color: colors.cyan,
    fontWeight: 500,
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
  },
  td: {
    padding: "12px 16px",
    borderBottom: `1px solid ${colors.border}`,
  },
  row: {
    transition: "all 0.15s",
    cursor: "pointer",
  },
  rowHover: {
    backgroundColor: colors.bgHover,
  },
  rowSelected: {
    backgroundColor: "#1a1a3e",
    boxShadow: `inset 0 0 20px rgba(0, 255, 242, 0.1)`,
  },
  portCell: {
    fontWeight: 600,
    color: colors.text,
  },
  stateOpen: {
    color: colors.matrix,
    fontWeight: 600,
    textShadow: `0 0 8px ${colors.matrix}`,
  },
  stateClosed: {
    color: colors.textMuted,
  },
  stateFiltered: {
    color: colors.warning,
    textShadow: `0 0 8px ${colors.warning}`,
  },
  serviceCell: {
    color: colors.textMuted,
  },
  serviceKnown: {
    color: colors.cyan,
    fontWeight: 500,
  },
  latencyCell: {
    color: colors.textMuted,
    fontSize: "12px",
  },
  emptyState: {
    textAlign: "center" as const,
    padding: "40px",
    color: colors.textMuted,
  },
  error: {
    padding: "16px",
    backgroundColor: "rgba(255, 51, 102, 0.1)",
    borderRadius: "6px",
    border: `1px solid ${colors.error}`,
    color: colors.error,
    marginBottom: "16px",
    textShadow: `0 0 10px ${colors.error}`,
  },
  openIndicator: {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: colors.matrix,
    marginRight: "8px",
    boxShadow: `0 0 8px ${colors.matrix}`,
  },
};

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Port Scanner", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Component
// ============================================================================

function PortScanner() {
  const [data, setData] = useState<ScanData | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  useEffect(() => {
    injectStyles();

    // Connect to MCP host
    app.connect().then(() => {
      appConnected = true;
      console.log("[port-scanner] Connected to MCP host");
    }).catch(() => {
      console.log("[port-scanner] No MCP host (standalone mode)");
      // Demo data for development
      setData({
        host: "192.168.1.1",
        ports: [
          { port: 22, state: "open", service: "SSH", latency: 12 },
          { port: 80, state: "open", service: "HTTP", latency: 8 },
          { port: 443, state: "open", service: "HTTPS", latency: 10 },
          { port: 3000, state: "closed", service: "Unknown" },
          { port: 5432, state: "open", service: "PostgreSQL", latency: 15 },
          { port: 6379, state: "closed", service: "Redis" },
          { port: 8080, state: "filtered", service: "HTTP-Alt" },
        ],
        openCount: 4,
        closedCount: 2,
        scanTime: 1234,
      });
    });

    // Handle tool results
    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      if (result.content) {
        for (const item of result.content) {
          if (item.type === "text" && item.text) {
            try {
              const parsed = JSON.parse(item.text);
              setData(parsed as ScanData);
              return;
            } catch {
              // Not JSON, continue
            }
          }
        }
      }
      // Try direct result
      if (typeof result === "object" && "host" in (result as object)) {
        setData(result as unknown as ScanData);
      }
    };
  }, []);

  const handleCopy = () => {
    if (!data) return;

    const openPorts = data.ports
      .filter(p => p.state === "open")
      .map(p => `${p.port} (${p.service})`)
      .join(", ");

    const text = `[SCAN REPORT]\nHost: ${data.host}\nOpen ports: ${openPorts}\nScan time: ${data.scanTime}ms`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePortClick = (port: number) => {
    setSelectedPort(selectedPort === port ? null : port);
    notifyModel("selected", { port, portData: data?.ports.find(p => p.port === port) });
  };

  const filteredPorts = data?.ports.filter(p => {
    if (filter === "all") return true;
    if (filter === "open") return p.state === "open";
    return p.state === "closed" || p.state === "filtered";
  }) || [];

  if (!data) {
    return (
      <div style={styles.container} className="scanlines">
        <div style={styles.terminal}>
          <div style={styles.emptyState} className="flicker">
            [INITIALIZING SCAN MODULE...]
          </div>
        </div>
      </div>
    );
  }

  const closedCount = data.closedCount ?? data.ports.filter(p => p.state !== "open").length;

  return (
    <div style={styles.container} className="scanlines">
      <div style={styles.terminal}>
        {data.error && (
          <div style={styles.error}>[ERROR] {data.error}</div>
        )}

        {/* Terminal Header */}
        <div style={styles.terminalHeader}>
          <div style={styles.terminalDots}>
            <div style={{ ...styles.dot, ...styles.dotRed }} />
            <div style={{ ...styles.dot, ...styles.dotYellow }} />
            <div style={{ ...styles.dot, ...styles.dotGreen }} />
          </div>
          <div style={styles.prompt}>
            <span style={styles.promptSymbol}>&gt;</span>
            <span>scan</span>
            <span style={styles.hostBadge} className="typing-effect">
              {data.host}
            </span>
          </div>
        </div>

        {/* ASCII Separator */}
        <div style={styles.asciiSeparator}>
          ═══════════════════════════════════════════════════════════
        </div>

        {/* Stats */}
        <div style={styles.stats}>
          <div style={styles.stat}>
            <span style={{ ...styles.statValue, ...styles.statOpen }} className="stat-glow">
              {data.openCount}
            </span>
            <span style={styles.statLabel}>Open</span>
          </div>
          <div style={styles.stat}>
            <span style={{ ...styles.statValue, ...styles.statClosed }}>
              {closedCount}
            </span>
            <span style={styles.statLabel}>Closed</span>
          </div>
          <div style={styles.stat}>
            <span style={{ ...styles.statValue, ...styles.statTime }} className="stat-glow">
              {data.scanTime}
            </span>
            <span style={styles.statLabel}>ms</span>
          </div>
        </div>

        {/* Toolbar */}
        <div style={styles.toolbar}>
          {(["all", "open", "closed"] as const).map((f) => (
            <button
              key={f}
              style={{
                ...styles.filterBtn,
                ...(filter === f ? styles.filterBtnActive : {}),
              }}
              onClick={() => setFilter(f)}
              onMouseEnter={(e) => {
                if (filter !== f) {
                  (e.target as HTMLElement).style.borderColor = colors.cyan;
                  (e.target as HTMLElement).style.color = colors.cyan;
                }
              }}
              onMouseLeave={(e) => {
                if (filter !== f) {
                  (e.target as HTMLElement).style.borderColor = colors.border;
                  (e.target as HTMLElement).style.color = colors.textMuted;
                }
              }}
            >
              {f === "all" ? `All (${data.ports.length})` :
               f === "open" ? `Open (${data.openCount})` :
               `Closed (${closedCount})`}
            </button>
          ))}
          <button
            style={styles.copyBtn}
            onClick={handleCopy}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.backgroundColor = colors.magenta;
              (e.target as HTMLElement).style.color = colors.bg;
              (e.target as HTMLElement).style.boxShadow = `0 0 15px ${colors.magenta}`;
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.backgroundColor = "transparent";
              (e.target as HTMLElement).style.color = colors.magenta;
              (e.target as HTMLElement).style.boxShadow = "none";
            }}
          >
            {copied ? "[COPIED]" : "[EXPORT]"}
          </button>
        </div>

        {/* ASCII Separator */}
        <div style={styles.asciiSeparator}>
          ───────────────────────────────────────────────────────────
        </div>

        {/* Table */}
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Port</th>
              <th style={styles.th}>State</th>
              <th style={styles.th}>Service</th>
              <th style={styles.th}>Latency</th>
            </tr>
          </thead>
          <tbody>
            {filteredPorts.map((p, index) => (
              <tr
                key={p.port}
                className="row-animate"
                style={{
                  ...styles.row,
                  ...(hoveredRow === p.port ? styles.rowHover : {}),
                  ...(selectedPort === p.port ? styles.rowSelected : {}),
                  animationDelay: `${index * 0.05}s`,
                }}
                onClick={() => handlePortClick(p.port)}
                onMouseEnter={() => setHoveredRow(p.port)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <td style={{ ...styles.td, ...styles.portCell }}>
                  {p.state === "open" && (
                    <span style={styles.openIndicator} className="pulse-open" />
                  )}
                  {p.port}
                </td>
                <td style={{
                  ...styles.td,
                  ...(p.state === "open" ? styles.stateOpen :
                      p.state === "filtered" ? styles.stateFiltered :
                      styles.stateClosed)
                }}>
                  {p.state.toUpperCase()}
                </td>
                <td style={{
                  ...styles.td,
                  ...(p.service !== "Unknown" ? styles.serviceKnown : styles.serviceCell)
                }}>
                  {p.service}
                </td>
                <td style={{ ...styles.td, ...styles.latencyCell }}>
                  {p.latency ? `${p.latency}ms` : "---"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredPorts.length === 0 && (
          <div style={styles.emptyState} className="flicker">
            [NO PORTS MATCH FILTER]
          </div>
        )}

        {/* Footer ASCII */}
        <div style={{ ...styles.asciiSeparator, marginTop: "24px" }}>
          ═══════════════════════════════════════════════════════════
        </div>
        <div style={{ ...styles.asciiSeparator, fontSize: "9px", opacity: 0.3 }}>
          CASYS_NETWORK_SCANNER v2.0 // SECURE CONNECTION ESTABLISHED
        </div>
      </div>
    </div>
  );
}

render(<PortScanner />, document.getElementById("app")!);
