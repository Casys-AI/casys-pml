import { PGliteClient } from "../src/db/client.ts";
const db = new PGliteClient();
await db.initialize();
const rows = await db.query("SELECT server_id, name FROM tool_schema LIMIT 20");
console.log("Tools indexed:", rows.length);
rows.forEach((r) => console.log(" -", r.server_id + ":" + r.name));
await db.close();
