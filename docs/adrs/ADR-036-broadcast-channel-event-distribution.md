# ADR-036: BroadcastChannel for Event Distribution

**Status:** 📝 Draft
**Date:** 2025-12-05 | **Deciders:** Architecture Team

## Context

Casys Intelligence distribue des événements temps réel vers le dashboard via SSE:

- `src/server/events-stream.ts` - Gestion des connexions SSE
- `src/server/sse-handler.ts` - Handler HTTP pour SSE
- `src/dag/event-stream.ts` - Émission d'événements DAG

**Architecture actuelle:**

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  DAG Executor   │     │  SSE Handler    │     │  Dashboard 1    │
│                 │────▶│  (manages list  │────▶│  (browser)      │
│  emit("event")  │     │   of clients)   │     └─────────────────┘
└─────────────────┘     │                 │────▶┌─────────────────┐
                        │  for each client│     │  Dashboard 2    │
                        │    send(event)  │     │  (browser)      │
                        └─────────────────┘     └─────────────────┘
```

**Problèmes:**
1. **Couplage fort:** L'émetteur doit connaître le gestionnaire de connexions
2. **Single point of failure:** Si le SSE handler crash, tous les clients sont déconnectés
3. **Scalabilité:** Difficile de distribuer sur plusieurs processus/workers
4. **Sandbox isolation:** Les workers sandbox ne peuvent pas émettre directement vers SSE

**Opportunité:** `BroadcastChannel` est une API Web standard disponible nativement dans Deno.

## Decision

Adopter BroadcastChannel comme bus d'événements interne pour découpler les émetteurs des consommateurs.

### BroadcastChannel API

```typescript
// Création d'un canal (même nom = même canal)
const channel = new BroadcastChannel("cai-events");

// Émission (broadcast à tous les listeners)
channel.postMessage({ type: "task_completed", payload: {...} });

// Réception
channel.onmessage = (event) => {
  console.log("Received:", event.data);
};

// Cleanup
channel.close();
```

### Architecture Cible

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BroadcastChannel: "cai-events"            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ DAG Executor  │       │ Sandbox Worker│       │ GraphRAG      │
│               │       │               │       │               │
│ postMessage() │       │ postMessage() │       │ postMessage() │
└───────────────┘       └───────────────┘       └───────────────┘

        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BroadcastChannel: "cai-events"            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ SSE Handler 1 │       │ SSE Handler 2 │       │ Metrics       │
│ → Client A    │       │ → Client B    │       │ Collector     │
│ → Client B    │       │ → Client C    │       │               │
└───────────────┘       └───────────────┘       └───────────────┘
```

### Event Types

```typescript
// src/events/types.ts
interface Casys IntelligenceEvent {
  type: EventType;
  timestamp: number;
  source: string;
  payload: unknown;
}

type EventType =
  // DAG Events
  | "dag.started"
  | "dag.task.started"
  | "dag.task.completed"
  | "dag.task.failed"
  | "dag.completed"
  // Sandbox Events
  | "sandbox.execution.started"
  | "sandbox.execution.completed"
  | "sandbox.rpc.called"
  // GraphRAG Events
  | "graph.updated"
  | "graph.suggestion.generated"
  // Capability Events
  | "capability.learned"
  | "capability.matched"
  // System Events
  | "health.check"
  | "metrics.snapshot";
```

### Implementation

#### 1. Event Bus Central

```typescript
// src/events/event-bus.ts
const CHANNEL_NAME = "cai-events";

class EventBus {
  private channel: BroadcastChannel;
  private handlers: Map<string, Set<(event: Casys IntelligenceEvent) => void>> = new Map();

  constructor() {
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (e) => this.dispatch(e.data);
  }

  emit(event: Omit<Casys IntelligenceEvent, "timestamp">): void {
    const fullEvent: Casys IntelligenceEvent = {
      ...event,
      timestamp: Date.now(),
    };
    this.channel.postMessage(fullEvent);
    // Also dispatch locally for same-process handlers
    this.dispatch(fullEvent);
  }

  on(type: EventType | "*", handler: (event: Casys IntelligenceEvent) => void): () => void {
    const handlers = this.handlers.get(type) ?? new Set();
    handlers.add(handler);
    this.handlers.set(type, handlers);

    // Return unsubscribe function
    return () => handlers.delete(handler);
  }

  private dispatch(event: Casys IntelligenceEvent): void {
    // Specific handlers
    this.handlers.get(event.type)?.forEach((h) => h(event));
    // Wildcard handlers
    this.handlers.get("*")?.forEach((h) => h(event));
  }

  close(): void {
    this.channel.close();
    this.handlers.clear();
  }
}

// Singleton
export const eventBus = new EventBus();
```

