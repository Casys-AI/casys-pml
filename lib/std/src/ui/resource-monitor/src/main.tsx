/**
 * Resource Monitor UI - Dashboard for CPU, Memory, Network monitoring
 *
 * Displays resource usage with:
 * - Circular gauges for CPU and Memory
 * - Progress bars with color thresholds (green < 70%, orange < 90%, red >= 90%)
 * - Network I/O formatted (KB/s, MB/s)
 * - Sparklines for history when available
 * - Refresh indicator
 * - Support for multiple resources (list)
 *
 * @module lib/std/src/ui/resource-monitor
 */

import { render } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface ResourceData {
  name: string;
  cpu: {
    percent: number;
    cores?: number;
  };
  memory: {
    used: number;
    limit: number;
    percent: number;
  };
  network?: {
    rxBytes: number;
    txBytes: number;
    rxRate?: number;
    txRate?: number;
  };
  blockIO?: {
    read: number;
    write: number;
  };
  timestamp?: number;
}

interface MonitorData {
  title?: string;
  resources: ResourceData[];
  refreshInterval?: number;
  timestamp?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Resource Monitor", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function getThresholdColor(percent: number): string {
  if (percent >= 90) return "var(--colors-red-500)";
  if (percent >= 70) return "var(--colors-yellow-500)";
  return "var(--colors-green-500)";
}

function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i];
}

function formatRate(bytesPerSec: number): string {
  return formatBytes(bytesPerSec) + "/s";
}

function formatPercent(percent: number): string {
  return percent.toFixed(1) + "%";
}

// ============================================================================
// Gauge Component
// ============================================================================

function CircularGauge({ percent, label, size = 80 }: { percent: number; label: string; size?: number }) {
  const color = getThresholdColor(percent);
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius * (270 / 360);
  const offset = circumference - (circumference * Math.min(100, percent)) / 100;

  return (
    <div class={styles.gaugeContainer}>
      <svg viewBox={`0 0 ${size} ${size}`} class={styles.gaugeSvg} style={{ width: size, height: size }}>
        {/* Background arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--colors-border-default)"
          stroke-width="8"
          stroke-linecap="round"
          stroke-dasharray={`${circumference} ${circumference}`}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        {/* Value arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          stroke-width="8"
          stroke-linecap="round"
          stroke-dasharray={`${circumference} ${circumference}`}
          stroke-dashoffset={offset}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
          class={styles.gaugeArc}
        />
      </svg>
      <div class={styles.gaugeValue}>
        <span class={styles.gaugePercent} style={{ color }}>{formatPercent(percent)}</span>
      </div>
      <div class={styles.gaugeLabel}>{label}</div>
    </div>
  );
}

// ============================================================================
// Progress Bar Component
// ============================================================================

function ProgressBar({ percent, label, sublabel }: { percent: number; label: string; sublabel?: string }) {
  const color = getThresholdColor(percent);
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div class={styles.progressContainer}>
      <div class={styles.progressHeader}>
        <span class={styles.progressLabel}>{label}</span>
        <span class={styles.progressValue} style={{ color }}>{formatPercent(percent)}</span>
      </div>
      <div class={styles.progressTrack}>
        <div
          class={styles.progressFill}
          style={{ width: `${clampedPercent}%`, backgroundColor: color }}
        />
        {/* Threshold markers */}
        <div class={styles.progressThreshold70} />
        <div class={styles.progressThreshold90} />
      </div>
      {sublabel && <div class={styles.progressSublabel}>{sublabel}</div>}
    </div>
  );
}

// ============================================================================
// Network I/O Component
// ============================================================================

