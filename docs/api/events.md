# AgentCards Events API

Real-time Server-Sent Events (SSE) stream for monitoring graph learning and evolution.

**Story:** 6.1 - Real-time Events Stream (SSE)
**Endpoint:** `GET /events/stream`
**Transport:** Server-Sent Events (SSE)

---

## Overview

The Events API provides a real-time stream of graph events via Server-Sent Events (SSE). This allows clients to observe how AgentCards learns from workflow executions, builds tool dependency relationships, and evolves its knowledge graph over time.

### Key Features

- ✅ **Real-time updates**: Graph changes streamed instantly to all connected clients
- ✅ **Auto-reconnection**: Built-in reconnection via EventSource API
- ✅ **Heartbeat**: Keep-alive events every 30 seconds
- ✅ **Client limit**: Max 100 concurrent connections (DoS protection)
- ✅ **CORS support**: Configurable origins for local development

---

## Endpoint

### `GET /events/stream`

Establishes a Server-Sent Events stream for graph events.

**Request:**
```bash
curl -N -H "Accept: text/event-stream" http://localhost:3000/events/stream
```

**Response (200 OK):**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
Access-Control-Allow-Origin: http://localhost:3000

event: connected
data: {"client_id":"550e8400-e29b-41d4-a716-446655440000","connected_clients":1,"timestamp":"2025-12-01T12:00:00.000Z"}

event: graph_synced
data: {"node_count":150,"edge_count":320,"sync_duration_ms":42.5,"timestamp":"2025-12-01T12:00:01.123Z"}

event: heartbeat
data: {"connected_clients":1,"uptime_seconds":30,"timestamp":"2025-12-01T12:00:30.000Z"}
```

**Response (503 Service Unavailable):**
```json
{
  "error": "Too many clients",
  "max": 100
}
```

Returns 503 when the server has reached the maximum concurrent client limit (100 connections).

---

## Event Types

All events follow the SSE format:
```
event: {event_type}
data: {JSON payload}

```

### Common Fields

Every event includes:
- **`timestamp`**: ISO8601 timestamp (e.g., `"2025-12-01T12:00:00.000Z"`)
- **Event-specific data fields** (see below)

---

### `connected`

Emitted once when a client first connects to the stream.

**Event Type:** `connected`

**Payload:**
```typescript
{
  client_id: string;        // Unique client identifier (UUID)
  connected_clients: number; // Current number of connected clients
  timestamp: string;         // ISO8601 timestamp
}
```

**Example:**
```
event: connected
data: {"client_id":"550e8400-e29b-41d4-a716-446655440000","connected_clients":5,"timestamp":"2025-12-01T12:00:00.000Z"}
```

---

### `graph_synced`

Emitted when the graph is synced from the database (typically on server startup or periodic refresh).

**Event Type:** `graph_synced`

**Payload:**
```typescript
{
  node_count: number;       // Total number of tool nodes in graph
  edge_count: number;       // Total number of dependency edges
  sync_duration_ms: number; // Time taken to sync (milliseconds)
  timestamp: string;         // ISO8601 timestamp
}
```

**Example:**
```
event: graph_synced
data: {"node_count":150,"edge_count":320,"sync_duration_ms":42.5,"timestamp":"2025-12-01T12:00:01.123Z"}
```

---

### `edge_created`

Emitted when a new dependency edge is discovered and added to the graph.

**Event Type:** `edge_created`

**Payload:**
```typescript
{
  from_tool_id: string;      // Source tool ID
  to_tool_id: string;        // Destination tool ID
  confidence_score: number;  // Initial confidence (typically 0.5)
  timestamp: string;          // ISO8601 timestamp
}
```

**Example:**
```
event: edge_created
data: {"from_tool_id":"search_tools","to_tool_id":"execute_dag","confidence_score":0.5,"timestamp":"2025-12-01T12:00:05.456Z"}
```

---

### `edge_updated`

Emitted when an existing dependency edge is strengthened through repeated observation.

**Event Type:** `edge_updated`

**Payload:**
```typescript
{
  from_tool_id: string;      // Source tool ID
  to_tool_id: string;        // Destination tool ID
  old_confidence: number;    // Previous confidence score
  new_confidence: number;    // Updated confidence score
  observed_count: number;    // Total number of times observed
  timestamp: string;          // ISO8601 timestamp
}
```

**Example:**
```
event: edge_updated
data: {"from_tool_id":"search_tools","to_tool_id":"execute_dag","old_confidence":0.5,"new_confidence":0.55,"observed_count":2,"timestamp":"2025-12-01T12:00:10.789Z"}
```

**Note:** Confidence scores increase by 10% per observation (capped at 1.0).

---

### `workflow_executed`

Emitted when a workflow execution completes (success or failure).

**Event Type:** `workflow_executed`

**Payload:**
```typescript
{
  workflow_id: string;       // Workflow execution ID
  tool_ids: string[];        // List of tools executed in order
  success: boolean;          // true if workflow succeeded
  execution_time_ms: number; // Total execution time (milliseconds)
  timestamp: string;          // ISO8601 timestamp
}
```

**Example:**
```
event: workflow_executed
data: {"workflow_id":"exec_123abc","tool_ids":["search_tools","execute_dag","continue"],"success":true,"execution_time_ms":1245.3,"timestamp":"2025-12-01T12:00:15.234Z"}
```

---

### `metrics_updated`

Emitted after graph metrics are recomputed (PageRank, communities, density).

**Event Type:** `metrics_updated`

**Payload:**
```typescript
{
  edge_count: number;        // Current number of edges
  node_count: number;        // Current number of nodes
  density: number;           // Graph density (0-1)
  pagerank_top_10: Array<{   // Top 10 tools by PageRank
    tool_id: string;
    score: number;
  }>;
  communities_count: number; // Number of detected communities (Louvain)
  timestamp: string;          // ISO8601 timestamp
}
```

**Example:**
```
event: metrics_updated
data: {"edge_count":320,"node_count":150,"density":0.0142,"pagerank_top_10":[{"tool_id":"search_tools","score":0.0234},{"tool_id":"execute_dag","score":0.0198}],"communities_count":8,"timestamp":"2025-12-01T12:00:15.567Z"}
```

**Density Calculation:** `density = edge_count / (node_count * (node_count - 1))`

---

### `heartbeat`

Emitted every 30 seconds to keep the connection alive and provide server status.

**Event Type:** `heartbeat`

**Payload:**
```typescript
{
  connected_clients: number; // Current number of connected clients
  uptime_seconds: number;    // Server uptime in seconds
  timestamp: string;          // ISO8601 timestamp
}
```

**Example:**
```
event: heartbeat
data: {"connected_clients":5,"uptime_seconds":3600,"timestamp":"2025-12-01T13:00:00.000Z"}
```

---

## Client Examples

### JavaScript (Browser)

```javascript
const eventSource = new EventSource("http://localhost:3000/events/stream");

