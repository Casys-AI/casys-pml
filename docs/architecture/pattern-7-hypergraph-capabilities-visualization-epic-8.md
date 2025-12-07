# Pattern 7: Hypergraph Capabilities Visualization (Epic 8)

**Status:** 📋 PROPOSED

**Problem:** Capabilities are N-ary relationships (connecting multiple tools), not binary edges. Standard graph visualization fails to represent this accurately.

**Solution: Cytoscape.js Compound Graphs (ADR-029)**

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard Header                                               │
│  [Tools] [Capabilities] [Hypergraph]  ← View mode toggle       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────┐                              │
│   │  Cap: Create Issue from File │ ← Compound node (violet)    │
│   │  success: 95% | usage: 12   │                              │
│   │  ┌───────┐  ┌────────────┐ │                              │
│   │  │fs:read│  │gh:issue    │ │ ← Child nodes (tools)        │
│   │  └───────┘  └────────────┘ │                              │
│   └─────────────────────────────┘                              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Code Panel (on capability click)                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  const content = await mcp.filesystem.read("config.json");│  │
│  │  const data = JSON.parse(content);                        │  │
│  │  await mcp.github.createIssue({ title: data.title });     │  │
│  │                                                           │  │
│  │  [Copy Code] [Try This]                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Components (Epic 8):**

| Component | File | Purpose |
|-----------|------|---------|
| HypergraphBuilder | `src/visualization/hypergraph-builder.ts` | Compound graph construction |
| Capability Data API | `GET /api/capabilities` | Fetch capabilities with filters |
| Hypergraph API | `GET /api/graph/hypergraph` | Cytoscape-ready graph data |
| Code Panel | `public/components/code-panel.tsx` | Syntax highlighting, copy action |

**Cytoscape Node Structure:**

```javascript
// Capability (parent node)
{
  data: {
    id: 'cap-uuid-1',
    type: 'capability',
    label: 'Create Issue from File',
    code_snippet: 'await mcp.github...',
    success_rate: 0.95,
    usage_count: 12
  }
}

// Tool (child node)
{
  data: {
    id: 'filesystem:read',
    parent: 'cap-uuid-1',  // Links to capability
    type: 'tool',
    server: 'filesystem'
  }
}
```

**Affects Epics:** Epic 8 (Stories 8.1-8.5)

**References:**

- ADR-029: Hypergraph Capabilities Visualization
- Epic 6: Real-time Graph Monitoring (base dashboard)

**Design Philosophy:** Visualize the learned capabilities as first-class entities, enabling developers to explore, understand, and reuse the system's accumulated knowledge.

---
