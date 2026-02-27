/**
 * MCP Gateway Server
 *
 * Exposes Casys PML functionality via MCP protocol (stdio transport)
 * Compatible with Claude Code and other MCP clients.
 *
 * Implements MCP methods:
 * - tools/list: Returns relevant tools (with semantic search)
 * - tools/call: Executes single tool or workflow
 * - prompts/get: Optional prompt retrieval
 *
 * @module mcp/gateway-server
 */

import {
  type CallToolRequest,
  CallToolRequestSchema,
  type GetPromptRequest,
  GetPromptRequestSchema,
  type ListToolsRequest,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as log from "@std/log";
import type { DbClient } from "../db/types.ts";
import type { VectorSearch } from "../vector/search.ts";
import type { GraphRAGEngine } from "../graphrag/graph-engine.ts";
import type { DAGSuggester } from "../graphrag/dag-suggester.ts";
import type { ParallelExecutor } from "../dag/executor.ts";
import { GatewayHandler } from "./gateway-handler.ts";
import type { MCPClientBase } from "./types.ts";
import { HealthChecker } from "../health/health-checker.ts";
import { ContextBuilder } from "../sandbox/context-builder.ts";
import { WorkerBridge } from "../sandbox/worker-bridge.ts";
import { addBreadcrumb, captureError, startTransaction } from "../telemetry/sentry.ts";
import type { CapabilityStore } from "../capabilities/capability-store.ts";
import { ToolStore } from "../tools/tool-store.ts";
import type { AdaptiveThresholdManager } from "./adaptive-threshold.ts";
import { CapabilityDataService, initMcpPermissions } from "../capabilities/mod.ts";
import { CapabilityRegistry } from "../capabilities/capability-registry.ts";
import { CapabilityMCPServer } from "./capability-server/mod.ts";
// TraceFeatureExtractor removed - V1 uses message passing, not TraceFeatures
import { CheckpointManager } from "../dag/checkpoint-manager.ts";
import { EventsStreamManager } from "../server/events-stream.ts";
import { PmlStdServer } from "./handlers/cap-handler.ts";
import type { AlgorithmTracer } from "../telemetry/algorithm-tracer.ts";
import { getTelemetryAdapter } from "../telemetry/decision-logger.ts";
import { eventBus } from "../events/mod.ts";
import { AlgorithmInitializer } from "./algorithm-init/mod.ts";
import type { IGRUInference } from "../graphrag/algorithms/gru/types.ts";
import type { EpisodicMemoryStore } from "../dag/episodic/store.ts";
import type { ICodeAnalyzer } from "../domain/interfaces/code-analyzer.ts";
import { McpRegistryService } from "./registry/mcp-registry.service.ts";

// Server types, constants, lifecycle, and HTTP server
import {
  type ActiveWorkflow,
  // Lifecycle functions
  createMCPServer,
  formatMCPError,
  formatMCPToolError,
  type GatewayServerConfig,
  type HttpServerDependencies,
  type HttpServerState,
  MCPErrorCodes,
  type McpServerInstance,
  type ResolvedGatewayConfig,
  ServerDefaults,
  // HTTP server functions
  startHttpServer,
  startStdioServer,
  stopServer,
} from "./server/mod.ts";

// Tool definitions
import { getMetaTools } from "./tools/mod.ts";

// Handlers
import {
  type CodeExecutionDependencies,
  handleAbort,
  handleApprovalResponse,
  handleContinue,
  handleExecuteCode,
  handleReplan,
  handleSearchCapabilities,
  handleSearchTools,
  handleWorkflowExecution,
  type WorkflowHandlerDependencies,
  DiscoverHandlerFacade,
  AdminHandlerFacade,
} from "./handlers/mod.ts";

// Hybrid routing (Story 14 - package/server handshake)
// NOTE: resolveRouting/getToolRouting moved to ExecuteDirectUseCase
// StaticStructureBuilder dynamically imported where needed (discover handler)

// Phase 3.2: Discover use cases (for facade initialization)
import {
  DiscoverToolsUseCase,
  DiscoverCapabilitiesUseCase,
  ListCapabilitiesUseCase,
  LookupUseCase,
  GetDetailsUseCase,
} from "../application/use-cases/discover/mod.ts";

// MCP Tools Consolidation: Admin use cases
import {
  RenameCapabilityUseCase,
  MergeCapabilitiesUseCase,
} from "../application/use-cases/admin/mod.ts";
import type { SHGAT } from "../graphrag/algorithms/shgat.ts";
import type { DRDSP } from "../graphrag/algorithms/dr-dsp.ts";
import type { EmbeddingModelInterface } from "../vector/embeddings.ts";

// Sampling Relay for agent tools
import { samplingRelay } from "./sampling/mod.ts";

// Concurrency framework from @casys/mcp-server
import { RequestQueue, type QueueMetrics } from "@casys/mcp-server";

// Phase 3.1: Execute Handler Facade and Use Cases
import { ExecuteHandlerFacade } from "./handlers/execute-handler-facade.ts";
import {
  ExecuteDirectUseCase,
  ExecuteSuggestionUseCase,
  ContinueWorkflowUseCase,
  TrainSHGATUseCase,
} from "../application/use-cases/execute/mod.ts";
import type { BootstrappedServices } from "../infrastructure/di/bootstrap.ts";

// Phase 3.2: Embedding cache for SHGAT training
import { getKv } from "../cache/kv.ts";

// Phase 3.2: Post-execution service for learning
import { PostExecutionService } from "../application/services/mod.ts";


/** Type alias for execute adapters from bootstrap */
type ExecuteAdapters = BootstrappedServices["executeAdapters"];

// Re-export for backward compatibility
export type { GatewayServerConfig };

// ============================================================================
// PMLGatewayServer
// ============================================================================

/**
 * MCP Gateway Server
 *
 * Transparent gateway that exposes Casys PML as a single MCP server.
 * Claude Code sees all tools from all MCP servers + workflow execution capability.
 */
export class PMLGatewayServer {
  private server: McpServerInstance;
  private gatewayHandler: GatewayHandler;
  private healthChecker: HealthChecker;
  private config: ResolvedGatewayConfig;
  private contextBuilder: ContextBuilder;
  private toolSchemaCache: Map<string, string> = new Map();
  private httpServer: Deno.HttpServer | null = null;
  private activeWorkflows: Map<string, ActiveWorkflow> = new Map();
  private checkpointManager: CheckpointManager | null = null;
  private eventsStream: EventsStreamManager | null = null;
  private requestQueue: RequestQueue; // Concurrency control for tool calls
  private metricsLogInterval: number | null = null; // Periodic metrics logging
  private capabilityDataService: CapabilityDataService;
  private shgat: SHGAT | null = null;
  private drdsp: DRDSP | null = null;
  private gru: IGRUInference | null = null;
  private embeddingModel: EmbeddingModelInterface | null = null;
  private capabilityRegistry: CapabilityRegistry | null = null; // Story 13.2
  private mcpRegistry: McpRegistryService | null = null; // FQDN resolution for MCP tools
  private capabilityMCPServer: CapabilityMCPServer | null = null; // Story 13.3
  private pmlStdServer: PmlStdServer | null = null; // Story 13.5: cap:* management tools
  private algorithmTracer: AlgorithmTracer | null = null; // Story 7.6: Observability
  private algorithmInitializer: AlgorithmInitializer | null = null; // Algorithm lifecycle
  private episodicMemory: EpisodicMemoryStore | null = null; // ADR-008: Episodic memory
  private codeAnalyzer: ICodeAnalyzer | null = null; // Phase 3.2: DI code analyzer
  private executeHandlerFacade: ExecuteHandlerFacade | null = null; // Phase 3.1: Use case facade
  private executeAdapters: ExecuteAdapters | null = null; // Phase 3.1: DI execute adapters
  private discoverHandlerFacade: DiscoverHandlerFacade | null = null; // Phase 3.2: Discover optimization
  private adminHandlerFacade: AdminHandlerFacade | null = null; // MCP Tools Consolidation: Admin operations
  private toolStore: ToolStore | null = null; // Phase 3.2: Singleton ToolStore

  constructor(
    // @ts-ignore: db kept for future use (direct queries)
    private db: DbClient,
    private vectorSearch: VectorSearch,
    private graphEngine: GraphRAGEngine,
    private dagSuggester: DAGSuggester,
    // @ts-ignore: executor kept for API backward compatibility
    private _executor: ParallelExecutor,
    private mcpClients: Map<string, MCPClientBase>,
    private capabilityStore?: CapabilityStore,
    private adaptiveThresholdManager?: AdaptiveThresholdManager,
    config?: GatewayServerConfig,
    embeddingModel?: EmbeddingModelInterface,
  ) {
    this.embeddingModel = embeddingModel ?? null;
    // Merge config with defaults
    this.config = {
      name: config?.name ?? ServerDefaults.name,
      version: config?.version ?? ServerDefaults.version,
      enableSpeculative: config?.enableSpeculative ?? ServerDefaults.enableSpeculative,
      defaultToolLimit: config?.defaultToolLimit ?? ServerDefaults.defaultToolLimit,
      piiProtection: {
        enabled: config?.piiProtection?.enabled ?? true,
        types: config?.piiProtection?.types ?? ["email", "phone", "credit_card", "ssn", "api_key"],
        detokenizeOutput: config?.piiProtection?.detokenizeOutput ?? false,
      },
      cacheConfig: {
        enabled: config?.cacheConfig?.enabled ?? true,
        maxEntries: config?.cacheConfig?.maxEntries ?? 100,
        ttlSeconds: config?.cacheConfig?.ttlSeconds ?? 300,
        persistence: config?.cacheConfig?.persistence ?? false,
      },
    };

    // Initialize MCP Server using lifecycle helper
    this.server = createMCPServer(this.config);

    // Initialize Gateway Handler (ADR-030: pass mcpClients for real execution)
    this.gatewayHandler = new GatewayHandler(
      this.graphEngine,
      this.dagSuggester,
      this.mcpClients,
      {
        enableSpeculative: this.config.enableSpeculative,
      },
    );

    // Initialize Health Checker
    this.healthChecker = new HealthChecker(this.mcpClients);

    // Initialize Context Builder for tool injection (Story 3.4)
    this.contextBuilder = new ContextBuilder(this.vectorSearch, this.mcpClients);

    // Initialize CheckpointManager for per-layer validation (Story 2.5-4)
    this.checkpointManager = new CheckpointManager(this.db, true);

    // Initialize CapabilityDataService for API endpoints (Story 8.1)
    this.capabilityDataService = new CapabilityDataService(this.db, this.graphEngine);
    this.capabilityDataService.setDAGSuggester(this.dagSuggester);

    // Initialize CapabilityRegistry for naming support (Story 13.2)
    this.capabilityRegistry = new CapabilityRegistry(this.db);

    // Initialize McpRegistryService for MCP standard tools FQDN resolution
    this.mcpRegistry = new McpRegistryService(this.db);

    // Wire registry to store for code transformation (display_name → FQDN)
    if (this.capabilityStore) {
      this.capabilityStore.setCapabilityRegistry(this.capabilityRegistry);
    }

    // Story 13.5: Initialize PmlStdServer for cap:* management tools
    // Pass embeddingModel for embedding updates on rename
    this.pmlStdServer = new PmlStdServer(
      this.capabilityRegistry,
      this.db,
      this.embeddingModel ?? undefined,
    );

    // Set up merge callback to emit capability.merged events for graph invalidation
    this.pmlStdServer.getCapModule().setOnMerged((response) => {
      eventBus.emit({
        type: "capability.merged",
        source: "cap:merge",
        timestamp: Date.now(),
        payload: {
          sourceId: response.deletedSourceId,
          sourceName: response.deletedSourceName,
          sourcePatternId: response.deletedSourcePatternId,
          targetId: response.targetId,
          targetName: response.targetDisplayName,
          targetPatternId: response.targetPatternId,
          mergedUsageCount: response.mergedStats.usageCount,
        },
      });
    });

    log.info("[Gateway] PmlStdServer initialized (Story 13.5)");

    // Phase 3.2: Initialize singleton ToolStore
    this.toolStore = new ToolStore(this.db);

    // Story 13.3: Initialize CapabilityMCPServer for capability-as-tool execution
    if (this.capabilityStore && this.capabilityRegistry) {
      const workerBridge = new WorkerBridge(this.mcpClients, {
        capabilityStore: this.capabilityStore,
        graphRAG: this.graphEngine,
        capabilityRegistry: this.capabilityRegistry,
        capModule: this.pmlStdServer?.getCapModule(),
      });
      this.capabilityMCPServer = new CapabilityMCPServer(
        this.capabilityStore,
        this.capabilityRegistry,
        workerBridge,
      );
      log.info("[Gateway] CapabilityMCPServer initialized (Story 13.3)");
    }

    // Initialize RequestQueue for concurrency control
    // Higher limit than MCP Std (20 vs 10) due to complex DAG operations
    this.requestQueue = new RequestQueue({
      maxConcurrent: 20,
      strategy: "queue", // Queue requests instead of sleep (better for long operations)
      sleepMs: 10,
    });

    log.info(`[Gateway] RequestQueue initialized (maxConcurrent: 20, strategy: queue)`);

    // Phase 3.1: ExecuteHandlerFacade is initialized in start() after algorithms are loaded

    this.setupHandlers();
    this.setupSamplingRelay();
  }

  /**
   * Update DI execute adapters with algorithms after they are loaded
   * Phase 3.1: Lazy initialization pattern for SHGAT/DR-DSP
   */
  private updateExecuteAdaptersWithAlgorithms(): void {
    if (!this.executeAdapters) {
      return;
    }

    // Update adapters with algorithms
    if (this.embeddingModel) {
      this.executeAdapters.dagSuggester.setEmbeddingModel(this.embeddingModel);
    }

    if (this.gru) {
      this.executeAdapters.dagSuggester.setGRU(this.gru);
      log.info("[Gateway] GRU wired to DAGSuggester");
    }

    log.debug("[Gateway] Execute adapters updated with algorithms");
  }

  /**
   * Initialize ExecuteHandlerFacade with all use cases and adapters
   * Phase 3.1: Execute Handler → Use Cases refactoring
   * Requires DI adapters from bootstrap (fail-fast if not available)
   */
  private initializeExecuteHandlerFacade(): void {
    if (!this.capabilityStore) {
      log.warn("[Gateway] CapabilityStore not available, ExecuteHandlerFacade disabled");
      return;
    }

    if (!this.executeAdapters) {
      throw new Error("[Gateway] Execute adapters not configured. Call setExecuteAdapters() before start().");
    }

    // Use DI adapters (fail-fast)
    const {
      capabilityRepo,
      workflowRepo,
      dagSuggester: dagSuggesterAdapter,
      shgatTrainer: shgatTrainerAdapter,
      toolDefsBuilder,
      dagConverter,
      workerBridgeFactory,
    } = this.executeAdapters;

    // Phase 3.2: Create embedding cache adapter for KV
    const embeddingCacheAdapter = {
      set: async (key: string[], value: number[], options?: { expireIn?: number }) => {
        const kv = await getKv();
        await kv.set(key, value, options);
      },
    };

    // Phase 3.2: Create PostExecutionService for learning tasks
    // Handles updateDRDSP, registerSHGATNodes, learnFromTaskResults, runPERBatchTraining, updateThompsonSampling
    const postExecutionService = new PostExecutionService({
      drdsp: this.drdsp ?? undefined,
      shgat: this.shgat ?? undefined,
      graphEngine: this.graphEngine,
      embeddingModel: this.embeddingModel ?? undefined,
      traceStore: this.capabilityStore?.getTraceStore(),
      db: this.db,
      adaptiveThresholdManager: this.adaptiveThresholdManager,
      algorithmInitializer: this.algorithmInitializer ?? undefined,
      onSHGATParamsUpdated: async () => {
        await this.algorithmInitializer?.saveSHGATParams();
      },
    });

    // Phase 3.2: Event-driven PER training - triggers on capability registration
    // This handles client-routed executions that don't go through PostExecutionService.process()
    eventBus.on("capability.shgat.registered", () => {
      postExecutionService.runPERBatchTraining().catch((err) => {
        const errMsg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
        log.warn(`[Gateway] PER training failed: ${errMsg}`);
      });
    });

    // Live SHGAT registration: when tools are synced + embedded, register them
    // so they're immediately discoverable without server restart
    eventBus.on("mcp.server.tools.changed", (event) => {
      if (!this.shgat || !this.db) return;
      const toolIds = (event.payload as { toolIds?: string[] })?.toolIds;
      if (!toolIds || toolIds.length === 0) return;

      this.registerNewToolsInSHGAT(toolIds).catch((err) => {
        log.warn(`[Gateway] Live SHGAT tool registration failed: ${err}`);
      });
    });

    // Create use cases
    const executeDirectUC = new ExecuteDirectUseCase({
      capabilityRepo,
      staticStructureBuilder: {
        buildStaticStructure: async (code: string) => {
          if (this.codeAnalyzer) {
            return await this.codeAnalyzer.analyze(code);
          }
          // Fallback: import dynamically
          const { StaticStructureBuilder } = await import("../capabilities/static-structure-builder.ts");
          const builder = new StaticStructureBuilder(this.db);
          return await builder.buildStaticStructure(code);
        },
        inferDecisions: (_structure, _executedPath) => {
          // Simple inference - decisions based on executed path
          return [];
        },
      },
      toolDefinitionsBuilder: toolDefsBuilder,
      // Cast adapters to use case interfaces (minor type differences)
      dagConverter: dagConverter as unknown as ExecuteDirectUseCase["deps"]["dagConverter"],
      workerBridgeFactory: workerBridgeFactory as unknown as ExecuteDirectUseCase["deps"]["workerBridgeFactory"],
      embeddingModel: this.embeddingModel ?? undefined,
      capabilityRegistry: this.capabilityRegistry ?? undefined,
      mcpRegistry: this.mcpRegistry ?? undefined,
      // Phase 3.2: Event-driven training (cast needed for interface compatibility)
      eventBus: eventBus as ExecuteDirectUseCase["deps"]["eventBus"],
      embeddingCache: embeddingCacheAdapter,
      // Phase 3.2: Post-execution learning (DR-DSP, SHGAT, PER training)
      postExecutionService,
      // Story 14.3: DB-based routing for capabilities from pml_registry
      routingDb: this.db,
    });

    const executeSuggestionUC = new ExecuteSuggestionUseCase({
      shgat: this.shgat ?? undefined,
      drdsp: this.drdsp ?? undefined,
      dagSuggester: dagSuggesterAdapter,
      capabilityRepo,
      embeddingModel: this.embeddingModel ?? undefined,
      // Cast algorithmTracer to use case interface (minor type differences)
      algorithmTracer: this.algorithmTracer as unknown as ExecuteSuggestionUseCase["deps"]["algorithmTracer"],
      thresholdManager: this.adaptiveThresholdManager ?? undefined,
    });

    const continueWorkflowUC = new ContinueWorkflowUseCase({
      workflowRepo,
      capabilityRepo,
      eventBus,
      // Cast to use case interface (ActiveWorkflow has minor differences)
      getActiveWorkflow: ((workflowId: string) => this.activeWorkflows.get(workflowId)) as ContinueWorkflowUseCase["deps"]["getActiveWorkflow"],
    });

    const trainSHGATUC = new TrainSHGATUseCase({
      shgatTrainer: shgatTrainerAdapter,
      thresholdManager: this.adaptiveThresholdManager ?? undefined,
      onTrainingComplete: async () => {
        await this.algorithmInitializer?.saveSHGATParams();
      },
    });

    // Create facade
    this.executeHandlerFacade = new ExecuteHandlerFacade({
      executeDirectUC,
      executeSuggestionUC,
      continueWorkflowUC,
      trainSHGATUC,
    });

    log.info("[Gateway] ExecuteHandlerFacade initialized (Phase 3.1)");
  }

  /**
   * Initialize DiscoverHandlerFacade with use cases
   * Phase 3.2: Discover performance optimization
   * MCP Tools Consolidation: Extended with list, lookup, details modes
   */
  private initializeDiscoverHandlerFacade(): void {
    if (!this.toolStore) {
      log.warn("[Gateway] ToolStore not available, DiscoverHandlerFacade disabled");
      return;
    }

    // Create core use cases with singleton dependencies
    const toolsUseCase = new DiscoverToolsUseCase({
      toolStore: this.toolStore,
      shgat: this.shgat ?? undefined,
      embeddingModel: this.embeddingModel ?? undefined,
      graphEngine: this.graphEngine,
      vectorSearch: this.vectorSearch,
      decisionLogger: getTelemetryAdapter(),
    });

    const capabilitiesUseCase = new DiscoverCapabilitiesUseCase({
      capabilityMatcher: this.dagSuggester,
      capabilityRegistry: this.capabilityRegistry ?? undefined,
      shgat: this.shgat ?? undefined,
      embeddingModel: this.embeddingModel ?? undefined,
      decisionLogger: getTelemetryAdapter(),
    });

    // MCP Tools Consolidation: Create extended use cases
    const listCapabilitiesUseCase = new ListCapabilitiesUseCase({
      db: this.db,
    });

    let lookupUseCase: LookupUseCase | undefined;
    let getDetailsUseCase: GetDetailsUseCase | undefined;

    if (this.capabilityRegistry) {
      lookupUseCase = new LookupUseCase({
        capabilityRegistry: this.capabilityRegistry,
        toolRepository: this.toolStore,
        db: this.db,
      });

      getDetailsUseCase = new GetDetailsUseCase({
        capabilityRegistry: this.capabilityRegistry,
        toolRepository: this.toolStore,
        db: this.db,
      });
    }

    // Create facade with shared embedding model and all use cases
    this.discoverHandlerFacade = new DiscoverHandlerFacade({
      toolsUseCase,
      capabilitiesUseCase,
      listCapabilitiesUseCase,
      lookupUseCase,
      getDetailsUseCase,
      embeddingModel: this.embeddingModel ?? undefined,
      decisionLogger: getTelemetryAdapter(),
      db: this.db, // For scope filtering in search mode
    });

    log.info("[Gateway] DiscoverHandlerFacade initialized (Phase 3.2 + MCP Consolidation)");
  }

  /**
   * Initialize AdminHandlerFacade with use cases
   * MCP Tools Consolidation: Admin operations (rename, merge)
   */
  private initializeAdminHandlerFacade(): void {
    if (!this.capabilityRegistry) {
      log.warn("[Gateway] CapabilityRegistry not available, AdminHandlerFacade disabled");
      return;
    }

    // Create admin use cases
    const renameCapabilityUseCase = new RenameCapabilityUseCase({
      capabilityRegistry: this.capabilityRegistry,
      db: this.db,
      embeddingModel: this.embeddingModel ?? undefined,
    });

    const mergeCapabilitiesUseCase = new MergeCapabilitiesUseCase({
      capabilityRegistry: this.capabilityRegistry,
      db: this.db,
      onMergedCallback: (response) => {
        // Emit capability.merged event for graph invalidation
        eventBus.emit({
          type: "capability.merged",
          source: "admin",
          timestamp: Date.now(),
          payload: {
            sourceId: response.deletedSourceId,
            sourceName: response.deletedSourceName,
            sourcePatternId: response.deletedSourcePatternId,
            targetId: response.targetId,
            targetName: response.targetDisplayName,
            targetPatternId: response.targetPatternId,
            mergedUsageCount: response.mergedStats.usageCount,
          },
        });
      },
    });

    // Create facade
    this.adminHandlerFacade = new AdminHandlerFacade({
      renameCapabilityUseCase,
      mergeCapabilitiesUseCase,
    });

    log.info("[Gateway] AdminHandlerFacade initialized (MCP Tools Consolidation)");
  }

  /**
   * Setup sampling relay for agent tools (Story 11.x)
   *
   * Configures the relay to forward sampling/createMessage requests from
   * child MCP servers to Claude Code via the SDK's createMessage method.
   */
  private setupSamplingRelay(): void {
    // Configure the relay to use SDK's createMessage
    // The server.createMessage method forwards to the parent client (Claude Code)
    // @ts-ignore - createMessage exists on Server when client supports sampling
    if (typeof this.server.createMessage === "function") {
      samplingRelay.setCreateMessageFn(
        // @ts-ignore - createMessage params type matches our interface
        (request) => this.server.createMessage(request),
      );
      log.info("[Gateway] Sampling relay configured with SDK createMessage");
    } else {
      log.warn("[Gateway] SDK server.createMessage not available - sampling relay disabled");
    }

    // Configure MCPClients with sampling handler
    for (const [serverId, client] of this.mcpClients.entries()) {
      // MCPClient has setSamplingHandler if properly typed
      if ("setSamplingHandler" in client && typeof client.setSamplingHandler === "function") {
        client.setSamplingHandler(
          (childServerId, request, respondToChild) =>
            samplingRelay.handleChildRequest(childServerId, request, respondToChild),
        );
        log.debug(`[Gateway] Sampling handler configured for ${serverId}`);
      }
    }
  }

  /**
   * Set AlgorithmTracer for observability (Story 7.6)
   * Called from serve.ts after gateway construction.
   */
  setAlgorithmTracer(tracer: AlgorithmTracer): void {
    this.algorithmTracer = tracer;
    log.debug("[Gateway] AlgorithmTracer configured for observability");
  }

  /**
   * Set EpisodicMemoryStore for learning (ADR-008)
   * Called from serve.ts after gateway construction.
   */
  setEpisodicMemoryStore(store: EpisodicMemoryStore): void {
    this.episodicMemory = store;
    log.debug("[Gateway] EpisodicMemoryStore configured for learning");
  }

  /**
   * Set CodeAnalyzer for static structure analysis (Phase 3.2)
   * Called from serve.ts after gateway construction.
   */
  setCodeAnalyzer(analyzer: ICodeAnalyzer): void {
    this.codeAnalyzer = analyzer;
    log.debug("[Gateway] CodeAnalyzer configured for static analysis");
  }

  /**
   * Set execute adapters from DI bootstrap (Phase 3.1)
   * Called from serve.ts after gateway construction.
   * These adapters will be used by initializeExecuteHandlerFacade.
   */
  setExecuteAdapters(adapters: ExecuteAdapters): void {
    this.executeAdapters = adapters;
    log.debug("[Gateway] Execute adapters configured from DI bootstrap");
  }

  /**
   * Get CapModule for cap_* tool routing
   * Used to wire DI adapters after gateway construction.
   */
  getCapModule(): import("./handlers/cap-handler.ts").CapModule | undefined {
    return this.pmlStdServer?.getCapModule();
  }

  /**
   * Get concurrency metrics for monitoring
   * Returns current queue state: in-flight requests, queued requests
   */
  getConcurrencyMetrics(): QueueMetrics {
    return this.requestQueue.getMetrics();
  }

  /**
   * Start periodic metrics logging (every 60 seconds)
   * Logs concurrency metrics only when there's activity
   */
  private startMetricsLogging(): void {
    this.metricsLogInterval = setInterval(() => {
      const metrics = this.getConcurrencyMetrics();
      if (metrics.inFlight > 0 || metrics.queued > 0) {
        log.info(
          `[Gateway] Concurrency metrics: ${metrics.inFlight} in-flight, ${metrics.queued} queued`,
        );
      }
    }, 60000); // Log every 60 seconds

    log.debug("[Gateway] Metrics logging started (interval: 60s)");
  }

  /**
   * Stop periodic metrics logging
   */
  private stopMetricsLogging(): void {
    if (this.metricsLogInterval !== null) {
      clearInterval(this.metricsLogInterval);
      this.metricsLogInterval = null;
      log.debug("[Gateway] Metrics logging stopped");
    }
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async (request: ListToolsRequest) => await this.handleListTools(request),
    );

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest) => {
        // Apply concurrency control
        await this.requestQueue.acquire();
        try {
          return await this.handleCallTool(request);
        } finally {
          this.requestQueue.release();
        }
      },
    );

    this.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request: GetPromptRequest) => await this.handleGetPrompt(request),
    );

    log.info("MCP handlers registered: tools/list, tools/call, prompts/get");
  }

  /**
   * Handler: tools/list
   *
   * Returns meta-tools only (ADR-013: minimize context usage).
   * Tool discovery happens via execute_workflow with intent parameter.
   */
  private handleListTools(
    _request: unknown,
  ): Promise<
    | { tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }
    | { error: { code: number; message: string; data?: unknown } }
  > {
    const transaction = startTransaction("mcp.tools.list", "mcp");
    try {
      addBreadcrumb("mcp", "Processing tools/list request", {});
      log.info(`list_tools: returning meta-tools (ADR-013)`);

      // Get meta-tools (cap:* tools are MiniTools in lib/std, not meta-tools)
      const metaTools = getMetaTools();

      const result = { tools: metaTools };
      transaction.setData("tools_returned", result.tools.length);
      transaction.finish();
      return Promise.resolve(result);
    } catch (error) {
      log.error(`list_tools error: ${error}`);
      captureError(error as Error, {
        operation: "tools/list",
        handler: "handleListTools",
      });
      transaction.finish();
      return Promise.resolve(formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        `Failed to list tools: ${(error as Error).message}`,
      ));
    }
  }

  /**
   * Handler: tools/call
   *
   * Routes to appropriate handler based on tool name.
   * @param request - JSON-RPC request
   * @param userId - User ID from auth
   * @param isPackageClient - True if request came via x-api-key (PML package)
   */
  private async handleCallTool(
    request: unknown,
    userId?: string,
    isPackageClient?: boolean,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const transaction = startTransaction("mcp.tools.call", "mcp");
    try {
      const params = (request as { params?: { name?: string; arguments?: unknown } }).params;

      if (!params?.name) {
        transaction.finish();
        // Use JSON-RPC error format for validation errors (INVALID_PARAMS)
        return formatMCPError(MCPErrorCodes.INVALID_PARAMS, "Missing required parameter: 'name'");
      }

      const { name, arguments: args } = params;
      transaction.setTag("tool", name);
      transaction.setData("has_arguments", !!args);
      addBreadcrumb("mcp", "Processing tools/call request", { tool: name });
      log.info(`call_tool: ${name}`);

      // Route to handlers
      const result = await this.routeToolCall(name, args, userId, isPackageClient);
      transaction.finish();
      return result;
    } catch (error) {
      log.error(`call_tool error: ${error}`);
      captureError(error as Error, {
        operation: "tools/call",
        handler: "handleCallTool",
      });
      transaction.finish();
      return formatMCPToolError(
        `Tool execution failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Route tool call to appropriate handler
   */
  private async routeToolCall(
    name: string,
    args: unknown,
    userId?: string,
    isPackageClient?: boolean,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    // Story 9.8: Set userId on components for multi-tenant trace isolation
    this.dagSuggester?.setUserId(userId ?? null);
    this.graphEngine?.setUserId(userId ?? null);
    getTelemetryAdapter().setUserId(userId ?? null);

    // DAG execution
    if (name === "execute_dag") {
      return await handleWorkflowExecution(args, this.getWorkflowDeps(), userId);
    }

    // Control tools
    if (name === "continue") {
      return await handleContinue(args, this.getWorkflowDeps());
    }

    if (name === "abort") {
      return await handleAbort(args, this.getWorkflowDeps());
    }

    if (name === "replan") {
      return await handleReplan(args, this.getWorkflowDeps());
    }

    if (name === "approval_response") {
      return await handleApprovalResponse(args, this.getWorkflowDeps());
    }

    // Code execution
    if (name === "execute_code") {
      return await handleExecuteCode(args, this.getCodeExecutionDeps(isPackageClient, userId));
    }

    // Search tools
    if (name === "search_tools") {
      return await handleSearchTools(args, this.graphEngine, this.vectorSearch);
    }

    if (name === "search_capabilities") {
      return await handleSearchCapabilities(args, this.dagSuggester);
    }

    // Unified discover (Story 10.6, Phase 3.2 optimization)
    // Uses SHGAT K-head with shared embedding generation
    // MCP Tools Consolidation: Extended with pattern, name, id modes
    if (name === "discover") {
      if (!this.discoverHandlerFacade) {
        throw new Error("[Gateway] DiscoverHandlerFacade not initialized");
      }
      return await this.discoverHandlerFacade.handle(args, userId);
    }

    // Admin operations (MCP Tools Consolidation)
    // Handles rename, merge capability operations
    if (name === "admin") {
      if (!this.adminHandlerFacade) {
        throw new Error("[Gateway] AdminHandlerFacade not initialized");
      }
      return await this.adminHandlerFacade.handle(args, userId);
    }

    // Unified execute (Story 10.7)
    // Phase 3.1: Use ExecuteHandlerFacade (fail-fast, no legacy fallback)
    if (name === "execute") {
      if (!this.executeHandlerFacade) {
        throw new Error("[Gateway] ExecuteHandlerFacade not initialized. Ensure setExecuteAdapters() was called.");
      }

      // Story 9.8: Set userId for multi-tenant trace isolation
      this.executeHandlerFacade.setUserId(userId ?? null);

      const executeArgs = args as {
        code?: string;
        intent?: string;
        continue_workflow?: {
          workflow_id: string;
          approved: boolean;
          checkpoint_id?: string;
        };
        options?: { timeout?: number; per_layer_validation?: boolean };
      };

      // Story 14: Hybrid routing - pass isPackageClient to use case via facade
      // Routing check is now in ExecuteDirectUseCase (clean architecture)
      const result = await this.executeHandlerFacade.handle({
        ...executeArgs,
        isPackageClient,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    // Story 13.3: Capability tool execution (mcp__namespace__action format)
    if (name.startsWith("mcp__") && this.capabilityMCPServer) {
      const result = await this.capabilityMCPServer.handleCallTool(
        name,
        args as Record<string, unknown>,
        userId,  // Multi-tenant: pass userId for scope resolution
      );
      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      } else {
        return formatMCPToolError(result.error || "Capability execution failed");
      }
    }

    // Story 13.5: std:cap_* tools need special handling
    // They're MiniTools in lib/std but require gateway's CapModule (not std server's)
    if (name.startsWith("std:cap_") && this.pmlStdServer) {
      // Map std:cap_list → cap:list, std:cap_rename → cap:rename, etc.
      const capToolName = "cap:" + name.slice(8); // "std:cap_list" → "cap:list"
      const result = await this.pmlStdServer.handleCallTool(capToolName, args);
      return {
        content: result.content,
        ...(result.isError ? { isError: true } : {}),
      };
    }

    // Single tool execution (proxy to underlying MCP server)
    return await this.proxyToolCall(name, args);
  }

  /**
   * Proxy tool call to underlying MCP server
   */
  private async proxyToolCall(
    name: string,
    args: unknown,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const [serverId, ...toolNameParts] = name.split(":");
    const toolName = toolNameParts.join(":");

    const client = this.mcpClients.get(serverId);
    if (!client) {
      // Use tool error format so the agent sees the error in conversation
      log.error(`[MCP_TOOL_ERROR] Unknown MCP server: ${serverId}`);
      return formatMCPToolError(
        `Unknown MCP server: ${serverId}`,
        { available_servers: Array.from(this.mcpClients.keys()) },
      );
    }

    const result = await client.callTool(toolName, args as Record<string, unknown>);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * Get workflow handler dependencies
   */
  private getWorkflowDeps(): WorkflowHandlerDependencies {
    return {
      db: this.db,
      graphEngine: this.graphEngine,
      dagSuggester: this.dagSuggester,
      capabilityStore: this.capabilityStore,
      capabilityRegistry: this.capabilityRegistry ?? undefined,
      mcpRegistry: this.mcpRegistry ?? undefined, // Issue 6 fix: FQDN resolution
      mcpClients: this.mcpClients,
      gatewayHandler: this.gatewayHandler,
      checkpointManager: this.checkpointManager,
      activeWorkflows: this.activeWorkflows,
      adaptiveThresholdManager: this.adaptiveThresholdManager, // Story 10.7c
      algorithmTracer: this.algorithmTracer ?? undefined, // Story 7.6
      episodicMemory: this.episodicMemory ?? undefined, // ADR-008
      capModule: this.pmlStdServer?.getCapModule(), // Story 13.5: cap_* tool routing
    };
  }

  /**
   * Get code execution handler dependencies
   * @param isPackageClient - True if request came from PML package (x-api-key auth)
   * @param userId - User ID for multi-tenant FQDN resolution
   */
  private getCodeExecutionDeps(isPackageClient?: boolean, userId?: string): CodeExecutionDependencies {
    return {
      vectorSearch: this.vectorSearch,
      graphEngine: this.graphEngine,
      mcpClients: this.mcpClients,
      capabilityStore: this.capabilityStore,
      capabilityRegistry: this.capabilityRegistry ?? undefined,
      adaptiveThresholdManager: this.adaptiveThresholdManager,
      config: this.config,
      contextBuilder: this.contextBuilder,
      toolSchemaCache: this.toolSchemaCache,
      codeAnalyzer: this.codeAnalyzer ?? undefined, // Phase 3.2: DI
      isPackageClient, // Hybrid routing: determines execute_locally response
      capModule: this.pmlStdServer?.getCapModule(), // Story 13.5: cap_* tool routing
      userId, // Multi-tenant: FQDN resolution for execute_locally
    };
  }

  // Phase 3.1: getExecuteDeps removed - ExecuteHandlerFacade uses DI adapters directly

  /**
   * Handler: prompts/get
   */
  private handleGetPrompt(_request: unknown): Promise<{ prompts: Array<unknown> }> {
    log.debug("prompts/get called (not implemented)");
    return Promise.resolve({ prompts: [] });
  }

  /**
   * Track tool usage for cache invalidation (Story 3.7)
   */
  public async trackToolUsage(toolKey: string): Promise<void> {
    try {
      const [serverId, ...toolNameParts] = toolKey.split(":");
      const toolName = toolNameParts.join(":");

      const rows = await this.db.query(
        `SELECT input_schema FROM tool_schema WHERE server_id = $1 AND name = $2`,
        [serverId, toolName],
      );

      if (rows.length > 0) {
        const schema = rows[0].input_schema;
        const schemaHash = this.hashToolSchema(schema);
        const previousHash = this.toolSchemaCache.get(toolKey);

        if (previousHash && previousHash !== schemaHash) {
          log.info(`Tool schema changed: ${toolKey}, cache will be invalidated`);
        }
        this.toolSchemaCache.set(toolKey, schemaHash);
      }
    } catch (error) {
      log.debug(`Failed to track tool schema for ${toolKey}: ${error}`);
    }
  }

  /**
   * Generate hash of tool schema for change detection
   */
  private hashToolSchema(schema: unknown): string {
    const str = JSON.stringify(schema);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Initialize algorithms via AlgorithmInitializer (Story 10.7)
   */
  /**
   * Register newly synced tools in the live SHGAT graph.
   * Fetches embeddings from DB and calls shgat.registerTool() for each unknown tool.
   */
  private async registerNewToolsInSHGAT(toolIds: string[]): Promise<void> {
    if (!this.shgat || !this.db) return;

    // Only register tools SHGAT doesn't already know
    const unknownIds = toolIds.filter((id) => !this.shgat!.hasToolNode(id));
    if (unknownIds.length === 0) return;

    const placeholders = unknownIds.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await this.db.query(
      `SELECT tool_id, embedding::text FROM tool_embedding WHERE tool_id IN (${placeholders})`,
      unknownIds,
    );

    let registered = 0;
    for (const row of rows) {
      const toolId = row.tool_id as string;
      const embStr = row.embedding as string;
      if (!embStr) continue;

      const embedding: number[] = embStr.startsWith("[")
        ? JSON.parse(embStr)
        : embStr.replace(/^\[|\]$/g, "").split(",").map(Number);

      this.shgat!.registerTool({ id: toolId, embedding });
      registered++;
    }

    if (registered > 0) {
      log.info(`[Gateway] Live SHGAT: registered ${registered} new tools (${unknownIds.length} requested)`);
    }
  }

  private async initializeAlgorithms(): Promise<void> {
    if (!this.embeddingModel) {
      log.warn("[Gateway] No embedding model - SHGAT/DR-DSP disabled, discover/suggestions degraded");
      return;
    }

    this.algorithmInitializer = new AlgorithmInitializer({
      db: this.db,
      graphEngine: this.graphEngine,
      capabilityStore: this.capabilityStore,
      embeddingModel: this.embeddingModel,
    });

    const result = await this.algorithmInitializer.initialize();
    this.shgat = result.shgat;
    this.drdsp = result.drdsp;
    this.gru = result.gru;
  }

  async start(): Promise<void> {
    await initMcpPermissions(); // Load mcp-permissions.yaml for HIL detection
    await this.initializeAlgorithms();

    // Phase 3.1: Initialize facade after algorithms are loaded (shgat/drdsp available)
    this.updateExecuteAdaptersWithAlgorithms();
    this.initializeExecuteHandlerFacade();
    this.initializeDiscoverHandlerFacade(); // Phase 3.2
    this.initializeAdminHandlerFacade(); // MCP Tools Consolidation

    await this.healthChecker.initialHealthCheck();
    this.healthChecker.startPeriodicChecks();

    // Start periodic metrics logging (every 60 seconds)
    this.startMetricsLogging();

    await startStdioServer(this.server, this.config, this.mcpClients);
  }

  /**
   * Start gateway server with HTTP transport (ADR-014)
   */
  async startHttp(port: number): Promise<void> {
    await initMcpPermissions();
    await this.initializeAlgorithms();

    // Phase 3.1: Initialize facade after algorithms are loaded (shgat/drdsp available)
    this.updateExecuteAdaptersWithAlgorithms();
    this.initializeExecuteHandlerFacade();
    this.initializeDiscoverHandlerFacade(); // Phase 3.2
    this.initializeAdminHandlerFacade(); // MCP Tools Consolidation

    const deps: HttpServerDependencies = {
      config: this.config,
      routeContext: {
        graphEngine: this.graphEngine,
        vectorSearch: this.vectorSearch,
        dagSuggester: this.dagSuggester,
        capabilityStore: this.capabilityStore,
        capabilityDataService: this.capabilityDataService,
        healthChecker: this.healthChecker,
        mcpClients: this.mcpClients,
        db: this.db,
        embeddingModel: this.embeddingModel ?? undefined,
      },
      handleListTools: (request: unknown) => this.handleListTools(request),
      handleCallTool: (request: unknown, userId?: string, isPackageClient?: boolean) =>
        this.handleCallTool(request, userId, isPackageClient),
    };

    const state: HttpServerState = {
      httpServer: null,
      eventsStream: null,
    };

    this.httpServer = await startHttpServer(port, deps, state, {
      initialHealthCheck: () => this.healthChecker.initialHealthCheck(),
      startPeriodicChecks: () => this.healthChecker.startPeriodicChecks(),
    });

    // Start periodic metrics logging (every 60 seconds)
    this.startMetricsLogging();

    this.eventsStream = state.eventsStream;
  }

  /**
   * Graceful shutdown
   */
  async stop(): Promise<void> {
    // Stop metrics logging first
    this.stopMetricsLogging();

    // Log concurrency metrics before shutdown
    const metrics = this.requestQueue.getMetrics();
    if (metrics.inFlight > 0 || metrics.queued > 0) {
      log.info(
        `[Gateway] Shutting down with ${metrics.inFlight} in-flight and ${metrics.queued} queued requests`,
      );
      // Wait a bit for in-flight requests to complete (max 5 seconds)
      const maxWait = 5000;
      const startTime = Date.now();
      while (this.requestQueue.getMetrics().inFlight > 0 && Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const finalMetrics = this.requestQueue.getMetrics();
      if (finalMetrics.inFlight > 0) {
        log.warn(`[Gateway] Forced shutdown with ${finalMetrics.inFlight} requests still in-flight`);
      }
    }

    // Save SHGAT params via initializer
    if (this.algorithmInitializer) {
      await this.algorithmInitializer.saveSHGATParams();
      this.algorithmInitializer.stop();
    }

    this.healthChecker.stopPeriodicChecks();

    if (this.eventsStream) {
      this.eventsStream.close();
      this.eventsStream = null;
    }

    await stopServer(this.server, this.mcpClients, this.httpServer);
    this.httpServer = null;
  }
}
