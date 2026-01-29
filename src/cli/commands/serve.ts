/**
 * Serve Command
 *
 * CLI command to start Casys PML as an MCP gateway server
 *
 * @module cli/commands/serve
 */

import { Command } from "@cliffy/command";
import * as log from "@std/log";
import { createClient } from "../../db/mod.ts";
import { getAllMigrations, MigrationRunner } from "../../db/migrations.ts";
import { runDrizzleMigrationsAuto } from "../../db/drizzle.ts";
import { MCPServerDiscovery } from "../../mcp/discovery.ts";
import { EmbeddingModel } from "../../vector/embeddings.ts";
import { VectorSearch } from "../../vector/search.ts";
import { GraphRAGEngine } from "../../graphrag/graph-engine.ts";
import { syncAllProvidesEdges } from "../../graphrag/provides-edge-calculator.ts";
import { DAGSuggester } from "../../graphrag/dag-suggester.ts";
import { ParallelExecutor } from "../../dag/executor.ts";
import { PMLGatewayServer } from "../../mcp/gateway-server.ts";
import { WorkflowSyncService } from "../../graphrag/workflow-sync.ts";
import { CodeOperationSyncService } from "../../graphrag/code-operation-sync.ts";
import { getWorkflowTemplatesPath } from "../utils.ts";
import type { MCPClientBase, MCPServer } from "../../mcp/types.ts";
import type { ToolExecutor } from "../../dag/types.ts";
import { CapabilityMatcher } from "../../capabilities/matcher.ts";
import { CapabilityStore } from "../../capabilities/capability-store.ts";
import { CapabilityRegistry } from "../../capabilities/capability-registry.ts";
import { SchemaInferrer } from "../../capabilities/schema-inferrer.ts";
import { checkAndSyncRouting } from "../../capabilities/routing-resolver.ts";
import { StaticStructureBuilder } from "../../capabilities/static-structure-builder.ts";
import { AdaptiveThresholdManager } from "../../mcp/adaptive-threshold.ts";
import { AlgorithmTracer } from "../../telemetry/algorithm-tracer.ts";
import { initAlgorithmSubscribers, stopAlgorithmSubscribers } from "../../telemetry/mod.ts";
import { bootstrapDI } from "../../infrastructure/di/mod.ts";
import { GatewayBuilder } from "../../infrastructure/patterns/mod.ts";
import { EpisodicMemoryStore } from "../../dag/episodic/store.ts";

/**
 * Serve command options
 */
interface ServeOptions {
  config?: string;
  port?: number;
  speculative: boolean;
  piiProtection: boolean;
  cache: boolean;
}

/**
 * Callback type for tool execution tracking (Story 3.7 cache invalidation)
 */
type OnToolCallCallback = (toolKey: string) => void;

/**
 * Gateway reference for tool usage tracking
 */
interface GatewayTracker {
  trackToolUsage: (toolKey: string) => Promise<void>;
}

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

  ${Deno.build.os === "windows" ? ">" : "$"} pml serve --port 3001 --config <path-to-config>

Examples:
  • ./config/mcp-servers.json
  • ./playground/config/mcp-servers.json
  • ~/.config/pml/mcp-servers.json

Need help creating a config? See: https://github.com/casys-ai/casys-pml#configuration`,
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
 *
 * Handles both stdio (MCPClient) and HTTP Streamable (SmitheryMCPClient) protocols.
 *
 * @param servers - List of server configurations
 * @param smitheryApiKey - Optional Smithery API key for HTTP servers
 */
