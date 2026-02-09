# Story 17.6: Agent Orchestrator for Main Tunnel

Status: done

## Story

As a playground user,
I want the main chat tunnel to be powered by an LLM agent that orchestrates PML tool discovery, argument composition, and execution,
so that my natural language messages produce real, actionable results instead of raw JSON suggestions.

## Acceptance Criteria

1. **AC1**: When the user types a message in the main tunnel, an LLM agent orchestrates the response (not just SHGAT suggestions)
2. **AC2**: The agent uses `pml_execute` (with `code` param) to discover and execute MCP tools
3. **AC3**: The agent composes tool arguments correctly based on the user's intent and available `inputSchema`
4. **AC4**: The result is returned to the chat in human-readable text (not raw JSON)
5. **AC5**: If a tool returns `_meta.ui`, the widget creation data is preserved in the response for the island to consume
6. **AC6**: The agent uses MCP Sampling (via `agent_delegate` or `createAgenticSamplingClient`) — NO direct LLM calls from Fresh server
7. **AC7**: The system works with either `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` configured in PML serve environment
8. **AC8**: Fallback: if agent fails or LLM is not configured, return a clear error message (no silent fallback per project policy)
9. **AC9**: Maximum 5 agentic loop iterations to prevent runaway costs

## Tasks / Subtasks

- [ ] Task 1: Verify agent_delegate works via PML serve (AC: 6, 7)
  - [ ] 1.1: Test `agent_delegate` call through PML serve (`tools/call` with `std:agent_delegate`)
  - [ ] 1.2: Verify sampling works (LLM API key configured, agentic loop executes)
  - [ ] 1.3: If `executePmlTool` in agent.ts fails (wrong port/path), fix PML serve routing
- [ ] Task 2: Update chat.ts tunnel principal routing (AC: 1, 2, 6)
  - [ ] 2.1: Replace current `execute({intent})` + auto-accept with `agent_delegate` call
  - [ ] 2.2: Pass user message as `goal`, conversation context if available
  - [ ] 2.3: Handle `agent_delegate` response format (extract text result)
  - [ ] 2.4: Remove the now-unused auto-accept suggestion code
- [ ] Task 3: Response formatting for chat UI (AC: 4, 5)
  - [ ] 3.1: Parse agent text response into chat-friendly format
  - [ ] 3.2: Detect and preserve `_meta.ui` data for widget creation
  - [ ] 3.3: Handle structured results (tables, JSON) with appropriate formatting
- [ ] Task 4: Error handling and fallbacks (AC: 8, 9)
  - [ ] 4.1: Handle LLM not configured error (clear message to user)
  - [ ] 4.2: Handle agent timeout / max iterations reached
  - [ ] 4.3: Handle PML serve unreachable
  - [ ] 4.4: Ensure no silent fallbacks (per project no-silent-fallbacks policy)
- [ ] Task 5: Integration testing (AC: 1-9)
  - [ ] 5.1: Test end-to-end: user message → agent → PML tools → formatted response
  - [ ] 5.2: Test error cases: no LLM key, PML serve down, timeout
  - [ ] 5.3: Test in browser: chat message produces real results

## Dev Notes

### Architecture

The playground uses a proxy architecture:
```
Browser (TryPlaygroundIsland) → POST /api/playground/chat (Fresh 8081)
  → PML serve (3004) via MCP JSON-RPC tools/call
  → PML serve routes to mcp-std which has agent_delegate
  → agent_delegate uses MCP Sampling for LLM calls
  → LLM calls pml_execute to discover + execute tools
  → Result flows back to browser
```

**Critical**: LLM calls MUST go through PML serve (MCP Sampling), NOT directly from Fresh.
See epic-17 decision: "Le LLM est appelé par PML via MCP Sampling, pas directement par le serveur Fresh."

### Key Source Files

| File | Purpose |
|------|---------|
| `src/web/routes/api/playground/chat.ts` | Proxy route - **MODIFY**: route tunnel to `agent_delegate` |
| `lib/std/src/tools/agent.ts` | Agent tools with agentic loop - **READ**: understand `agent_delegate`, `executePmlTool` |
| `lib/std/server.ts` | mcp-std server setup - **READ**: sampling bridge initialization |
| `src/web/islands/TryPlaygroundIsland.tsx` | Chat UI - **MODIFY** if response format changes |
| `src/mcp/handlers/execute-handler-facade.ts` | Execute handler - **READ**: `accept_suggestion` already implemented |
| `packages/pml/src/cli/serve-command.ts` | PML serve command - **READ**: how tools are exposed |

### Existing Infrastructure

1. **`agent_delegate`** (lib/std/src/tools/agent.ts:498): Full agentic loop MCP tool
   - Uses `getSamplingClient()` for LLM calls
   - Exposes `pml_execute` as the ONLY tool to the LLM
   - System prompt teaches LLM to use `intent` + `code` params
   - `maxIterations` param controls loop limit (default 5)

2. **`createAgenticSamplingClient()`** (lib/std/src/tools/agent.ts:377): Standalone agentic loop
   - Supports Anthropic (`ANTHROPIC_API_KEY`) and OpenAI (`OPENAI_API_KEY`)
   - Implements tool execution internally (no MCP client needed)
   - Used when MCP sampling bridge is not available

3. **`executePmlTool()`** (lib/std/src/tools/agent.ts:114): PML execution proxy
   - Calls `PML_API_URL/api/mcp` (default: `http://localhost:3003`)
   - Tool name: `pml:execute`
   - **POTENTIAL ISSUE**: PML serve uses `/mcp` endpoint and `execute` tool name (not `/api/mcp` and `pml:execute`)
   - May need adjustment for PML serve context

4. **`accept_suggestion`** (execute-handler-facade.ts:322): Already implemented
   - Converts `callName` → code → delegates to `handleDirect()`
   - Works with args: tested with `std:psql_query` + args successfully

### Known Issues to Handle

1. **Port/endpoint mismatch**: `executePmlTool` calls port 3003 (`/api/mcp`), but playground uses PML serve on port 3004 (`/mcp`). Tool names differ too: `pml:execute` vs `execute`.

2. **Sampling availability**: When `mcp-std` runs inside PML serve, the sampling bridge may or may not work depending on PML serve's sampling support. Fallback: `createAgenticSamplingClient()`.

3. **Code injection risk** (CR-1 from 17.3 review): User messages must be properly escaped when embedded in code strings. Use `JSON.stringify()` for safe embedding.

### Testing Standards

- Unit tests in `tests/unit/` matching the source tree structure
- Deno test framework (`deno test`)
- No mocking of PML serve for integration tests — use live PML serve
- Test both success and error paths

### Previous Story Intelligence (17.3)

- `chat.ts` already proxies to PML serve via `callPml()` helper function
- `accept_suggestion` was implemented but doesn't solve the core problem (SHGAT can't fill args)
- The auto-accept code works technically but suggestions return bad callNames or tools without args
- `TryPlaygroundIsland.tsx` has `pendingApproval` state for HIL workflows
- Code review found 23 issues, 2 CRITICAL (code injection, stale closure)

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-17-playground-conversationnel.md#US-06]
- [Source: lib/std/src/tools/agent.ts] — Agent tools implementation
- [Source: src/web/routes/api/playground/chat.ts] — Current tunnel implementation
- [Source: src/mcp/handlers/execute-handler-facade.ts] — accept_suggestion implementation

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

### File List
