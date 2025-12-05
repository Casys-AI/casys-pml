#!/usr/bin/env -S deno run -A --watch=static/,routes/,islands/,components/
/**
 * Fresh 2.x Development Server
 */

import { Builder } from "fresh/dev";
import { tailwind } from "@fresh/plugin-tailwind";

const builder = new Builder();
tailwind(builder);

if (Deno.args.includes("build")) {
  await builder.build(async () => (await import("./main.ts")).app);
} else {
  const port = parseInt(Deno.env.get("FRESH_PORT") || "8080");
  console.log(`\n🍋 Fresh dashboard: http://localhost:${port}/dashboard`);
  console.log(`📊 API: http://localhost:3003\n`);
  await builder.listen(async () => (await import("./main.ts")).app, { port });
}
