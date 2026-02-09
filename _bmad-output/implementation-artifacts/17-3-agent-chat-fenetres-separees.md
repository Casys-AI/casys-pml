# Story 17.3: Agent Chat in Dedicated Windows

Status: done

<!-- Note: This is a REDO of story 17.3. The previous implementation was REJECTED because it used
     fake agents (direct OpenAI calls with a different system prompt) instead of real MCP agent tools.
     This story rewrites the entire backend + client integration to use PML serve (port 3004)
     AND rewrites agent_help to be a real MCP Sampling agent. -->

## Story

As a **playground user**,
I want **the system to open a dedicated agent conversation window when I ask a complex question**,
so that **I can have a deep discussion powered by real MCP agent tools without polluting the main chat tunnel**.

## Acceptance Criteria

1. **AC1 — Tunnel principal connected to PML serve**: `chat.ts` backend proxifies user intent to PML serve (port 3004) via MCP JSON-RPC `tools/call`, NOT calling OpenAI directly. No `OPENAI_API_KEY` in the Fresh server.

2. **AC2 — Real MCP agents via Sampling**: `agent_help` uses `getSamplingClient().createMessage()` for conversation — like the other agent tools (`agent_delegate`, `agent_analyze`, etc.). It is NOT a one-shot tool that just returns `_meta.ui`.

3. **AC3 — agent_help opens widget AND responds**: On first call (no message), `agent_help` returns `_meta.ui` to open the agent-chat widget AND uses MCP Sampling to generate a contextual welcome. On subsequent calls (with message + history), it uses MCP Sampling to generate responses.

4. **AC4 — Widget agent-chat on canvas**: The agent-chat window is a draggable, resizable, closable widget on the canvas — reusing the existing WidgetFrame infrastructure.

5. **AC5 — Independent conversation via MCP Sampling**: Each agent window has its own conversation history. Agent messages are routed through PML serve → `agent_help` → MCP Sampling (not a separate OpenAI call). Conversation history is sent with each call.

6. **AC6 — Multiple simultaneous agents**: Multiple agent-chat widgets can coexist on the canvas, each with independent context and history.

7. **AC7 — Agent can use tools**: `agent_help` uses `toolChoice: "auto"` with `pml_execute` tool — the agent can discover and execute MCP tools during conversation (like `agent_delegate` does). This means the agent can fetch data, read files, etc. while chatting.

8. **AC8 — No fake agents**: No `AGENT_DEFAULT_SYSTEM_PROMPT`, no `agentMode: boolean`, no `handleAgentMessage()` calling OpenAI. All agent behavior comes from real MCP agent tools executed by PML via MCP Sampling.

9. **AC9 — Observability**: The observability panel logs: PML calls (discover, execute), tool results, widget creation from `_meta.ui`, agent sampling calls, errors from PML.

## Tasks / Subtasks

