# Story 3.2: WorkerBridge Helper avec Mini-Tools Library

**Status:** ready-for-dev

## Story

As a **notebook author**,
I want **a helper that exposes the real WorkerBridge with a rich library of MCP tools**,
So that **notebooks can execute code in the real sandbox with 94 useful tools for demos**.

## Acceptance Criteria

1. `playground/lib/capabilities.ts` exporte `getWorkerBridge(mcpClients?)`
2. Utilise `MiniToolsClient` de `lib/mcp-tools.ts` (94 outils en 15 catégories)
3. Le WorkerBridge utilise le vrai sandbox Deno Worker
4. Les traces sont de vraies TraceEvent du système
5. Fonction `getDefaultMCPClients()` retourne le MiniToolsClient prêt à l'emploi
6. Ajout au `resetPlaygroundState()` pour cleanup du bridge + reset des states
7. Helper `requireApiKey()` qui vérifie la présence d'une clé API et guide vers setup-api-key.ts si absente

## Tasks / Subtasks

- [x] Task 1: MCP Mini-Tools Library (AC: 2, 5) ✅ DONE
  - [x] 1.1: Created `lib/mcp-tools.ts` with 94 tools in 15 categories (standalone, no imports)
  - [x] 1.2: Categories: text, json, math, datetime, crypto, collections, fs, data, http, validation, format, transform, state, compare, algo
  - [x] 1.3: `MiniToolsClient` implements MCPClientBase interface (types defined locally)
  - [x] 1.4: Export `getDefaultMCPClients()` returning Map with MiniToolsClient
  - [x] 1.5: Virtual filesystem and state store with reset functions
  - [x] 1.6: Compare tools (diff, levenshtein, similarity, fuzzy_match, schema_infer)
  - [x] 1.7: Algo tools (binary_search, set ops, aggregation, sequences, numeric)
- [ ] Task 2: Add WorkerBridge helper (AC: 1, 3, 4)
  - [ ] 2.1: Import real WorkerBridge from src/sandbox/worker-bridge.ts
  - [ ] 2.2: Create `getWorkerBridge(mcpClients?)` with lazy singleton
  - [ ] 2.3: Default to MiniToolsClient if no clients provided
  - [ ] 2.4: Configure with capabilityStore from getCapabilityStore()
- [ ] Task 3: Update reset function (AC: 6)
  - [ ] 3.1: Add bridge cleanup to resetPlaygroundState()
  - [ ] 3.2: Call bridge.terminate() and bridge.cleanup() on reset
  - [ ] 3.3: Call resetVirtualFs() and resetStateStore() from mcp-tools
- [ ] Task 4: Add API key requirement helper (AC: 7)
  - [ ] 4.1: Create `requireApiKey()` that checks ANTHROPIC_API_KEY or OPENAI_API_KEY
  - [ ] 4.2: If missing, show clear message with instructions to run setup-api-key.ts
  - [ ] 4.3: Return the detected provider and key if found
- [ ] Task 5: Test the helper
  - [ ] 5.1: Verify WorkerBridge executes code in real Worker
  - [ ] 5.2: Verify traces are captured correctly
  - [ ] 5.3: Verify MiniToolsClient responds to tool calls (all 60+ tools)
  - [ ] 5.4: Verify reset clears bridge state, virtual fs, and state store

## Dev Notes

### Real WorkerBridge API

From `src/sandbox/worker-bridge.ts`:

```typescript
class WorkerBridge {
  constructor(mcpClients: Map<string, MCPClientBase>, config?: WorkerBridgeConfig)

  async execute(
    code: string,
    toolDefinitions: ToolDefinition[],
    context?: Record<string, unknown>,
    capabilityContext?: string,
    parentTraceId?: string
  ): Promise<WorkerExecutionResult>

  getTraces(): TraceEvent[]
  getToolsCalled(): string[]
  getToolInvocations(): ToolInvocation[]
  hasAnyToolFailed(): boolean
  terminate(): void
  cleanup(): void
}
```

### MCP Mini-Tools Library

Instead of boring mocks, we created a full library of **94 useful tools** in `lib/mcp-tools.ts` (standalone, no external imports):

