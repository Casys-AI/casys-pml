/**
 * Agent tools - LLM-powered decision and analysis via MCP Sampling
 *
 * Ces outils utilisent MCP Sampling pour déléguer des tâches à un LLM.
 * En Claude Code, le sampling est natif (zéro config).
 * En local/cloud, nécessite SAMPLING_PROVIDER + SAMPLING_API_KEY.
 *
 * @module lib/std/agent
 */

import type { MiniTool } from "./types.ts";

// =============================================================================
// Sampling Client Interface
// =============================================================================

/**
 * Interface pour le client de sampling MCP
 * Sera injecté par le serveur MCP au runtime
 */
interface SamplingClient {
  createMessage(params: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
    toolChoice?: "auto" | "required" | "none";
    maxTokens?: number;
  }): Promise<{
    content: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
    stopReason: "end_turn" | "tool_use" | "max_tokens";
  }>;
}

// Global sampling client - set by mcp-tools-server.ts at init
let _samplingClient: SamplingClient | null = null;

/**
 * Set the sampling client (called by mcp-tools-server.ts)
 */
export function setSamplingClient(client: SamplingClient): void {
  _samplingClient = client;
}

/**
 * Get the sampling client, throw if not available
 */
function getSamplingClient(): SamplingClient {
  if (!_samplingClient) {
    throw new Error(
      "Sampling client not available. " +
      "Configure SAMPLING_PROVIDER in mcp-servers.json or use Claude Code."
    );
  }
  return _samplingClient;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract text from sampling response
 */
function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter(c => c.type === "text" && c.text)
    .map(c => c.text!)
    .join("\n");
}

/**
 * Try to parse JSON from text, return text if parsing fails
 */
function tryParseJSON(text: string): unknown {
  // Try to find JSON in markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    return text;
  }
}

// =============================================================================
// Agent Tools
// =============================================================================