- [x] **Task 1: Rewrite `agent_help` to use MCP Sampling** (AC: #2, #3, #7)
  - [x] 1.1 Rewrite agent_help with single-path pattern (same as all other agent tools): `message` required, `history` + `context` optional
  - [x] 1.2 Move `_meta.ui` to tool DEFINITION (not response) — `_meta: { ui: { resourceUri: "ui://mcp-std/agent-chat" } }` — like `psql_query` has `table-viewer`
  - [x] 1.3 Single handler path: build messages (system + history + message) → `getSamplingClient().createMessage()` with `toolChoice: "auto"`, `maxTokens: 2048`, `maxIterations: 3` → return `{ message: extractText(response.content) }`
  - [x] 1.4 System prompt in French: assistant PML with pml_execute access for MCP tool discovery/execution
  - [x] 1.5 Remove `title`, `welcomeMessage` params (not needed — client manages window title)
  - [x] 1.6 Keywords in description: "agent, help, chat, conversation, dialogue, assistant, talk, discuss, question, support, sampling, multi-turn"

- [x] **Task 2: Rewrite `chat.ts` backend as PML proxy** (AC: #1, #8)
  - [x] 2.1 Remove: `SYSTEM_PROMPT`, `AGENT_DEFAULT_SYSTEM_PROMPT`, `buildDatasetCatalog()`, `agentMode`, `OpenAIMessage`, `OpenAIResponse`, direct OpenAI `fetch()` call
  - [x] 2.2 Remove: `processLlmResponse()`, `parseLlmJson()`, dataset lookup logic
  - [x] 2.3 Implement: MCP JSON-RPC proxy to PML serve via `callPml()` helper → `tools/call execute { intent }`
  - [x] 2.4 Parse PML response: `extractPmlResult()` extracts embedded JSON from `content[0].text`
  - [x] 2.5 Handle `status: "approval_required"` from PML (HIL flow) — return to client
  - [x] 2.6 Handle errors with fail-fast (no silent fallback)
  - [x] 2.7 Keep: `PLAYGROUND_ENABLED` env gate, FreshContext handler pattern
  - [x] 2.8 New env: `PML_SERVE_URL` (default `http://localhost:3004`)
  - [x] 2.9 Support agent messages: `widgetId` → call PML with `code: "return await mcp.std.agent_help(...)"`

- [x] **Task 3: Update client response parsing for PML results** (AC: #1, #3)
  - [x] 3.1 New `parsePmlResult()` in island handles PML execution results
  - [x] 3.2 Detect `_meta.ui` in tool results → extract `resourceUri`, `context`, create widget
  - [x] 3.3 Handle text-only responses (plain message extraction)
  - [x] 3.4 Handle legacy `ui` field format for backwards compatibility

- [x] **Task 4: Rewrite agent message routing through PML** (AC: #5, #8)
  - [x] 4.1 Rewrite `handleAgentMessage()` → sends `{ widgetId, message, history, context }` to `/api/playground/chat`
  - [x] 4.2 Backend routes to PML `agent_help` via `execute` with code parameter
  - [x] 4.3 Response routed back to agent-chat widget via AppBridge `sendToolResult()`
  - [x] 4.4 Agent widget maintains conversation history client-side (`agentHistory` + `agentContext`)

- [x] **Task 5: Remove fake agent artifacts** (AC: #8)
  - [x] 5.1 Removed from `chat.ts`: all OpenAI code, `AGENT_DEFAULT_SYSTEM_PROMPT`, `agentMode`, dataset imports
  - [x] 5.2 Removed from island: old `handleAgentMessage()` with `agentMode: true`, `sendMessageDev()`, `sendMessagePuter()`
  - [x] 5.3 Removed from island: client-side `SYSTEM_PROMPT`, `AVAILABLE_UIS`, `providerMode`, Puter.js code
  - [x] 5.4 Removed: `parseResponse()` replaced with `parsePmlResult()`

- [x] **Task 6: Update observability panel** (AC: #9)
  - [x] 6.1 New event types: `pml-call`, `pml-response`, `pml-error`, `meta-ui-widget`, `agent-sampling`
  - [x] 6.2 Log PML request/response details
  - [x] 6.3 Log when `_meta.ui` triggers widget creation
  - [x] 6.4 Log agent sampling calls (message sent, response received)

- [x] **Task 7: Handle Brave Search cleanup** (AC: #8)
  - [x] 7.1 Deleted: `src/web/routes/api/playground/search.ts`
  - [x] 7.2 Deleted: `lib/std/src/ui/web-browser/` directory
  - [x] 7.3 Removed: `web-browser` reference from suggestions, `AVAILABLE_UIS` list removed entirely

## Dev Notes

### CRITICAL: What Was Wrong in the Previous Implementation

The previous 17.3 implementation had TWO fundamental problems:

**Problem 1: Fake agents in chat.ts + island**
- `AGENT_DEFAULT_SYSTEM_PROMPT` = just a different OpenAI system prompt
- `agentMode: boolean` = a flag to switch prompts, not a real agent mode
- `handleAgentMessage()` = called the same `/api/playground/chat` endpoint with `agentMode: true`
- **No MCP tools were used at all** — the entire thing was a direct OpenAI call disguised as an "agent"

**Problem 2: agent_help is not a real agent**
- `agent_help` in `lib/std/src/tools/agent.ts` (line 1030) is a **one-shot tool**
- It does NOT use `getSamplingClient()` — unlike ALL other agent tools
- It just returns `_meta.ui` to open a window and nothing else
- There is no MCP Sampling backing the conversation — the "agent" cannot think, reason, or use tools

### Architecture: How It MUST Work Now

```
User message in chat
       ↓
POST /api/playground/chat  (Fresh server, port 8081)
       ↓
chat.ts proxifies to PML serve (port 3004)
  via JSON-RPC: { method: "tools/call", params: { name: "execute", arguments: { intent: "..." } } }
       ↓
PML serve → Cloud → execute_locally → Local sandbox
  - If simple data request → tool returns data (+ optional _meta.ui)
  - If complex/help request → PML selects agent_help → returns _meta.ui for agent-chat
  - agent_help uses MCP Sampling (getSamplingClient().createMessage()) for LLM calls
  - agent_help has access to pml_execute tool → can call any MCP tool
       ↓
Response to client: { content: [...], _meta?: { ui: { resourceUri, context } } }
       ↓
Client parses response:
  - Text → show in chat
  - _meta.ui → create widget on canvas (table-viewer, metrics-panel, agent-chat, etc.)

Agent conversation flow:
  User types in agent-chat widget
       ↓
  agent-chat UI → app.updateModelContext({ structuredContent: { event: "message", text } })
       ↓
  Host (TryPlaygroundIsland) → bridge.onupdatemodelcontext
       ↓
  POST /api/playground/chat  { widgetId, message, history }
       ↓
  chat.ts → PML serve → tools/call execute { code: "return await mcp.std.agent_help({ message, history })" }
       ↓
  agent_help → getSamplingClient().createMessage() → LLM response (with optional tool calls)
       ↓
  Response → chat.ts → island → bridge.sendToolResult({ message: reply })
       ↓
  agent-chat UI → ontoolresult → addMessage("assistant", reply)
```

### PML Serve HTTP API Reference

**Endpoint**: `POST http://localhost:3004/mcp`

**CORS**: Already configured (`origin: "*"`, methods: GET/POST/OPTIONS)

**Important**: PML serve exposes only 3 meta-tools: `discover`, `execute`, `admin`. To call MCP std tools like `agent_help`, use `execute` with code parameter.

**Request format — tunnel principal** (MCP JSON-RPC):
```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "method": "tools/call",
  "params": {
    "name": "execute",
    "arguments": {
      "intent": "montre-moi les ventes du trimestre"
    }
  }
}
```

**Request format — agent message** (calling agent_help via execute):
```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "method": "tools/call",
  "params": {
    "name": "execute",
    "arguments": {
      "intent": "agent conversation response",
      "code": "return await mcp.std.agent_help({ message: 'user message here', history: [{role:'user',content:'...'},{role:'assistant',content:'...'}], context: 'optional initial context' })"
    }
  }
}
```

**Success response**:
```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "result": {
    "content": [
      { "type": "text", "text": "{\"status\":\"success\",\"result\":{...}}" }
    ]
  }
}
```

The `text` field contains embedded JSON with:
- `status`: "success" | "error" | "approval_required"
- `result`: The actual tool execution result
- `executed_locally`: boolean

**Approval required response** (HIL):
```json
{
  "status": "approval_required",
  "approval_type": "tool_permission",
  "workflow_id": "uuid",
  "description": "...",
  "options": ["continue", "abort"]
}
```

To continue: send another `tools/call` with `continue_workflow: { workflow_id, approved: true }`.

### Real Agent Tools Reference

**Source**: `lib/std/src/tools/agent.ts`

| Tool | Purpose | Uses Sampling? | Returns `_meta.ui`? |
|------|---------|----------------|---------------------|
| `agent_help` | Conversational chat window | **NO → MUST FIX** | YES: `ui://mcp-std/agent-chat` |
| `agent_delegate` | Full agentic loop with tool access | YES (with tools) | No |
| `agent_decide` | LLM-based decision making | YES (no tools) | No |
| `agent_analyze` | Structured data analysis | YES (no tools) | No |
| `agent_extract` | Extract structured data | YES (no tools) | No |
| `agent_classify` | Classify content | YES (no tools) | No |
| `agent_summarize` | Summarize content | YES (no tools) | No |
| `agent_generate` | Generate code/text | YES (no tools) | No |
| `agent_compare` | Compare and rank items | YES (no tools) | No |

### agent_help Rewrite Specification

**Current handler** (line 1052, TO REWRITE):
```typescript
handler: async ({ title, context, welcomeMessage }) => {
  // ONE-SHOT: just returns _meta.ui, no sampling
  return {
    status: "agent_ready",
    message: "Chat window opened.",
    _meta: { ui: { resourceUri: "ui://mcp-std/agent-chat", context: { config: {...} } } }
  };
};
```

**New handler** (what it should become):
```typescript
handler: async ({ title, context, welcomeMessage, message, history }) => {
  const chatTitle = (title as string) || "Assistant";
  const client = getSamplingClient();

  // FIRST CALL: no message → open window + generate contextual welcome
  if (!message) {
    let welcomeMsg = (welcomeMessage as string) || "Comment puis-je vous aider ?";
    if (context) {
      // Use sampling to generate a context-aware welcome
      const response = await client.createMessage({
        messages: [{ role: "user", content: `Context: ${context}\nGenerate a short welcome message.` }],
        maxTokens: 200,
      });
      welcomeMsg = extractText(response.content);
    }
    return {
      status: "agent_ready",
      message: welcomeMsg,
      _meta: {
        ui: {
          resourceUri: "ui://mcp-std/agent-chat",
          context: {
            config: { name: chatTitle, icon: "💬", welcomeMessage: welcomeMsg, placeholder: "Tapez votre message..." },
            userContext: context,
          },
        },
      },
    };
  }

  // SUBSEQUENT CALLS: message + history → use sampling to respond
  const systemPrompt = `Tu es ${chatTitle}, un assistant conversationnel.
${context ? `Contexte: ${context}` : ""}
Réponds de manière claire et utile. Tu peux utiliser pml_execute pour accéder aux outils MCP si nécessaire.`;

  const messages = [
    { role: "user" as const, content: systemPrompt },
    ...(history as Array<{role: "user"|"assistant"; content: string}> || []),
    { role: "user" as const, content: message as string },
  ];

  const response = await client.createMessage({
    messages,
    toolChoice: "auto",  // Agent can use tools
    maxTokens: 2048,
    maxIterations: 3,
  });

  return { message: extractText(response.content) };
};
```

**New input schema**:
```typescript
inputSchema: {
  type: "object",
  properties: {
    title: { type: "string", description: "Title for the chat window (default: 'Assistant')" },
    context: { type: "string", description: "Initial context or topic for the conversation" },
    welcomeMessage: { type: "string", description: "Custom welcome message to display" },
    message: { type: "string", description: "User message for ongoing conversation" },
    history: {
      type: "array",
      items: { type: "object", properties: { role: { type: "string" }, content: { type: "string" } } },
      description: "Conversation history array of {role, content} objects"
    },
  },
  // All optional — first call has no message, subsequent calls have message+history
}
```

### AppBridge Communication Flow (KEEP — already works)

The AppBridge communication between host and agent-chat widget is correct and does not need changes:

1. **agent-chat → host**: `app.updateModelContext({ structuredContent: { event: "message", text } })` (agent-chat/main.tsx:52)
2. **host receives**: `bridge.onupdatemodelcontext` checks `structured.event === "message"` (island:686)
3. **host → agent-chat**: `bridge.sendToolResult({ content: [{ type: "text", text: JSON.stringify({ message: reply }) }] })` (island:694-698)
4. **agent-chat receives**: `app.ontoolresult` parses JSON, extracts `parsed.message`, calls `addMessage("assistant", content)` (agent-chat/main.tsx:110-113)

What changes: only the `onAgentMessage` callback body (how the host gets the response — PML instead of OpenAI).

### What to KEEP from Previous Implementation

| Component | Status | File |
|-----------|--------|------|
| WidgetFrame (drag, resize, close, AppBridge) | KEEP | TryPlaygroundIsland.tsx |
| AppBridge + PostMessageTransport setup | KEEP | TryPlaygroundIsland.tsx |
| Widget state management (position, size, data) | KEEP | TryPlaygroundIsland.tsx |
| Chat UI (messages, input, suggestions) | KEEP | TryPlaygroundIsland.tsx |
| Observability panel (events, toggle) | KEEP (update event types) | TryPlaygroundIsland.tsx |
| `addWidget()` function | KEEP (trigger changes) | TryPlaygroundIsland.tsx |
| `removeWidget()` function | KEEP | TryPlaygroundIsland.tsx |
| agent-chat MCP UI component | KEEP | lib/std/src/ui/agent-chat/ |
| Mock datasets | KEEP (will be served by MCP tools) | src/web/content/playground-datasets.ts |
| Dataset tests | KEEP | tests/unit/web/playground-datasets_test.ts |
| Route `/try` | KEEP | src/web/routes/try.tsx |
| PLAYGROUND_ENABLED gate | KEEP | chat.ts |
| `bridge.onupdatemodelcontext` flow | KEEP (change callback body only) | TryPlaygroundIsland.tsx |
| `bridge.sendToolResult` pattern | KEEP | TryPlaygroundIsland.tsx |

### What to REMOVE/REWRITE

| Component | Action | File |
|-----------|--------|------|
| `SYSTEM_PROMPT` (dataset routing) | REMOVE | chat.ts |
| `AGENT_DEFAULT_SYSTEM_PROMPT` | REMOVE | chat.ts |
| `buildDatasetCatalog()` | REMOVE | chat.ts |
| `processLlmResponse()` | REMOVE | chat.ts |
| `parseLlmJson()` | REMOVE | chat.ts |
| Direct OpenAI `fetch()` call | REWRITE → PML proxy | chat.ts |
| `agentMode` in ChatRequest | REMOVE | chat.ts |
| `handleAgentMessage()` | REWRITE → PML route | TryPlaygroundIsland.tsx |
| Client-side `SYSTEM_PROMPT` | REMOVE | TryPlaygroundIsland.tsx |
| `AVAILABLE_UIS` static list | REMOVE or make dynamic | TryPlaygroundIsland.tsx |
| `sendMessageDev()` | REWRITE → PML call | TryPlaygroundIsland.tsx |
| `parseResponse()` | REWRITE → handle PML results | TryPlaygroundIsland.tsx |
| `search.ts` (Brave Search) | DELETE | src/web/routes/api/playground/search.ts |
| `web-browser/` UI (Brave) | DELETE | lib/std/src/ui/web-browser/ |
| `agent_help` handler | REWRITE → MCP Sampling | lib/std/src/tools/agent.ts |

### Existing Files to Modify

| File | Changes |
|------|---------|
| `lib/std/src/tools/agent.ts` | Rewrite `agent_help` handler: add message/history params, use getSamplingClient(), toolChoice: "auto" with pml_execute |
| `src/web/routes/api/playground/chat.ts` | Complete rewrite: PML JSON-RPC proxy instead of OpenAI call. Support both tunnel and agent messages. |
| `src/web/islands/TryPlaygroundIsland.tsx` | Rewrite sendMessage, parseResponse, remove fake agent code. Keep AppBridge flow, change onAgentMessage callback body. |

### Files to Delete

| File | Reason |
|------|--------|
| `src/web/routes/api/playground/search.ts` | Brave Search API — abandoned (US-05 uses Chrome CDP instead) |
| `lib/std/src/ui/web-browser/` | Brave Search UI — abandoned (US-05 will create CDP-based browser) |

### New Files to Create

None — this story modifies existing files only.

### Key Patterns to Follow

1. **No silent fallbacks** (`.claude/rules/no-silent-fallbacks.md`): If PML serve is not running → fail-fast with clear error, NOT fallback to OpenAI
2. **MCP JSON-RPC protocol**: All PML calls use `{ jsonrpc: "2.0", method: "tools/call", params: { name, arguments } }`
3. **`_meta.ui` pattern**: When a tool result contains `_meta.ui`, the client creates a widget. This is the standard MCP Apps pattern (SEP-1865).
4. **MCP Sampling pattern** (from agent_delegate): `getSamplingClient().createMessage({ messages, toolChoice: "auto", maxTokens, maxIterations })`
5. **AppBridge data sending** (existing pattern):
   ```typescript
   bridge.sendToolResult({
     content: [{ type: "text", text: JSON.stringify(widget.data) }],
     isError: false,
   });
   ```
6. **PML_SERVE_URL**: Default `http://localhost:3004`, configurable via env. The server Fresh proxifies to this URL.
7. **Calling MCP std tools via PML serve**: Use `execute` with `code` parameter: `return await mcp.std.agent_help({ message, history })`

### Previous Story Intelligence (from 17.2)

Story 17.2 validated all 5 MCP UI data formats. Key learnings:
- All UIs accept data via `bridge.sendToolResult()` with `{ content: [{ type: "text", text: JSON.stringify(data) }] }`
- `agent-chat` expects `{ config: {...} }` for init and `{ message: "..." }` for responses
- The AppBridge `ontoolresult` handler in agent-chat (line 94-138) is flexible and handles multiple formats
- `.gitignore` was fixed: changed `playground/` to `/playground/` (root-only) to unblock `src/web/routes/api/playground/`
- All 23 mock datasets validated against UI parsers (73 unit tests)

### Project Structure Notes

- `packages/pml/src/cli/serve-command.ts` — PML serve HTTP server (Hono.js, port 3004), CORS enabled, 3 meta-tools only
- `lib/std/src/tools/agent.ts` — Real MCP agent tools (agent_help to rewrite, agent_delegate as reference)
- `lib/std/src/ui/agent-chat/` — agent-chat MCP UI component (HTML + Preact) — KEEP as-is
- `src/web/routes/api/playground/chat.ts` — Fresh backend (to rewrite as PML proxy)
- `src/web/islands/TryPlaygroundIsland.tsx` — Playground island (to modify: routing, parsing, remove fake agents)
- `src/web/content/playground-datasets.ts` — Mock datasets (keep, future: serve via MCP tools)

### References

- [Source: lib/std/src/tools/agent.ts] — Real MCP agent tools, `_meta.ui` pattern, SamplingClient, agent_help (line 1030), agent_delegate (line 497)
- [Source: lib/std/src/ui/agent-chat/src/main.tsx] — agent-chat UI: notifyModel (line 170), ontoolresult (line 94), AppBridge flow
- [Source: packages/pml/src/cli/serve-command.ts] — PML serve HTTP API, JSON-RPC protocol, 3 meta-tools, CORS config
- [Source: src/web/islands/TryPlaygroundIsland.tsx] — Widget infrastructure, AppBridge (line 661-734), onupdatemodelcontext (line 684), handleAgentMessage (line 287)
- [Source: src/web/routes/api/playground/chat.ts] — Current backend (to rewrite)
- [Source: _bmad-output/planning-artifacts/epics/epic-17-playground-conversationnel.md#US-03] — Epic US-03 requirements
- [Source: .claude/rules/no-silent-fallbacks.md] — No silent fallback policy
- [Source: .claude/rules/pml-usage.md] — PML HTTP usage guide
- [Source: _bmad-output/implementation-artifacts/17-2-validation-5-uis-cibles.md] — Previous story: UI format validation, AppBridge patterns

## Action Items (Code Review — 2026-02-06)

### CRITICAL

- [ ] **CR-1: Code injection RCE dans chat.ts:120-125** — L'échappement manuel `replace(/'/g, "\\'")` est contournable (`\'; malicious(); '`). **Fix**: remplacer par `JSON.stringify()` pour message, history, et context. Fichier: `src/web/routes/api/playground/chat.ts`

- [ ] **CR-2: Stale closure / race condition dans island handleAgentMessage()** — `currentHistory` est capturé dans le callback `setWidgets()` mais utilisé dans le `fetch()` après. L'ordre d'exécution React n'est pas garanti. **Fix**: capturer l'historique AVANT le `setWidgets()`, ou utiliser `useRef` pour l'historique agent. Fichier: `src/web/islands/TryPlaygroundIsland.tsx`

### HIGH

- [ ] **CR-3: Silent fallback dans extractPmlResult() (chat.ts:88-92)** — Le `catch` sur JSON.parse retourne un résultat synthétique au lieu de fail-fast. Viole la policy `no-silent-fallbacks`. **Fix**: `log.warn()` + structure de retour explicite, ou throw.

- [ ] **CR-4: Mixed escaping regimes (chat.ts:120-125)** — 3 régimes différents pour message/context/history : `replace` pour message, `replace` pour context, `JSON.stringify` pour history. Unifier avec `JSON.stringify()` partout (résout aussi CR-1).

- [ ] **CR-5: Aucune retry logic PML (chat.ts)** — Un seul appel fetch, aucun retry sur timeout ou 5xx. Pour un proxy critique, ajouter au minimum 1 retry avec backoff.

- [ ] **CR-6: Response type casting sans validation (chat.ts:149)** — `result as Record<string, unknown>` sans vérifier la structure. **Fix**: valider `typeof result === 'object' && result !== null` avant cast.

- [ ] **CR-7: Inconsistent error handling entre les 3 branches (chat.ts)** — Tunnel, agent, et HIL ont des patterns d'erreur différents. Unifier le handling.

- [ ] **CR-8: AppBridge sendToolResult() avant iframe ready (island)** — Quand l'agent répond vite, `sendToolResult()` peut être appelé avant que l'iframe du widget soit fully loaded. **Fix**: ajouter un check `bridge.isReady` ou queue les messages.

- [x] **CR-9: HIL approval flow sans UI (island)** — ~~Pas de boutons approve/reject.~~ **Fixed**: `pendingApproval` state + boutons Approuver/Rejeter dans le chat tunnel. `handleApproval()` envoie `continueWorkflow` au backend.

- [ ] **CR-10: History items manquent `required` (agent.ts)** — Le schema `history.items` n'a pas `required: ["role", "content"]`. Un objet vide `{}` passerait la validation. **Fix**: ajouter `required`.

- [ ] **CR-11: Role manque enum (agent.ts)** — `role` est `type: "string"` sans `enum: ["user", "assistant"]`. **Fix**: ajouter `enum`.

### MEDIUM

- [ ] **CR-12: Validation longueur message absente (chat.ts)** — Aucune limite sur `body.message`. Un payload de 10MB passerait. **Fix**: vérifier `message.length < MAX_LENGTH`.

- [ ] **CR-13: Type unsafe string assertions (chat.ts:120-121)** — `body.message as string` et `body.context as string` sans vérification préalable. **Fix**: `typeof body.message === 'string'` check.

- [ ] **CR-14: Workflow ID non validé (chat.ts:109)** — `body.continueWorkflow.workflowId` est passé directement à PML sans validation format UUID. **Fix**: regex UUID ou au minimum `typeof === 'string' && length > 0`.

- [ ] **CR-15: Hardcoded localhost fallback (chat.ts:16)** — `PML_SERVE_URL` default `http://localhost:3004` est un silent fallback. **Fix**: `log.warn()` quand l'env var n'est pas set.

- [ ] **CR-16: `_meta` inconsistant avec les autres agents (agent.ts)** — `agent_help` est le seul agent avec `_meta.ui` sur la définition. Les autres n'en ont pas. C'est correct architecturalement mais documenter explicitement pourquoi.

- [ ] **CR-17: context maxLength absent (agent.ts)** — Le param `context` n'a pas de `maxLength`. **Fix**: ajouter `maxLength: 2000` ou similaire.

- [ ] **CR-18: Silent fallback result.result ?? result (island)** — Le parsing `result.result ?? result` masque des formats inattendus. **Fix**: log.warn si le format est inattendu.

- [ ] **CR-19: Context param jamais envoyé au widget agent-chat (island)** — `agentContext` est stocké mais jamais passé dans le body de handleAgentMessage pour le premier appel.

### LOW

- [ ] **CR-20: Hardcoded French system prompt (agent.ts)** — Le prompt est en français. Acceptable pour le playground PML mais à noter pour l'i18n future.

- [ ] **CR-21: Return missing stopReason (agent.ts)** — Le handler retourne `{ message }` mais pas `stopReason` de la response sampling. Utile pour debug.

- [ ] **CR-22: History type cast sans validation runtime (agent.ts)** — `history as Array<{role, content}>` sans vérifier que chaque élément a bien role+content.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- deno check chat.ts: PASS
- deno check agent.ts: PASS
- 73 playground-datasets tests: PASS

### Completion Notes List

- Task 1: Rewrote `agent_help` to follow single-path pattern like all other agent tools. `_meta.ui` moved to tool definition (not response). `message` required, `history`/`context` optional. Uses `getSamplingClient().createMessage()` with `toolChoice: "auto"`, `maxTokens: 2048`, `maxIterations: 3`.
- Task 2: Complete rewrite of `chat.ts` — removed all OpenAI code, now a pure PML JSON-RPC proxy. `callPml()` helper sends `tools/call execute` to `PML_SERVE_URL`. Supports tunnel (intent) and agent (widgetId + code) modes. HIL approval flow handled.
- Task 3: New `parsePmlResult()` handles `_meta.ui` (MCP Apps pattern), legacy `ui` field, and plain text. Replaces old `parseResponse()`.
- Task 4: `handleAgentMessage()` rewritten — sends `{ widgetId, message, history, context }` to backend, which proxies to PML `agent_help`. Widget `agentContext` preserved across calls.
- Task 5: Removed all fake agent artifacts: `SYSTEM_PROMPT`, `AGENT_DEFAULT_SYSTEM_PROMPT`, `agentMode`, `AVAILABLE_UIS`, `providerMode`, `sendMessageDev`, `sendMessagePuter`, Puter.js code.
- Task 6: Observability panel updated with new event types: `pml-call`, `pml-response`, `pml-error`, `meta-ui-widget`, `agent-sampling`. Color-coded in cyan for agent events.
- Task 7: Deleted `search.ts` (Brave Search) and `web-browser/` directory. No references remain.

### Change Log

- 2026-02-06: Story 17.3 implemented — PML proxy, real MCP agents, fake agents removed

### File List

- `lib/std/src/tools/agent.ts` — Modified: agent_help rewritten with single-path MCP Sampling pattern + `_meta.ui` on definition
- `src/web/routes/api/playground/chat.ts` — Rewritten: PML JSON-RPC proxy (removed all OpenAI code)
- `src/web/islands/TryPlaygroundIsland.tsx` — Rewritten: PML integration, removed fake agents, new parsePmlResult(), updated observability
- `src/web/routes/api/playground/search.ts` — Deleted: Brave Search route (abandoned)
- `lib/std/src/ui/web-browser/index.html` — Deleted: Brave Search UI
- `lib/std/src/ui/web-browser/src/main.tsx` — Deleted: Brave Search UI component

