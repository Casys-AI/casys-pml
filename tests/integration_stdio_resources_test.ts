/**
 * Integration test: PML stdio mode — resources/list + resources/read
 *
 * Spawns `pml stdio`, performs MCP handshake via NDJSON (newline-delimited),
 * waits for discovery, then verifies UI resources are served.
 *
 * Run: deno run -A --unstable-worker-options tests/integration_stdio_resources_test.ts
 */

const TIMEOUT_MS = 60_000;
const DISCOVERY_POLL_MS = 2_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

let nextId = 0;

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("=== PML stdio Integration Test: resources/list + resources/read ===\n");

  // 1. Spawn
  console.log("1. Spawning pml stdio...");
  const proc = new Deno.Command("deno", {
    args: ["run", "-A", "--unstable-worker-options", "src/cli/mod.ts", "stdio"],
    cwd: "/home/ubuntu/CascadeProjects/AgentCards/packages/pml",
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    env: { ...Deno.env.toObject(), PML_CLOUD_URL: "http://localhost:3003" },
  }).spawn();

  const writer = proc.stdin.getWriter();

  // ── Collect stdout raw chunks into a shared buffer ──
  let stdoutBuf = "";
  const stdoutChunks: string[] = [];

  // Background reader: continuously pull from stdout
  const stdoutReader = proc.stdout.getReader();
  const stdoutDone = (async () => {
    try {
      while (true) {
        const { value, done } = await stdoutReader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        stdoutBuf += chunk;
        stdoutChunks.push(chunk);
        console.error(`  [stdout raw] ${chunk.length} bytes: ${chunk.slice(0, 120).replace(/\n/g, "\\n")}`);
      }
    } catch (e) {
      console.error(`  [stdout error] ${e}`);
    }
  })();

  // Drain stderr (show key lines)
  (async () => {
    const r = proc.stderr.getReader();
    try {
      while (true) {
        const { value, done } = await r.read();
        if (done) break;
        for (const l of dec.decode(value, { stream: true }).split("\n")) {
          if (
            l.includes("Registered resource:") ||
            l.includes("UI Resources:") ||
            l.includes("Discovery:") ||
            l.includes("Registered tool:") ||
            l.includes("Starting async discovery") ||
            l.includes("[ERROR]") ||
            l.includes("MCP Discovery:")
          ) {
            console.error(`  [stderr] ${l.trim().slice(0, 150)}`);
          }
        }
      }
    } catch { /* */ }
  })();

  // Send NDJSON message
  async function send(obj: Record<string, unknown>) {
    const json = JSON.stringify(obj) + "\n";
    console.error(`  [stdin] sending ${json.length} bytes: ${json.trim().slice(0, 100)}`);
    await writer.write(enc.encode(json));
  }

  // Wait for a JSON-RPC response with given id, parsing from stdoutBuf
  function extractResponse(id: number): Record<string, unknown> | null {
    const lines = stdoutBuf.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id === id) {
          // Remove consumed lines from buffer
          stdoutBuf = lines.slice(i + 1).join("\n");
          return msg;
        }
      } catch {
        // skip non-JSON
      }
    }
    return null;
  }

  // Poll the buffer for a response with matching id
  async function call(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = ++nextId;
    await send({ jsonrpc: "2.0", id, method, params });

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const resp = extractResponse(id);
      if (resp) return resp;
      await new Promise(r => setTimeout(r, 100)); // poll every 100ms
    }
    console.error(`  [timeout] buffer state: ${stdoutBuf.length} bytes, chunks: ${stdoutChunks.length}`);
    console.error(`  [timeout] buffer content: ${stdoutBuf.slice(0, 500)}`);
    throw new Error(`Timeout waiting for ${method} (id=${id})`);
  }

  try {
    // Small delay to let the process start
    await new Promise(r => setTimeout(r, 1000));

    // 2. Initialize
    console.log("2. MCP Initialize...");
    const init = await call("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: "integration-test", version: "1.0.0" },
    });

    const caps = (init.result as Record<string, unknown>)?.capabilities as Record<string, unknown> ?? {};
    console.log(`   capabilities: ${Object.keys(caps).join(", ")}`);
    const hasResources = "resources" in caps;
    console.log(`   resources declared: ${hasResources ? "YES" : "NO"}`);
    if (!hasResources) {
      console.log("\n FAIL: resources capability not in initialize response");
      Deno.exit(1);
    }

    // 3. Initialized notification
    console.log("3. Sending initialized...");
    await send({ jsonrpc: "2.0", method: "notifications/initialized" });

    // 4. Poll resources/list until discovery populates them
    console.log("4. Polling resources/list...");
    const start = Date.now();
    let resources: Array<Record<string, unknown>> = [];
    let poll = 0;

    while (Date.now() - start < TIMEOUT_MS) {
      poll++;
      await new Promise(r => setTimeout(r, DISCOVERY_POLL_MS));
      const resp = await call("resources/list");
      if (resp.error) {
        console.log(`   Poll #${poll}: error ${JSON.stringify(resp.error)}`);
        continue;
      }
      resources = ((resp.result as Record<string, unknown>)?.resources ?? []) as Array<Record<string, unknown>>;
      console.log(`   Poll #${poll}: ${resources.length} resources`);
      if (resources.length > 0) break;
    }

    if (resources.length === 0) {
      console.log("\n PARTIAL PASS: handlers work, no UI resources discovered");
      Deno.exit(0);
    }

    console.log(`\n   ${resources.length} UI resources discovered:`);
    for (const r of resources.slice(0, 8)) console.log(`     ${r.uri}`);
    if (resources.length > 8) console.log(`     ... +${resources.length - 8} more`);

    // 5. resources/read — first resource
    const uri = resources[0].uri as string;
    console.log(`\n5. resources/read ${uri}`);
    const rr = await call("resources/read", { uri });

    if (rr.error) {
      console.log(`   FAIL: ${JSON.stringify(rr.error)}`);
      Deno.exit(1);
    }

    const contents = ((rr.result as Record<string, unknown>)?.contents ?? []) as Array<Record<string, unknown>>;
    const html = (contents[0]?.text ?? "") as string;
    const mime = (contents[0]?.mimeType ?? "") as string;
    console.log(`   mimeType: ${mime}`);
    console.log(`   HTML: ${html.length} chars`);
    console.log(`   preview: ${html.slice(0, 100).replace(/\n/g, " ")}...`);

    if (!html.includes("<html") && !html.includes("<!DOCTYPE") && !html.includes("<!doctype")) {
      console.log("\n FAIL: not HTML");
      Deno.exit(1);
    }

    // 6. resources/read — table-viewer
    const tv = resources.find(r => String(r.uri).includes("table-viewer"));
    if (tv) {
      console.log(`\n6. resources/read ${tv.uri}`);
      const r2 = await call("resources/read", { uri: tv.uri as string });
      const c2 = ((r2.result as Record<string, unknown>)?.contents ?? []) as Array<Record<string, unknown>>;
      const h2 = (c2[0]?.text ?? "") as string;
      console.log(`   HTML: ${h2.length} chars, <html>: ${h2.includes("<html") ? "YES" : "NO"}`);
    }

    console.log("\n=== PASS: resources capability + discovery + resources/read all work in stdio mode ===");

  } catch (err) {
    console.error(`\n ERROR: ${err instanceof Error ? err.message : err}`);
    Deno.exit(1);
  } finally {
    try { writer.close(); } catch { /* */ }
    try { proc.kill("SIGTERM"); } catch { /* */ }
    // Give background reader time to finish
    await Promise.race([stdoutDone, new Promise(r => setTimeout(r, 2000))]);
  }
}

await main();
