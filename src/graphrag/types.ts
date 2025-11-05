/**
 * GraphRAG Types and Interfaces
 *
 * @module graphrag/types
 */

/**
 * DAG task representation
 */
export interface Task {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  depends_on: string[];
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
