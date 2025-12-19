/**
 * Database tools - SQL and NoSQL database access
 *
 * @module lib/std/tools/database
 */

import { runCommand, type MiniTool } from "./common.ts";

export const databaseTools: MiniTool[] = [
  {
    name: "sqlite_query",
    description: "Execute SQLite query",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        database: { type: "string", description: "Database file path" },
        query: { type: "string", description: "SQL query" },
        mode: { type: "string", enum: ["json", "csv", "table", "line"], description: "Output mode" },
      },
      required: ["database", "query"],
    },
    handler: async ({ database, query, mode = "json" }) => {
      const args = [database as string, "-cmd", `.mode ${mode}`, query as string];

      const result = await runCommand("sqlite3", args);
      if (result.code !== 0) {
        throw new Error(`sqlite3 failed: ${result.stderr}`);
      }

      if (mode === "json") {
        try {
          return { results: JSON.parse(result.stdout || "[]") };
        } catch {
          return { output: result.stdout };
        }
      }
      return { output: result.stdout };
    },
  },
  {
    name: "psql_query",
    description: "Execute PostgreSQL query",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Database host" },
        port: { type: "number", description: "Port (default: 5432)" },
        database: { type: "string", description: "Database name" },
        user: { type: "string", description: "Username" },
        query: { type: "string", description: "SQL query" },
      },
      required: ["database", "query"],
    },
    handler: async ({ host = "localhost", port = 5432, database, user, query }) => {
      const args = ["-h", host as string, "-p", String(port), "-d", database as string];
      if (user) args.push("-U", user as string);
      args.push("-t", "-A", "-c", query as string);

      const result = await runCommand("psql", args);
      if (result.code !== 0) {
        throw new Error(`psql failed: ${result.stderr}`);
      }
      return { output: result.stdout.trim() };
    },
  },
  {
    name: "redis_cli",
    description: "Execute Redis command",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Redis host (default: localhost)" },
        port: { type: "number", description: "Redis port (default: 6379)" },
        command: { type: "string", description: "Redis command" },
        database: { type: "number", description: "Database number" },
      },
      required: ["command"],
    },
    handler: async ({ host = "localhost", port = 6379, command, database }) => {
      const args = ["-h", host as string, "-p", String(port)];
      if (database !== undefined) args.push("-n", String(database));
      args.push(...(command as string).split(" "));

      const result = await runCommand("redis-cli", args);
      if (result.code !== 0) {
        throw new Error(`redis-cli failed: ${result.stderr}`);
      }
      return { result: result.stdout.trim() };
    },
  },
];
