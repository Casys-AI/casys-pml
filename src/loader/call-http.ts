/**
 * HTTP MCP Dependency Caller
 *
 * Standalone function for calling HTTP-type MCP dependencies.
 * Extracted from CapabilityLoader for testability.
 *
 * @module loader/call-http
 */

import { resolveEnvHeaders } from "../byok/env-loader.ts";
import { LoaderError } from "./types.ts";

/**
 * Call an HTTP-type MCP dependency via direct fetch().
 *
 * Resolves env var references in headers (fail-fast if missing),
 * sends a JSON-RPC-style POST request, and returns the result.
 *
 * @param url - HTTP endpoint URL
 * @param namespace - MCP namespace (e.g., "tavily")
 * @param action - Action name (e.g., "search")
 * @param args - Tool arguments
 * @param httpHeaders - Header template with optional `${VAR}` references
 * @returns The result from the HTTP endpoint
 * @throws LoaderError on missing URL, HTTP errors, or RPC errors
 */
export async function callHttp(
  url: string,
  namespace: string,
  action: string,
  args: unknown,
  httpHeaders: Record<string, string> = {},
): Promise<unknown> {
  // Resolve env var references in headers (fail-fast if missing)
  const headers = resolveEnvHeaders(httpHeaders);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      method: `${namespace}:${action}`,
      params: args,
    }),
  });

  if (!response.ok) {
    throw new LoaderError(
      "HTTP_CALL_FAILED",
      `HTTP dep ${namespace} returned ${response.status}: ${response.statusText}`,
      { namespace, action, status: response.status },
    );
  }

  const data = await response.json();

  if (data.error) {
    throw new LoaderError(
      "HTTP_CALL_FAILED",
      `HTTP dep ${namespace} RPC error: ${data.error.message ?? JSON.stringify(data.error)}`,
      { namespace, action, error: data.error },
    );
  }

  return data.result;
}
