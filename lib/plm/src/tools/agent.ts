/**
 * PLM Agent Tools - LLM-powered PLM assistance via MCP Sampling
 *
 * Domain-specific agents for BOM analysis, cost optimization, and change management.
 * Uses MCP Sampling (SEP-1577) — in Claude Code, sampling is native (zero config).
 *
 * @module lib/plm/tools/agent
 */

import type { PlmTool } from "./types.ts";

// =============================================================================
// Sampling Client Interface
// =============================================================================

interface SamplingClient {
  createMessage(params: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    tools?: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;
    toolChoice?: "auto" | "required" | "none";
    maxTokens?: number;
    maxIterations?: number;
    allowedToolPatterns?: string[];
  }): Promise<{
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
    stopReason: "end_turn" | "tool_use" | "max_tokens";
  }>;
}

// Global sampling client — set by server.ts at init
let _samplingClient: SamplingClient | null = null;

/** Set the sampling client (called by server.ts) */
export function setSamplingClient(client: SamplingClient): void {
  _samplingClient = client;
}

/** Get the sampling client — fail-fast if not available */
export function getSamplingClient(): SamplingClient {
  if (!_samplingClient) {
    throw new Error(
      "[lib/plm] Sampling client not available. " +
        "Configure SAMPLING_PROVIDER in mcp-servers.json or use Claude Code.",
    );
  }
  return _samplingClient;
}

// =============================================================================
// Agentic Sampling Client Factory
// =============================================================================

/**
 * Create an agentic sampling client for standalone mode (no Claude Code).
 *
 * Supports Anthropic and OpenAI APIs via ANTHROPIC_API_KEY / OPENAI_API_KEY.
 * In Claude Code, this is NOT used — the client handles sampling natively.
 */
export function createAgenticSamplingClient(): SamplingClient {
  return {
    async createMessage(params) {
      const anthropicKey = typeof Deno !== "undefined"
        ? Deno.env.get("ANTHROPIC_API_KEY")
        : undefined;
      const openaiKey = typeof Deno !== "undefined"
        ? Deno.env.get("OPENAI_API_KEY")
        : undefined;

      const maxTokens = params.maxTokens || 4096;
      const model = typeof Deno !== "undefined"
        ? Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-20250514"
        : "claude-sonnet-4-20250514";

      if (anthropicKey) {
        const body: Record<string, unknown> = {
          model,
          max_tokens: maxTokens,
          messages: params.messages,
        };

        if (params.tools && params.toolChoice !== "none") {
          body.tools = params.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema,
          }));
        }

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Anthropic API error: ${response.status} ${error}`);
        }

        const data = await response.json();
        return {
          content: data.content,
          stopReason: data.stop_reason === "end_turn" ? "end_turn" : "max_tokens",
        };
      }

      if (openaiKey) {
        const openaiModel = typeof Deno !== "undefined"
          ? Deno.env.get("OPENAI_MODEL") || "gpt-4.1"
          : "gpt-4.1";

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: openaiModel,
            max_tokens: maxTokens,
            messages: params.messages,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`OpenAI API error: ${response.status} ${error}`);
        }

        const data = await response.json();
        return {
          content: [{ type: "text", text: data.choices[0].message.content }],
          stopReason: data.choices[0].finish_reason === "stop"
            ? "end_turn"
            : "max_tokens",
        };
      }

      throw new Error(
        "[lib/plm] No LLM API key configured. " +
          "Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or use Claude Code (native sampling).",
      );
    },
  };
}

// =============================================================================
// Agent Tools (placeholder — will be populated when BOM tools are ready)
// =============================================================================

export const agentTools: PlmTool[] = [];
