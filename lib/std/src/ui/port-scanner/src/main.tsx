/**
 * Port Scanner UI for MCP Apps
 *
 * Displays port scan results with visual status indicators.
 * Features:
 * - Color-coded port status (open/closed/filtered)
 * - Summary statistics
 * - Filter by status
 * - Service name display
 *
 * @module lib/std/src/ui/port-scanner
 */

import { createRoot } from "react-dom/client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Grid, Center } from "../../styled-system/jsx";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import * as Table from "../../components/ui/table";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface PortResult {
  port: number;
  status: "open" | "closed" | "filtered" | "timeout";
  service?: string;
  banner?: string;
}

interface ScanResult {
  host: string;
  ports: PortResult[];
  scanTime?: number;
  timestamp?: string;
}

interface ContentItem {
  type: string;
  text?: string;
}

type FilterStatus = "all" | "open" | "closed" | "filtered";

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
// Status Badge Component
// ============================================================================

function PortStatusBadge({ status }: { status: PortResult["status"] }) {
  const colorMap: Record<string, "green" | "red" | "orange" | "gray"> = {
    open: "green",
    closed: "red",
    filtered: "orange",
    timeout: "gray",
  };

  return (
    <Badge variant="subtle" colorPalette={colorMap[status] || "gray"} size="sm">
      {status.toUpperCase()}
    </Badge>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function PortScanner() {
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("all");

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[port-scanner] Connected to MCP host");
    }).catch(() => {
      console.log("[port-scanner] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }

        const parsed = JSON.parse(textContent.text);
        const normalized = normalizeData(parsed);
        setData(normalized);
        setFilter("all");
      } catch (e) {
        setError(`Failed to parse scan results: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Filter ports
  const filteredPorts = useMemo(() => {
    if (!data?.ports) return [];
    if (filter === "all") return data.ports;
    return data.ports.filter((p) => p.status === filter);
  }, [data?.ports, filter]);

  // Statistics
  const stats = useMemo(() => {
    if (!data?.ports) return { total: 0, open: 0, closed: 0, filtered: 0 };
    return {
      total: data.ports.length,
      open: data.ports.filter((p) => p.status === "open").length,
      closed: data.ports.filter((p) => p.status === "closed").length,
      filtered: data.ports.filter((p) => p.status === "filtered" || p.status === "timeout").length,
    };
  }, [data?.ports]);

  // Handlers
  const handlePortClick = useCallback((port: PortResult) => {
    notifyModel("select", { port: port.port, status: port.status, service: port.service });
  }, []);

  // Render states
  if (loading) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Center p="10" color="fg.muted">Scanning ports...</Center>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Box p="4" bg={{ base: "red.50", _dark: "red.950" }} color={{ base: "red.700", _dark: "red.300" }} rounded="md">
          {error}
        </Box>
      </Box>
    );
  }

  if (!data || data.ports.length === 0) {
    return (
      <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
        <Center p="10" color="fg.muted">No scan results</Center>
      </Box>
    );
  }

  return (
    <Box p="4" fontFamily="sans" fontSize="sm" color="fg.default" bg="bg.canvas" minH="200px">
      {/* Header */}
      <Box mb="4">
        <Box fontSize="lg" fontWeight="semibold" mb="1">{data.host}</Box>
        {data.timestamp && (
          <Box fontSize="xs" color="fg.muted">
            Scanned: {new Date(data.timestamp).toLocaleString()}
            {data.scanTime && ` (${data.scanTime}ms)`}
          </Box>
        )}
      </Box>

      {/* Statistics */}
      <Grid columns={{ base: 2, sm: 4 }} gap="3" mb="4">
        <StatCard label="Total" value={stats.total} color="blue" />
        <StatCard label="Open" value={stats.open} color="green" />
        <StatCard label="Closed" value={stats.closed} color="red" />
        <StatCard label="Filtered" value={stats.filtered} color="orange" />
      </Grid>

      {/* Filter buttons */}
      <Flex gap="2" mb="3" flexWrap="wrap">
        {(["all", "open", "closed", "filtered"] as FilterStatus[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "solid" : "outline"}
            size="xs"
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== "all" && ` (${stats[f as keyof typeof stats]})`}
          </Button>
        ))}
      </Flex>

      {/* Results table */}
      <Box overflowX="auto" rounded="lg">
        <Table.Root size="sm" variant="outline">
          <Table.Head>
            <Table.Row>
              <Table.Header className={css({ w: "80px" })}>Port</Table.Header>
              <Table.Header className={css({ w: "100px" })}>Status</Table.Header>
              <Table.Header>Service</Table.Header>
              <Table.Header>Banner</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {filteredPorts.map((port) => (
              <Table.Row
                key={port.port}
                onClick={() => handlePortClick(port)}
                className={css({
                  cursor: "pointer",
                  _hover: { bg: "bg.subtle" },
                })}
              >
                <Table.Cell fontFamily="mono" fontWeight="medium">
                  {port.port}
                </Table.Cell>
                <Table.Cell>
                  <PortStatusBadge status={port.status} />
                </Table.Cell>
                <Table.Cell color={port.service ? "fg.default" : "fg.muted"}>
                  {port.service || "-"}
                </Table.Cell>
                <Table.Cell
                  color="fg.muted"
                  fontSize="xs"
                  className={css({
                    maxW: "200px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  })}
                  title={port.banner}
                >
                  {port.banner || "-"}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Summary for open ports */}
      {stats.open > 0 && filter === "all" && (
        <Box mt="3" p="3" bg="bg.subtle" rounded="md">
          <Box fontSize="xs" color="fg.muted" mb="1">Open ports:</Box>
          <Flex gap="2" flexWrap="wrap">
            {data.ports
              .filter((p) => p.status === "open")
              .map((p) => (
                <Badge key={p.port} variant="outline" size="sm">
                  {p.port}{p.service ? ` (${p.service})` : ""}
                </Badge>
              ))}
          </Flex>
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// Stat Card Component
// ============================================================================

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const bgColor = {
    blue: { base: "blue.50", _dark: "blue.950" },
    green: { base: "green.50", _dark: "green.950" },
    red: { base: "red.50", _dark: "red.950" },
    orange: { base: "orange.50", _dark: "orange.950" },
  }[color] || { base: "gray.50", _dark: "gray.900" };

  const textColor = {
    blue: { base: "blue.700", _dark: "blue.300" },
    green: { base: "green.700", _dark: "green.300" },
    red: { base: "red.700", _dark: "red.300" },
    orange: { base: "orange.700", _dark: "orange.300" },
  }[color] || { base: "gray.700", _dark: "gray.300" };

  return (
    <Box p="3" rounded="md" bg={bgColor} textAlign="center">
      <Box fontSize="2xl" fontWeight="bold" color={textColor}>{value}</Box>
      <Box fontSize="xs" color="fg.muted">{label}</Box>
    </Box>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeData(parsed: unknown): ScanResult | null {
  // Handle direct ScanResult format
  if (parsed && typeof parsed === "object" && "host" in parsed && "ports" in parsed) {
    return parsed as ScanResult;
  }

  // Handle array of port results
  if (Array.isArray(parsed)) {
    // Array of {port, status, ...}
    if (parsed.length > 0 && typeof parsed[0] === "object" && "port" in parsed[0]) {
      return {
        host: "Unknown",
        ports: parsed as PortResult[],
        timestamp: new Date().toISOString(),
      };
    }

    // Simple array of port numbers (assume all open)
    if (parsed.length > 0 && typeof parsed[0] === "number") {
      return {
        host: "Unknown",
        ports: parsed.map((p) => ({ port: p as number, status: "open" as const })),
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Handle object with results array
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    // Look for common patterns
    if ("results" in obj && Array.isArray(obj.results)) {
      return normalizeData(obj.results);
    }
    if ("openPorts" in obj && Array.isArray(obj.openPorts)) {
      return {
        host: (obj.host as string) || "Unknown",
        ports: (obj.openPorts as number[]).map((p) => ({ port: p, status: "open" as const })),
        timestamp: new Date().toISOString(),
      };
    }
  }

  return null;
}

// ============================================================================
// Well-known ports service names
// ============================================================================

const WELL_KNOWN_PORTS: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  143: "IMAP",
  443: "HTTPS",
  465: "SMTPS",
  587: "Submission",
  993: "IMAPS",
  995: "POP3S",
  1433: "MSSQL",
  1521: "Oracle",
  3000: "Dev Server",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  5672: "AMQP",
  6379: "Redis",
  8080: "HTTP Alt",
  8443: "HTTPS Alt",
  9200: "Elasticsearch",
  27017: "MongoDB",
};

// ============================================================================
// Mount
// ============================================================================

createRoot(document.getElementById("app")!).render(<PortScanner />);