function NetworkIO({ network }: { network: NonNullable<ResourceData["network"]> }) {
  return (
    <div class={styles.networkContainer}>
      <div class={styles.networkLabel}>Network</div>
      <div class={styles.networkRow}>
        <span class={styles.networkIcon}>&#8595;</span>
        <span class={styles.networkDirection}>RX</span>
        <span class={styles.networkValue}>
          {network.rxRate !== undefined ? formatRate(network.rxRate) : formatBytes(network.rxBytes)}
        </span>
      </div>
      <div class={styles.networkRow}>
        <span class={styles.networkIcon}>&#8593;</span>
        <span class={styles.networkDirection}>TX</span>
        <span class={styles.networkValue}>
          {network.txRate !== undefined ? formatRate(network.txRate) : formatBytes(network.txBytes)}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Block I/O Component
// ============================================================================

function BlockIO({ blockIO }: { blockIO: NonNullable<ResourceData["blockIO"]> }) {
  return (
    <div class={styles.blockIOContainer}>
      <div class={styles.networkLabel}>Block I/O</div>
      <div class={styles.networkRow}>
        <span class={styles.networkDirection}>Read</span>
        <span class={styles.networkValue}>{formatBytes(blockIO.read)}</span>
      </div>
      <div class={styles.networkRow}>
        <span class={styles.networkDirection}>Write</span>
        <span class={styles.networkValue}>{formatBytes(blockIO.write)}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Sparkline Component
// ============================================================================

function Sparkline({ data, color, height = 30 }: { data: number[]; color: string; height?: number }) {
  if (!data.length) return null;

  const width = 100;
  const padding = 2;
  const dataMin = Math.min(...data);
  const dataMax = Math.max(...data);
  const range = dataMax - dataMin || 1;

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1 || 1)) * (width - padding * 2),
    y: padding + (height - padding * 2) - ((v - dataMin) / range) * (height - padding * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <svg width={width} height={height} class={styles.sparklineSvg}>
      <path d={areaPath} fill={color} opacity={0.15} />
      <path d={linePath} fill="none" stroke={color} stroke-width={1.5} stroke-linecap="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2} fill={color} />
    </svg>
  );
}

// ============================================================================
// Resource Card Component
// ============================================================================

function ResourceCard({ resource, history }: { resource: ResourceData; history?: { cpu: number[]; memory: number[] } }) {
  const memoryUsed = formatBytes(resource.memory.used);
  const memoryLimit = formatBytes(resource.memory.limit);
  const memorySublabel = `${memoryUsed} / ${memoryLimit}`;

  return (
    <div class={styles.resourceCard} onClick={() => notifyModel("selectResource", { name: resource.name, resource })}>
      {/* Header */}
      <div class={styles.resourceHeader}>
        <span class={styles.resourceName}>{resource.name}</span>
        {resource.cpu.cores && (
          <span class={styles.resourceCores}>{resource.cpu.cores} cores</span>
        )}
      </div>

      {/* Metrics Grid */}
      <div class={styles.metricsGrid}>
        {/* CPU Section */}
        <div class={styles.metricSection}>
          <CircularGauge percent={resource.cpu.percent} label="CPU" />
          {history?.cpu && history.cpu.length > 1 && (
            <Sparkline data={history.cpu} color={getThresholdColor(resource.cpu.percent)} />
          )}
        </div>

        {/* Memory Section */}
        <div class={styles.metricSection}>
          <ProgressBar
            percent={resource.memory.percent}
            label="Memory"
            sublabel={memorySublabel}
          />
          {history?.memory && history.memory.length > 1 && (
            <Sparkline data={history.memory} color={getThresholdColor(resource.memory.percent)} />
          )}
        </div>

        {/* Network Section */}
        {resource.network && (
          <div class={styles.metricSection}>
            <NetworkIO network={resource.network} />
          </div>
        )}

        {/* Block I/O Section */}
        {resource.blockIO && (
          <div class={styles.metricSection}>
            <BlockIO blockIO={resource.blockIO} />
          </div>
        )}
      </div>

      {/* Timestamp */}
      {resource.timestamp && (
        <div class={styles.resourceTimestamp}>
          {new Date(resource.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function ResourceMonitor() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyMap, setHistoryMap] = useState<Map<string, { cpu: number[]; memory: number[] }>>(new Map());

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
    }).catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);

          // Handle different input formats
          let monitorData: MonitorData;
          if (Array.isArray(parsed)) {
            monitorData = { resources: parsed };
          } else if (parsed.resources) {
            monitorData = parsed;
          } else if (parsed.name && parsed.cpu && parsed.memory) {
            // Single resource object
            monitorData = { resources: [parsed] };
          } else {
            console.error("Invalid resource data format");
            return;
          }

          setData(monitorData);

          // Update history for sparklines
          setHistoryMap((prev) => {
            const next = new Map(prev);
            for (const resource of monitorData.resources) {
              const existing = next.get(resource.name) || { cpu: [], memory: [] };
              const maxHistory = 20;
              next.set(resource.name, {
                cpu: [...existing.cpu.slice(-maxHistory + 1), resource.cpu.percent],
                memory: [...existing.memory.slice(-maxHistory + 1), resource.memory.percent],
              });
            }
            return next;
          });
        }
      } catch (e) {
        console.error("Failed to parse resource data", e);
      }
    };
  }, []);

  if (loading) {
    return (
      <div class={styles.container}>
        <div class={styles.loading}>Loading resources...</div>
      </div>
    );
  }

  if (!data?.resources?.length) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No resources to monitor</div>
      </div>
    );
  }

  return (
    <div class={styles.container}>
      {/* Header */}
      {(data.title || data.refreshInterval || data.timestamp) && (
        <div class={styles.header}>
          {data.title && <h2 class={styles.title}>{data.title}</h2>}
          <div class={styles.headerRight}>
            {data.refreshInterval && (
              <span class={styles.refreshBadge}>
                &#8635; {data.refreshInterval}s
              </span>
            )}
            {data.timestamp && (
              <span class={styles.timestamp}>{data.timestamp}</span>
            )}
          </div>
        </div>
      )}

      {/* Resources List */}
      <div class={styles.resourcesList}>
        {data.resources.map((resource) => (
          <ResourceCard
            key={resource.name}
            resource={resource}
            history={historyMap.get(resource.name)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: css({
    fontFamily: "sans",
    fontSize: "sm",
    color: "fg.default",
    bg: "bg.canvas",
    p: "3",
    minWidth: "320px",
  }),
  header: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    mb: "3",
    pb: "2",
    borderBottom: "1px solid",
    borderColor: "border.subtle",
  }),
  title: css({
    fontSize: "lg",
    fontWeight: "semibold",
    m: 0,
  }),
  headerRight: css({
    display: "flex",
    alignItems: "center",
    gap: "3",
  }),
  refreshBadge: css({
    px: "2",
    py: "0.5",
    bg: "blue.100",
    color: "blue.700",
    fontSize: "xs",
    rounded: "full",
    _dark: { bg: "blue.900", color: "blue.300" },
  }),
  timestamp: css({
    fontSize: "xs",
    color: "fg.muted",
  }),
  resourcesList: css({
    display: "flex",
    flexDirection: "column",
    gap: "3",
  }),
  resourceCard: css({
    p: "3",
    bg: "bg.subtle",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    cursor: "pointer",
    transition: "all 0.15s",
    _hover: { borderColor: "border.emphasized", shadow: "sm" },
  }),
  resourceHeader: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    mb: "3",
    pb: "2",
    borderBottom: "1px solid",
    borderColor: "border.subtle",
  }),
  resourceName: css({
    fontSize: "md",
    fontWeight: "semibold",
    fontFamily: "mono",
  }),
  resourceCores: css({
    fontSize: "xs",
    color: "fg.muted",
    px: "2",
    py: "0.5",
    bg: "bg.muted",
    rounded: "md",
  }),
  metricsGrid: css({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "4",
  }),
  metricSection: css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2",
  }),
  resourceTimestamp: css({
    mt: "2",
    pt: "2",
    borderTop: "1px solid",
    borderColor: "border.subtle",
    fontSize: "xs",
    color: "fg.muted",
    textAlign: "right",
  }),
  // Gauge
  gaugeContainer: css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    position: "relative",
  }),
  gaugeSvg: css({
    display: "block",
  }),
  gaugeArc: css({
    transition: "stroke-dashoffset 0.5s ease",
  }),
  gaugeValue: css({
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    textAlign: "center",
  }),
  gaugePercent: css({
    fontSize: "lg",
    fontWeight: "bold",
    fontFamily: "mono",
  }),
  gaugeLabel: css({
    fontSize: "xs",
    color: "fg.muted",
    fontWeight: "medium",
    textTransform: "uppercase",
    letterSpacing: "wide",
    mt: "1",
  }),
  // Progress Bar
  progressContainer: css({
    w: "100%",
    minWidth: "120px",
  }),
  progressHeader: css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    mb: "1",
  }),
  progressLabel: css({
    fontSize: "xs",
    color: "fg.muted",
    fontWeight: "medium",
    textTransform: "uppercase",
    letterSpacing: "wide",
  }),
  progressValue: css({
    fontSize: "sm",
    fontWeight: "bold",
    fontFamily: "mono",
  }),
  progressTrack: css({
    position: "relative",
    h: "8px",
    bg: "bg.muted",
    rounded: "full",
    overflow: "hidden",
  }),
  progressFill: css({
    h: "100%",
    rounded: "full",
    transition: "width 0.5s ease",
  }),
  progressThreshold70: css({
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "70%",
    w: "1px",
    bg: "yellow.500",
    opacity: 0.5,
  }),
  progressThreshold90: css({
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "90%",
    w: "1px",
    bg: "red.500",
    opacity: 0.5,
  }),
  progressSublabel: css({
    fontSize: "xs",
    color: "fg.muted",
    mt: "1",
    textAlign: "center",
  }),
  // Network I/O
  networkContainer: css({
    display: "flex",
    flexDirection: "column",
    gap: "1",
    p: "2",
    bg: "bg.muted",
    rounded: "md",
    minWidth: "100px",
  }),
  networkLabel: css({
    fontSize: "xs",
    color: "fg.muted",
    fontWeight: "medium",
    textTransform: "uppercase",
    letterSpacing: "wide",
    mb: "1",
  }),
  networkRow: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
  }),
  networkIcon: css({
    fontSize: "sm",
    color: "fg.muted",
    fontWeight: "bold",
  }),
  networkDirection: css({
    fontSize: "xs",
    color: "fg.muted",
    w: "28px",
  }),
  networkValue: css({
    fontSize: "sm",
    fontWeight: "semibold",
    fontFamily: "mono",
    color: "fg.default",
  }),
  // Block I/O
  blockIOContainer: css({
    display: "flex",
    flexDirection: "column",
    gap: "1",
    p: "2",
    bg: "bg.muted",
    rounded: "md",
    minWidth: "100px",
  }),
  // Sparkline
  sparklineSvg: css({
    display: "block",
    w: "100%",
  }),
  // States
  loading: css({
    p: "6",
    textAlign: "center",
    color: "fg.muted",
  }),
  empty: css({
    p: "6",
    textAlign: "center",
    color: "fg.muted",
  }),
};

// ============================================================================
// Mount
// ============================================================================

render(<ResourceMonitor />, document.getElementById("app")!);
