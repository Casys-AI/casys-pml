# Story 17.1: Mock Datasets Pré-configurés

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **playground user**,
I want **pre-configured mock datasets loaded by ID instead of LLM-generated data**,
so that **the data is always consistent, realistic, and the demo is reproducible for the video**.

## Acceptance Criteria

1. **AC1 — Dataset file created**: File `src/web/content/playground-datasets.ts` exists with all mock datasets, typed with TypeScript interfaces matching each MCP UI's expected format.

2. **AC2 — Dataset catalog complete**: Datasets cover all 4 UI types:
   - `table-viewer`: 8 datasets (sales-monthly, sales-products, employees, inventory, customers, orders-recent, support-tickets, marketing-campaigns)
   - `metrics-panel`: 6 datasets (kpi-sales, kpi-ops, kpi-hr, kpi-finance, kpi-marketing, kpi-product)
   - `timeline-viewer`: 5 datasets (deploy-history, incident-log, project-milestones, user-activity, audit-trail)
   - `resource-monitor`: 4 datasets (infra-prod, infra-dev, containers, databases)

3. **AC3 — System prompt updated**: The system prompt in `chat.ts` lists available dataset IDs grouped by UI type. The LLM returns a `datasetId` field instead of generating inline data.

4. **AC4 — Server-side lookup**: `chat.ts` intercepts the LLM response, extracts `datasetId`, looks up the dataset in `playground-datasets.ts`, and injects the actual data into the response sent to the client.

5. **AC5 — Error handling (no silent fallback)**: If `datasetId` is invalid or missing from the catalog, the server returns a clear error message (`"Dataset '[id]' not found. Available: [list]"`) — NO silent fallback to empty data or LLM-generated data.

6. **AC6 — Client unchanged**: `TryPlaygroundIsland.tsx` continues to receive data in the same format as before (via `ui.data`). The dataset lookup is transparent to the frontend.

7. **AC7 — End-to-end test**: Each dataset renders correctly in its target MCP UI (manual verification: send a prompt → widget appears with correct data).

## Tasks / Subtasks

