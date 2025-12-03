/**
 * GraphRAG Types and Interfaces
 *
 * @module graphrag/types
 */

/**
 * DAG task representation
 *
 * Supports two task types (Story 3.4):
 * - mcp_tool (default): Execute MCP tool
 * - code_execution: Execute code in sandbox
 */
export interface Task {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  depends_on: string[];

  /**
   * Task type (Story 3.4)
   * @default "mcp_tool"
   */
  type?: "mcp_tool" | "code_execution";

  /**
   * TypeScript code to execute (only for type="code_execution")
   */
  code?: string;

  /**
   * Intent for tool discovery (only for type="code_execution")
   */
  intent?: string;

  /**
   * Sandbox configuration (only for type="code_execution")
   */
  sandbox_config?: {
    timeout?: number;
    memoryLimit?: number;
    allowedReadPaths?: string[];
  };

  /**
   * Flag for side-effects (Story 2.5-3 HIL approval)
   */
  side_effects?: boolean;
}

/**
 * DAG structure for workflow execution
 */
export interface DAGStructure {
  tasks: Task[];
}

/**
 * Workflow intent for pattern matching
 */
export interface WorkflowIntent {
  text: string;
  toolsConsidered?: string[];
}

/**
 * Workflow execution record
 */
export interface WorkflowExecution {
  execution_id: string;
  executed_at: Date;
  intent_text: string;
  dag_structure: DAGStructure;
  success: boolean;
  execution_time_ms: number;
  error_message?: string;
}

/**
 * Execution result for a single task
 */
export interface ExecutionResult {
  taskId: string;
  tool: string;
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime: number;
}

/**
 * Dependency path between two tools
 */
export interface DependencyPath {
  from: string;
  to: string;
  path: string[];
  hops: number;
  explanation: string;
  confidence?: number;
}

/**
 * Suggested DAG with metadata
 */
export interface SuggestedDAG {
  dagStructure: DAGStructure;
  confidence: number;
  rationale: string;
  dependencyPaths?: DependencyPath[];
  alternatives?: string[];
  /** Warning message for low confidence suggestions (ADR-026) */
  warning?: string;
}

/**
 * Execution mode for gateway handler
 */
export interface ExecutionMode {
  mode: "explicit_required" | "suggestion" | "speculative_execution";
  confidence: number;
  dagStructure?: DAGStructure;
  results?: ExecutionResult[];
  explanation?: string;
  warning?: string;
  error?: string;
  note?: string;
  execution_time_ms?: number;
  dag_used?: DAGStructure;
  dependency_paths?: DependencyPath[];
}

/**
 * Graph statistics
 */
export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  communities: number;
  avgPageRank: number;
}

/**
 * Execution record for adaptive learning
 */
export interface ExecutionRecord {
  confidence: number;
  mode: "explicit" | "suggestion" | "speculative";
  success: boolean;
  userAccepted?: boolean;
  executionTime?: number;
  timestamp: number;
}

/**
 * Speculative execution metrics
 */
export interface SpeculativeMetrics {
  totalSpeculativeAttempts: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgExecutionTime: number;
  avgConfidence: number;
  wastedComputeCost: number;
  savedLatency: number;
}

// =============================================================================
// Story 3.5-1: DAG Suggester & Speculative Execution
// =============================================================================

/**
 * Predicted next node for speculative execution (Story 3.5-1)
 *
 * Represents a tool that is likely to be requested next based on:
 * - Historical co-occurrence patterns
 * - Community membership (Louvain)
 * - Context similarity
 */
export interface PredictedNode {
  toolId: string;
  confidence: number;
  reasoning: string;
  source: "community" | "co-occurrence" | "hint" | "learned";
  wasCorrect?: boolean; // Set after validation
}

/**
 * Configuration for speculative execution (Story 3.5-1)
 */
export interface SpeculationConfig {
  enabled: boolean;
  confidence_threshold: number; // Default: 0.70
  max_concurrent: number; // Default: 3
}

/**
 * Cached result from speculative execution (Story 3.5-1)
 */
export interface SpeculationCache {
  prediction_id: string;
  toolId: string;
  result: unknown;
  confidence: number;
  timestamp: number;
  executionTimeMs: number;
}

/**
 * Speculation metrics for monitoring (Story 3.5-1)
 */
export interface SpeculationMetrics {
  hit_rate: number;
  net_benefit_ms: number;
  false_positive_rate: number;
  total_speculations: number;
  total_hits: number;
  total_misses: number;
}

/**
 * Learned pattern from execution history (Story 3.5-1)
 */
export interface LearnedPattern {
  from_tool: string;
  to_tool: string;
  success_rate: number;
  observation_count: number;
  avg_confidence: number;
  source: "user" | "learned";
}

/**
 * Workflow state for prediction (Story 3.5-1)
 */
export interface WorkflowPredictionState {
  workflow_id: string;
  current_layer: number;
  completed_tasks: CompletedTask[];
  context?: Record<string, unknown>;
}

/**
 * Completed task for prediction context (Story 3.5-1)
 */
export interface CompletedTask {
  taskId: string;
  tool: string;
  status: "success" | "error" | "failed_safe";
  executionTimeMs?: number;
}

// =============================================================================
// Story 5.2 / ADR-022: Hybrid Search Integration
// =============================================================================

/**
 * Result from hybrid search combining semantic and graph scores (ADR-022)
 *
 * Centralizes the hybrid search logic for use in both:
 * - GatewayServer.handleSearchTools (MCP tool)
 * - DAGSuggester.suggestDAG (internal)
 */
export interface HybridSearchResult {
  toolId: string;
  serverId: string;
  toolName: string;
  description: string;
  /** Semantic similarity score (0-1) */
  semanticScore: number;
  /** Graph relatedness score (0-1) */
  graphScore: number;
  /** Combined final score: α × semantic + (1-α) × graph */
  finalScore: number;
  /** Related tools (in/out neighbors) if requested */
  relatedTools?: Array<{
    toolId: string;
    relation: "often_before" | "often_after";
    score: number;
  }>;
  /** Original schema from tool_schema table */
  schema?: Record<string, unknown>;
}

// =============================================================================
// Story 6.3: Live Metrics & Analytics Panel
// =============================================================================

/**
 * Time range for metrics queries
 */
export type MetricsTimeRange = "1h" | "24h" | "7d";

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

/**
 * Graph metrics response for dashboard (Story 6.3 AC4)
 *
 * Contains current snapshot metrics, time series data for charts,
 * and period statistics for the selected time range.
 */
export interface GraphMetricsResponse {
  /** Current snapshot metrics */
  current: {
    node_count: number;
    edge_count: number;
    density: number;
    adaptive_alpha: number;
    communities_count: number;
    pagerank_top_10: Array<{ tool_id: string; score: number }>;
  };

  /** Time series data for charts */
  timeseries: {
    edge_count: TimeSeriesPoint[];
    avg_confidence: TimeSeriesPoint[];
    workflow_rate: TimeSeriesPoint[];
  };

  /** Period statistics */
  period: {
    range: MetricsTimeRange;
    workflows_executed: number;
    workflows_success_rate: number;
    new_edges_created: number;
    new_nodes_added: number;
  };
}
