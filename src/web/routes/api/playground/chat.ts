/**
 * Playground Chat API - LLM Agent + PML Tools
 *
 * POST /api/playground/chat
 *
 * Architecture:
 * 1. User message → discover(intent: message, limit: 5) → top tools WITH schemas
 * 2. Convert to OpenAI function tools format
 * 3. Agentic loop: LLM calls tools → proxy to PML execute → feed result back
 * 4. Final LLM text response → return to browser
 *
 * @module web/routes/api/playground/chat
 */

import type { FreshContext } from "fresh";
import OpenAI from "openai";

const PML_SERVE_URL = Deno.env.get("PML_SERVE_URL") || (() => {
  console.warn("[Playground] PML_SERVE_URL not set, defaulting to http://localhost:3004");
  return "http://localhost:3004";
})();
const MAX_AGENT_ITERATIONS = 5;
const DISCOVER_LIMIT = 10;

interface ChatRequest {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  widgetId?: string;
  context?: string;
  continueWorkflow?: { workflowId: string; approved: boolean };
}

interface PmlJsonRpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: {
    code: number;
    message: string;
  };
}

// =============================================================================
// PML Proxy
// =============================================================================

async function callPml(
  name: string,
  args: Record<string, unknown>,
): Promise<PmlJsonRpcResponse> {
  const requestId = `playground-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const response = await fetch(`${PML_SERVE_URL}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PML serve error (${response.status}): ${text}`);
  }

  return await response.json();
}

function extractPmlResult(rpcResponse: PmlJsonRpcResponse): Record<string, unknown> {
  if (rpcResponse.error) {
    throw new Error(`PML RPC error: ${rpcResponse.error.message}`);
  }

  const content = rpcResponse.result?.content;
  if (!content || content.length === 0) {
    throw new Error("PML returned empty content");
  }

  const text = content[0].text;
  try {
    return JSON.parse(text);
  } catch {
    console.warn(
      "[extractPmlResult] PML returned non-JSON text, wrapping as message. " +
      "This may indicate an unexpected response format.",
      text.slice(0, 200),
    );
    return { status: "success", result: { message: text } };
  }
}

// =============================================================================
// Discover PML tools → OpenAI tool format
// =============================================================================

interface DiscoverResult {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
  call_name?: string;
}

/** call_name "namespace:action" → { namespace, action } */
function parseCallName(callName: string): { namespace: string; action: string } {
  const idx = callName.indexOf(":");
  if (idx === -1) return { namespace: "std", action: callName };
  return { namespace: callName.slice(0, idx), action: callName.slice(idx + 1) };
}

/**
 * Discover relevant tools for the user's message using semantic search.
 * Returns OpenAI-formatted tools + a mapping to route calls back to PML execute.
 *
 * Both capabilities and MCP tools use the same call convention:
 *   mcp.<namespace>.<action>(args)
 */
async function discoverToolsForMessage(message: string): Promise<{
  openaiTools: OpenAI.ChatCompletionTool[];
  callNameByFunc: Map<string, string>;
}> {
  const rpc = await callPml("discover", { intent: message, limit: DISCOVER_LIMIT, filter: { type: "tool" } });
  const text = rpc.result?.content?.[0]?.text || "{}";
  const data = JSON.parse(text);
  const results: DiscoverResult[] = data.results || [];

  const openaiTools: OpenAI.ChatCompletionTool[] = [];
  const callNameByFunc = new Map<string, string>();

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const callName = item.call_name || item.name;
    const schema = item.input_schema || {};

    // OpenAI function names: ^[a-zA-Z0-9_-]+$ — replace ":" with "_"
    const funcName = `pml_${i}_${callName.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    const parameters: Record<string, unknown> = {
      type: "object",
      properties: (schema as Record<string, unknown>).properties || {},
    };
    const required = (schema as Record<string, unknown>).required;
    if (Array.isArray(required) && required.length > 0) {
      parameters.required = required;
    }

    openaiTools.push({
      type: "function",
      function: {
        name: funcName,
        description: item.description || callName,
        parameters,
      },
    });

    callNameByFunc.set(funcName, callName);
  }

  // agent_help = opens a dedicated chat WIDGET (not for answering inline)
  const agentHelpFunc = "pml_agent_help";
  openaiTools.push({
    type: "function",
    function: {
      name: agentHelpFunc,
      description:
        "Ouvre une fenetre de chat dediee sur le canvas. Appelle UNIQUEMENT quand l'utilisateur demande explicitement un assistant, une aide approfondie, ou une fenetre de conversation separee. Ne PAS utiliser pour repondre aux questions normales.",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "string",
            description: "Contexte initial pour le chat (ex: le sujet de la conversation)",
          },
        },
      },
    },
  });
  callNameByFunc.set(agentHelpFunc, "std:agent_help");

  return { openaiTools, callNameByFunc };
}

/**
 * Build PML execute code from a call_name (namespace:action) + args.
 * Capabilities and MCP tools use the same convention: mcp.namespace.action(args)
 */
