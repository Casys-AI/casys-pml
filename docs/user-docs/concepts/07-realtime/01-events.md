# Events

> Real-time updates via SSE

## En bref

Les events dans PML, c'est comme les **notifications push sur votre téléphone** : vous n'avez pas besoin de rafraîchir constamment pour voir ce qui se passe, les mises à jour arrivent automatiquement en temps réel.

**Pourquoi c'est important ?**

- **Monitoring en direct** : Voyez exactement ce que PML fait à chaque instant
- **Debugging facilité** : Identifiez immédiatement où une erreur se produit
- **Compréhension du système** : Observez comment PML apprend et évolue en temps réel
- **Expérience utilisateur** : Barres de progression fluides, logs qui s'affichent au fil de l'eau

**L'analogie simple :** Imaginez PML comme une cuisine de restaurant. Les events, c'est comme les sonnettes qui tintent quand un plat est prêt, ou les écrans qui montrent les commandes en cours. Vous n'avez pas besoin d'aller vérifier constamment en cuisine, les informations viennent à vous.

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

**Analogie : Le réseau social interne**

Pensez à l'EventBus comme un **réseau social interne de l'entreprise** où chaque composant de PML peut poster des mises à jour :

- Les **Publishers** (Gateway, DAG Engine, Sandbox) sont comme des employés qui publient des posts : "Je viens de lire un fichier", "J'ai fini la tâche 3/5", "J'ai appris un nouveau pattern"
- Les **Subscribers** (SSE Handler, Learning System, Metrics) sont comme des followers qui voient ces posts et réagissent : l'un envoie l'info aux clients, l'autre met à jour le graphe de connaissances, un troisième note les statistiques
- Personne n'a besoin de demander des nouvelles à tout le monde, l'information circule automatiquement vers ceux qui sont intéressés

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

## Intérêt pratique des différents types d'events

Chaque type d'event a une utilité concrète selon votre rôle :

### Pour les développeurs

- **Tool Events** : Debuggez les appels d'outils qui échouent, mesurez les performances, détectez les appels redondants
- **System Events** : Surveillez la santé du système, détectez les connexions/déconnexions de serveurs, recevez des alertes sur les erreurs

### Pour les data scientists

- **Learning Events** : Observez comment le graphe de connaissances évolue, identifiez les patterns émergents, validez que l'apprentissage fonctionne
- **DAG Events** : Analysez les workflows pour optimiser les pipelines de données

### Pour les product managers

- **DAG Progress** : Suivez l'avancement des tâches en temps réel, estimez les délais de traitement
- **Tool Completed** : Comprenez quels outils sont les plus utilisés, identifiez les goulots d'étranglement

**Cas d'usage concret :** Vous développez une intégration GitHub. En observant les `tool_called` events, vous voyez que `create_issue` est appelé 5 fois pour la même tâche. C'est un bug ! Sans les events, vous ne l'auriez peut-être jamais remarqué.

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
