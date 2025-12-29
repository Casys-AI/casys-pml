/**
 * PML - Procedural Memory Layer
 *
 * Lightweight CLI package for installing and configuring PML.
 *
 * @module @casys/pml
 *
 * @example Install globally
 * ```bash
 * deno install -A -n pml jsr:@casys/pml
 * ```
 *
 * @example Initialize a project
 * ```bash
 * pml init
 * ```
 *
 * @example Start the server
 * ```bash
 * pml serve
 * ```
 */

export { main } from "./src/cli/mod.ts";
export { initProject } from "./src/init/mod.ts";
export type { PmlConfig, McpConfig } from "./src/types.ts";
