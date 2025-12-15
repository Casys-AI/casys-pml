# Story 3.2: WorkerBridge Helper pour Notebooks

**Status:** ready-for-dev

## Story

As a **notebook author**,
I want **a helper that exposes the real WorkerBridge with MCP client mocks**,
So that **notebooks can execute code in the real sandbox with tool tracing**.

## Acceptance Criteria

1. `playground/lib/capabilities.ts` exporte `getWorkerBridge(mcpClients?)`
2. Crée des mock MCP clients minimaux pour filesystem et memory (pas besoin de vrais serveurs)
3. Le WorkerBridge utilise le vrai sandbox Deno Worker
4. Les traces sont de vraies TraceEvent du système
5. Fonction `getDefaultMCPClients()` pour les démos sans configuration
6. Ajout au `resetPlaygroundState()` pour cleanup du bridge
7. Helper `requireApiKey()` qui vérifie la présence d'une clé API et guide vers setup-api-key.ts si absente

## Tasks / Subtasks

- [ ] Task 1: Create minimal MCP client mocks (AC: 2, 5)
  - [ ] 1.1: Create `MockFilesystemClient` with read_file, write_file, list_directory
  - [ ] 1.2: Create `MockMemoryClient` with store_entity, retrieve_entity
  - [ ] 1.3: Both implement MCPClientBase interface
  - [ ] 1.4: Export `getDefaultMCPClients()` returning Map of mocks
- [ ] Task 2: Add WorkerBridge helper (AC: 1, 3, 4)
  - [ ] 2.1: Import real WorkerBridge from src/sandbox/worker-bridge.ts
  - [ ] 2.2: Create `getWorkerBridge(mcpClients?)` with lazy singleton
  - [ ] 2.3: Default to mock MCP clients if none provided
  - [ ] 2.4: Configure with capabilityStore from getCapabilityStore()
- [ ] Task 3: Update reset function (AC: 6)
  - [ ] 3.1: Add bridge cleanup to resetPlaygroundState()
  - [ ] 3.2: Call bridge.terminate() and bridge.cleanup() on reset
- [ ] Task 4: Add API key requirement helper (AC: 7)
  - [ ] 4.1: Create `requireApiKey()` that checks ANTHROPIC_API_KEY or OPENAI_API_KEY
  - [ ] 4.2: If missing, show clear message with instructions to run setup-api-key.ts
  - [ ] 4.3: Return the detected provider and key if found
- [ ] Task 5: Test the helper
  - [ ] 5.1: Verify WorkerBridge executes code in real Worker
  - [ ] 5.2: Verify traces are captured correctly
  - [ ] 5.3: Verify mock MCP clients respond to tool calls
  - [ ] 5.4: Verify reset clears bridge state

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

### Mock MCP Client Interface

```typescript
// From src/mcp/types.ts
interface MCPClientBase {
  listTools(): Promise<Tool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

// Minimal mock implementation
class MockFilesystemClient implements MCPClientBase {
  private files = new Map<string, string>();

  async listTools(): Promise<Tool[]> {
    return [
      { name: "read_file", description: "Read file contents", inputSchema: {...} },
      { name: "write_file", description: "Write file contents", inputSchema: {...} },
      { name: "list_directory", description: "List directory contents", inputSchema: {...} }
    ];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "read_file":
        return { content: this.files.get(args.path as string) ?? "mock content" };
      case "write_file":
        this.files.set(args.path as string, args.content as string);
        return { success: true };
      case "list_directory":
        return { entries: ["file1.txt", "file2.txt"] };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  async close(): Promise<void> {}
}
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

### Why Mock MCP Clients?

Real MCP servers require:
- npx processes running
- Network connections
- Configuration files

For notebook demos, mocks are sufficient because:
1. We're demonstrating the **WorkerBridge** behavior, not MCP server behavior
2. Traces show real tool_start/tool_end events
3. The sandbox security is real (Worker isolation)
4. Timing measurements are accurate

### Files to Modify

- `playground/lib/capabilities.ts` - Add WorkerBridge helper and mocks

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
- Mock MCP clients avoid complex server setup

### File List

Files to modify:
- `playground/lib/capabilities.ts` (ADD WorkerBridge, mocks, requireApiKey)
