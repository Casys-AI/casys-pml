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

import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { css } from "../../styled-system/css";
import { Box, Flex, Grid, VStack } from "../../styled-system/jsx";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import "../../global.css";

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
// Styles (minimal)
// ============================================================================

const depCardBase = css({
  p: "2.5",
  bg: "bg.subtle",
  rounded: "md",
  borderLeft: "3px solid",
  cursor: "pointer",
  transition: "all 0.15s",
  _hover: { bg: "bg.muted" },
});

const borderColors = {
  prod: css({ borderLeftColor: "blue.500" }),
  dev: css({ borderLeftColor: "purple.500" }),
  peer: css({ borderLeftColor: "yellow.500" }),
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
      <Box p="4" maxW="900px" mx="auto" color="fg.default" bg="bg.canvas" minH="100vh" fontFamily="sans">
        <Box textAlign="center" p="10" color="fg.muted">Loading dependencies...</Box>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p="4" maxW="900px" mx="auto" color="fg.default" bg="bg.canvas" minH="100vh" fontFamily="sans">
        <Box textAlign="center" p="10" color="fg.muted">No data received</Box>
      </Box>
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
    <Box p="4" maxW="900px" mx="auto" color="fg.default" bg="bg.canvas" minH="100vh" fontFamily="sans">
      {/* Header */}
      <Box mb="5">
        <Box fontSize="lg" fontWeight="semibold" mb="1" color="fg.default">
          {data.name}
        </Box>
        <Box color="fg.muted" fontSize="sm">v{data.version}</Box>
      </Box>

      {/* Stats */}
      <Flex gap="4" mb="5" flexWrap="wrap">
        <Box p="3" bg="bg.subtle" rounded="lg" textAlign="center" border="1px solid" borderColor="border.default">
          <Box fontSize="2xl" fontWeight="bold" color={{ base: "blue.600", _dark: "blue.400" }}>
            {data.dependencies?.length || 0}
          </Box>
          <Box fontSize="xs" color="fg.muted" mt="1">Production</Box>
        </Box>
        <Box p="3" bg="bg.subtle" rounded="lg" textAlign="center" border="1px solid" borderColor="border.default">
          <Box fontSize="2xl" fontWeight="bold" color={{ base: "blue.600", _dark: "blue.400" }}>
            {data.devDependencies?.length || 0}
          </Box>
          <Box fontSize="xs" color="fg.muted" mt="1">Development</Box>
        </Box>
        <Box p="3" bg="bg.subtle" rounded="lg" textAlign="center" border="1px solid" borderColor="border.default">
          <Box fontSize="2xl" fontWeight="bold" color={{ base: "blue.600", _dark: "blue.400" }}>
            {data.totalCount || allDeps.length}
          </Box>
          <Box fontSize="xs" color="fg.muted" mt="1">Total</Box>
        </Box>
      </Flex>

      {/* Search */}
      <Box mb="4">
        <Input
          type="text"
          placeholder="Search dependencies..."
          value={search}
          onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
        />
      </Box>

      {/* Production Dependencies */}
      {prodDeps.length > 0 && (
        <VStack gap="3" mb="6" alignItems="stretch">
          <Box
            fontSize="sm"
            fontWeight="semibold"
            color="fg.muted"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Production Dependencies
          </Box>
          <Grid gridTemplateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap="2">
            {prodDeps.map((dep) => (
              <Box
                key={dep.name}
                className={`${depCardBase} ${borderColors.prod}`}
                onClick={() => handleSelect(dep)}
              >
                <Box fontWeight="medium" fontSize="sm" mb="0.5" color="fg.default">
                  {dep.name}
                </Box>
                <Box fontSize="xs" color="fg.muted" fontFamily="mono">
                  {dep.version}
                </Box>
              </Box>
            ))}
          </Grid>
        </VStack>
      )}

      {/* Dev Dependencies */}
      {devDeps.length > 0 && (
        <VStack gap="3" mb="6" alignItems="stretch">
          <Box
            fontSize="sm"
            fontWeight="semibold"
            color="fg.muted"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Dev Dependencies
          </Box>
          <Grid gridTemplateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap="2">
            {devDeps.map((dep) => (
              <Box
                key={dep.name}
                className={`${depCardBase} ${borderColors.dev}`}
                onClick={() => handleSelect(dep)}
              >
                <Box fontWeight="medium" fontSize="sm" mb="0.5" color="fg.default">
                  {dep.name}
                </Box>
                <Box fontSize="xs" color="fg.muted" fontFamily="mono">
                  {dep.version}
                </Box>
              </Box>
            ))}
          </Grid>
        </VStack>
      )}

      {/* Peer Dependencies */}
      {peerDeps.length > 0 && (
        <VStack gap="3" mb="6" alignItems="stretch">
          <Box
            fontSize="sm"
            fontWeight="semibold"
            color="fg.muted"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Peer Dependencies
          </Box>
          <Grid gridTemplateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap="2">
            {peerDeps.map((dep) => (
              <Box
                key={dep.name}
                className={`${depCardBase} ${borderColors.peer}`}
                onClick={() => handleSelect(dep)}
              >
                <Box fontWeight="medium" fontSize="sm" mb="0.5" color="fg.default">
                  {dep.name}
                </Box>
                <Box fontSize="xs" color="fg.muted" fontFamily="mono">
                  {dep.version}
                </Box>
              </Box>
            ))}
          </Grid>
        </VStack>
      )}

      {filteredDeps.length === 0 && (
        <Box textAlign="center" p="10" color="fg.muted">No dependencies found</Box>
      )}
    </Box>
  );
}

createRoot(document.getElementById("app")!).render(<DependencyGraph />);
