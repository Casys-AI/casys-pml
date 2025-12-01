/**
 * Client-side example for consuming AgentCards Graph Events via Server-Sent Events (SSE)
 * Story 6.1: Real-time Events Stream
 *
 * This example demonstrates:
 * - Connecting to the /events/stream endpoint
 * - Handling different event types (graph_synced, edge_created, edge_updated, etc.)
 * - Automatic reconnection via EventSource (built-in browser API)
 * - Error handling and connection monitoring
 *
 * Usage:
 *   import { connectToEventsStream } from "./events-client.ts";
 *   const eventSource = connectToEventsStream("http://localhost:3000");
 */

/**
 * Connect to AgentCards events stream
 *
 * @param baseUrl - Base URL of AgentCards server (e.g., "http://localhost:3000")
 * @returns EventSource instance
 */
export function connectToEventsStream(baseUrl: string): EventSource {
  const eventSource = new EventSource(`${baseUrl}/events/stream`);

  // ============================================
  // Connection Events
  // ============================================

  eventSource.addEventListener("connected", (event: MessageEvent) => {
    const data = JSON.parse(event.data);
    console.log(
      `🔗 Connected to events stream (${data.connected_clients} clients)`,
    );
    console.log(`   Client ID: ${data.client_id}`);
  });

  // ============================================
  // Graph Events
  // ============================================

  eventSource.addEventListener("graph_synced", (event: MessageEvent) => {
    const data = JSON.parse(event.data);
    console.log(
      `📊 Graph synced: ${data.node_count} nodes, ${data.edge_count} edges (${data.sync_duration_ms.toFixed(1)}ms)`,
    );
  });

  eventSource.addEventListener("edge_created", (event: MessageEvent) => {
    const data = JSON.parse(event.data);
    console.log(
      `➕ New edge: ${data.from_tool_id} → ${data.to_tool_id} (confidence: ${data.confidence_score.toFixed(2)})`,
    );
  });

  eventSource.addEventListener("edge_updated", (event: MessageEvent) => {
    const data = JSON.parse(event.data);
    console.log(
      `📈 Edge updated: ${data.from_tool_id} → ${data.to_tool_id}`,
    );
    console.log(
      `   Confidence: ${data.old_confidence.toFixed(2)} → ${data.new_confidence.toFixed(2)} (observed ${data.observed_count}x)`,
    );
  });

  eventSource.addEventListener("workflow_executed", (event: MessageEvent) => {
    const data = JSON.parse(event.data);
    const status = data.success ? "✅" : "❌";
    console.log(
      `${status} Workflow ${data.workflow_id.substring(0, 8)}... (${data.execution_time_ms.toFixed(1)}ms)`,
    );
    console.log(`   Tools: ${data.tool_ids.join(" → ")}`);
  });

  eventSource.addEventListener("metrics_updated", (event: MessageEvent) => {
    const data = JSON.parse(event.data);
    console.log(
      `📉 Metrics updated: ${data.edge_count} edges, ${data.node_count} nodes`,
    );
    console.log(
      `   Density: ${data.density.toFixed(4)}, Communities: ${data.communities_count}`,
    );

    if (data.pagerank_top_10.length > 0) {
      const topTools = data.pagerank_top_10
        .slice(0, 3)
        .map((t: { tool_id: string; score: number }) =>
          `${t.tool_id} (${t.score.toFixed(3)})`
        )
        .join(", ");
      console.log(`   Top PageRank: ${topTools}`);
    }
  });

  eventSource.addEventListener("heartbeat", (event: MessageEvent) => {
    const data = JSON.parse(event.data);
    console.log(
      `💓 Heartbeat: ${data.connected_clients} clients, uptime ${data.uptime_seconds}s`,
    );
  });

  // ============================================
  // Error Handling & Reconnection
  // ============================================

  /**
   * EventSource automatically reconnects on connection loss!
   * - Default retry interval: ~3 seconds
   * - Exponential backoff on repeated failures
   * - No manual reconnection logic needed
   */
  eventSource.onerror = (error) => {
    if (eventSource.readyState === EventSource.CONNECTING) {
      console.log("⚠️  Connection lost, reconnecting...");
    } else if (eventSource.readyState === EventSource.CLOSED) {
      console.error("❌ Connection closed:", error);
    } else {
      console.error("❌ Connection error:", error);
    }
  };

  eventSource.onopen = () => {
    console.log("✅ Connection established");
  };

  return eventSource;
}

/**
 * Gracefully disconnect from events stream
 *
 * @param eventSource - EventSource instance to close
 */
export function disconnectFromEventsStream(eventSource: EventSource): void {
  eventSource.close();
  console.log("👋 Disconnected from events stream");
}

// ============================================
// Example Usage
// ============================================

if (import.meta.main) {
  console.log("Starting AgentCards events stream client...\n");

  const eventSource = connectToEventsStream("http://localhost:3000");

  // Handle Ctrl+C gracefully
  Deno.addSignalListener("SIGINT", () => {
    console.log("\n\nReceived SIGINT, closing connection...");
    disconnectFromEventsStream(eventSource);
    Deno.exit(0);
  });

  console.log("\nListening for graph events (Ctrl+C to stop)...\n");
}