function buildExecuteCode(callName: string, args: Record<string, unknown>): string {
  const { namespace, action } = parseCallName(callName);
  return `return await mcp.${namespace}.${action}(${JSON.stringify(args)})`;
}

// =============================================================================
// Tunnel Agent
// =============================================================================

const TUNNEL_SYSTEM_PROMPT = `Tu es l'orchestrateur du playground PML (Procedural Memory Layer).
Tu NE CONVERSES PAS. Tu executes des outils et tu rapportes les resultats.

## PML — comment ca marche
PML est un systeme de memoire procedurale. Il stocke des "capabilities" — des procedures
apprises qui encapsulent des appels MCP. Quand tu appelles un outil, c'est peut-etre un
outil MCP brut (psql_query, data_person, read_file...) ou une capability apprise.
Il n'y a AUCUNE difference d'appel : tout s'appelle pareil, via les memes fonctions.
Ne fais jamais de distinction entre "capability" et "outil" dans tes reponses.

## Ce que tu as
Les outils fournis sont les plus pertinents pour la demande de l'utilisateur.
Ils ont ete selectionnes par recherche semantique. Utilise-les directement.

## Regles STRICTES
- Tu es un executeur d'outils ET un assistant. Tu peux repondre directement aux questions simples.
- Pour les questions de donnees (ventes, serveurs, metriques...), appelle les outils pertinents.
- Pour les questions conversationnelles (salut, explique-moi, comment ca marche...), reponds DIRECTEMENT sans appeler d'outil.
- N'appelle agent_help que si l'utilisateur demande EXPLICITEMENT d'ouvrir une fenetre de chat separee.
- Reponds TOUJOURS en francais
- Sois concis : rapporte le resultat de l'outil, pas plus
- N'invente jamais de donnees — utilise les outils pour les obtenir
- Si un outil echoue, rapporte l'erreur telle quelle`;

interface ToolResultEntry {
  toolName: string;
  /** Unwrapped actual data (parsed from content[0].text) */
  data: unknown;
  /** UI metadata from the tool definition (_meta.ui) if present */
  uiMeta?: { resourceUri: string; emits?: string[]; accepts?: string[] };
}

interface TunnelResult {
  message: string;
  toolResults?: ToolResultEntry[];
}

/**
 * Unwrap MCP envelope: extract actual data + optional _meta.ui from a PML tool result.
 *
 * PML results may be wrapped in several layers:
 * - { result: { _meta, content: [{ text: "..." }] } }
 * - { result: { _meta, key: value } } (no envelope, data is inline)
 * - plain text
 */
function unwrapMcpResult(resultText: string): { data: unknown; uiMeta: ToolResultEntry["uiMeta"] } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(resultText);
  } catch {
    return { data: resultText, uiMeta: undefined };
  }

  const mcpResult = parsed?.result ?? parsed;

  if (!mcpResult || typeof mcpResult !== "object") {
    return { data: mcpResult, uiMeta: undefined };
  }

  const r = mcpResult as Record<string, unknown>;

  // Extract _meta.ui if present (tool has a dedicated viewer)
  let uiMeta: ToolResultEntry["uiMeta"];
  const meta = r._meta as Record<string, unknown> | undefined;
  if (meta?.ui) {
    const ui = meta.ui as Record<string, unknown>;
    uiMeta = {
      resourceUri: ui.resourceUri as string,
      emits: ui.emits as string[] | undefined,
      accepts: ui.accepts as string[] | undefined,
    };
  }

  // Unwrap content[0].text → parse as JSON for actual data
  const content = r.content as Array<{ type: string; text?: string }> | undefined;
  if (Array.isArray(content) && content[0]?.text) {
    let actualData: unknown;
    try {
      actualData = JSON.parse(content[0].text);
    } catch {
      actualData = content[0].text;
    }
    return { data: actualData, uiMeta };
  }

  if (!content) {
    // No MCP envelope — data is directly in the result (minus _meta)
    const { _meta: _, ...rest } = r;
    const data = Object.keys(rest).length > 0 ? rest : mcpResult;
    return { data, uiMeta };
  }

  return { data: mcpResult, uiMeta };
}

/** Serialize tool data as context text, truncated to stay under MCP limits. */
const MAX_CONTEXT_LENGTH = 8000; // Well under 65536 byte MCP limit
function truncateForContext(data: unknown): string {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  if (text.length <= MAX_CONTEXT_LENGTH) return text;
  return text.slice(0, MAX_CONTEXT_LENGTH) + "\n... (tronque)";
}

