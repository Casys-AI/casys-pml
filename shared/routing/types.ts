/**
 * Shared routing types — tool routing contract.
 *
 * @module @casys/pml-types/routing
 */

/**
 * Where a tool executes: client machine or cloud server.
 */
export type ToolRouting = "client" | "server";

/**
 * Routing configuration synced from server to client.
 */
export interface RoutingConfig {
  /** Config version for cache invalidation */
  version: string;

  /** Tools that execute on client machine */
  clientTools: string[];

  /** Tools that execute on server */
  serverTools: string[];

  /** Default routing for unknown tools */
  defaultRouting: ToolRouting;
}
