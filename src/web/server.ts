/**
 * Fresh Server Integration
 *
 * This module provides a function to render Fresh routes for integration
 * with the AgentCards gateway server.
 */

import { createHandler, type FreshContext } from "$fresh/server.ts";
import manifest from "./fresh.gen.ts";
import config from "./fresh.config.ts";

const handler = await createHandler(manifest, config);

/**
 * Handle a request using Fresh framework
 */
export async function handleFreshRequest(req: Request): Promise<Response> {
  return await handler(req);
}
