---
title: 'PML Desktop - Increment 7: PGlite Persistence'
slug: 'pml-desktop-07-pglite'
created: '2026-01-26'
status: 'ready-for-dev'
parent_spec: '../tech-spec-pml-desktop.md'
increment: 7
estimated_tasks: 4
depends_on: ['06-mcp-live-sync.md']
---

# Increment 7: PGlite Persistence

**Goal:** Metadata persisted in PGlite, survives app restart.

## Prerequisites

- Increment 6 completed (live sync working)
- Understanding of existing `src/db/client.ts` and `lib/std/src/tools/pglite.ts`

## Context

PGlite runs in WebView (JavaScript), stores metadata about capabilities, tools, traces. casys_engine (Rust) stores graph structure. Both persist to app data directory.

## Tasks

- [ ] **Task 7.1: Setup PGlite in WebView**
  - File: `apps/desktop/src/db/pglite.ts`
  - Action: Initialize PGlite with pgvector
  - Code:
    ```ts
    import { PGlite } from '@electric-sql/pglite';
    import { vector } from '@electric-sql/pglite/vector';
    import { appDataDir } from '@tauri-apps/api/path';

    let db: PGlite | null = null;

    export async function getDb(): Promise<PGlite> {
      if (db) return db;

      const dataDir = await appDataDir();
      const dbPath = `${dataDir}/pglite`;

      db = new PGlite(dbPath, {
        extensions: { vector },
      });

      await db.exec('CREATE EXTENSION IF NOT EXISTS vector;');
      await runMigrations(db);

      return db;
    }
    ```

- [ ] **Task 7.2: Port essential migrations**
  - File: `apps/desktop/src/db/migrations.ts`
  - Action: Subset of migrations for desktop
  - Tables needed:
    ```sql
    -- Capabilities (for node metadata)
    CREATE TABLE IF NOT EXISTS capabilities (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      server TEXT NOT NULL,
      level INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Execution traces (for history)
    CREATE TABLE IF NOT EXISTS execution_traces (
      id UUID PRIMARY KEY,
      capability_id UUID REFERENCES capabilities(id),
      tool_name TEXT NOT NULL,
      args JSONB,
      result JSONB,
      duration_ms INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Embeddings (for search, optional)
    CREATE TABLE IF NOT EXISTS embeddings (
      id UUID PRIMARY KEY,
      capability_id UUID REFERENCES capabilities(id),
      vector vector(1536)
    );
    ```

- [ ] **Task 7.3: Connect tool calls to PGlite**
  - File: `apps/desktop/src/hooks/useMcpSync.ts`
  - Action: Store tool calls in PGlite
  - Update:
    ```ts
    onToolCall(async (event) => {
      const db = await getDb();

      // Store in PGlite
      await db.query(`
        INSERT INTO execution_traces (id, tool_name, args, result, duration_ms)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        crypto.randomUUID(),
        event.tool,
        JSON.stringify(event.args),
        JSON.stringify(event.result),
        event.duration,
      ]);

      // Also create node in casys_engine (existing code)
      await invoke('graph_add_node', { ... });
    });
    ```

- [ ] **Task 7.4: Load persisted data on startup**
  - File: `apps/desktop/src/App.tsx`
  - Action: Load graph from casys_engine + metadata from PGlite on app start
  - Code:
    ```ts
    useEffect(() => {
      async function loadPersistedData() {
        // Load graph structure from casys_engine
        const nodes = await invoke('graph_get_all_nodes');
        const edges = await invoke('graph_get_all_edges');

        // Load metadata from PGlite
        const db = await getDb();
        const capabilities = await db.query('SELECT * FROM capabilities');

        // Merge metadata into nodes
        const enrichedNodes = nodes.map(n => ({
          ...n,
          metadata: capabilities.rows.find(c => c.id === n.id),
        }));

        // Render
        setGraphData({ nodes: enrichedNodes, edges });
      }

      loadPersistedData();
    }, []);
    ```

## Acceptance Criteria

- [ ] **AC1:** Given tool calls executed, when app is closed and reopened, then nodes still appear
- [ ] **AC2:** Given PGlite database, when queried for traces, then execution history is returned
- [ ] **AC3:** Given corrupted/missing PGlite, when app starts, then it creates fresh DB (no crash)
- [ ] **AC4:** Given 1000 traces stored, when app loads, then startup is <2s

## Data Flow

```
Tool Call Event
    │
    ├─→ casys_engine (Rust) - graph structure, positions
    │       └─→ persists to: {app_data}/casys/
    │
    └─→ PGlite (WebView) - metadata, traces, embeddings
            └─→ persists to: {app_data}/pglite/
```

## App Data Directory

```
~/.local/share/pml-desktop/  (Linux)
~/Library/Application Support/pml-desktop/  (macOS)
%APPDATA%/pml-desktop/  (Windows)
├── casys/
│   └── (casys_engine segments)
└── pglite/
    └── (PGlite files)
```

## Deliverable

MVP Complete! App persists all data, survives restart.

## Post-MVP

See parent spec `tech-spec-pml-desktop.md` for future considerations:
- Cloud sync with PostgreSQL
- Multi-window
- Graph export