- [ ] **Task 1: Create playground-datasets.ts** (AC: #1, #2)
  - [ ] 1.1 Define TypeScript interfaces for each UI data format (see Dev Notes for exact specs)
  - [ ] 1.2 Create `src/web/content/playground-datasets.ts` with export map `Record<string, DatasetEntry>`
  - [ ] 1.3 Implement 8 table-viewer datasets with `{ columns: string[], rows: unknown[][], totalCount?: number }`
  - [ ] 1.4 Implement 6 metrics-panel datasets with `{ title, metrics: MetricData[], columns?, timestamp? }`
  - [ ] 1.5 Implement 5 timeline-viewer datasets with `{ title?, events: TimelineEvent[] }`
  - [ ] 1.6 Implement 4 resource-monitor datasets with `{ title?, resources: ResourceData[] }`
  - [ ] 1.7 Add a `getDataset(id: string)` lookup function and a `listDatasetIds()` function
  - [ ] 1.8 Add a `DatasetEntry` type with `{ uiType: string, resourceUri: string, data: unknown }`

- [ ] **Task 2: Update system prompt in chat.ts** (AC: #3)
  - [ ] 2.1 Replace the current "Sois créatif avec des données mock" instruction with the dataset catalog listing
  - [ ] 2.2 Update the response format to include `datasetId` instead of `data`
  - [ ] 2.3 Keep the conversational message format (`{ message, ui: { action, resourceUri, datasetId, title } }`)

- [ ] **Task 3: Implement server-side dataset lookup** (AC: #4, #5)
  - [ ] 3.1 In `chat.ts`, after receiving the LLM response, parse `ui.datasetId`
  - [ ] 3.2 Call `getDataset(datasetId)` to look up the data
  - [ ] 3.3 Replace `datasetId` with `data` in the response sent to the client
  - [ ] 3.4 If datasetId not found: return error with clear message listing available datasets (FAIL-FAST, per project rules)
  - [ ] 3.5 If no `ui` or no `datasetId` in response: pass through unchanged (pure chat response)

- [ ] **Task 4: Update client-side system prompt** (AC: #6)
  - [ ] 4.1 Remove the duplicate `SYSTEM_PROMPT` in `TryPlaygroundIsland.tsx` (only used for Puter mode)
  - [ ] 4.2 If keeping Puter mode support, update the client-side prompt to also list datasetIds
  - [ ] 4.3 Ensure the `parseResponse()` function still works with the new format (it should — `ui.data` comes from server now)

- [ ] **Task 5: Manual E2E verification** (AC: #7)
  - [ ] 5.1 Test each table-viewer dataset: "Montre-moi les ventes", "Liste des employés", etc.
  - [ ] 5.2 Test each metrics-panel dataset: "KPIs commerciaux", "Métriques opérationnelles", etc.
  - [ ] 5.3 Test each timeline-viewer dataset: "Historique de déploiement", "Log d'incidents", etc.
  - [ ] 5.4 Test each resource-monitor dataset: "État des serveurs", "Containers Docker", etc.
  - [ ] 5.5 Test error case: trigger a response with an invalid datasetId

## Dev Notes

### Architecture Overview

The playground currently has the LLM generate mock data inline. This story changes the flow to:

```
User → chat.ts → OpenAI (returns datasetId) → chat.ts looks up dataset → client (receives data)
```

The key change is in `chat.ts`: after receiving the LLM response, intercept `ui.datasetId`, replace with actual data from `playground-datasets.ts`, and forward to client.

### MCP UI Data Format Specifications

These are the **exact** TypeScript interfaces extracted from the MCP UI source code. The datasets MUST conform to these formats.

#### table-viewer (`lib/std/src/ui/table-viewer/src/main.tsx`)

```typescript
// The table normalizes multiple formats, but prefer this canonical one:
interface TableData {
  columns: string[];           // Column headers
  rows: unknown[][];           // Row data (positional, matching columns order)
  totalCount?: number;         // Total row count (for pagination info)
}
```

Data is sent via `bridge.sendToolResult({ content: [{ type: "text", text: JSON.stringify(data) }] })`.
The table also accepts: array of objects, object with array property, simple key-value object.

#### metrics-panel (`lib/std/src/ui/metrics-panel/src/main.tsx`)

```typescript
interface MetricData {
  id: string;                  // Unique identifier
  label: string;               // Display label
  value: number;               // Current value
  unit?: string;               // "%" | "MB" | "ms" | "$" | custom
  history?: number[];          // For sparklines (array of past values)
  min?: number;                // Gauge/bar minimum
  max?: number;                // Gauge/bar maximum
  thresholds?: {
    warning?: number;          // Yellow threshold
    critical?: number;         // Red threshold
  };
  type?: "gauge" | "sparkline" | "stat" | "bar";  // Visualization type
  description?: string;        // Tooltip text
}

interface PanelData {
  title?: string;              // Panel title
  metrics: MetricData[];       // Array of metrics
  columns?: number;            // Grid columns (default: auto)
  refreshInterval?: number;    // Seconds (ignored for static data)
  timestamp?: string;          // ISO date string
}
```

Color thresholds: green (<warning), yellow (warning..critical), red (>=critical). Default blue if no thresholds.

#### timeline-viewer (`lib/std/src/ui/timeline-viewer/src/main.tsx`)

```typescript
interface TimelineEvent {
  timestamp: string | number;  // ISO string OR unix timestamp (auto-detects seconds vs ms)
  type: string;                // "info" | "warning" | "error" | "success" (normalized)
  title: string;               // Event title
  description?: string;        // Collapsible detail text
  source?: string;             // e.g. pod name, service name
  metadata?: Record<string, unknown>;  // Collapsible key-value pairs
}

interface TimelineData {
  events: TimelineEvent[];     // Array of events (sorted by timestamp desc)
  title?: string;              // Timeline title
}
```

Type normalization: "warn"→"warning", "err"→"error", "ok"→"success". Timestamp auto-detection: `ts > 1e12` → milliseconds, else seconds.

#### resource-monitor (`lib/std/src/ui/resource-monitor/src/main.tsx`)

```typescript
interface ResourceData {
  name: string;                // Resource display name
  cpu: {
    percent: number;           // 0-100
    cores?: number;            // Badge display
  };
  memory: {
    used: number;              // Bytes
    limit: number;             // Bytes
    percent: number;           // 0-100
  };
  network?: {
    rxBytes: number;           // Cumulative received
    txBytes: number;           // Cumulative transmitted
    rxRate?: number;           // Bytes/sec (preferred)
    txRate?: number;           // Bytes/sec (preferred)
  };
  blockIO?: {
    read: number;              // Bytes
    write: number;             // Bytes
  };
  timestamp?: number;          // Unix timestamp
}

interface MonitorData {
  title?: string;
  resources: ResourceData[];
  refreshInterval?: number;
  timestamp?: string;
}
```

Threshold colors: green (<70%), yellow (70-89%), red (>=90%). Bytes auto-formatted to B/KB/MB/GB/TB.

### Existing Files to Modify

| File | Changes |
|------|---------|
| `src/web/routes/api/playground/chat.ts` | Update SYSTEM_PROMPT (datasetId instead of data), add dataset lookup after LLM response |
| `src/web/islands/TryPlaygroundIsland.tsx` | Remove/update duplicate SYSTEM_PROMPT if Puter mode still references it |

### New Files to Create

| File | Purpose |
|------|---------|
| `src/web/content/playground-datasets.ts` | All mock datasets with types and lookup function |

### Key Patterns to Follow

1. **AppBridge data sending pattern** (from `TryPlaygroundIsland.tsx:542-546`):
   ```typescript
   bridge.sendToolResult({
     content: [{ type: "text", text: JSON.stringify(widget.data) }],
     isError: false,
   });
   ```
   The `widget.data` comes from `ui.data` in the parsed LLM response. Our lookup replaces `datasetId` with `data` server-side, so this pattern remains unchanged.

2. **No silent fallback policy** (per `.claude/rules/no-silent-fallbacks.md`):
   ```typescript
   // BAD - silent fallback
   const dataset = getDataset(id) || {};

   // GOOD - fail fast with clear error
   const dataset = getDataset(id);
   if (!dataset) {
     throw new Error(`Dataset '${id}' not found. Available: ${listDatasetIds().join(', ')}`);
   }
   ```

3. **PLAYGROUND_ENABLED gate** (already in `chat.ts:79`): The playground is gated by `PLAYGROUND_ENABLED` env var. No changes needed.

4. **Content externalization pattern** (from `src/web/content/landing-v2.ts`): Datasets file follows the same pattern of externalizing content from components.

### Dataset Design Guidelines

- **Realistic French business data**: Company names, employee names, product names in French context
- **Consistent numbers**: Realistic ranges (CA in k€, margins in %, etc.)
- **Cross-dataset coherence**: Same company/product names across related datasets
- **Enough rows for visual impact**: 10-30 rows per table, 4-8 metrics per panel, 10-20 events per timeline, 3-8 resources per monitor

### Project Structure Notes

- Alignment with unified project structure: datasets file goes in `src/web/content/` following the established pattern (`landing-v2.ts` already there)
- No conflicts detected with current codebase
- The `lib/std/src/ui/` components are pre-built and served via `/api/ui/resource` — no changes needed there

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-17-playground-conversationnel.md#US-01]
- [Source: _bmad-output/implementation-artifacts/tech-specs/playground-conversationnel/tech-spec.md#Mock-Datasets-Strategy]
- [Source: _bmad-output/implementation-artifacts/tech-specs/playground-conversationnel/architecture-serveur.md]
- [Source: src/web/routes/api/playground/chat.ts] — Current chat API implementation
- [Source: src/web/islands/TryPlaygroundIsland.tsx] — Current playground island
- [Source: lib/std/src/ui/table-viewer/src/main.tsx] — Table viewer data format
- [Source: lib/std/src/ui/metrics-panel/src/main.tsx] — Metrics panel data format
- [Source: lib/std/src/ui/timeline-viewer/src/main.tsx] — Timeline viewer data format
- [Source: lib/std/src/ui/resource-monitor/src/main.tsx] — Resource monitor data format
- [Source: .claude/rules/no-silent-fallbacks.md] — No silent fallback policy

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Type-check: `deno check src/web/content/playground-datasets.ts` -- passed

### Completion Notes List

- Created `playground-datasets.ts` with all 23 datasets (8 table-viewer, 6 metrics-panel, 5 timeline-viewer, 4 resource-monitor)
- All datasets use realistic French business data with cross-dataset coherence (same company names, employee names across datasets)
- Updated `chat.ts` system prompt to list dataset IDs by category, LLM now returns `datasetId` instead of `data`
- Added server-side dataset lookup in `chat.ts`: `processLlmResponse()` intercepts LLM output, replaces `datasetId` with actual data
- FAIL-FAST on invalid datasetId: returns error message listing available datasets (per no-silent-fallback policy)
- Pass-through for non-JSON or no-UI responses (pure chat)
- Updated `TryPlaygroundIsland.tsx` client-side SYSTEM_PROMPT for Puter mode to also use datasetIds
- Client-side `parseResponse()` function unchanged -- `ui.data` is injected server-side transparently
- Added `listDatasetsByType()` helper used by system prompt builder

### File List

- `src/web/content/playground-datasets.ts` (NEW) -- All 23 mock datasets with TypeScript interfaces and lookup functions
- `src/web/routes/api/playground/chat.ts` (MODIFIED) -- Updated system prompt + server-side dataset lookup
- `src/web/islands/TryPlaygroundIsland.tsx` (MODIFIED) -- Updated client-side SYSTEM_PROMPT for Puter mode
