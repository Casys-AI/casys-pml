# Events

> Real-time updates via SSE

## What Are Events?

PML emits **events** for everything that happens—tool calls, DAG progress, learning updates, errors. These events power real-time dashboards and monitoring.

```
┌─────────────────────────────────────────────────────────────────┐
│                       Event Flow                                 │
│                                                                  │
│   PML System                              Clients                │
│   ──────────                              ───────                │
│                                                                  │
│  ┌─────────────┐                      ┌─────────────────┐       │
│  │ Tool Call   │──┐                   │ Dashboard       │       │
│  └─────────────┘  │                   │  • Graph view   │       │
│  ┌─────────────┐  │    Event Bus      │  • Metrics      │       │
│  │ DAG Execute │──┼────────────────▶  │  • Logs         │       │
│  └─────────────┘  │                   └─────────────────┘       │
│  ┌─────────────┐  │                   ┌─────────────────┐       │
│  │ Learning    │──┘                   │ CLI             │       │
│  └─────────────┘                      │  • Progress     │       │
│                                       └─────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Server-Sent Events (SSE)

PML uses **Server-Sent Events** to stream updates to clients in real-time.

### Why SSE?

| Feature | SSE | WebSocket | Polling |
|---------|-----|-----------|---------|
| **Direction** | Server → Client | Bidirectional | Client → Server |
| **Complexity** | Simple | Complex | Simple |
| **Auto-reconnect** | Built-in | Manual | Manual |
| **HTTP compatible** | Yes | Upgrade needed | Yes |
| **Best for** | Streaming updates | Chat, games | Legacy systems |

SSE is perfect for PML because updates flow one way: from the system to observers.

### Connecting to SSE

```
┌─────────────────────────────────────────────────────────────────┐
│  Client Connection                                               │
│                                                                  │
│  GET /events                                                    │
│  Accept: text/event-stream                                      │
│                                                                  │
│  Response (streaming):                                          │
│                                                                  │
│  event: tool_called                                             │
│  data: {"tool":"read_file","server":"filesystem"}               │
│                                                                  │
│  event: dag_progress                                            │
│  data: {"workflow_id":"abc","completed":3,"total":5}            │
│                                                                  │
│  event: learning_update                                         │
│  data: {"edge":"read→parse","confidence":0.85}                 │
│                                                                  │
│  ... continues indefinitely ...                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## EventBus

The **EventBus** is PML's internal message broker that distributes events.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        EventBus                                  │
│                                                                  │
│  Publishers                    Subscribers                       │
│  ──────────                    ───────────                      │
│                                                                  │
│  Gateway ────┐              ┌──── SSE Handler → External clients│
│              │              │                                    │
│  DAG Engine ─┼──▶ EventBus ─┼──── Learning System               │
│              │              │                                    │
│  Sandbox ────┘              └──── Metrics Collector              │
│                                                                  │
│                                                                  │
│  Events flow: Publish → Route → Deliver to all subscribers      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Pub/Sub Pattern

```
1. Publisher emits event:
   eventBus.emit("tool_called", { tool: "read_file", ... })

2. EventBus routes to subscribers:
   • SSE Handler receives → streams to clients
   • Learning System receives → updates graph
   • Metrics receives → increments counters

3. Each subscriber processes independently
```

### Event Filtering

Clients can subscribe to specific event types:

```
Subscribe to all events:
  GET /events

Subscribe to specific types:
  GET /events?types=tool_called,dag_progress

Subscribe by workflow:
  GET /events?workflow_id=abc123
```

## Event Types

PML emits different events for different activities:

### Tool Events

```
┌─────────────────────────────────────────────────────────────────┐
│  tool_called                                                     │
│                                                                  │
│  {                                                               │
│    type: "tool_called",                                         │
│    timestamp: 1699900000000,                                    │
│    data: {                                                       │
│      tool: "read_file",                                         │
│      server: "filesystem",                                      │
│      params: { path: "data.json" },                             │
│      execution_id: "exec_123"                                   │
│    }                                                             │
│  }                                                               │
│                                                                  │
│  tool_completed                                                  │
│                                                                  │
│  {                                                               │
│    type: "tool_completed",                                      │
│    data: {                                                       │
│      tool: "read_file",                                         │
│      duration_ms: 45,                                           │
│      status: "success",                                         │
│      result_size: 1024                                          │
│    }                                                             │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### DAG Events

```
┌─────────────────────────────────────────────────────────────────┐
│  dag_started                                                     │
│  {                                                               │
│    workflow_id: "wf_abc",                                       │
│    task_count: 5,                                               │
│    intent: "Process files and create report"                    │
│  }                                                               │
│                                                                  │
│  dag_progress                                                    │
│  {                                                               │
│    workflow_id: "wf_abc",                                       │
│    current_task: "task_3",                                      │
│    completed: 2,                                                │
│    total: 5,                                                    │
│    percent: 40                                                  │
│  }                                                               │
│                                                                  │
│  dag_completed                                                   │
│  {                                                               │
│    workflow_id: "wf_abc",                                       │
│    status: "success",                                           │
│    duration_ms: 2340                                            │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Learning Events

```
┌─────────────────────────────────────────────────────────────────┐
│  edge_strengthened                                               │
│  {                                                               │
│    from_tool: "read_file",                                      │
│    to_tool: "parse_json",                                       │
│    old_confidence: 0.70,                                        │
│    new_confidence: 0.75,                                        │
│    observation_count: 15                                        │
│  }                                                               │
│                                                                  │
│  capability_learned                                              │
│  {                                                               │
│    capability_id: "cap_xyz",                                    │
│    intent: "Extract data from JSON file",                       │
│    tools: ["read_file", "parse_json"],                          │
│    source: "execution"                                          │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### System Events

```
┌─────────────────────────────────────────────────────────────────┐
│  server_connected                                                │
│  {                                                               │
│    server: "github",                                            │
│    tool_count: 12,                                              │
│    status: "ready"                                              │
│  }                                                               │
│                                                                  │
│  error                                                           │
│  {                                                               │
│    level: "error",                                              │
│    message: "Tool execution failed",                            │
│    tool: "create_issue",                                        │
│    error_code: "RATE_LIMITED"                                   │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Using Events

### In Dashboard

```
Real-time updates without polling:
  • Graph nodes appear as tools are discovered
  • Edges glow when strengthened
  • Progress bars update live
  • Logs stream continuously
```

### In CLI

```
$ pml execute --intent "process data" --stream

[00:00] Starting DAG execution...
[00:01] ✓ read_file completed (45ms)
[00:02] ✓ parse_json completed (12ms)
[00:03] ✓ transform completed (89ms)
[00:04] ✓ write_file completed (23ms)
[00:04] DAG completed successfully (169ms total)
```

### In Code

```
// Subscribe to events programmatically
const eventSource = new EventSource('/events?types=dag_progress');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  updateProgressBar(data.percent);
};
```

## Next

- [Visualization](./02-visualization.md) - Visual graph rendering
- [GraphRAG](../03-learning/01-graphrag.md) - The knowledge graph
