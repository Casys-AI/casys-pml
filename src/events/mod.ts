/**
 * Events Module - Unified Event Distribution for Casys Intelligence
 * Story 6.5: EventBus with BroadcastChannel (ADR-036)
 *
 * @module events
 */

// Core EventBus
export { EventBus, eventBus } from "./event-bus.ts";

// All event types and payloads
export type {
  // Core types
  AgentCardsEvent,
  CaiEvent,
  EventHandler,
  EventType,
  WildcardEventHandler,

  // Tool event payloads
  ToolEndPayload,
  ToolStartPayload,

  // Capability event payloads
  CapabilityEndPayload,
  CapabilityLearnedPayload,
  CapabilityMatchedPayload,
  CapabilityStartPayload,

  // DAG event payloads
  DagCompletedPayload,
  DagReplannedPayload,
  DagStartedPayload,
  DagTaskCompletedPayload,
  DagTaskFailedPayload,
  DagTaskStartedPayload,

  // Graph event payloads
  GraphEdgeCreatedPayload,
  GraphEdgeUpdatedPayload,
  GraphSyncedPayload,

  // Algorithm event payloads (Story 7.6 preparation)
  AlgorithmAnomalyPayload,
  AlgorithmFeedbackPayload,
  AlgorithmScoredPayload,
  AlgorithmSuggestedPayload,
  ThresholdAdjustedPayload,

  // System event payloads
  HealthCheckPayload,
  HeartbeatPayload,
  MetricsSnapshotPayload,

  // Typed events
  AlgorithmScoredEvent,
  CapabilityEndEvent,
  CapabilityLearnedEvent,
  CapabilityMatchedEvent,
  CapabilityStartEvent,
  DagCompletedEvent,
  DagStartedEvent,
  GraphSyncedEvent,
  ToolEndEvent,
  ToolStartEvent,
} from "./types.ts";