async function connectToMCPServers(
  servers: MCPServer[],
  _smitheryApiKey?: string, // Prefixed: reserved for future HTTP server support
): Promise<Map<string, MCPClientBase>> {
  const clients = new Map<string, MCPClientBase>();

  const stdioServers = servers.filter((s) => s.protocol === "stdio");
  const httpServers = servers.filter((s) => s.protocol === "http");

  log.info(
    `Connecting to ${servers.length} MCP server(s) ` +
      `(${stdioServers.length} stdio, ${httpServers.length} HTTP)...`,
  );

  // DISABLED: Server-side spawning - MCP processes are now controlled by PML package (client)
  // The server only stores metadata in DB for discovery. Client handles:
  // - Permission checks, installation HIL, API key validation
  // - Spawning via StdioManager when tool is actually called
  //
  // // Connect to stdio servers
  // for (const server of stdioServers) {
  //   try {
  //     const client = new MCPClient(server, 10000);
  //     await client.connect();
  //     clients.set(server.id, client);
  //     log.info(`  ✓ Connected (stdio): ${server.id}`);
  //   } catch (error) {
  //     log.error(`  ✗ Failed to connect to ${server.id}: ${error}`);
  //   }
  // }
  //
  // // Connect to HTTP Streamable (Smithery) servers
  // if (httpServers.length > 0) {
  //   if (!smitheryApiKey) {
  //     log.warn(
  //       `  ⚠ ${httpServers.length} HTTP server(s) skipped: SMITHERY_API_KEY not set`,
  //     );
  //   } else {
  //     for (const server of httpServers) {
  //       try {
  //         const client = new SmitheryMCPClient(server, {
  //           apiKey: smitheryApiKey,
  //           timeoutMs: 30000,
  //         });
  //         await client.connect();
  //         clients.set(server.id, client);
  //         log.info(`  ✓ Connected (HTTP): ${server.id}`);
  //       } catch (error) {
  //         log.error(`  ✗ Failed to connect to Smithery ${server.id}: ${error}`);
  //       }
  //     }
  //   }
  // }

  log.info(`  ⏸ Server-side spawning disabled (controlled by PML client)`);
  log.info(`    Configured: ${stdioServers.length} stdio, ${httpServers.length} HTTP`)

  return clients;
}

/**
 * Create tool executor function for ParallelExecutor
 *
 * This function is called by the executor to execute individual tools.
 * It routes tool calls to the appropriate MCP client (stdio or HTTP).
 *
 * @param clients - Map of MCP clients by server ID
 * @param onToolCall - Optional callback for tracking tool usage (Story 3.7)
 */
