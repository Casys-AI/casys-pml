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
import { WorkflowSyncService } from "../../graphrag/workflow-sync.ts";
import { getWorkflowTemplatesPath } from "../utils.ts";
import type { MCPServer } from "../../mcp/types.ts";
import type { ToolExecutor } from "../../dag/types.ts";

/**
 * Find and validate config file
 *
 * Requires explicit --config flag to avoid assumptions about config location.
 * This makes the tool more predictable and easier to use in different environments.
 */
async function findConfigFile(configPath?: string): Promise<string> {
  if (!configPath) {
    throw new Error(
      `❌ No MCP server configuration provided.

Please specify your MCP servers config file using --config:

  ${Deno.build.os === "windows" ? ">" : "$"} agentcards serve --port 3001 --config <path-to-config>

Examples:
  • ./config/mcp-servers.json
  • ./playground/config/mcp-servers.json
  • ~/.config/agentcards/mcp-servers.json

Need help creating a config? See: https://github.com/anthropics/agentcards#configuration`,
    );
  }

  try {
    await Deno.stat(configPath);
    log.info(`✓ Found MCP config: ${configPath}`);
    return configPath;
  } catch {
    throw new Error(
      `❌ Config file not found: ${configPath}

Please check that the file exists and the path is correct.`,
    );
  }
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
 * Callback type for tool execution tracking (Story 3.7 cache invalidation)
 */
type OnToolCallCallback = (toolKey: string) => void;

/**
 * Create tool executor function for ParallelExecutor
 *
 * This function is called by the executor to execute individual tools.
 * It routes tool calls to the appropriate MCP client.
 *
 * @param clients - Map of MCP clients by server ID
 * @param onToolCall - Optional callback for tracking tool usage (Story 3.7)
 */
function createToolExecutor(
  clients: Map<string, MCPClient>,
  onToolCall?: OnToolCallCallback,
): ToolExecutor {
  return async (toolName: string, args: Record<string, unknown>) => {
    // Parse tool name: "serverId:toolName"
    const [serverId, ...toolNameParts] = toolName.split(":");
    const actualToolName = toolNameParts.join(":");

    const client = clients.get(serverId);
    if (!client) {
      throw new Error(`Unknown MCP server: ${serverId}`);
    }

    // Track tool call for cache invalidation (Story 3.7)
    if (onToolCall) {
      onToolCall(toolName);
    }

    // Execute tool via MCP client
    return await client.callTool(actualToolName, args);
  };
}

/**
 * Create serve command
 *
 * Usage:
 *   agentcards serve --config ./config/mcp-servers.json --port 3001
 *   agentcards serve --config ~/.config/agentcards/mcp-servers.json
 */
export function createServeCommand() {
  return new Command()
    .name("serve")
    .description("Start AgentCards MCP gateway server")
    .option(
      "--config <path:string>",
      "Path to MCP servers config file (required)",
    )
    .option(
      "--port <port:number>",
      "HTTP port for HTTP/SSE transport (optional, stdio is default)",
    )
    .option(
      "--no-speculative",
      "Disable speculative execution mode",
      { default: true },
    )
    .option(
      "--no-pii-protection",
      "Disable PII detection and tokenization (use in trusted environments only)",
      { default: true },
    )
    .option(
      "--no-cache",
      "Disable code execution caching (forces re-execution every time)",
      { default: true },
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

        // Story 5.2: Auto-bootstrap graph from workflow templates if empty
        const workflowSyncService = new WorkflowSyncService(db);
        const bootstrapped = await workflowSyncService.bootstrapIfEmpty(
          getWorkflowTemplatesPath(),
        );
        if (bootstrapped) {
          log.info("✓ Graph bootstrapped from workflow-templates.yaml");
        }

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

        // Create tool executor with tracking callback (Story 3.7)
        // Gateway reference will be set after gateway is created
        let gatewayRef: { trackToolUsage: (toolKey: string) => Promise<void> } | null = null;
        const toolExecutor = createToolExecutor(mcpClients, (toolKey) => {
          // Fire-and-forget tracking - don't block tool execution
          gatewayRef?.trackToolUsage(toolKey).catch(() => {});
        });
        const executor = new ParallelExecutor(toolExecutor, {
          verbose: false,
          taskTimeout: 30000,
        });

        // Check PII protection settings
        // --no-pii-protection sets options.piiProtection to false
        const piiProtectionEnabled = options.piiProtection !== false &&
          Deno.env.get("AGENTCARDS_NO_PII_PROTECTION") !== "1";

        if (!piiProtectionEnabled) {
          log.warn(
            "⚠️  PII protection is DISABLED. Sensitive data may be exposed to LLM context.",
          );
        }

        // Check cache settings
        // --no-cache sets options.cache to false
        const cacheEnabled = options.cache !== false &&
          Deno.env.get("AGENTCARDS_NO_CACHE") !== "1";

        if (!cacheEnabled) {
          log.warn(
            "⚠️  Code execution cache is DISABLED. Performance may be degraded for repetitive queries.",
          );
        }

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
            enableSpeculative: options.speculative,
            defaultToolLimit: 10,
            piiProtection: {
              enabled: piiProtectionEnabled,
            },
            cacheConfig: {
              enabled: cacheEnabled,
              maxEntries: 100,
              ttlSeconds: 300,
              persistence: false,
            },
          },
        );

        // Connect gateway to tool tracking callback (Story 3.7)
        gatewayRef = gateway;

        // 6. Start gateway (stdio or HTTP mode based on --port option)
        log.info("Step 6/6: Listening for MCP requests...\n");
        if (options.port) {
          await gateway.startHttp(options.port);
        } else {
          await gateway.start();
        }

        // Setup graceful shutdown (ADR-020: Fix hanging shutdown)
        let isShuttingDown = false;
        const shutdown = () => {
          if (isShuttingDown) return;
          isShuttingDown = true;

          log.info("\n\nShutting down...");
          log.info("Shutting down AgentCards gateway...");

          // Force exit after 2 seconds if graceful shutdown hangs
          const forceExitTimer = setTimeout(() => {
            log.warn("Graceful shutdown timeout - forcing exit");
            Deno.exit(1);
          }, 2000);

          // Attempt graceful shutdown
          Promise.all([
            gateway.stop(),
            db.close(),
          ])
            .then(() => {
              clearTimeout(forceExitTimer);
              log.info("✓ Shutdown complete");
              Deno.exit(0);
            })
            .catch((err) => {
              clearTimeout(forceExitTimer);
              log.error(`Shutdown error: ${err}`);
              Deno.exit(1);
            });
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
