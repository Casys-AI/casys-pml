/**
 * DI Bootstrap
 *
 * Creates and configures the DI container with real implementations.
 * Used by serve.ts to wire up the application.
 *
 * Phase 2.2: Progressive DI migration
 * Phase 3.1: Execute use cases integration
 *
 * @module infrastructure/di/bootstrap
 */

import type { Container } from "diod";
import type { DbClient } from "../../db/types.ts";
import type { EmbeddingModel, EmbeddingModelInterface } from "../../vector/embeddings.ts";
import type { VectorSearch as VectorSearchImpl } from "../../vector/search.ts";
import type { GraphRAGEngine } from "../../graphrag/graph-engine.ts";
import type { CapabilityStore } from "../../capabilities/capability-store.ts";
import type { MCPClientBase } from "../../mcp/types.ts";
import type { SHGAT } from "../../graphrag/algorithms/shgat.ts";
import type { DRDSP } from "../../graphrag/algorithms/dr-dsp.ts";
import type { CheckpointManager } from "../../dag/checkpoint-manager.ts";
import type { CapabilityRegistry } from "../../capabilities/capability-registry.ts";
import type { IGRUInference } from "../../graphrag/algorithms/gru/types.ts";

import { buildContainer, type AppConfig, type EventBus } from "./container.ts";

/**
 * Create an in-memory event bus implementation.
 * Extracted as a reusable factory function.
 */
function createInMemoryEventBus(): EventBus {
  const subscribers: Array<(event: unknown) => void> = [];
  return {
    emit(event: unknown): void {
      for (const fn of subscribers) {
        fn(event);
      }
    },
    subscribe(handler: (event: unknown) => void): () => void {
      subscribers.push(handler);
      return () => {
        const idx = subscribers.indexOf(handler);
        if (idx >= 0) {
          subscribers.splice(idx, 1);
        }
      };
    },
  } as EventBus;
}
import {
  GraphEngineAdapter,
  CapabilityRepositoryAdapter,
  MCPClientRegistryAdapter,
  CodeAnalyzerAdapter,
} from "./adapters/mod.ts";

// Phase 3.1: Execute adapters
import {
  DAGSuggesterAdapter as ExecuteDAGSuggesterAdapter,
  WorkflowRepositoryAdapter,
  SHGATTrainerAdapter,
  ToolDefinitionsBuilderAdapter,
  DAGConverterAdapter,
  WorkerBridgeFactoryAdapter,
} from "./adapters/execute/mod.ts";

/**
 * Services created during bootstrap that may need direct access.
 *
 * The DI container provides abstracted access, but some services
 * need to be accessed directly for initialization or legacy code.
 */
export interface BootstrappedServices {
  container: Container;
  /** Underlying GraphRAGEngine for methods not in interface */
  graphEngine: GraphRAGEngine;
  /** Underlying CapabilityStore for methods not in interface */
  capabilityStore: CapabilityStore;
  /** MCP client registry adapter with refreshTools() */
  mcpRegistry: MCPClientRegistryAdapter;
  /** Code analyzer adapter for static structure analysis (Phase 3.2) */
  codeAnalyzer: CodeAnalyzerAdapter;

  // Phase 3.1: Execute adapters (for use cases)
  /** Execute-specific adapters for use cases */
  executeAdapters: {
    dagSuggester: ExecuteDAGSuggesterAdapter;
    workflowRepo: WorkflowRepositoryAdapter;
    shgatTrainer: SHGATTrainerAdapter;
    toolDefsBuilder: ToolDefinitionsBuilderAdapter;
    dagConverter: DAGConverterAdapter;
    workerBridgeFactory: WorkerBridgeFactoryAdapter;
    capabilityRepo: CapabilityRepositoryAdapter;
  };
}

/**
 * Bootstrap options for creating the DI container
 */
export interface BootstrapOptions {
  db: DbClient;
  embeddingModel: EmbeddingModel;
  vectorSearch: VectorSearchImpl;
  graphEngine: GraphRAGEngine;
  capabilityStore: CapabilityStore;
  mcpClients: Map<string, MCPClientBase>;
  config?: Partial<AppConfig>;