function createToolExecutor(
  clients: Map<string, MCPClientBase>,
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
 * Check if a feature is enabled based on CLI option and environment variables
 */
function isFeatureEnabled(
  cliOption: boolean,
  envVars: string[],
): boolean {
  if (cliOption === false) {
    return false;
  }
  for (const envVar of envVars) {
    if (Deno.env.get(envVar) === "1") {
      return false;
    }
  }
  return true;
}

/**
 * Setup graceful shutdown handlers
 */
function setupShutdownHandlers(
  gateway: PMLGatewayServer,
  episodicMemory: EpisodicMemoryStore,
  db: ReturnType<typeof createClient>,
): void {
  let isShuttingDown = false;

  const shutdown = (): void => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log.info("\n\nShutting down...");
    log.info("Shutting down Casys PML gateway...");

    const forceExitTimer = setTimeout(() => {
      log.warn("Graceful shutdown timeout - forcing exit");
      Deno.exit(1);
    }, 10000);

    Promise.all([
      gateway.stop(),
      stopAlgorithmSubscribers(),
      episodicMemory.shutdown(),
    ])
      .then(() => db.close())
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

  Deno.addSignalListener("SIGINT", () => {
    log.info("[Shutdown] Received SIGINT (Ctrl+C)");
    shutdown();
  });
  Deno.addSignalListener("SIGTERM", () => {
    log.info("[Shutdown] Received SIGTERM (external kill)");
    shutdown();
  });
}

/**
 * Create serve command
 *
 * Usage:
 *   pml serve --config ./config/mcp-servers.json --port 3001
 *   pml serve --config ~/.config/pml/mcp-servers.json
 */
export function createServeCommand() {
  return new Command()
    .name("serve")
    .description("Start Casys PML MCP gateway server")
    .option("--config <path:string>", "Path to MCP servers config file (required)")
    .option("--port <port:number>", "HTTP port for HTTP/SSE transport (optional, stdio is default)")
    .option("--no-speculative", "Disable speculative execution mode", { default: true })
    .option("--no-pii-protection", "Disable PII detection and tokenization (use in trusted environments only)", { default: true })
    .option("--no-cache", "Disable code execution caching (forces re-execution every time)", { default: true })
    .action(async (options: ServeOptions) => {
      try {
        await executeServeCommand(options);
      } catch (error) {
        log.error(`❌ Failed to start gateway: ${error}`);
        console.error(error);
        Deno.exit(1);
      }
    });
}

/**
 * Execute the serve command
 */
async function executeServeCommand(options: ServeOptions): Promise<void> {
  log.info("🚀 Starting Casys PML MCP Gateway...\n");

  // Step 1: Load configuration
  log.info("Step 1/7: Loading configuration...");
  const configPath = await findConfigFile(options.config);
  const discovery = new MCPServerDiscovery(configPath);
  await discovery.loadConfig();

  const smitheryApiKey = Deno.env.get("SMITHERY_API_KEY");
  if (smitheryApiKey) {
    log.info("  → Loading servers from Smithery...");
    await discovery.loadFromSmithery(smitheryApiKey);
  }

  const allServers = await discovery.discoverServers();
  if (allServers.length === 0) {
    throw new Error("No MCP servers configured");
  }

  // Step 2: Initialize database
  log.info("Step 2/6: Initializing database...");
  const db = createClient();
  await db.connect();

  const runner = new MigrationRunner(db);
  await runner.runUp(getAllMigrations());
  await runDrizzleMigrationsAuto();

  const routingResult = await checkAndSyncRouting(db);
  if (routingResult.synced) {
    log.info(`✓ Routing sync: ${routingResult.updated} capabilities updated`);
  }

  // Step 3: Connect to MCP servers
  log.info("Step 3/6: Connecting to MCP servers...");
  const mcpClients = await connectToMCPServers(allServers, smitheryApiKey);

  // Step 4: Initialize AI components
  log.info("Step 4/6: Loading AI models...");
  const embeddingModel = new EmbeddingModel();
  await embeddingModel.load();

  const vectorSearch = new VectorSearch(db, embeddingModel);

  // Bootstrap graph and code operations
  const workflowSyncService = new WorkflowSyncService(db);
  if (await workflowSyncService.bootstrapIfEmpty(getWorkflowTemplatesPath())) {
    log.info("✓ Graph bootstrapped from workflow-templates.yaml");
  }

  const codeOpSyncService = new CodeOperationSyncService(db);
  if (await codeOpSyncService.bootstrapIfEmpty()) {
    log.info("✓ Code operation embeddings synced");
  }

  const graphEngine = new GraphRAGEngine(db);
  await graphEngine.syncFromDatabase();

  const providesEdgeCount = await syncAllProvidesEdges(db);
  if (providesEdgeCount > 0) {
    log.info(`✓ Synced ${providesEdgeCount} provides edges from tool schemas`);
    await graphEngine.syncFromDatabase();
  }

  // Initialize Capabilities System
  const schemaInferrer = new SchemaInferrer(db);
  const staticStructureBuilder = new StaticStructureBuilder(db);
  const capabilityStore = new CapabilityStore(db, embeddingModel, schemaInferrer, staticStructureBuilder);
  const adaptiveThresholdManager = new AdaptiveThresholdManager({}, db);
  const capabilityMatcher = new CapabilityMatcher(capabilityStore, adaptiveThresholdManager);
  const dagSuggester = new DAGSuggester(graphEngine, vectorSearch, capabilityMatcher, capabilityStore);

  // Wire algorithm tracing
  const algorithmTracer = new AlgorithmTracer(db);
  capabilityMatcher.setAlgorithmTracer(algorithmTracer);
  dagSuggester.setAlgorithmTracer(algorithmTracer);
  graphEngine.setAlgorithmTracer(algorithmTracer);
  initAlgorithmSubscribers(db);
  log.info("✓ Algorithm tracing enabled (EventBus-centric)");

  // Initialize episodic memory
  const episodicMemory = new EpisodicMemoryStore(db, {
    bufferSize: 50,
    retentionDays: 30,
    maxEvents: 10000,
    flushIntervalMs: 5000,
  });
  dagSuggester.setEpisodicMemoryStore(episodicMemory);
  log.info("✓ Episodic memory enabled (ADR-008)");

  // Bootstrap DI container
  const capabilityRegistry = new CapabilityRegistry(db);
  const { mcpRegistry, codeAnalyzer, executeAdapters } = bootstrapDI({
    db,
    embeddingModel,
    vectorSearch,
    graphEngine,
    capabilityStore,
    mcpClients,
    capabilityRegistry,
  });
  await mcpRegistry.refreshTools();
  log.info(`✓ DI container initialized (${mcpRegistry.getAllTools().length} tools registered)`);

  // Create tool executor with tracking
  let gatewayRef: GatewayTracker | null = null;
  const toolExecutor = createToolExecutor(mcpClients, (toolKey) => {
    gatewayRef?.trackToolUsage(toolKey).catch(() => {});
  });
  const executor = new ParallelExecutor(toolExecutor, { verbose: false, taskTimeout: 30000 });

  // Check feature flags
  const piiProtectionEnabled = isFeatureEnabled(
    options.piiProtection,
    ["CAI_NO_PII_PROTECTION", "AGENTCARDS_NO_PII_PROTECTION"],
  );
  const cacheEnabled = isFeatureEnabled(
    options.cache,
    ["CAI_NO_CACHE", "AGENTCARDS_NO_CACHE"],
  );

  if (!piiProtectionEnabled) {
    log.warn("⚠️  PII protection is DISABLED. Sensitive data may be exposed to LLM context.");
  }
  if (!cacheEnabled) {
    log.warn("⚠️  Code execution cache is DISABLED. Performance may be degraded for repetitive queries.");
  }

  // Step 5: Create gateway server
  log.info("Step 5/6: Starting MCP gateway...");
  const gatewayDeps = new GatewayBuilder()
    .withDatabase(db)
    .withVectorSearch(vectorSearch)
    .withGraphEngine(graphEngine)
    .withDAGSuggester(dagSuggester)
    .withExecutor(executor)
    .withMCPClients(mcpClients)
    .withCapabilityStore(capabilityStore)
    .withAdaptiveThresholdManager(adaptiveThresholdManager)
    .withEmbeddingModel(embeddingModel)
    .withServerInfo("pml", "1.0.0")
    .withSpeculation(options.speculative ?? false)
    .withDefaultToolLimit(10)
    .withPIIProtection({ enabled: piiProtectionEnabled })
    .withCaching({ enabled: cacheEnabled, maxEntries: 100, ttlSeconds: 300, persistence: false })
    .build();

  const gateway = new PMLGatewayServer(
    gatewayDeps.db,
    gatewayDeps.vectorSearch,
    gatewayDeps.graphEngine,
    gatewayDeps.dagSuggester,
    gatewayDeps.executor,
    gatewayDeps.mcpClients,
    gatewayDeps.capabilityStore,
    gatewayDeps.adaptiveThresholdManager,
    gatewayDeps.config,
    gatewayDeps.embeddingModel,
  );

  // Wire additional components to gateway
  gateway.setAlgorithmTracer(algorithmTracer);
  gateway.setEpisodicMemoryStore(episodicMemory);
  gateway.setCodeAnalyzer(codeAnalyzer);
  gateway.setExecuteAdapters(executeAdapters);

  const capModule = gateway.getCapModule();
  if (capModule) {
    executeAdapters.workerBridgeFactory.setCapModule(capModule);
    log.info("✓ CapModule wired to WorkerBridgeFactory for cap_* tools");
  }

  gatewayRef = gateway;

  // Step 6: Start gateway
  log.info("Step 6/6: Listening for MCP requests...\n");
  if (options.port) {
    await gateway.startHttp(options.port);
  } else {
    await gateway.start();
  }

  setupShutdownHandlers(gateway, episodicMemory, db);

  await new Promise(() => {}); // Run forever
}