```typescript
// 15 Categories, 94 tools:
// text (8):       split, join, template, case, regex, trim, count, pad
// json (5):       parse, stringify, query, merge, keys
// math (5):       eval, stats, round, random, percentage
// datetime (5):   now, format, diff, add, parse
// crypto (5):     hash, uuid, base64, hex, random_bytes
// collections (7): map, filter, sort, unique, group, flatten, chunk
// fs (5):         read, write, list, delete, exists (virtual filesystem)
// data (5):       fake_name, fake_email, lorem, fake_address, fake_user
// http (4):       build_url, parse_url, headers, mock_response
// validation (4): email, url, json_schema, pattern
// format (5):     number, bytes, duration, pluralize, slugify
// transform (6):  csv_parse, csv_stringify, xml_simple, markdown_strip, object_pick, object_omit
// state (6):      set, get, delete, list, counter, push (key-value store with TTL)
// compare (5):    diff, levenshtein, similarity, fuzzy_match, schema_infer
// algo (19):      binary_search, find_index, find_all, union, intersect, difference,
//                 is_subset, group_aggregate, running_total, moving_average, top_n,
//                 zip, partition, interleave, transpose, clamp, normalize, interpolate, round_to

import { MiniToolsClient, getDefaultMCPClients } from "./lib/mcp-tools.ts";

// Usage with WorkerBridge:
const clients = getDefaultMCPClients(); // Returns Map with MiniToolsClient
const bridge = new WorkerBridge(clients);

// Or create filtered client:
const mathOnly = new MiniToolsClient(["math", "collections", "algo"]);
```

### API Key Requirement Helper

```typescript
interface ApiKeyResult {
  provider: "anthropic" | "openai" | "google";
  apiKey: string;
}

export function requireApiKey(): ApiKeyResult {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const googleKey = Deno.env.get("GOOGLE_API_KEY");

  if (anthropicKey) return { provider: "anthropic", apiKey: anthropicKey };
  if (openaiKey) return { provider: "openai", apiKey: openaiKey };
  if (googleKey) return { provider: "google", apiKey: googleKey };

  console.error(`
╔═══════════════════════════════════════════════════════════════╗
║  API KEY REQUIRED                                              ║
╠═══════════════════════════════════════════════════════════════╣
║  This notebook requires an LLM API key for the "Wow Moment"   ║
║  demo to show real timing differences.                         ║
║                                                                 ║
║  To set up your API key, run:                                  ║
║    deno run --allow-all playground/scripts/setup-api-key.ts   ║
║                                                                 ║
║  Or manually create playground/.env with:                      ║
║    ANTHROPIC_API_KEY=sk-ant-...                                ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  throw new Error("API key required. Run setup-api-key.ts to configure.");
}
```

### Integration with Story 3.1

This story adds to `playground/lib/capabilities.ts` created in Story 3.1:

```typescript
// Story 3.1 exports:
export { getCapabilityStore, getCapabilityMatcher, getAdaptiveThresholdManager };
export { resetPlaygroundState, getPlaygroundStatus };

// Story 3.2 adds:
export { getWorkerBridge, getDefaultMCPClients };
export { requireApiKey };
```

### Why Mini-Tools Library Instead of Real MCP Servers?

Real MCP servers require:
- npx processes running
- Network connections
- Configuration files

The Mini-Tools Library is **better than both mocks and real servers** because:
1. **94 useful tools** that can actually DO things (not just fake responses)
2. Traces show real tool_start/tool_end events with actual work
3. The sandbox security is real (Worker isolation)
4. Tools are pedagogically interesting (text, math, crypto, data generation, algorithms)
5. Virtual filesystem and state store for realistic multi-step workflows
6. Compare/reasoning tools for agent decision-making (diff, similarity, fuzzy match)
7. Algo tools for data processing pipelines (aggregation, set ops, sequences)
8. No external dependencies or server processes needed
9. Standalone file - ready for mcp-servers.json configuration
10. Perfect for demonstrating capability learning on real tool compositions

### Files Modified/Created

- `lib/mcp-tools.ts` - ✅ CREATED: 94 mini-tools library (standalone)
- `playground/lib/capabilities.ts` - TO DO: Add WorkerBridge helper using MiniToolsClient

### References

- [Source: src/sandbox/worker-bridge.ts] - WorkerBridge class
- [Source: src/mcp/types.ts] - MCPClientBase interface
- [Source: ADR-032] - Worker RPC Bridge architecture
- [Source: playground/scripts/setup-api-key.ts] - API key setup script

## Dev Agent Record

### Context Reference

Story created during SM review of Epic 3
Fills gap between Story 3.1 (helpers) and Story 3.3 (Notebook 04)

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Created to address dependency gap identified in SM review
- Includes API key requirement for Wow Moment demo
- **Mini-Tools Library created** with 94 real utility tools instead of boring mocks
- Tool categories: text, json, math, datetime, crypto, collections, fs, data, http, validation, format, transform, state, compare, algo
- Virtual filesystem and state store enable realistic multi-step workflow demos
- Compare tools for agent reasoning (diff, similarity, fuzzy matching, schema inference)
- Algo tools for data pipelines (search, set ops, aggregation, sequences, numeric)
- Library is standalone (no external imports) - ready for mcp-servers.json

### File List

Files created:
- `lib/mcp-tools.ts` (NEW: 94 mini-tools library, standalone)

Files to modify:
- `playground/lib/capabilities.ts` (ADD WorkerBridge helper using MiniToolsClient, requireApiKey)
