#!/usr/bin/env -S deno run -A --watch=static/,routes/,islands/
/**
 * Fresh 2.x Development Server
 *
 * Handles both dev mode and build commands
 */

import { Builder } from "fresh/dev";

const builder = new Builder();

if (Deno.args.includes("build")) {
  await builder.build(async () => (await import("./main.ts")).app);
} else {
  const port = parseInt(Deno.env.get("FRESH_PORT") || "8080");
  console.log(`\n🍋 Fresh dashboard starting on http://localhost:${port}/dashboard`);
  console.log(`📊 API endpoint: http://localhost:3001\n`);
  await builder.listen(async () => (await import("./main.ts")).app, { port });
}
