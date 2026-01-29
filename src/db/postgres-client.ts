/**
 * PostgreSQL Client for Cloud/Production Mode
 *
 * Provides the same interface as PGliteClient but uses real PostgreSQL.
 * Used when DATABASE_URL environment variable is set.
 *
 * Features:
 * - Connection pooling (built into postgres.js)
 * - SSL support for cloud databases
 * - Same interface as PGliteClient for seamless switching
 *
 * @module db/postgres-client
 */

import postgres from "postgres";
import * as log from "@std/log";
import type { DbClient, Row, Transaction } from "./types.ts";

// Re-export types for backward compatibility
export type { DbClient, Row, Transaction } from "./types.ts";

/** Cloud provider patterns for SSL detection */
const CLOUD_PROVIDERS = ["sslmode=require", "supabase", "neon", "railway"] as const;

/**
 * PostgreSQL client wrapper with same interface as PGliteClient
 *
 * Implements DbClient interface for compatibility.
 */
export class PostgresClient implements DbClient {
  private sql: ReturnType<typeof postgres> | null = null;
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  /**
   * Throw if database is not connected
   */
  private ensureConnected(): asserts this is { sql: ReturnType<typeof postgres> } {
    if (!this.sql) {
      throw new Error("Database not connected");
    }
  }

  /**
   * Check if params array has values
   */
  private hasParams(params?: unknown[]): params is unknown[] {
    return params !== undefined && params.length > 0;
  }

  /**
   * Detect if connection string is for a cloud provider
   */
  private isCloudProvider(): boolean {
    return CLOUD_PROVIDERS.some((pattern) => this.connectionString.includes(pattern));
  }

  /**
   * Initialize and connect to the database
   * Creates connection pool with SSL if needed
   */
  async connect(): Promise<void> {
    try {
      this.sql = postgres(this.connectionString, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
        ssl: this.isCloudProvider() ? "require" : false,
      });

      await this.sql`SELECT 1`;
      await this.sql`CREATE EXTENSION IF NOT EXISTS vector`;

      log.info("PostgreSQL connected (cloud mode)");
    } catch (error) {
      log.error(`Failed to connect to PostgreSQL: ${error}`);
      throw error;
    }
  }

  /**
   * Execute SQL statement without returning results
   */
  async exec(sql: string, params?: unknown[]): Promise<void> {
    this.ensureConnected();
    try {
      if (this.hasParams(params)) {
        await this.sql.unsafe(sql, params as any[]);
      } else {
        await this.sql.unsafe(sql);
      }
    } catch (error) {
      log.error(`SQL execution failed: ${error}`);
      throw error;
    }
  }

  /**
   * Execute query and return results
   */
  async query(sql: string, params?: unknown[]): Promise<Row[]> {
    this.ensureConnected();
    try {
      const result = this.hasParams(params)
        ? await this.sql.unsafe(sql, params as any[])
        : await this.sql.unsafe(sql);
      return result as unknown as Row[];
    } catch (error) {
      log.error(`SQL query failed: ${error}`);
      throw error;
    }
  }

  /**
   * Execute single row query, returns first row or null
   */
  async queryOne(sql: string, params?: unknown[]): Promise<Row | null> {
    const rows = await this.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Try to execute query, returns null on error (no logging)
   * Use for optional tables that may not exist
   */
  async tryQuery(sql: string, params?: unknown[]): Promise<Row[] | null> {
    if (!this.sql) {
      return null;
    }
    try {
      const result = this.hasParams(params)
        ? await this.sql.unsafe(sql, params as any[])
        : await this.sql.unsafe(sql);
      return result as unknown as Row[];
    } catch {
      return null;
    }
  }

  /**
   * Try to execute single row query, returns null on error (no logging)
   */
  async tryQueryOne(sql: string, params?: unknown[]): Promise<Row | null> {
    const rows = await this.tryQuery(sql, params);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  /**
   * Run a transaction
   */
  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    this.ensureConnected();

    const result = await this.sql.begin(async (sqlTx) => {
      const tx: Transaction = {
        exec: async (sql: string, params?: unknown[]) => {
          if (this.hasParams(params)) {
            await sqlTx.unsafe(sql, params as any[]);
          } else {
            await sqlTx.unsafe(sql);
          }
        },
        query: async (sql: string, params?: unknown[]) => {
          const queryResult = this.hasParams(params)
            ? await sqlTx.unsafe(sql, params as any[])
            : await sqlTx.unsafe(sql);
          return queryResult as unknown as Row[];
        },
      };

      return fn(tx);
    });
    return result as T;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.sql) {
      try {
        await this.sql.end();
      } catch (error) {
        log.error(`Error closing database: ${error}`);
      }
      this.sql = null;
      log.info("PostgreSQL connection closed");
    }
  }

  /**
   * Get database statistics
   */
  async stats(): Promise<{ tables: number; size: string }> {
    const tables = await this.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'",
    );

    const sizeResult = await this.query(
      "SELECT pg_size_pretty(pg_database_size(current_database())) as size",
    );

    return {
      tables: Number(tables[0]?.count) || 0,
      size: (sizeResult[0]?.size as string) || "unknown",
    };
  }
}

/**
 * Check if running in cloud mode (DATABASE_URL is set)
 */
export function isCloudDatabase(): boolean {
  return !!Deno.env.get("DATABASE_URL");
}

/**
 * Create a PostgreSQL client from DATABASE_URL
 *
 * @returns PostgresClient instance (call .connect() before use)
 * @throws Error if DATABASE_URL is not set
 */
export function createPostgresClient(): PostgresClient {
  const url = Deno.env.get("DATABASE_URL");
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required for cloud mode");
  }
  return new PostgresClient(url);
}
