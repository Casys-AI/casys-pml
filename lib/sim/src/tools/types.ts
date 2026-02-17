/**
 * Tool type definitions for lib/sim
 *
 * Same pattern as lib/plm — PlmTool-style interface.
 *
 * @module lib/sim/tools/types
 */

/** Sim tool category identifier */
export type SimToolCategory = "constraint";

/** Sim tool handler function type */
export type SimToolHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

/** Sim tool definition with handler */
export interface SimTool {
  name: string;
  description: string;
  category: SimToolCategory;
  inputSchema: Record<string, unknown>;
  handler: SimToolHandler;
  _meta?: {
    ui?: {
      resourceUri: string;
    };
  };
}
