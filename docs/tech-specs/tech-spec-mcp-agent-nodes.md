# Tech Spec: MCP Agent Nodes via Sampling

**Date**: 2025-12-23
**Status**: Draft
**Priority**: Medium
**Spike**: [2025-12-23-mcp-sampling-agent-nodes.md](../spikes/2025-12-23-mcp-sampling-agent-nodes.md)

## Objectif

Ajouter un type de nœud `agent` dans les DAGs qui peut faire des décisions runtime via MCP sampling.

## Contexte

La spec MCP de novembre 2025 (SEP-1577) permet aux serveurs MCP de faire des boucles agentiques via `sampling/createMessage` avec tools.

## Scope

### In Scope

- Tool `agent_delegate` dans `lib/std/agent.ts`
- Handler de sampling dans le MCP client (gateway)
- Configuration LLM via env vars
- Traçage des appels sampling

### Out of Scope

- Branches conditionnelles dans le code généré (sujet séparé)
- Agent pool / réutilisation d'instances
- GraphRAG learning sur patterns d'agents (v2)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Code généré par l'agent :                                       │
│  await mcp.std.agent_delegate({ goal, context, tools })         │
└─────────────────────────────────────────────────────────────────┘
                              │
                    Worker RPC → Main Process
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  lib/mcp-tools-server.ts                                         │
│                                                                  │
│  tools/call "agent_delegate" →                                   │
│    loop {                                                        │
│      response = sampling/createMessage(goal, tools)             │
│      if (toolUse) → execute tools → continue                    │
│      else → return result                                        │
│    }                                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                    sampling/createMessage
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Gateway (MCP Client)                                            │
│                                                                  │
│  Si Claude Code → répondu nativement par Claude                 │
│  Sinon → appel LLM via env config (SAMPLING_PROVIDER)           │
└─────────────────────────────────────────────────────────────────┘
```

## Implémentation

### 1. Nouveau tool : `lib/std/agent.ts`

```typescript
import { type MiniTool } from "./common.ts";

export const agentTools: MiniTool[] = [
  {
    name: "agent_delegate",
    description: "Delegate a sub-task to an autonomous agent that can make decisions and call tools",
    category: "agent",
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "What the agent should accomplish"
        },
        context: {
          type: "object",
          description: "Context data for the agent"
        },
        allowedTools: {
          type: "array",
          items: { type: "string" },
          description: "Tools the agent can use (e.g., ['git_*', 'vfs_*'])"
        },
        maxIterations: {
          type: "number",
          default: 5,
          description: "Maximum agentic loop iterations"
        },
      },
      required: ["goal"],
    },
    handler: async ({ goal, context, allowedTools, maxIterations = 5 }) => {
      // Récupère le sampling client depuis le contexte MCP
      const samplingClient = getSamplingClient();

      const messages = [
        { role: "user", content: buildPrompt(goal, context) }
      ];

      const tools = filterTools(allowedTools);
      let iterations = 0;

      while (iterations < maxIterations) {
        const response = await samplingClient.createMessage({
          messages,
          tools,
          toolChoice: "auto",
          maxTokens: 4096,
        });

        if (response.stopReason === "end_turn") {
          return extractResult(response);
        }

        if (response.stopReason === "tool_use") {
          const toolResults = await executeToolCalls(response.content);
          messages.push({ role: "assistant", content: response.content });
          messages.push({ role: "user", content: toolResults });
        }

        iterations++;
      }

      throw new Error(`Agent exceeded max iterations (${maxIterations})`);
    },
  },
];
```

### 2. Export dans `lib/std/mod.ts`

```typescript
// Ajouter
export { agentTools } from "./agent.ts";
import { agentTools } from "./agent.ts";

// Dans systemTools
export const systemTools = [
  ...existingTools,
  ...agentTools,  // ← Ajouter
];

// Dans toolsByCategory
export const toolsByCategory = {
  ...existing,
  agent: agentTools,  // ← Ajouter
};
```

### 3. Sampling handler (gateway)

Le gateway doit implémenter le handler pour `sampling/createMessage` :

```typescript
// src/mcp/sampling-handler.ts
export class SamplingHandler {
  private provider: "anthropic" | "openai" | "ollama" | "native";
  private apiKey?: string;
  private endpoint?: string;
  private model: string;

  constructor() {
    this.provider = Deno.env.get("SAMPLING_PROVIDER") as any || "native";
    this.apiKey = Deno.env.get("SAMPLING_API_KEY");
    this.endpoint = Deno.env.get("SAMPLING_ENDPOINT");
    this.model = Deno.env.get("SAMPLING_MODEL") || "claude-sonnet-4-20250514";
  }