#### 2. SSE Handler Integration

```typescript
// src/server/sse-handler.ts - Updated
import { eventBus } from "../events/event-bus.ts";

export function handleSSE(req: Request): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Subscribe to all events
      const unsubscribe = eventBus.on("*", (event) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      });

      // Cleanup on disconnect
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

#### 3. DAG Executor Integration

```typescript
// src/dag/executor.ts - Updated
import { eventBus } from "../events/event-bus.ts";

class DAGExecutor {
  async executeTask(task: DAGTask): Promise<TaskResult> {
    eventBus.emit({
      type: "dag.task.started",
      source: "dag-executor",
      payload: { taskId: task.id, toolId: task.toolId },
    });

    try {
      const result = await this.runTask(task);

      eventBus.emit({
        type: "dag.task.completed",
        source: "dag-executor",
        payload: { taskId: task.id, result },
      });

      return result;
    } catch (error) {
      eventBus.emit({
        type: "dag.task.failed",
        source: "dag-executor",
        payload: { taskId: task.id, error: String(error) },
      });
      throw error;
    }
  }
}
```

#### 4. Sandbox Worker Integration

```typescript
// src/sandbox/sandbox-worker.ts - Updated
// Note: BroadcastChannel works across workers!

const eventChannel = new BroadcastChannel("cai-events");

function emitEvent(type: string, payload: unknown): void {
  eventChannel.postMessage({
    type,
    timestamp: Date.now(),
    source: "sandbox-worker",
    payload,
  });
}

// In RPC handler
async function handleToolCall(toolId: string, args: unknown): Promise<unknown> {
  emitEvent("sandbox.rpc.called", { toolId, argsPreview: summarize(args) });

  const result = await mcp[toolId](args);

  return result;
}
```

### Event Filtering (Client-side)

```typescript
// Dashboard can subscribe to specific event types
const eventSource = new EventSource("/api/events");

eventSource.onmessage = (e) => {
  const event = JSON.parse(e.data);

  // Filter by type
  if (event.type.startsWith("dag.")) {
    updateDAGVisualization(event);
  } else if (event.type.startsWith("graph.")) {
    updateGraphView(event);
  }
};
```

### Metrics Collection via Events

```typescript
// src/telemetry/metrics-collector.ts
import { eventBus } from "../events/event-bus.ts";

// Subscribe to events for metrics
eventBus.on("dag.task.completed", (event) => {
  const { taskId, result } = event.payload as TaskCompletedPayload;
  metrics.increment("dag_tasks_completed_total", { status: "success" });
  metrics.histogram("dag_task_duration_ms", result.durationMs);
});

eventBus.on("dag.task.failed", (event) => {
  metrics.increment("dag_tasks_completed_total", { status: "failure" });
});

