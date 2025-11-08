/**
 * DAG Execution Module
 *
 * Provides parallel execution of DAG workflows with automatic parallelization
 * and SSE streaming for progressive results.
 *
 * @module dag
 */

export { ParallelExecutor } from "./executor.ts";
export type {
  DAGExecutionResult,
  ExecutorConfig,
  TaskError,
  TaskResult,
  ToolExecutor,
} from "./types.ts";

// SSE Streaming
export {
  StreamingExecutor,
  BufferedEventStream,
} from "./streaming.ts";
export type {
  SSEEvent,
  TaskStartEvent,
  TaskCompleteEvent,
  ExecutionCompleteEvent,
  ErrorEvent,
  BufferedStreamConfig,
} from "./streaming.ts";
