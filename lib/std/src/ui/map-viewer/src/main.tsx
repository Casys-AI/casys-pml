/**
 * Map Viewer UI for MCP Apps
 *
 * Simplified geographic data viewer with:
 * - SVG-based coordinate visualization
 * - Points with labels and colors
 * - Lines connecting points with distances
 * - Polygons with area calculation
 * - DMS/Decimal coordinate formatting
 * - Copy to clipboard functionality
 *
 * @module lib/std/src/ui/map-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import "./styles.css";

// ============================================================================
// Types
// ============================================================================

interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
  id?: string;
}

interface GeoLine {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  label?: string;
  color?: string;
  distance?: number;
  unit?: string;
}

interface GeoPolygon {
  points: Array<{ lat: number; lng: number }>;
  label?: string;
  color?: string;
  fillOpacity?: number;
}

interface MapData {
  points?: GeoPoint[];
  lines?: GeoLine[];
  polygons?: GeoPolygon[];
  center?: { lat: number; lng: number };
  zoom?: number;
  title?: string;
  // Support direct geo_distance output format
  from?: { lat: number; lon: number };
  to?: { lat: number; lon: number };
  distance?: number;
  unit?: string;
  // Support geo_nearest output format
  reference?: { lat: number; lon: number };
  results?: Array<{ lat: number; lon: number; id?: string; distance?: number }>;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// Constants
// ============================================================================

const EARTH_RADIUS_KM = 6371;
const DEFAULT_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Map Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Geo Helpers
// ============================================================================

const toRad = (deg: number): number => deg * (Math.PI / 180);

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { degrees: number; cardinal: string } {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lon2 - lon1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  bearing = (bearing + 360) % 360;

  const cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const cardinal = cardinals[Math.round(bearing / 45) % 8];

  return { degrees: Math.round(bearing * 10) / 10, cardinal };
}

function formatCoordinate(
  value: number,
  type: "lat" | "lng",
  format: "decimal" | "dms"
): string {
  if (format === "decimal") {
    return `${value.toFixed(6)}`;
  }

  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minFloat);
  const seconds = Math.round((minFloat - minutes) * 60 * 10) / 10;

  let direction: string;
  if (type === "lat") {
    direction = value >= 0 ? "N" : "S";
  } else {
    direction = value >= 0 ? "E" : "W";
  }

  return `${degrees}°${minutes}'${seconds}"${direction}`;
}

function formatDistance(km: number, targetUnit?: string): string {
  const unit = targetUnit || "km";
  switch (unit) {
    case "mi":
      return `${(km * 0.621371).toFixed(2)} mi`;
    case "m":
      return `${Math.round(km * 1000)} m`;
    case "nm":
      return `${(km * 0.539957).toFixed(2)} nm`;
    default:
      return `${km.toFixed(2)} km`;
  }
}

// ============================================================================
// Data Normalization
// ============================================================================

function normalizeMapData(raw: unknown): MapData {
  if (!raw || typeof raw !== "object") {
    return { points: [] };
  }

  const data = raw as Record<string, unknown>;

  // Handle geo_distance output: { from, to, distance, unit }
  if (data.from && data.to && typeof data.distance === "number") {
    const from = data.from as { lat: number; lon: number };
    const to = data.to as { lat: number; lon: number };
    return {
      points: [
        { lat: from.lat, lng: from.lon, label: "From", color: DEFAULT_COLORS[0] },
        { lat: to.lat, lng: to.lon, label: "To", color: DEFAULT_COLORS[1] },
      ],
      lines: [
        {
          from: { lat: from.lat, lng: from.lon },
          to: { lat: to.lat, lng: to.lon },
          distance: data.distance as number,
          unit: data.unit as string,
        },
      ],
    };
  }

  // Handle geo_nearest output: { reference, results }
  if (data.reference && Array.isArray(data.results)) {
    const ref = data.reference as { lat: number; lon: number };
    const results = data.results as Array<{
      lat: number;
      lon: number;
      id?: string;
      distance?: number;
    }>;

    const points: GeoPoint[] = [
      { lat: ref.lat, lng: ref.lon, label: "Reference", color: "#ef4444" },
    ];

    results.forEach((r, i) => {
      points.push({
        lat: r.lat,
        lng: r.lon,
        label: r.id || `#${i + 1} (${r.distance?.toFixed(2)} km)`,
        color: DEFAULT_COLORS[(i + 1) % DEFAULT_COLORS.length],
      });
    });

    return { points };
  }

  // Handle geo_bounds output
  if (data.bounds) {
    const bounds = data.bounds as {
      north: number;
      south: number;
      east: number;
      west: number;
    };
    const center = data.center as { lat: number; lon: number } | undefined;

    return {
      polygons: [
        {
          points: [
            { lat: bounds.north, lng: bounds.west },
            { lat: bounds.north, lng: bounds.east },
            { lat: bounds.south, lng: bounds.east },
            { lat: bounds.south, lng: bounds.west },
          ],
          label: "Bounds",
          color: "#3b82f6",
          fillOpacity: 0.1,
        },
      ],
      center: center ? { lat: center.lat, lng: center.lon } : undefined,
    };
  }

  // Handle geo_point_in_polygon output
  if (data.point && data.polygonVertices !== undefined) {
    const point = data.point as { lat: number; lon: number };
    const inside = data.inside as boolean;

    return {
      points: [
        {
          lat: point.lat,
          lng: point.lon,
          label: inside ? "Inside" : "Outside",
          color: inside ? "#22c55e" : "#ef4444",
        },
      ],
    };
  }

  // Standard MapData format
  return data as MapData;
}

// ============================================================================
// SVG Map Component
// ============================================================================

interface SvgMapProps {
  points: GeoPoint[];
  lines: GeoLine[];
  polygons: GeoPolygon[];
  selectedPoint: GeoPoint | null;
  onSelectPoint: (point: GeoPoint | null) => void;
}

function SvgMap({
  points,
  lines,
  polygons,
  selectedPoint,
  onSelectPoint,
}: SvgMapProps) {
  // Calculate bounds
  const allLats: number[] = [];
  const allLngs: number[] = [];

  points.forEach((p) => {
    allLats.push(p.lat);
    allLngs.push(p.lng);
  });
  lines.forEach((l) => {
    allLats.push(l.from.lat, l.to.lat);
    allLngs.push(l.from.lng, l.to.lng);
  });
  polygons.forEach((poly) => {
    poly.points.forEach((p) => {
      allLats.push(p.lat);
      allLngs.push(p.lng);
    });
  });

  if (allLats.length === 0) {
    return (
      <div class={styles.emptyMap}>
        <span>No geographic data to display</span>
      </div>
    );
  }

  const minLat = Math.min(...allLats);
  const maxLat = Math.max(...allLats);
  const minLng = Math.min(...allLngs);
  const maxLng = Math.max(...allLngs);

  // Add padding
  const latPadding = Math.max((maxLat - minLat) * 0.15, 0.01);
  const lngPadding = Math.max((maxLng - minLng) * 0.15, 0.01);

  const viewMinLat = minLat - latPadding;
  const viewMaxLat = maxLat + latPadding;
  const viewMinLng = minLng - lngPadding;
  const viewMaxLng = maxLng + lngPadding;

  const width = 400;
  const height = 300;

  // Transform geo coords to SVG coords
  const toSvg = (lat: number, lng: number): { x: number; y: number } => {
    const x = ((lng - viewMinLng) / (viewMaxLng - viewMinLng)) * width;
    const y = ((viewMaxLat - lat) / (viewMaxLat - viewMinLat)) * height; // Flip Y
    return { x, y };
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      class={styles.svgMap}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Background grid */}
      <defs>
        <pattern
          id="grid"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="var(--colors-border-subtle)"
            stroke-width="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />

      {/* Polygons */}
      {polygons.map((poly, i) => {
        const pathPoints = poly.points.map((p) => toSvg(p.lat, p.lng));
        const pathD =
          pathPoints.map((p, j) => `${j === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

        return (
          <g key={`polygon-${i}`}>
            <path
              d={pathD}
              fill={poly.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              fill-opacity={poly.fillOpacity ?? 0.2}
              stroke={poly.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              stroke-width="2"
            />
            {poly.label && (
              <text
                x={pathPoints.reduce((sum, p) => sum + p.x, 0) / pathPoints.length}
                y={pathPoints.reduce((sum, p) => sum + p.y, 0) / pathPoints.length}
                text-anchor="middle"
                fill="var(--colors-fg-default)"
                font-size="10"
              >
                {poly.label}
              </text>
            )}
          </g>
        );
      })}

      {/* Lines */}
      {lines.map((line, i) => {
        const from = toSvg(line.from.lat, line.from.lng);
        const to = toSvg(line.to.lat, line.to.lng);
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const dist =
          line.distance ??
          calculateDistance(line.from.lat, line.from.lng, line.to.lat, line.to.lng);

        return (
          <g key={`line-${i}`}>
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={line.color || "#6b7280"}
              stroke-width="2"
              stroke-dasharray="6,3"
            />
            <rect
              x={midX - 30}
              y={midY - 10}
              width="60"
              height="18"
              rx="4"
              fill="var(--colors-bg-default)"
              stroke="var(--colors-border-default)"
            />
            <text
              x={midX}
              y={midY + 4}
              text-anchor="middle"
              fill="var(--colors-fg-default)"
              font-size="10"
              font-family="monospace"
            >
              {formatDistance(dist, line.unit)}
            </text>
          </g>
        );
      })}

      {/* Points */}
      {points.map((point, i) => {
        const pos = toSvg(point.lat, point.lng);
        const isSelected = selectedPoint?.lat === point.lat && selectedPoint?.lng === point.lng;
        const color = point.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];

        return (
          <g
            key={`point-${i}`}
            class={styles.pointGroup}
            onClick={() => onSelectPoint(isSelected ? null : point)}
          >
            {/* Pin shadow */}
            <ellipse
              cx={pos.x}
              cy={pos.y + 14}
              rx={isSelected ? 8 : 6}
              ry={isSelected ? 3 : 2}
              fill="rgba(0,0,0,0.2)"
            />
            {/* Pin marker */}
            <path
              d={`M ${pos.x} ${pos.y - 20}
                  C ${pos.x - 10} ${pos.y - 20}, ${pos.x - 10} ${pos.y - 8}, ${pos.x} ${pos.y}
                  C ${pos.x + 10} ${pos.y - 8}, ${pos.x + 10} ${pos.y - 20}, ${pos.x} ${pos.y - 20} Z`}
              fill={color}
              stroke={isSelected ? "var(--colors-fg-default)" : "white"}
              stroke-width={isSelected ? 2 : 1}
            />
            {/* Inner circle */}
            <circle cx={pos.x} cy={pos.y - 14} r="4" fill="white" />
            {/* Label */}
            {point.label && (
              <g>
                <rect
                  x={pos.x - 40}
                  y={pos.y - 40}
                  width="80"
                  height="16"
                  rx="3"
                  fill="var(--colors-bg-default)"
                  stroke={color}
                  stroke-width="1"
                />
                <text
                  x={pos.x}
                  y={pos.y - 28}
                  text-anchor="middle"
                  fill="var(--colors-fg-default)"
                  font-size="10"
                  font-weight="500"
                >
                  {point.label.length > 12
                    ? point.label.slice(0, 12) + "..."
                    : point.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Compass */}
      <g transform="translate(370, 30)">
        <circle cx="0" cy="0" r="18" fill="var(--colors-bg-default)" stroke="var(--colors-border-default)" />
        <text x="0" y="-6" text-anchor="middle" font-size="10" font-weight="bold" fill="var(--colors-fg-default)">N</text>
        <path d="M 0 -12 L 3 0 L 0 -4 L -3 0 Z" fill="#ef4444" />
        <path d="M 0 12 L 3 0 L 0 4 L -3 0 Z" fill="var(--colors-fg-muted)" />
      </g>
    </svg>
  );
}

// ============================================================================
// Point Details Component
// ============================================================================

interface PointDetailsProps {
  point: GeoPoint;
  coordFormat: "decimal" | "dms";
  onCopy: (text: string) => void;
}

function PointDetails({ point, coordFormat, onCopy }: PointDetailsProps) {
  const latStr = formatCoordinate(point.lat, "lat", coordFormat);
  const lngStr = formatCoordinate(point.lng, "lng", coordFormat);
  const copyText =
    coordFormat === "decimal"
      ? `${point.lat}, ${point.lng}`
      : `${latStr}, ${lngStr}`;

  return (
    <div class={styles.pointDetails}>
      <div class={styles.pointHeader}>
        <span
          class={styles.pointColorDot}
          style={{ backgroundColor: point.color || DEFAULT_COLORS[0] }}
        />
        <span class={styles.pointLabel}>{point.label || "Point"}</span>
      </div>
      <div class={styles.coordRow}>
        <span class={styles.coordLabel}>Lat:</span>
        <code class={styles.coordValue}>{latStr}</code>
      </div>
      <div class={styles.coordRow}>
        <span class={styles.coordLabel}>Lng:</span>
        <code class={styles.coordValue}>{lngStr}</code>
      </div>
      <button class={styles.copyBtn} onClick={() => onCopy(copyText)}>
        Copy Coordinates
      </button>
    </div>
  );
}

// ============================================================================
// Points List Component
// ============================================================================

interface PointsListProps {
  points: GeoPoint[];
  lines: GeoLine[];
  coordFormat: "decimal" | "dms";
  onSelectPoint: (point: GeoPoint) => void;
  onCopy: (text: string) => void;
}

function PointsList({
  points,
  lines,
  coordFormat,
  onSelectPoint,
  onCopy,
}: PointsListProps) {
  if (points.length === 0 && lines.length === 0) {
    return null;
  }

  return (
    <div class={styles.pointsList}>
      <h3 class={styles.listTitle}>Locations</h3>
      {points.map((point, i) => {
        const latStr = formatCoordinate(point.lat, "lat", coordFormat);
        const lngStr = formatCoordinate(point.lng, "lng", coordFormat);

        return (
          <div
            key={i}
            class={styles.listItem}
            onClick={() => onSelectPoint(point)}
          >
            <span
              class={styles.pointColorDot}
              style={{ backgroundColor: point.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] }}
            />
            <div class={styles.listItemContent}>
              <span class={styles.listItemLabel}>
                {point.label || `Point ${i + 1}`}
              </span>
              <code class={styles.listItemCoords}>
                {latStr}, {lngStr}
              </code>
            </div>
            <button
              class={styles.listCopyBtn}
              onClick={(e) => {
                e.stopPropagation();
                onCopy(`${point.lat}, ${point.lng}`);
              }}
              title="Copy coordinates"
            >
              Copy
            </button>
          </div>
        );
      })}

      {/* Distance summary for lines */}
      {lines.length > 0 && (
        <div class={styles.distanceSummary}>
          <h4 class={styles.summaryTitle}>Distances</h4>
          {lines.map((line, i) => {
            const dist =
              line.distance ??
              calculateDistance(
                line.from.lat,
                line.from.lng,
                line.to.lat,
                line.to.lng
              );
            const bearing = calculateBearing(
              line.from.lat,
              line.from.lng,
              line.to.lat,
              line.to.lng
            );

            return (
              <div key={i} class={styles.distanceRow}>
                <span class={styles.distanceLabel}>
                  {line.label || `Route ${i + 1}`}
                </span>
                <span class={styles.distanceValue}>
                  {formatDistance(dist, line.unit)}
                </span>
                <span class={styles.bearingValue}>
                  {bearing.degrees}deg ({bearing.cardinal})
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function MapViewer() {
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<GeoPoint | null>(null);
  const [coordFormat, setCoordFormat] = useState<"decimal" | "dms">("decimal");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
        console.log("[map-viewer] Connected to MCP host");
      })
      .catch(() => {
        console.log("[map-viewer] No MCP host (standalone mode)");
      });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find(
          (c) => c.type === "text"
        ) as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }
        const parsed = JSON.parse(textContent.text);
        setData(normalizeMapData(parsed));
        setSelectedPoint(null);
      } catch (e) {
        setError(
          `Failed to parse map data: ${e instanceof Error ? e.message : "Unknown error"}`
        );
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Extract points, lines, polygons
  const { points, lines, polygons } = useMemo(() => {
    if (!data) {
      return { points: [], lines: [], polygons: [] };
    }
    return {
      points: data.points || [],
      lines: data.lines || [],
      polygons: data.polygons || [],
    };
  }, [data]);

  // Copy handler
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback("Copied!");
      notifyModel("copy", { text });
      setTimeout(() => setCopyFeedback(null), 1500);
    });
  }, []);

  // Select point handler
  const handleSelectPoint = useCallback((point: GeoPoint | null) => {
    setSelectedPoint(point);
    if (point) {
      notifyModel("selectPoint", { point });
    }
  }, []);

  // Render states
  if (loading) {
    return (
      <div class={styles.container}>
        <div class={styles.loading}>Loading map data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div class={styles.container}>
        <div class={styles.error}>{error}</div>
      </div>
    );
  }

  if (!data || (points.length === 0 && lines.length === 0 && polygons.length === 0)) {
    return (
      <div class={styles.container}>
        <div class={styles.empty}>No geographic data to display</div>
      </div>
    );
  }

  return (
    <div class={styles.container}>
      {/* Header */}
      <div class={styles.header}>
        <h2 class={styles.title}>{data.title || "Map Viewer"}</h2>
        <div class={styles.headerControls}>
          <button
            class={coordFormat === "decimal" ? styles.formatBtnActive : styles.formatBtn}
            onClick={() => setCoordFormat("decimal")}
          >
            Decimal
          </button>
          <button
            class={coordFormat === "dms" ? styles.formatBtnActive : styles.formatBtn}
            onClick={() => setCoordFormat("dms")}
          >
            DMS
          </button>
        </div>
      </div>

      {/* Copy feedback */}
      {copyFeedback && <div class={styles.copyFeedback}>{copyFeedback}</div>}

      {/* Map */}
      <div class={styles.mapContainer}>
        <SvgMap
          points={points}
          lines={lines}
          polygons={polygons}
          selectedPoint={selectedPoint}
          onSelectPoint={handleSelectPoint}
        />
      </div>

      {/* Selected point details */}
      {selectedPoint && (
        <PointDetails
          point={selectedPoint}
          coordFormat={coordFormat}
          onCopy={handleCopy}
        />
      )}

      {/* Points list */}
      <PointsList
        points={points}
        lines={lines}
        coordFormat={coordFormat}
        onSelectPoint={handleSelectPoint}
        onCopy={handleCopy}
      />
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
    p: "4",
    minH: "300px",
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
  headerControls: css({
    display: "flex",
    gap: "1",
  }),
  formatBtn: css({
    px: "2",
    py: "1",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.subtle",
    color: "fg.muted",
    fontSize: "xs",
    cursor: "pointer",
    _hover: { bg: "bg.muted" },
  }),
  formatBtnActive: css({
    px: "2",
    py: "1",
    border: "1px solid",
    borderColor: "border.accent",
    rounded: "md",
    bg: "bg.accent",
    color: "fg.default",
    fontSize: "xs",
    cursor: "pointer",
    fontWeight: "medium",
  }),
  copyFeedback: css({
    position: "fixed",
    top: "4",
    right: "4",
    px: "3",
    py: "2",
    bg: "green.600",
    color: "white",
    rounded: "md",
    fontSize: "sm",
    fontWeight: "medium",
    zIndex: 1000,
    animation: "fadeIn 0.2s ease-out",
  }),
  mapContainer: css({
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
    overflow: "hidden",
    bg: "bg.subtle",
    mb: "3",
  }),
  svgMap: css({
    display: "block",
    w: "100%",
    h: "auto",
    minH: "200px",
  }),
  emptyMap: css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    h: "200px",
    color: "fg.muted",
  }),
  pointGroup: css({
    cursor: "pointer",
    transition: "transform 0.15s ease",
    _hover: { transform: "scale(1.1)" },
  }),
  pointDetails: css({
    p: "3",
    mb: "3",
    bg: "bg.subtle",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "lg",
  }),
  pointHeader: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    mb: "2",
  }),
  pointColorDot: css({
    w: "12px",
    h: "12px",
    rounded: "full",
    flexShrink: 0,
  }),
  pointLabel: css({
    fontWeight: "semibold",
    fontSize: "md",
  }),
  coordRow: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    mb: "1",
  }),
  coordLabel: css({
    w: "30px",
    color: "fg.muted",
    fontSize: "xs",
    fontWeight: "medium",
  }),
  coordValue: css({
    fontFamily: "mono",
    fontSize: "sm",
    color: "fg.default",
  }),
  copyBtn: css({
    mt: "2",
    px: "3",
    py: "1.5",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "md",
    bg: "bg.default",
    color: "fg.default",
    fontSize: "xs",
    cursor: "pointer",
    _hover: { bg: "bg.muted", borderColor: "border.emphasized" },
  }),
  pointsList: css({
    borderTop: "1px solid",
    borderColor: "border.subtle",
    pt: "3",
  }),
  listTitle: css({
    fontSize: "sm",
    fontWeight: "semibold",
    color: "fg.muted",
    textTransform: "uppercase",
    letterSpacing: "wide",
    mb: "2",
    m: 0,
  }),
  listItem: css({
    display: "flex",
    alignItems: "center",
    gap: "2",
    p: "2",
    rounded: "md",
    cursor: "pointer",
    _hover: { bg: "bg.subtle" },
  }),
  listItemContent: css({
    flex: 1,
    minW: 0,
  }),
  listItemLabel: css({
    display: "block",
    fontWeight: "medium",
    fontSize: "sm",
    truncate: true,
  }),
  listItemCoords: css({
    display: "block",
    fontFamily: "mono",
    fontSize: "xs",
    color: "fg.muted",
  }),
  listCopyBtn: css({
    px: "2",
    py: "1",
    border: "1px solid",
    borderColor: "border.default",
    rounded: "sm",
    bg: "transparent",
    color: "fg.muted",
    fontSize: "xs",
    cursor: "pointer",
    _hover: { bg: "bg.muted", color: "fg.default" },
  }),
  distanceSummary: css({
    mt: "3",
    pt: "3",
    borderTop: "1px solid",
    borderColor: "border.subtle",
  }),
  summaryTitle: css({
    fontSize: "xs",
    fontWeight: "semibold",
    color: "fg.muted",
    textTransform: "uppercase",
    letterSpacing: "wide",
    mb: "2",
    m: 0,
  }),
  distanceRow: css({
    display: "flex",
    alignItems: "center",
    gap: "3",
    py: "1",
  }),
  distanceLabel: css({
    flex: 1,
    fontSize: "sm",
    color: "fg.default",
  }),
  distanceValue: css({
    fontFamily: "mono",
    fontSize: "sm",
    fontWeight: "semibold",
    color: "blue.600",
    _dark: { color: "blue.400" },
  }),
  bearingValue: css({
    fontFamily: "mono",
    fontSize: "xs",
    color: "fg.muted",
  }),
  loading: css({
    p: "10",
    textAlign: "center",
    color: "fg.muted",
  }),
  empty: css({
    p: "10",
    textAlign: "center",
    color: "fg.muted",
  }),
  error: css({
    p: "4",
    bg: "red.50",
    color: "red.700",
    rounded: "md",
    _dark: { bg: "red.950", color: "red.300" },
  }),
};

// ============================================================================
// Mount
// ============================================================================

render(<MapViewer />, document.getElementById("app")!);
