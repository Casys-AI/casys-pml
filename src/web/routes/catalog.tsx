/**
 * MCP Catalog Page
 *
 * Cloud-only: public catalog of available MCP servers.
 * Shows all MCPs provided via PML's unified gateway.
 *
 * @module web/routes/catalog
 */

import { page } from "fresh";
import type { FreshContext } from "fresh";
import { Head } from "fresh/runtime";
import type { MCPCatalogEntry } from "../../cloud/ui/catalog/types.ts";
import MCPCatalogIsland from "../islands/MCPCatalogIsland.tsx";
import { BaseLayout } from "../components/layout/mod.ts";
import type { AuthState } from "./_middleware.ts";

interface CatalogData {
  entries: MCPCatalogEntry[];
  isCloudMode: boolean;
  user: AuthState["user"];
}

/**
 * Static catalog entries (will be replaced by registry API)
 * TODO: Load from registry via API once Story 14.4 is implemented
 */
const CATALOG_ENTRIES: MCPCatalogEntry[] = [
  // PML Built-in (Deno)
  {
    fqdn: "std:json",
    name: "JSON Tools",
    description: "Parse, stringify, query, and transform JSON data with JSONPath support.",
    type: "deno",
    isBuiltin: true,
    toolCount: 5,
  },
  {
    fqdn: "std:math",
    name: "Math Tools",
    description: "Mathematical operations, statistics, and numerical analysis.",
    type: "deno",
    isBuiltin: true,
    toolCount: 12,
  },
  {
    fqdn: "std:datetime",
    name: "DateTime Tools",
    description: "Date and time parsing, formatting, and manipulation.",
    type: "deno",
    isBuiltin: true,
    toolCount: 8,
  },
  {
    fqdn: "std:crypto",
    name: "Crypto Tools",
    description: "Hashing, encryption, and secure random generation.",
    type: "deno",
    isBuiltin: true,
    toolCount: 6,
  },
  {
    fqdn: "std:http",
    name: "HTTP Tools",
    description: "HTTP client for making web requests with retry and timeout support.",
    type: "deno",
    isBuiltin: true,
    toolCount: 4,
  },
  {
    fqdn: "std:text",
    name: "Text Tools",
    description: "Text manipulation, search, and transformation utilities.",
    type: "deno",
    isBuiltin: true,
    toolCount: 10,
  },
  // Cloud MCPs (BYOK)
  {
    fqdn: "github:*",
    name: "GitHub",
    description: "Interact with GitHub repositories, issues, pull requests, and more.",
    type: "cloud",
    requiresApiKey: true,
    toolCount: 15,
  },
  {
    fqdn: "slack:*",
    name: "Slack",
    description: "Send messages, manage channels, and interact with Slack workspaces.",
    type: "cloud",
    requiresApiKey: true,
    toolCount: 8,
  },
  // Stdio MCPs (npm/docker)
  {
    fqdn: "filesystem:*",
    name: "Filesystem",
    description: "Read, write, and manage files in the local filesystem.",
    type: "stdio",
    toolCount: 6,
  },
  {
    fqdn: "memory:*",
    name: "Memory",
    description: "Persistent key-value memory for context across conversations.",
    type: "stdio",
    toolCount: 4,
  },
  {
    fqdn: "sequential-thinking:*",
    name: "Sequential Thinking",
    description: "Step-by-step reasoning and thought chain management.",
    type: "stdio",
    toolCount: 3,
  },
  {
    fqdn: "playwright:*",
    name: "Playwright",
    description: "Browser automation for web scraping and testing.",
    type: "stdio",
    toolCount: 12,
  },
];

export const handler = {
  GET(ctx: FreshContext<AuthState>) {
    return page({
      entries: CATALOG_ENTRIES,
      isCloudMode: ctx.state.isCloudMode,
      user: ctx.state.user,
    });
  },
};

export default function CatalogPage({ data }: { data: CatalogData }) {
  const { entries, isCloudMode, user } = data;

  return (
    <>
      <Head>
        <title>MCP Catalog - Casys PML</title>
        <meta name="description" content="Browse available MCP servers provided via PML's unified gateway." />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>

      <BaseLayout user={user} isCloudMode={isCloudMode}>
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div class="mb-8">
            <h1
              class="text-3xl font-bold mb-2"
              style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}
            >
              MCP Catalog
            </h1>
            <p class="text-lg" style={{ color: "var(--text-muted)" }}>
              Browse available MCP servers provided via PML's unified gateway.
              All MCPs are installed on-demand when you first use them.
            </p>
          </div>

          {/* Catalog Island */}
          <MCPCatalogIsland entries={entries} />
        </div>
      </BaseLayout>
    </>
  );
}
