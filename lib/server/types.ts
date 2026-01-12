/**
 * Type definitions for the MCP Concurrent Server Framework
 *
 * This module provides TypeScript types for building high-performance
 * MCP servers with built-in concurrency control and backpressure.
 *
 * @module lib/server/types
 */

/**
 * Configuration options for ConcurrentMCPServer
 */
export interface ConcurrentServerOptions {
  /** Server name (shown in MCP protocol) */
  name: string;

  /** Server version */
  version: string;

  /** Maximum concurrent requests (default: 10) */
  maxConcurrent?: number;

  /** Backpressure strategy when at capacity (default: 'sleep') */
  backpressureStrategy?: 'sleep' | 'queue' | 'reject';

  /** Sleep duration in ms for 'sleep' strategy (default: 10) */
  backpressureSleepMs?: number;

  /** Enable sampling support for agentic tools (default: false) */
  enableSampling?: boolean;

  /** Sampling client implementation (required if enableSampling is true) */
  samplingClient?: SamplingClient;

  /** Custom logger function (default: console.error) */
  logger?: (msg: string) => void;
}

/**
 * MCP Tool definition (compatible with MCP protocol)
 */
export interface MCPTool {
  /** Tool name */
  name: string;

  /** Human-readable description */
  description: string;

  /** JSON Schema for tool input */
  inputSchema: Record<string, unknown>;
}

/**
 * Tool handler function
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

/**
 * Sampling client interface for bidirectional LLM delegation
 */
export interface SamplingClient {
  /**
   * Request LLM completion from the client
   * @param params - Sampling parameters (messages, model, etc.)
   * @returns Completion result
   */
  createMessage(params: SamplingParams): Promise<SamplingResult>;
}

/**
 * Parameters for sampling request
 */
export interface SamplingParams {
  messages: Array<{ role: string; content: string }>;
  modelPreferences?: {
    hints?: Array<{ name: string }>;
    costPriority?: number;
    speedPriority?: number;
    intelligencePriority?: number;
  };
  systemPrompt?: string;
  includeContext?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Result from sampling request
 */
export interface SamplingResult {
  model: string;
  stopReason?: string;
  role: string;
  content: {
    type: string;
    text?: string;
    [key: string]: unknown;
  };
}

/**
 * Queue metrics for monitoring
 */
export interface QueueMetrics {
  /** Number of requests currently executing */
  inFlight: number;

  /** Number of requests waiting in queue */
  queued: number;
}

/**
 * Promise resolver for pending requests
 */
export interface PromiseResolver<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Request queue options
 */
export interface QueueOptions {
  maxConcurrent: number;
  strategy: 'sleep' | 'queue' | 'reject';
  sleepMs: number;
}