// Connection opened
eventSource.onopen = () => {
  console.log("✅ Connected to events stream");
};

// Listen to specific event types
eventSource.addEventListener("graph_synced", (event) => {
  const data = JSON.parse(event.data);
  console.log(`📊 Graph: ${data.node_count} nodes, ${data.edge_count} edges`);
});

eventSource.addEventListener("edge_created", (event) => {
  const data = JSON.parse(event.data);
  console.log(`➕ New edge: ${data.from_tool_id} → ${data.to_tool_id}`);
});

eventSource.addEventListener("workflow_executed", (event) => {
  const data = JSON.parse(event.data);
  const status = data.success ? "✅" : "❌";
  console.log(`${status} Workflow: ${data.tool_ids.join(" → ")}`);
});

// Error handling (automatic reconnection)
eventSource.onerror = (error) => {
  console.error("⚠️  Connection error, reconnecting...");
};

// Close connection
// eventSource.close();
```

### TypeScript (Deno)

```typescript
import { connectToEventsStream } from "./public/examples/events-client.ts";

const eventSource = connectToEventsStream("http://localhost:3000");

// Automatically handles all event types and logging
// See: public/examples/events-client.ts for full implementation
```

### curl (Testing)

```bash
# Stream events (Ctrl+C to stop)
curl -N -H "Accept: text/event-stream" http://localhost:3000/events/stream

# Expected output:
# event: connected
# data: {"client_id":"...","connected_clients":1,"timestamp":"..."}
#
# event: heartbeat
# data: {"connected_clients":1,"uptime_seconds":30,"timestamp":"..."}
```

---

## Connection Management

### Automatic Reconnection

EventSource automatically reconnects on connection loss:
- **Default retry interval:** ~3 seconds
- **Exponential backoff:** Increases on repeated failures
- **No manual logic needed:** Browser/Deno handles reconnection

### Maximum Clients

- **Limit:** 100 concurrent connections
- **Behavior:** 101st connection receives HTTP 503
- **Reason:** DoS protection

### Heartbeat

- **Interval:** 30 seconds
- **Purpose:** Keep connection alive, detect dead clients
- **Client action:** None required (automatic)

---

## CORS Configuration

Default allowed origins:
- `http://localhost:3000`
- `http://localhost:8080`
- `http://127.0.0.1:*` (wildcard pattern)

Custom configuration via `EventsStreamConfig`:
```typescript
const config = {
  maxClients: 100,
  heartbeatIntervalMs: 30000,
  corsOrigins: ["http://localhost:5173", "https://example.com"]
};
```

---

## Performance Targets

- **Connection setup:** <50ms
- **Event broadcast latency:** <10ms (100 clients)
- **Memory per client:** <1KB
- **Heartbeat jitter:** <1s

---

## Error Responses

### 503 Service Unavailable

Too many concurrent connections.

**Response:**
```json
{
  "error": "Too many clients",
  "max": 100
}
```

**Solution:** Wait for existing clients to disconnect, or increase `maxClients` limit.

---

## Security Considerations

1. **DoS Protection:** Client limit (100) prevents resource exhaustion
2. **CORS:** Only allowed origins can connect from browsers
3. **No Authentication:** Events are read-only, no sensitive data exposed
4. **Rate Limiting:** Consider adding rate limiting for production deployments

---

## Related Documentation

- [Architecture: Pattern 3 - GraphRAG Engine](../architecture.md#Pattern-3)
- [Story 2.3: SSE Streaming for Progressive Results](../stories/story-2.3.md)
- [Client Example: events-client.ts](../../public/examples/events-client.ts)