  // Phase 3.1: Optional execute dependencies
  /** SHGAT scorer for capability matching */
  shgat?: SHGAT;
  /** DR-DSP for hyperpath finding */
  drdsp?: DRDSP;
  /** Checkpoint manager for workflow persistence */
  checkpointManager?: CheckpointManager;
  /** Capability registry for tool definitions */
  capabilityRegistry?: CapabilityRegistry;
  /** CapModule for cap_* tool routing */
  capModule?: import("../../mcp/handlers/cap-handler.ts").CapModule;
  /** GRU inference engine for next-tool prediction */
  gru?: IGRUInference;
}

/**
 * Bootstrap the DI container with real implementations.
 *
 * Creates adapters for existing service instances and registers
 * them with the DI container.
 *
 * @example
 * ```ts
 * const { container, graphEngine, capabilityStore } = bootstrapDI({
 *   db,
 *   embeddingModel,
 *   vectorSearch,
 *   graphEngine,
 *   capabilityStore,
 *   mcpClients,
 * });
 *
 * // Use container for DI-aware code
 * const repo = container.get(CapabilityRepository);
 *
 * // Use underlying services for legacy code
 * await graphEngine.syncFromDatabase();
 * ```
 */
export function bootstrapDI(options: BootstrapOptions): BootstrappedServices {
  const {
    db,
    embeddingModel,
    vectorSearch,
    graphEngine,
    capabilityStore,
    mcpClients,
    config = {},
    // Phase 3.1: Execute dependencies
    checkpointManager,
    capabilityRegistry,
  } = options;

  // Create core adapters
  const graphEngineAdapter = new GraphEngineAdapter(graphEngine);
  const capabilityRepoAdapter = new CapabilityRepositoryAdapter(capabilityStore);
  const mcpRegistryAdapter = new MCPClientRegistryAdapter(mcpClients);
  const codeAnalyzerAdapter = new CodeAnalyzerAdapter(db);

  // Phase 3.1: Create execute adapters
  const executeDAGSuggester = new ExecuteDAGSuggesterAdapter({
    embeddingModel: embeddingModel as EmbeddingModelInterface,
    gru: options.gru,
  });

  const workflowRepo = new WorkflowRepositoryAdapter({
    checkpointManager,
  });

  const shgatTrainer = new SHGATTrainerAdapter({
    // liveTrainer will be set later via setLiveTrainer if needed
  });

  const toolDefsBuilder = new ToolDefinitionsBuilderAdapter({
    mcpClients,
    capabilityRegistry,
    capabilityStore,
  });

  const dagConverter = new DAGConverterAdapter();

  const workerBridgeFactory = new WorkerBridgeFactoryAdapter({
    mcpClients,
    capabilityStore,
    capabilityRegistry,
    graphRAG: graphEngine,
    capModule: options.capModule,
  });

  // Build container with factory functions
  const container = buildContainer(
    {
      dbPath: config.dbPath ?? ":memory:",
      ...config,
    },
    {
      // Database client - wrap existing instance
      createDbClient: () => ({
        connect: async () => {},
        disconnect: async () => db.close(),
        query: async <T>(sql: string, params?: unknown[]) => {
          const result = await db.query(sql, params);
          return result as T[];
        },
      }),

      // Vector search - wrap existing instance
      createVectorSearch: () => ({
        searchTools: async (query: string, limit?: number) =>
          vectorSearch.searchTools(query, limit),
        searchCapabilities: async (_query: string, _limit?: number) => {
          // Capabilities search not yet implemented in VectorSearch
          return [];
        },
      }),

      // Event bus - simple in-memory implementation
      createEventBus: createInMemoryEventBus,

      // Domain services - use adapters
      createGraphEngine: () => graphEngineAdapter,
      createCapabilityRepository: () => capabilityRepoAdapter,
      createMCPClientRegistry: () => mcpRegistryAdapter,

      // Phase 3.2: Code analyzer adapter
      createCodeAnalyzer: () => codeAnalyzerAdapter,
    },
  );

  return {
    container,
    graphEngine,
    capabilityStore,
    mcpRegistry: mcpRegistryAdapter,
    codeAnalyzer: codeAnalyzerAdapter,
    // Phase 3.1: Execute adapters
    executeAdapters: {
      dagSuggester: executeDAGSuggester,
      workflowRepo,
      shgatTrainer,
      toolDefsBuilder,
      dagConverter,
      workerBridgeFactory,
      capabilityRepo: capabilityRepoAdapter,
    },
  };
}

/**
 * Re-export container utilities
 */
export {
  getCapabilityRepository,
  getGraphEngine,
  getMCPClientRegistry,
  getCodeAnalyzer,
} from "./container.ts";
