/**
 * Serve Command
 *
 * CLI command to start AgentCards as an MCP gateway server
 *
 * @module cli/commands/serve
 */

import { Command } from "@cliffy/command";
import * as log from "@std/log";
import { createDefaultClient } from "../../db/client.ts";
import { MigrationRunner, getAllMigrations } from "../../db/migrations.ts";
import { MCPServerDiscovery } from "../../mcp/discovery.ts";
import { MCPClient } from "../../mcp/client.ts";
import { EmbeddingModel } from "../../vector/embeddings.ts";
import { VectorSearch } from "../../vector/search.ts";
import { GraphRAGEngine } from "../../graphrag/graph-engine.ts";
import { DAGSuggester } from "../../graphrag/dag-suggester.ts";
import { ParallelExecutor } from "../../dag/executor.ts";
import { AgentCardsGatewayServer } from "../../mcp/gateway-server.ts";
import type { MCPServer } from "../../mcp/types.ts";
import type { ToolExecutor } from "../../dag/types.ts";

/**
 * Default MCP config path
 * Supports both AgentCards config and Claude Code config
 */
const DEFAULT_CONFIG_PATHS = [
  `${Deno.env.get("HOME")}/.agentcards/config.yaml`,
  `${Deno.env.get("HOME")}/.config/Claude/claude_desktop_config.json`,
];

/**
 * Find first existing config file
 */
async function findConfigFile(customPath?: string): Promise<string> {
  if (customPath) {
    try {
      await Deno.stat(customPath);
      return customPath;
    } catch {
      throw new Error(`Config file not found: ${customPath}`);
    }
  }

  for (const path of DEFAULT_CONFIG_PATHS) {
    try {
      await Deno.stat(path);
      log.info(`Found config at: ${path}`);
      return path;
    } catch {
      // Continue searching
    }
  }

  throw new Error(
    `No MCP configuration found. Checked:\n${DEFAULT_CONFIG_PATHS.map((p) => `  - ${p}`).join("\n")}\n\nRun 'agentcards init' first.`,
  );
}

/**
 * Discover and connect to MCP servers
 */
async function connectToMCPServers(
  servers: MCPServer[],
): Promise<Map<string, MCPClient>> {
  const clients = new Map<string, MCPClient>();

  log.info(`Connecting to ${servers.length} MCP server(s)...`);

  for (const server of servers) {
    try {
      const client = new MCPClient(server, 10000);
      await client.connect();
      clients.set(server.id, client);
      log.info(`  ✓ Connected: ${server.id}`);
    } catch (error) {
      log.error(`  ✗ Failed to connect to ${server.id}: ${error}`);
      // Continue with other servers (gateway is resilient to individual failures)
    }
  }

  if (clients.size === 0) {
    throw new Error("Failed to connect to any MCP servers");
  }

  return clients;
}

/**
 * Create tool executor function for ParallelExecutor
 *
 * This function is called by the executor to execute individual tools.
 * It routes tool calls to the appropriate MCP client.
 */
function createToolExecutor(
  clients: Map<string, MCPClient>,
): ToolExecutor {
  return async (toolName: string, args: Record<string, unknown>) => {
    // Parse tool name: "serverId:toolName"
    const [serverId, ...toolNameParts] = toolName.split(":");
    const actualToolName = toolNameParts.join(":");

    const client = clients.get(serverId);
    if (!client) {
      throw new Error(`Unknown MCP server: ${serverId}`);
    }

    // Execute tool via MCP client
    return await client.callTool(actualToolName, args);
  };
}

/**
 * Create serve command
 *
 * Usage:
 *   agentcards serve                 # Auto-detect config and start gateway
 *   agentcards serve --config <path> # Use custom config path
 *   agentcards serve --port 3000     # Enable HTTP server (stdio is default)
 */
export function createServeCommand() {
  return new Command()
    .name("serve")
    .description("Start AgentCards MCP gateway server (stdio mode)")
    .option(
      "--config <path:string>",
      "Path to MCP config file (auto-detected if not provided)",
    )
    .option(
      "--port <port:number>",
      "HTTP port for SSE transport (optional, stdio is default)",
    )
    .option(
      "--no-speculative",
      "Disable speculative execution mode",
      { default: false },
    )
    .action(async (options) => {
      try {
        log.info("🚀 Starting AgentCards MCP Gateway...\n");

        // 1. Find and load config
        log.info("Step 1/6: Loading configuration...");
        const configPath = await findConfigFile(options.config);
        const discovery = new MCPServerDiscovery(configPath);
        const config = await discovery.loadConfig();

        if (config.servers.length === 0) {
          throw new Error("No MCP servers configured");
        }

        // 2. Initialize database
        log.info("Step 2/6: Initializing database...");
        const db = createDefaultClient();
        await db.connect();

        // Run migrations
        const runner = new MigrationRunner(db);
        await runner.runUp(getAllMigrations());

        // 3. Connect to MCP servers
        log.info("Step 3/6: Connecting to MCP servers...");
        const mcpClients = await connectToMCPServers(config.servers);

        // 4. Initialize AI components
        log.info("Step 4/6: Loading AI models...");
        const embeddingModel = new EmbeddingModel();
        await embeddingModel.load();

        const vectorSearch = new VectorSearch(db, embeddingModel);
        const graphEngine = new GraphRAGEngine(db);
        await graphEngine.syncFromDatabase();

        const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);

        // Create tool executor
        const toolExecutor = createToolExecutor(mcpClients);
        const executor = new ParallelExecutor(toolExecutor, {
          verbose: false,
          taskTimeout: 30000,
        });

        // 5. Create gateway server
        log.info("Step 5/6: Starting MCP gateway...");
        const gateway = new AgentCardsGatewayServer(
          db,
          vectorSearch,
          graphEngine,
          dagSuggester,
          executor,
          mcpClients,
          {
            name: "agentcards",
            version: "1.0.0",
            enableSpeculative: !options.noSpeculative,
            defaultToolLimit: 10,
          },
        );

        // 6. Start gateway (stdio mode)
        log.info("Step 6/6: Listening for MCP requests...\n");
        await gateway.start();

        // Setup graceful shutdown
        const shutdown = async () => {
          log.info("\n\nShutting down...");
          await gateway.stop();
          await db.close();
          Deno.exit(0);
        };

        Deno.addSignalListener("SIGINT", shutdown);
        Deno.addSignalListener("SIGTERM", shutdown);

        // Keep process alive
        await new Promise(() => {}); // Run forever
      } catch (error) {
        log.error(`❌ Failed to start gateway: ${error}`);
        console.error(error);
        Deno.exit(1);
      }
    });
}
