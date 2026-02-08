/**
 * Runtime adapter — Node.js implementation
 *
 * Drop-in replacement for runtime.ts (Deno) when building for Node.js.
 * Uses node:fs, node:http, and process.env.
 *
 * @module lib/server/runtime.node
 */

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

/**
 * Get an environment variable.
 */
export function env(key: string): string | undefined {
  return process.env[key];
}

/**
 * Read a UTF-8 text file.
 * Returns null if the file does not exist.
 */
export async function readTextFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/** Options for starting an HTTP server */
export interface ServeOptions {
  port: number;
  hostname?: string;
  onListen?: (info: { hostname: string; port: number }) => void;
}

/** Handle returned by serve(), used to shut down the server */
export interface ServeHandle {
  shutdown(): Promise<void>;
}

/**
 * Start an HTTP server.
 *
 * Uses node:http with a fetch-style handler adapter.
 * Compatible with Hono's app.fetch.
 */
export function serve(
  options: ServeOptions,
  handler: (req: Request) => Response | Promise<Response>,
): ServeHandle {
  const hostname = options.hostname ?? "0.0.0.0";

  const server = createServer(async (nodeReq, nodeRes) => {
    try {
      // Convert Node.js IncomingMessage → Web Request
      const url = `http://${hostname}:${options.port}${nodeReq.url ?? "/"}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(nodeReq.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v);
          } else {
            headers.set(key, value);
          }
        }
      }

      const body = nodeReq.method !== "GET" && nodeReq.method !== "HEAD"
        ? await collectBody(nodeReq)
        : undefined;

      const request = new Request(url, {
        method: nodeReq.method ?? "GET",
        headers,
        body,
        // @ts-ignore: duplex needed for streaming requests in Node 20+
        duplex: body ? "half" : undefined,
      });

      // Call the fetch handler (Hono, etc.)
      const response = await handler(request);

      // Convert Web Response → Node.js ServerResponse
      nodeRes.writeHead(response.status, Object.fromEntries(response.headers));

      if (response.body) {
        const reader = response.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            nodeRes.write(value);
          }
          nodeRes.end();
        };
        await pump();
      } else {
        const text = await response.text();
        nodeRes.end(text);
      }
    } catch (err) {
      console.error("[runtime.node] Request handler error:", err);
      if (!nodeRes.headersSent) {
        nodeRes.writeHead(500);
        nodeRes.end("Internal Server Error");
      }
    }
  });

  server.listen(options.port, hostname, () => {
    if (options.onListen) {
      options.onListen({ hostname, port: options.port });
    }
  });

  return {
    shutdown: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/**
 * Unref a timer so it doesn't block process exit.
 */
export function unrefTimer(id: number): void {
  // In Node.js, setTimeout returns a Timeout object with .unref()
  // But when called with a numeric ID, we need the original reference.
  // The caller should pass the timer ID — in Node.js this is handled
  // by the Timeout object directly, so this is a compatibility shim.
  // Node.js timers auto-unref when using setTimeout with unref().
  try {
    // @ts-ignore: clearTimeout accepts number in some contexts
    const timer = id as unknown as { unref?: () => void };
    if (typeof timer === "object" && timer && typeof timer.unref === "function") {
      timer.unref();
    }
  } catch {
    // Best effort — timer unref is non-critical
  }
}

/** Collect request body from Node.js IncomingMessage */
function collectBody(req: import("node:http").IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    req.on("error", reject);
  });
}