  async createMessage(params: CreateMessageParams): Promise<CreateMessageResult> {
    switch (this.provider) {
      case "native":
        // Claude Code - le client MCP parent gère
        throw new Error("Native sampling - request should be forwarded to parent");

      case "anthropic":
        return this.callAnthropic(params);

      case "openai":
        return this.callOpenAI(params);

      case "ollama":
        return this.callOllama(params);
    }
  }

  private async callAnthropic(params: CreateMessageParams) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: params.messages,
        tools: params.tools,
        max_tokens: params.maxTokens,
      }),
    });

    return response.json();
  }
}
```

## Configuration

### Claude Code (natif)

Aucune configuration. Le sampling est géré par Claude Code lui-même.

### Local / Cloud (BYOK)

Variables d'environnement dans `mcp-servers.json` :

```json
{
  "mcpServers": {
    "std": {
      "command": "deno",
      "args": ["run", "--allow-all", "lib/mcp-tools-server.ts"],
      "env": {
        "SAMPLING_PROVIDER": "anthropic",
        "SAMPLING_API_KEY": "sk-ant-...",
        "SAMPLING_MODEL": "claude-sonnet-4-20250514"
      }
    }
  }
}
```

| Variable | Valeurs | Description |
|----------|---------|-------------|
| `SAMPLING_PROVIDER` | `native`, `anthropic`, `openai`, `ollama` | Provider LLM |
| `SAMPLING_API_KEY` | string | Clé API (anthropic, openai) |
| `SAMPLING_ENDPOINT` | URL | Endpoint custom (ollama) |
| `SAMPLING_MODEL` | string | Modèle à utiliser |

## Traçage

Les appels sampling doivent être tracés comme les autres tools :

```typescript
// Chaque itération de la boucle agentique
{
  type: "agent_iteration",
  traceId: "...",
  iteration: 1,
  toolCalls: ["git_status", "vfs_read"],
  durationMs: 2500,
}

// Résultat final
{
  type: "agent_complete",
  traceId: "...",
  totalIterations: 3,
  success: true,
  durationMs: 8500,
}
```

## Limites et sécurité

| Limite | Défaut | Description |
|--------|--------|-------------|
| `maxIterations` | 5 | Prévient les boucles infinies |
| `timeout` | 60s | Timeout global pour l'agent |
| `allowedTools` | tous | Whitelist de tools autorisés |

## Tests

```typescript
// tests/unit/lib/agent_test.ts
Deno.test("agent_delegate - simple goal", async () => {
  // Mock sampling client
  const mockSampling = createMockSamplingClient([
    { stopReason: "end_turn", content: [{ type: "text", text: "Done" }] }
  ]);

  const result = await agentTools[0].handler({
    goal: "Say hello",
    context: {},
  });

  assertEquals(result, { text: "Done" });
});

Deno.test("agent_delegate - with tool calls", async () => {
  const mockSampling = createMockSamplingClient([
    { stopReason: "tool_use", content: [{ type: "tool_use", name: "git_status" }] },
    { stopReason: "end_turn", content: [{ type: "text", text: "Status checked" }] }
  ]);

  const result = await agentTools[0].handler({
    goal: "Check git status",
    allowedTools: ["git_*"],
  });

  assertEquals(result, { text: "Status checked" });
  assertEquals(mockSampling.calls.length, 2);
});

Deno.test("agent_delegate - max iterations", async () => {
  const mockSampling = createMockSamplingClient([
    // Always returns tool_use, never ends
    ...Array(10).fill({ stopReason: "tool_use", content: [] })
  ]);

  await assertRejects(
    () => agentTools[0].handler({ goal: "Loop forever", maxIterations: 3 }),
    Error,
    "exceeded max iterations"
  );
});
```

## Tâches

1. [ ] Créer `lib/std/agent.ts` avec `agent_delegate` tool
2. [ ] Exporter dans `lib/std/mod.ts`
3. [ ] Créer `src/mcp/sampling-handler.ts`
4. [ ] Intégrer dans `lib/mcp-tools-server.ts`
5. [ ] Ajouter traçage des itérations
6. [ ] Tests unitaires
7. [ ] Documentation

## Estimation

| Tâche | Effort |
|-------|--------|
| Tool agent_delegate | 0.5j |
| Sampling handler | 1j |
| Intégration serveur | 0.5j |
| Tests | 0.5j |
| **Total** | **2.5j** |
