
import { assertEquals, assertExists } from "@std/assert";
import { PGlite } from "@electric-sql/pglite";
import { createDrizzleClient } from "../../../src/db/drizzle.ts";
import { users } from "../../../src/db/schema/users.ts";
import { eq } from "drizzle-orm";


Deno.test("Drizzle + PGlite - create and query user", async () => {
  // Create in-memory PGlite
  const pglite = new PGlite("memory://");
  const db = createDrizzleClient(pglite);

  // Run migrations - using migrate() from drizzle-orm/pglite/migrator
  // Note: In a real app we would use the generated SQL files, but for this test
  // we might need to rely on push or effectively mocking the schema creation if we haven't generated migrations yet.
  // HOWEVER, preventing `drizzle-kit generate` from running during test means we need away to apply schema.
  // For unit tests, we can use `db.run` to create table manually matching schema or use `drizzle-kit push` logic if available.
  // Given we haven't run generation yet, let's manually create the table for this unit test to verify Drizzle client works.
  
  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      github_id TEXT UNIQUE,
      username TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'user',
      api_key_hash TEXT,
      api_key_prefix TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // Insert user
  const newUser = {
    id: crypto.randomUUID(),
    username: "testuser",
    githubId: "12345",
    email: "test@example.com",
    role: "user",
    apiKeyHash: null,
    apiKeyPrefix: null,
  };

  // We need to suppress TS error for missing default fields if we don't provide them, 
  // but Drizzle's inferInsert should handle optional fields.
  await db.insert(users).values(newUser);

  // Query user
  const result = await db.select().from(users).where(eq(users.id, newUser.id));

  assertEquals(result.length, 1);
  assertEquals(result[0].username, "testuser");
  assertEquals(result[0].githubId, "12345");
  assertExists(result[0].createdAt);

  // Cleanup
  await pglite.close();
});

Deno.test("Drizzle + PGlite - API key prefix lookup", async () => {
  const pglite = new PGlite("memory://");
  const db = createDrizzleClient(pglite);
  
  // Manually create schema for test (see above note)
  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      github_id TEXT UNIQUE,
      username TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'user',
      api_key_hash TEXT,
      api_key_prefix TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `);

  // Insert user with API key
  const newUser = {
    id: crypto.randomUUID(),
    username: "apiuser",
    apiKeyHash: "hashed_key_here",
    apiKeyPrefix: "ac_testpref",
    role: "user"
  };

  await db.insert(users).values(newUser);

  // Lookup by prefix
  const result = await db
    .select()
    .from(users)
    .where(eq(users.apiKeyPrefix, "ac_testpref"));

  assertEquals(result.length, 1);
  assertEquals(result[0].username, "apiuser");

  await pglite.close();
});
