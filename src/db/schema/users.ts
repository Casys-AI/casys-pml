
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubId: text("github_id").unique(),
  username: text("username").notNull(),
  email: text("email"),
  role: text("role").default("user"),
  // Security: Store Argon2 hash of the API key
  apiKeyHash: text("api_key_hash"),
  // Optimization: Store prefix (e.g. "ac_1234...") for O(1) lookup
  apiKeyPrefix: text("api_key_prefix").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