eventBus.on("capability.learned", (event) => {
  metrics.increment("capabilities_learned_total");
});
```

## Consequences

### Positives

- **Découplage total:** Émetteurs et consommateurs ne se connaissent pas
- **Multi-consumer:** Un événement peut être traité par N handlers
- **Cross-worker:** Fonctionne entre le main thread et les Web Workers
- **Standard Web API:** Pas de dépendance externe, natif Deno
- **Testabilité:** Facile de mock le bus d'événements dans les tests
- **Extensibilité:** Ajouter un nouveau consumer = juste `eventBus.on()`

### Negatives

- **Pas de persistence:** Les événements non consommés sont perdus
- **Pas de replay:** Impossible de rejouer des événements passés
- **Same-origin only:** Ne fonctionne pas entre processus séparés (sauf via IPC)
- **Memory:** Handlers gardés en mémoire jusqu'à unsubscribe

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Event storm (too many events) | Medium | Medium | Throttling, sampling |
| Memory leak (forgotten handlers) | Low | Low | WeakRef for handlers, auto-cleanup |
| Message size limits | Low | Low | Summarize large payloads |

## Implementation

### Architecture Cible Complète

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    BroadcastChannel: "cai-events"                      │
│                                                                              │
│  PRODUCERS (émettent des événements)                                         │
│  ════════════════════════════════════                                        │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│  │  SandboxWorker  │  │  WorkerBridge   │  │  DAG Executor   │               │
│  │                 │  │                 │  │                 │               │
│  │ capability_start│  │ tool_start      │  │ dag.started     │               │
│  │ capability_end  │  │ tool_end        │  │ dag.task.*      │               │
│  │                 │  │                 │  │ dag.completed   │               │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘               │
│           │                    │                    │                        │
│  ┌────────┴────────┐  ┌────────┴────────┐  ┌────────┴────────┐               │
│  │  GraphRAGEngine │  │ CapabilityStore │  │  Health/Metrics │               │
│  │                 │  │                 │  │                 │               │
│  │ graph.synced    │  │ capability.     │  │ health.check    │               │
│  │ edge.created    │  │   learned       │  │ metrics.snapshot│               │
│  │ edge.updated    │  │ capability.     │  │                 │               │
│  │                 │  │   matched       │  │                 │               │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘               │
│           │                    │                    │                        │
│           └────────────────────┼────────────────────┘                        │
│                                │                                             │
│                                ▼                                             │
│  CONSUMERS (écoutent les événements)                                         │
│  ═══════════════════════════════════                                         │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│  │  SSE Handler    │  │ Metrics         │  │  Future:        │               │
│  │  → Dashboard    │  │ Collector       │  │  Webhooks, etc. │               │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Plan d'Implémentation Progressif

#### Phase 1: Story 7.3b - Capability Traces Only ✅ PLANNED

**Scope:** BroadcastChannel pour `capability_start` / `capability_end` uniquement

```typescript
// src/sandbox/sandbox-worker.ts
const traceChannel = new BroadcastChannel("cai-traces");

function __trace(event: Partial<TraceEvent>): void {
  traceChannel.postMessage({ ...event, ts: Date.now() });
}
```

**Avantages:**
- Validation du pattern BroadcastChannel cross-worker
- Scope contrôlé, risque minimal
- Base pour Phase 2

**Story:** `docs/sprint-artifacts/7-3b-capability-injection-nested-tracing.md`

#### Phase 2: Story 6.5 - Full EventBus Refactoring ✅ CREATED

**Story:** `docs/sprint-artifacts/6-5-eventbus-broadcast-channel.md`

**Scope:** Migration complète vers EventBus centralisé

**Tasks:**
1. Créer `src/events/types.ts` avec tous les types d'événements
2. Créer `src/events/event-bus.ts` avec le singleton EventBus
3. Migrer `tool_start/end` de WorkerBridge vers EventBus
4. Migrer DAG events vers EventBus
5. Migrer GraphRAG events vers EventBus
6. Refactorer `src/server/sse-handler.ts` pour consommer via EventBus
7. Créer `src/telemetry/metrics-collector.ts` pour collecter via events
8. Tests: event emission, multi-subscriber, cross-worker

**Estimation:** 1.5-2 jours

**Prerequisites:** Story 7.3b complétée (valide le pattern)

### Story Originale (SUPERSEDED by Phased Approach)

~~**Story: Event Bus with BroadcastChannel**~~

> ⚠️ Remplacée par le plan d'implémentation progressif ci-dessus.
> Phase 1 (7.3b) puis Phase 2 (refactoring story).

## References

- [MDN: BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
- [Deno: Web APIs](https://docs.deno.com/runtime/reference/web_platform_apis/)
- `src/server/events-stream.ts` - Current SSE implementation
- `src/dag/event-stream.ts` - Current event emission
- Epic 6: Dashboard & Visualization
