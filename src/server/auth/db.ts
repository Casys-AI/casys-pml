/**
 * Database Access for Auth Operations
 *
 * Provides a shared Drizzle database instance for Fresh auth routes.
 * Uses the same DB path as API Server for data consistency.
 *
 * @module server/auth/db
 */

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { createDrizzleClient, type DrizzleDB, runDrizzleMigrations } from "../../db/drizzle.ts";
import { getAgentCardsDatabasePath } from "../../cli/utils.ts";

let db: DrizzleDB | null = null;
let pgliteInstance: PGlite | null = null;

/**
 * Get shared Drizzle database instance for auth operations
 * Lazily initializes on first call.
 * Uses same DB path as API server for data consistency.
 *
 * @returns Drizzle database instance
 */
export async function getDb(): Promise<DrizzleDB> {
  if (!db) {
    // Initialize PGlite with vector extension (consistent with src/db/client.ts)
    pgliteInstance = new PGlite(getAgentCardsDatabasePath(), {
      extensions: { vector },
    });
    db = createDrizzleClient(pgliteInstance);
    await runDrizzleMigrations(db);
  }
  return db;
}

/**
 * Close database connection (for graceful shutdown)
 */
export async function closeDb(): Promise<void> {
  if (pgliteInstance) {
    await pgliteInstance.close();
    pgliteInstance = null;
    db = null;
  }
}

/**
 * Get raw PGlite instance for SQL queries
 * Used by admin analytics which needs complex aggregations.
 * Returns a DbClient-compatible interface.
 */
export async function getRawDb(): Promise<{
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  queryOne: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
}> {
  // Ensure DB is initialized
  await getDb();

  if (!pgliteInstance) {
    throw new Error("Database not initialized");
  }

  const pg = pgliteInstance;

  return {
    async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
      const result = params && params.length > 0
        ? await (pg as any).query(sql, params)
        : await (pg as any).query(sql);
      return result.rows as T[];
    },
    async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
      const rows = await this.query<T>(sql, params);
      return rows[0] || null;
    },
  };
}
