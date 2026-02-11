/**
 * Runtime adapter — Node.js implementation
 *
 * Implements the RuntimePort contract for Node.js.
 * Drop-in replacement for runtime.ts (Deno) — swapped by build script.
 *
 * @see runtime-types.ts for the port contract
 * @module lib/server/runtime.node
 */

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { RuntimePort, ServeOptions, ServeHandle, FetchHandler } from "./runtime-types.ts";

// Re-export types so consumers import from a single module
export type { ServeOptions, ServeHandle, FetchHandler } from "./runtime-types.ts";

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

/**
 * Start an HTTP server with a fetch-style handler.
 * Uses node:http with a Request/Response adapter (compatible with Hono).
 */
export function serve(options: ServeOptions, handler: FetchHandler): ServeHandle {
  const hostname = options.hostname ?? "0.0.0.0";

  const server = createServer(async (nodeReq, nodeRes) => {
    try {
      // Convert Node.js IncomingMessage → Web Request
      // Prefer Host header (correct behind reverse proxy) over bound hostname
      const host = nodeReq.headers.host ?? `${hostname}:${options.port}`;
      const url = `http://${host}${nodeReq.url ?? "/"}`;
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
      // Use raw header entries to preserve duplicate Set-Cookie headers
      const resHeaders: Record<string, string | string[]> = {};
      response.headers.forEach((value, key) => {
        const existing = resHeaders[key];
        if (existing !== undefined) {
          resHeaders[key] = Array.isArray(existing)
            ? [...existing, value]
            : [existing, value];
        } else {
          resHeaders[key] = value;
        }
      });
      nodeRes.writeHead(response.status, resHeaders);

      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          nodeRes.write(value);
        }
        nodeRes.end();
      } else {
        nodeRes.end();
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
  // In Node.js, setTimeout returns a Timeout object (not a numeric ID).
  // The caller passes it as `number` for Deno compat — we cast back.
  try {
    const timer = id as unknown as { unref?: () => void };
    if (typeof timer === "object" && timer && typeof timer.unref === "function") {
      timer.unref();
    }
  } catch (err) {
    console.warn("[runtime.node] Failed to unref timer:", err);
  }
}

/** Compile-time contract check — ensures this module satisfies RuntimePort */
void ({ env, readTextFile, serve, unrefTimer } satisfies RuntimePort);

// ─── Internal helpers ────────────────────────────────────

/** Collect request body from Node.js IncomingMessage */
function collectBody(req: import("node:http").IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    req.on("error", reject);
  });
}