export const agentTools: MiniTool[] = [
  // -------------------------------------------------------------------------
  // agent_delegate - Full agentic loop with tool access
  // -------------------------------------------------------------------------
  {
    name: "agent_delegate",
    description: "Delegate a complex sub-task to an autonomous agent. The agent can make multiple decisions and call tools to accomplish the goal. Use for multi-step tasks requiring reasoning and tool use. Keywords: agent, delegate, autonomous, sub-task, agentic loop, multi-step.",
    category: "agent" as any,
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
          description: "Tool name patterns the agent can use (e.g., ['git_*', 'vfs_*'])"
        },
        maxIterations: {
          type: "number",
          description: "Maximum agentic loop iterations (default: 5)"
        },
      },
      required: ["goal"],
    },
    handler: async ({ goal, context, allowedTools, maxIterations = 5 }) => {
      const client = getSamplingClient();

      const systemPrompt = `You are an autonomous agent. Your goal: ${goal}

${context ? `Context:\n${JSON.stringify(context, null, 2)}` : ""}

${allowedTools ? `You may use these tools: ${(allowedTools as string[]).join(", ")}` : "You may use any available tools."}

Work step by step. When you have completed the goal, provide your final answer.`;

      const messages: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: systemPrompt }
      ];

      let iterations = 0;
      const toolCalls: string[] = [];

      while (iterations < (maxIterations as number)) {
        const response = await client.createMessage({
          messages,
          toolChoice: "auto",
          maxTokens: 4096,
        });

        if (response.stopReason === "end_turn") {
          return {
            success: true,
            result: extractText(response.content),
            iterations,
            toolCalls,
          };
        }

        if (response.stopReason === "tool_use") {
          // Extract tool calls
          const tools = response.content.filter(c => c.type === "tool_use");
          for (const tool of tools) {
            if (tool.name) toolCalls.push(tool.name);
          }

          // Add assistant response and tool results to messages
          messages.push({
            role: "assistant",
            content: JSON.stringify(response.content)
          });
          messages.push({
            role: "user",
            content: "[Tool results would be here - continue with your task]"
          });
        }

        iterations++;
      }

      return {
        success: false,
        error: `Exceeded max iterations (${maxIterations})`,
        iterations,
        toolCalls,
      };
    },
  },

  // -------------------------------------------------------------------------
  // agent_decide - Make a single decision
  // -------------------------------------------------------------------------
  {
    name: "agent_decide",
    description: "Ask an LLM to make a decision based on context. Returns a boolean or choice from options. Use for conditional branching based on complex criteria that can't be expressed in simple code. Keywords: decide, decision, condition, evaluate, branch, if-else, choose.",
    category: "agent" as any,
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The decision question (e.g., 'Should we retry this operation?')"
        },
        context: {
          type: "object",
          description: "Context data to help make the decision"
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Possible choices (if not provided, returns true/false)"
        },
      },
      required: ["question"],
    },
    handler: async ({ question, context, options }) => {
      const client = getSamplingClient();

      const optionsText = options
        ? `Choose ONE of: ${(options as string[]).join(", ")}`
        : "Answer with: true or false";

      const prompt = `${question}

${context ? `Context:\n${JSON.stringify(context, null, 2)}` : ""}

${optionsText}

Respond with ONLY your choice, no explanation.`;

      const response = await client.createMessage({
        messages: [{ role: "user", content: prompt }],
        maxTokens: 100,
      });

      const answer = extractText(response.content).trim().toLowerCase();

      if (options) {
        // Find matching option
        const match = (options as string[]).find(
          opt => answer.includes(opt.toLowerCase())
        );
        return {
          decision: match || answer,
          question: question as string,
        };
      } else {
        // Boolean decision
        const isTrue = answer.includes("true") || answer.includes("yes") || answer === "1";
        return {
          decision: isTrue,
          question: question as string,
        };
      }
    },
  },

  // -------------------------------------------------------------------------
  // agent_analyze - Analyze data and return insights
  // -------------------------------------------------------------------------
  {
    name: "agent_analyze",
    description: "Analyze data or content and return structured insights. Use for understanding patterns, identifying issues, or generating reports. Keywords: analyze, analysis, insights, patterns, review, examine, assess.",
    category: "agent" as any,
    inputSchema: {
      type: "object",
      properties: {
        data: {
          type: ["string", "object", "array"],
          description: "The data to analyze"
        },
        focus: {
          type: "string",
          description: "What aspect to focus on (e.g., 'security issues', 'performance')"
        },
        format: {
          type: "string",
          enum: ["text", "json", "markdown"],
          description: "Output format (default: json)"
        },
      },
      required: ["data"],
    },
    handler: async ({ data, focus, format = "json" }) => {
      const client = getSamplingClient();

      const dataStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);

      const prompt = `Analyze the following data${focus ? ` focusing on: ${focus}` : ""}:

${dataStr}

Provide your analysis in ${format} format.${format === "json" ? " Return valid JSON with keys: summary, findings, recommendations" : ""}`;

      const response = await client.createMessage({
        messages: [{ role: "user", content: prompt }],
        maxTokens: 2048,
      });

      const text = extractText(response.content);

      if (format === "json") {
        return tryParseJSON(text);
      }
      return { analysis: text };
    },
  },

  // -------------------------------------------------------------------------
  // agent_extract - Extract structured data from unstructured content
  // -------------------------------------------------------------------------
  {
    name: "agent_extract",
    description: "Extract structured data from unstructured text or content. Define a schema and the LLM will populate it. Keywords: extract, parse, structure, schema, entities, fields, data extraction.",
    category: "agent" as any,
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The unstructured content to extract from"
        },
        schema: {
          type: "object",
          description: "JSON schema describing the data to extract"
        },
        examples: {
          type: "array",
          items: { type: "object" },
          description: "Optional examples of expected output"
        },
      },
      required: ["content", "schema"],
    },
    handler: async ({ content, schema, examples }) => {
      const client = getSamplingClient();

      let prompt = `Extract data from the following content according to the schema:

Content:
${content}

Schema:
${JSON.stringify(schema, null, 2)}`;

      if (examples) {
        prompt += `\n\nExamples of expected output:\n${JSON.stringify(examples, null, 2)}`;
      }

      prompt += "\n\nRespond with ONLY valid JSON matching the schema.";

      const response = await client.createMessage({
        messages: [{ role: "user", content: prompt }],
        maxTokens: 2048,
      });

      return tryParseJSON(extractText(response.content));
    },
  },

  // -------------------------------------------------------------------------
  // agent_classify - Classify content into categories
  // -------------------------------------------------------------------------
  {
    name: "agent_classify",
    description: "Classify content into predefined categories. Returns the category and confidence. Keywords: classify, categorize, label, tag, type, sentiment, intent.",
    category: "agent" as any,
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The content to classify"
        },
        categories: {
          type: "array",
          items: { type: "string" },
          description: "List of possible categories"
        },
        multiLabel: {
          type: "boolean",
          description: "Allow multiple categories (default: false)"
        },
      },
      required: ["content", "categories"],
    },
    handler: async ({ content, categories, multiLabel = false }) => {
      const client = getSamplingClient();

      const prompt = `Classify the following content into ${multiLabel ? "one or more of" : "exactly one of"} these categories: ${(categories as string[]).join(", ")}

Content:
${content}

Respond with JSON: { "categories": [...], "confidence": 0.0-1.0, "reasoning": "..." }`;

      const response = await client.createMessage({
        messages: [{ role: "user", content: prompt }],
        maxTokens: 500,
      });

      return tryParseJSON(extractText(response.content));
    },
  },

  // -------------------------------------------------------------------------
  // agent_summarize - Summarize content
  // -------------------------------------------------------------------------
  {
    name: "agent_summarize",
    description: "Summarize long content into a shorter form. Control length and style. Keywords: summarize, summary, condense, brief, tldr, abstract, digest.",
    category: "agent" as any,
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The content to summarize"
        },
        maxLength: {
          type: "number",
          description: "Maximum length in words (default: 100)"
        },
        style: {
          type: "string",
          enum: ["bullet", "paragraph", "technical", "simple"],
          description: "Summary style (default: paragraph)"
        },
        focus: {
          type: "string",
          description: "Aspect to focus on in the summary"
        },
      },
      required: ["content"],
    },
    handler: async ({ content, maxLength = 100, style = "paragraph", focus }) => {
      const client = getSamplingClient();

      const styleInstr = {
        bullet: "Use bullet points",
        paragraph: "Write as a paragraph",
        technical: "Use technical language",
        simple: "Use simple, everyday language",
      }[style as string] || "Write as a paragraph";

      const prompt = `Summarize the following content in ${maxLength} words or less. ${styleInstr}.${focus ? ` Focus on: ${focus}` : ""}

Content:
${content}`;

      const response = await client.createMessage({
        messages: [{ role: "user", content: prompt }],
        maxTokens: Math.ceil((maxLength as number) * 2),
      });

      return {
        summary: extractText(response.content),
        style,
        maxLength,
      };
    },
  },

  // -------------------------------------------------------------------------
  // agent_generate - Generate content (code, text, etc.)
  // -------------------------------------------------------------------------
  {
    name: "agent_generate",
    description: "Generate content based on instructions. Can generate code, text, documentation, etc. Keywords: generate, create, write, compose, produce, synthesize.",
    category: "agent" as any,
    inputSchema: {
      type: "object",
      properties: {
        instructions: {
          type: "string",
          description: "What to generate"
        },
        type: {
          type: "string",
          enum: ["code", "text", "markdown", "json", "yaml"],
          description: "Type of content to generate (default: text)"
        },
        context: {
          type: "object",
          description: "Additional context for generation"
        },
        constraints: {
          type: "array",
          items: { type: "string" },
          description: "Constraints or requirements"
        },
      },
      required: ["instructions"],
    },
    handler: async ({ instructions, type = "text", context, constraints }) => {
      const client = getSamplingClient();

      let prompt = `${instructions}`;

      if (context) {
        prompt += `\n\nContext:\n${JSON.stringify(context, null, 2)}`;
      }

      if (constraints) {
        prompt += `\n\nConstraints:\n- ${(constraints as string[]).join("\n- ")}`;
      }

      prompt += `\n\nGenerate ${type} content.${type === "code" ? " Include only the code, no explanations." : ""}`;

      const response = await client.createMessage({
        messages: [{ role: "user", content: prompt }],
        maxTokens: 4096,
      });

      const text = extractText(response.content);

      // Try to extract code from markdown code blocks
      if (type === "code") {
        const codeMatch = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
        return {
          content: codeMatch ? codeMatch[1].trim() : text,
          type,
        };
      }

      if (type === "json" || type === "yaml") {
        return {
          content: type === "json" ? tryParseJSON(text) : text,
          type,
        };
      }

      return { content: text, type };
    },
  },

  // -------------------------------------------------------------------------
  // agent_compare - Compare items and determine winner/ranking
  // -------------------------------------------------------------------------
  {
    name: "agent_compare",
    description: "Compare multiple items and rank them or pick the best. Use for selecting between options based on criteria. Keywords: compare, rank, best, winner, evaluate, choose, select.",
    category: "agent" as any,
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: ["string", "object"] },
          description: "Items to compare"
        },
        criteria: {
          type: "array",
          items: { type: "string" },
          description: "Criteria for comparison"
        },
        mode: {
          type: "string",
          enum: ["best", "rank", "pros-cons"],
          description: "Comparison mode (default: best)"
        },
      },
      required: ["items"],
    },
    handler: async ({ items, criteria, mode = "best" }) => {
      const client = getSamplingClient();

      const itemsStr = (items as unknown[]).map((item, i) =>
        `${i + 1}. ${typeof item === "string" ? item : JSON.stringify(item)}`
      ).join("\n");

      const criteriaStr = criteria
        ? `Criteria: ${(criteria as string[]).join(", ")}`
        : "Use your best judgment";

      const modeInstr = {
        best: "Pick the single best option and explain why.",
        rank: "Rank all options from best to worst.",
        "pros-cons": "List pros and cons for each option.",
      }[mode as string];

      const prompt = `Compare these items:

${itemsStr}

${criteriaStr}

${modeInstr}

Respond with JSON: { "result": ..., "reasoning": "..." }`;

      const response = await client.createMessage({
        messages: [{ role: "user", content: prompt }],
        maxTokens: 1500,
      });

      return tryParseJSON(extractText(response.content));
    },
  },
];
