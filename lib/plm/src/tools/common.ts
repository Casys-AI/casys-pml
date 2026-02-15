/**
 * Common utilities for PLM tools
 *
 * @module lib/plm/tools/common
 */

import type { PlmTool } from "./types.ts";

export type { PlmTool };

/**
 * Run a command and return output
 */
export async function runCommand(
  cmd: string,
  args: string[],
  options?: { cwd?: string; timeout?: number },
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const command = new Deno.Command(cmd, {
      args,
      cwd: options?.cwd,
      stdout: "piped",
      stderr: "piped",
    });

    const timeoutMs = options?.timeout ?? 30000;
    const process = command.spawn();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        try {
          process.kill("SIGTERM");
        } catch { /* ignore */ }
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const output = await Promise.race([process.output(), timeoutPromise]);

    return {
      stdout: new TextDecoder().decode(output.stdout),
      stderr: new TextDecoder().decode(output.stderr),
      code: output.code,
    };
  } catch (e) {
    if ((e as Error).message?.includes("timed out")) {
      throw e;
    }
    throw new Error(`Failed to execute ${cmd}: ${(e as Error).message}`);
  }
}

/**
 * Change status lifecycle
 */
export type ChangeStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "implemented"
  | "closed";

/**
 * BOM level types
 */
export type BomLevel = "top" | "sub" | "component" | "raw_material";
