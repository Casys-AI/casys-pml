
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema/index.ts";

/**
 * Create a Drizzle client instance from a PGlite connection
 * @param client PGlite client instance
 * @returns Drizzle database instance
 */
export function createDrizzleClient(client: PGlite) {
  // Cast to any to avoid private member mismatch between PGlite versions
  return drizzle(client as any, { schema });
}

export type DrizzleDB = ReturnType<typeof createDrizzleClient>;
