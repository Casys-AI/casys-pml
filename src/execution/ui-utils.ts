/**
 * UI Utilities for Sandbox Executor
 *
 * Helper functions for extracting and processing UI metadata
 * from MCP tool responses.
 *
 * @module execution/ui-utils
 */

/**
 * UI metadata extracted from MCP tool response.
 */
export interface ExtractedUiMeta {
  /** URI of the UI resource */
  resourceUri: string;
  /** Optional context data for the UI */
  context?: Record<string, unknown>;
}

/**
 * Shape of result containing `_meta.ui` from MCP tool responses.
 */
interface ResultWithUiMeta {
  _meta?: {
    ui?: {
      resourceUri?: string;
      context?: Record<string, unknown>;
    };
  };
}

/**
 * Type guard to check if a value is a non-null object.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/**
 * Extract UI metadata from tool result if present.
 * Safe extraction with optional chaining.
 *
 * @param result - Tool call result (may contain _meta.ui)
 * @returns UI metadata or null if not present
 *
 * @example
 * ```ts
 * const result = await toolCall();
 * const uiMeta = extractUiMeta(result);
 * if (uiMeta) {
 *   console.log("UI available at:", uiMeta.resourceUri);
 * }
 * ```
 */
/**
 * Parse MCP content envelope to extract the actual data payload.
 *
 * MCP tool results are wrapped: `{ content: [{ type: "text", text: "{...}" }], _meta: {...} }`.
 * This extracts the parsed data from `content[0].text`.
 * Returns the original value if it's not an MCP envelope.
 */
export function extractResultData(result: unknown): unknown {
  if (!isObject(result)) return result;
  const r = result as { content?: Array<{ type: string; text?: string }> };
  if (r.content) {
    for (const c of r.content) {
      if (c.type === "text" && c.text) {
        try {
          return JSON.parse(c.text);
        } catch {
          return c.text;
        }
      }
    }
  }
  return result;
}

export function extractUiMeta(result: unknown): ExtractedUiMeta | null {
  if (!isObject(result)) {
    return null;
  }

  const { _meta } = result as ResultWithUiMeta;
  const ui = _meta?.ui;

  if (!ui?.resourceUri) {
    return null;
  }

  return {
    resourceUri: ui.resourceUri,
    context: ui.context,
  };
}
