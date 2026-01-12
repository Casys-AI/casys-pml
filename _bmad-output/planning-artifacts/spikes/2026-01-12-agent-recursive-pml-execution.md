# Spike: Agent Recursive PML Execution

**Date:** 2026-01-12
**Status:** Draft
**Author:** Erwan + Claude

## Objective

Explorer comment les agent tools (`agent_delegate`, etc.) peuvent utiliser les outils MCP via des appels récursifs à PML.

## Context

Les agent tools actuels appellent le LLM directement via `callLLMDirectly()` mais n'ont pas accès aux outils MCP. Pour un vrai comportement agentique, l'agent doit pouvoir:
1. Demander au LLM ce qu'il veut faire
2. Exécuter des outils MCP selon la demande du LLM
3. Retourner les résultats au LLM
4. Boucler jusqu'à completion

## Hypothesis

L'agent expose UN seul outil au LLM: `pml_execute`. Le LLM décrit ce qu'il veut faire, PML gère le reste (discovery, routing, execution, tracing).

## Design

### Tool Definition for LLM

```typescript
const pmlTool = {
  name: "pml_execute",
  description: "Execute any task using PML. Describe what you want to accomplish. PML will discover the right tools and execute them.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        description: "Natural language description of what to do"
      },
      code: {
        type: "string",
        description: "Optional: explicit mcp.* code if you know the exact calls"
      }
    },
    required: ["intent"]
  }
};
```

### Agent Loop in callLLMDirectly()

```typescript
async function callLLMDirectly(params: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools?: Array<Tool>;
  maxIterations?: number;
}): Promise<SamplingResponse> {

  const messages = [...params.messages];
  const maxIter = params.maxIterations || 5;

  for (let i = 0; i < maxIter; i++) {
    // 1. Call LLM with pml_execute tool
    const response = await callLLM(messages, [pmlTool]);

    // 2. If end_turn, return final result
    if (response.stop_reason === "end_turn") {
      return response;
    }

    // 3. If tool_use, execute via PML
    if (response.stop_reason === "tool_use") {
      const toolCall = response.content.find(c => c.type === "tool_use");

      if (toolCall.name === "pml_execute") {
        // Call PML recursively
        const pmlResult = await fetch(`${PML_API_URL}/api/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "tools/call",
            params: {
              name: "pml:execute",
              arguments: toolCall.input
            }
          })
        });

        const result = await pmlResult.json();

        // 4. Add tool result to conversation
        messages.push({
          role: "assistant",
          content: response.content
        });
        messages.push({
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: JSON.stringify(result)
          }]
        });
      }
    }
  }

  return { stop_reason: "max_tokens", content: [{ type: "text", text: "Max iterations reached" }] };
}
```

### Execution Flow

```
User: "Analyze the config files and summarize"
         ↓
agent_delegate({ goal: "Analyze config files and summarize" })
         ↓
┌─────────────────────────────────────────────────┐
│  Agentic Loop (max 5 iterations)                │
│                                                 │
│  1. LLM: "I need to list config files"          │
│     → tool_use: pml_execute({                   │
│         intent: "list files in config/"         │
│       })                                        │
│     → PML executes filesystem:read_directory    │
│     → Result: ["mcp-routing.json", ...]         │
│                                                 │
│  2. LLM: "Now read each config"                 │
│     → tool_use: pml_execute({                   │
│         intent: "read config/mcp-routing.json"  │
│       })                                        │
│     → PML executes filesystem:read_file         │
│     → Result: { routing: { ... } }              │
│                                                 │
│  3. LLM: "I have enough info, here's summary"   │
│     → end_turn                                  │
│     → Return final summary                      │
└─────────────────────────────────────────────────┘
         ↓
{ success: true, result: "Summary: 3 config files..." }
```

## Questions to Explore

1. **Auth propagation**: Comment passer l'API key du user dans les appels récursifs?
2. **Tracing**: Les appels récursifs apparaissent-ils dans le DAG parent?
3. **Allowed tools**: Comment filtrer les outils que l'agent peut utiliser?
4. **Timeouts**: Quelle limite de temps pour la boucle complète?
5. **Cost control**: Comment limiter les tokens/appels LLM?

## Experiments to Run

- [ ] Test simple: agent_delegate → pml_execute → filesystem:read_file
- [ ] Test multi-step: agent lit fichier → parse → analyse
- [ ] Test avec allowedTools filter
- [ ] Mesurer latence de la boucle complète
- [ ] Vérifier le tracing dans les logs

## Risks

1. **Infinite loops**: Le LLM pourrait tourner en boucle sans progresser
2. **Cost explosion**: Trop d'appels LLM = facture élevée
3. **Latency**: Chaque iteration = RTT vers LLM + execution PML
4. **Context overflow**: Conversation trop longue pour le context window

## Success Criteria

- [ ] Agent peut accomplir une tâche multi-step avec 2+ tool calls
- [ ] Les outils sont correctement tracés
- [ ] allowedTools filter fonctionne
- [ ] Performance < 30s pour 3 iterations typiques

## Next Steps

1. Implémenter le prototype dans `callLLMDirectly()`
2. Tester avec `agent_delegate`
3. Mesurer et itérer
4. Si OK → créer tech-spec pour implémentation complète
