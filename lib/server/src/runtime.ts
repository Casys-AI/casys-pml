/**
 * Runtime adapter — Deno implementation
 *
 * Abstracts Deno-specific APIs so the library can run on both Deno and Node.js.
 * For Node.js, swap this file with runtime.node.ts via build script.
 *
 * @module lib/server/runtime
 */

/**
 * Get an environment variable.
 */
export function env(key: string): string | undefined {
  return Deno.env.get(key);
}

/**
 * Read a UTF-8 text file.
 * Returns null if the file does not exist.
 */
export async function readTextFile(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
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
 * @param options - Port, hostname, onListen callback
 * @param handler - Fetch-style request handler (Request → Response)
 * @returns A handle with a shutdown() method
 */
export function serve(
  options: ServeOptions,
  handler: (req: Request) => Response | Promise<Response>,
): ServeHandle {
  const server = Deno.serve(
    {
      port: options.port,
      hostname: options.hostname,
      onListen: options.onListen,
    },
    handler,
  );
  return {
    shutdown: () => server.shutdown(),
  };
}

/**
 * Unref a timer so it doesn't block process exit.
 */
export function unrefTimer(id: number): void {
  Deno.unrefTimer(id);
}