async function runTunnelAgent(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<TunnelResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY not configured. Set it in the environment to use the playground agent.",
    );
  }

  const client = new OpenAI({ apiKey });
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";
  const collectedToolResults: ToolResultEntry[] = [];

  // 1. Discover relevant tools using semantic search on the user's message
  console.log(`[Playground Agent] Discovering tools for: "${message.slice(0, 80)}"`);
  const { openaiTools, callNameByFunc } = await discoverToolsForMessage(message);
  console.log(
    `[Playground Agent] ${openaiTools.length} tools discovered:`,
    [...callNameByFunc.values()].join(", "),
  );

  if (openaiTools.length === 0) {
    return { message: "Aucun outil pertinent trouve pour cette demande. Essaie de reformuler ta question." };
  }

  // 2. Build messages
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: TUNNEL_SYSTEM_PROMPT },
    ...history.map((m): OpenAI.ChatCompletionMessageParam => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  // 3. Agentic loop
  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    console.log(`[Playground Agent] Iteration ${i + 1}/${MAX_AGENT_ITERATIONS}`);

    const completion = await client.chat.completions.create({
      model,
      max_completion_tokens: 4096,
      messages,
      tools: openaiTools,
      tool_choice: i === 0 ? "required" : "auto",
    });

    const choice = completion.choices[0];
    const assistantMsg = choice.message;

    // No tool calls → final answer
    if (choice.finish_reason !== "tool_calls" || !assistantMsg.tool_calls?.length) {
      return {
        message: assistantMsg.content || "",
        toolResults: collectedToolResults.length > 0 ? collectedToolResults : undefined,
      };
    }

    // Add assistant message with tool calls
    messages.push(assistantMsg);

    // Execute each tool call via PML
    for (const tc of assistantMsg.tool_calls) {
      const fn = (tc as { function: { name: string; arguments: string }; id: string }).function;

      let args: Record<string, unknown>;
      try {
        args = JSON.parse(fn.arguments);
      } catch {
        args = {};
      }

      const callName = callNameByFunc.get(fn.name);
      if (!callName) {
        console.warn(`[Playground Agent] Unknown tool: ${fn.name}`);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: `Unknown tool: ${fn.name}` }),
        });
        continue;
      }

      console.log(
        `[Playground Agent] Calling: ${callName}`,
        JSON.stringify(args).slice(0, 200),
      );

      const code = buildExecuteCode(callName, args);
      let resultText: string;
      try {
        const rpc = await callPml("execute", { code, intent: callName });
        resultText = rpc.result?.content?.[0]?.text || "No result";

        const { data, uiMeta } = unwrapMcpResult(resultText);
        collectedToolResults.push({ toolName: callName, data, uiMeta });
      } catch (error) {
        resultText = JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        });
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: resultText,
      });
    }
  }

  return {
    message: "J'ai atteint la limite d'iterations. Peux-tu reformuler ta demande ?",
    toolResults: collectedToolResults.length > 0 ? collectedToolResults : undefined,
  };
}

// =============================================================================
// Handler
// =============================================================================

export const handler = {
  async POST(ctx: FreshContext) {
    if (!Deno.env.get("PLAYGROUND_ENABLED")) {
      return new Response("Not Found", { status: 404 });
    }

    try {
      const body: ChatRequest = await ctx.req.json();

      // --- HIL workflow continuation ---
      if (body.continueWorkflow) {
        const rpcResponse = await callPml("execute", {
          continue_workflow: {
            workflow_id: body.continueWorkflow.workflowId,
            approved: body.continueWorkflow.approved,
          },
        });
        const result = extractPmlResult(rpcResponse);
        return Response.json(result);
      }

      // --- Agent message (widgetId) ---
      if (body.widgetId && body.message) {
        const rpcResponse = await callPml("execute", {
          intent: "agent conversation response",
          code: `return await mcp.std.agent_help(${JSON.stringify({
            message: body.message,
            history: body.history || [],
            ...(body.context ? { context: body.context } : {}),
          })})`,
        });
        const result = extractPmlResult(rpcResponse);
        return Response.json(result);
      }

      // --- Tunnel principal: LLM agent ---
      if (!body.message) {
        return Response.json({ error: "message is required" }, { status: 400 });
      }

      const agentResponse = await runTunnelAgent(body.message, body.history || []);

      // Build response — one widget per tool result with the correct viewer
      const responseBody: Record<string, unknown> = {
        status: "success",
        result: { message: agentResponse.message },
        mode: "agent",
      };

      if (agentResponse.toolResults && agentResponse.toolResults.length > 0) {
        const widgets = agentResponse.toolResults.map((tr) => {
          const { action } = parseCallName(tr.toolName);

          if (tr.uiMeta?.resourceUri) {
            // Tool declares a dedicated viewer → use it
            return {
              resourceUri: tr.uiMeta.resourceUri,
              title: action,
              data: tr.data,
            };
          }

          // No dedicated viewer → open agent-chat with auto-send
          const contextText = truncateForContext(tr.data);
          return {
            resourceUri: "ui://mcp-std/agent-chat",
            title: action,
            data: { context: contextText, initialMessage: body.message },
          };
        });

        (responseBody.result as Record<string, unknown>).widgets = widgets;
      }

      return Response.json(responseBody);
    } catch (error) {
      console.error("[Playground Chat] Error:", error);
      const msg = error instanceof Error ? error.message : "Internal server error";
      return Response.json({ error: msg }, { status: 500 });
    }
  },
};
