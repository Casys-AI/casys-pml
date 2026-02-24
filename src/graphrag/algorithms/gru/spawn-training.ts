/**
 * Spawn GRU Training Subprocess
 *
 * Runs GRU training in a separate Node.js process (lib/gru uses tfjs-node).
 * Same IPC pattern as SHGAT spawn-training: temp file input, stdout JSON result.
 *
 * @module graphrag/algorithms/gru/spawn-training
 */

import * as log from "@std/log";
import type { SpawnGRUTrainingInput, SpawnGRUTrainingResult } from "./types.ts";

/**
 * Spawn GRU training in a subprocess.
 *
 * The worker (lib/gru/src/train-worker-prod.ts) runs under Node.js:
 * 1. Reads training data from temp file
 * 2. Loads existing weights (from file or DB)
 * 3. Trains incrementally (few epochs)
 * 4. Saves weights to DB (gru_params table)
 * 5. Outputs lightweight JSON status to stdout
 */
export async function spawnGRUTraining(
  input: SpawnGRUTrainingInput,
): Promise<SpawnGRUTrainingResult> {
  const workerPath = new URL(
    "../../../../lib/gru/src/train-worker-prod.ts",
    import.meta.url,
  ).pathname;

  log.info(`[GRU] Spawning training subprocess with ${input.examples.length} examples...`);

  const inputData = {
    examples: input.examples,
    toolEmbeddings: input.toolEmbeddings,
    capabilityData: input.capabilityData,
    testExamples: input.testExamples,
    evalEvery: input.evalEvery,
    existingWeightsPath: input.existingWeightsPath,
    config: {
      epochs: input.epochs ?? 10,
      learningRate: input.learningRate ?? 0.001,
    },
  };

  // Use temp file for IPC (same pattern as SHGAT — avoids pipe blocking)
  const tempFile = await Deno.makeTempFile({ prefix: "gru-", suffix: ".json" });
  await Deno.writeTextFile(tempFile, JSON.stringify(inputData));
  log.info(`[GRU] Wrote training data to ${tempFile}`);

  // Node.js with tsx for TypeScript support
  const command = new Deno.Command("npx", {
    args: ["tsx", workerPath, tempFile],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
    cwd: new URL("../../../../lib/gru", import.meta.url).pathname,
  });

  const process = command.spawn();
  const decoder = new TextDecoder();

  // Collect stdout
  const stdoutChunks: Uint8Array[] = [];
  const stdoutReader = process.stdout.getReader();
  const stdoutPromise = (async () => {
    try {
      while (true) {
        const { done, value } = await stdoutReader.read();
        if (done) break;
        stdoutChunks.push(value);
      }
    } catch {
      // Ignore read errors on close
    }
  })();

  // Stream stderr for progress logs
  const stderrChunks: Uint8Array[] = [];
  const stderrReader = process.stderr.getReader();
  const stderrPromise = (async () => {
    try {
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;
        stderrChunks.push(value);
        const text = decoder.decode(value).trim();
        if (text) {
          for (const line of text.split("\n")) {
            if (line.trim()) log.info(`[GRU Worker] ${line.trim()}`);
          }
        }
      }
    } catch {
      // Ignore read errors on close
    }
  })();

  await Promise.all([stdoutPromise, stderrPromise]);
  const status = await process.status;

  // Cleanup temp file
  try {
    await Deno.remove(tempFile);
  } catch {
    // Best effort
  }

  if (!status.success) {
    const stderrBytes = concatUint8Arrays(stderrChunks);
    const stderr = decoder.decode(stderrBytes);

    const stdoutBytes = concatUint8Arrays(stdoutChunks);
    const stdout = decoder.decode(stdoutBytes).trim();

    let errorMsg = `Exit code: ${status.code}`;
    if (stdout) {
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.error) errorMsg = parsed.error;
      } catch {
        errorMsg = stderr || stdout;
      }
    } else {
      errorMsg = stderr || errorMsg;
    }

    log.error(`[GRU] Training subprocess failed (code=${status.code}): ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  // Parse result
  const stdoutBytes = concatUint8Arrays(stdoutChunks);
  const stdout = decoder.decode(stdoutBytes).trim();

  try {
    const result = JSON.parse(stdout) as {
      success: boolean;
      finalLoss?: number;
      finalAccuracy?: number;
      weightsFile?: string;
      error?: string;
    };

    if (!result.success) {
      return { success: false, error: result.error ?? "Unknown error" };
    }

    // Read weights from temp file and save to DB (Deno side)
    let savedToDb = false;
    if (result.weightsFile) {
      const databaseUrl = input.databaseUrl || Deno.env.get("DATABASE_URL");
      if (databaseUrl) {
        try {
          const weightsRaw = await Deno.readTextFile(result.weightsFile);
          // Parse to object so postgres.js serializes as JSONB object (not scalar string)
          const weightsObj = JSON.parse(weightsRaw);
          const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
          const sql = postgres(databaseUrl);
          const metrics = { loss: result.finalLoss, nextToolAccuracy: result.finalAccuracy };
          const config = inputData.config;
          await sql`
            INSERT INTO gru_params (user_id, params, config, metrics)
            VALUES ('local', ${sql.json(weightsObj)}, ${sql.json(config)}, ${sql.json(metrics)})
            ON CONFLICT (user_id) DO UPDATE SET
              params = ${sql.json(weightsObj)},
              config = ${sql.json(config)},
              metrics = ${sql.json(metrics)},
              updated_at = NOW()
          `;
          await sql.end();
          savedToDb = true;
          log.info("[GRU] Weights saved to DB");
        } catch (e) {
          log.error(`[GRU] Failed to save weights to DB: ${e}`);
        }
      }
      // Cleanup weights file
      try { await Deno.remove(result.weightsFile); } catch { /* best effort */ }
    }

    log.info(
      `[GRU] Training complete: loss=${result.finalLoss?.toFixed(4)}, accuracy=${result.finalAccuracy?.toFixed(2)}${savedToDb ? " (saved to DB)" : ""}`,
    );

    return {
      success: true,
      finalLoss: result.finalLoss,
      finalAccuracy: result.finalAccuracy,
      savedToDb,
    };
  } catch (e) {
    log.error(`[GRU] Failed to parse training result: ${e}`);
    return { success: false, error: `Failed to parse result: ${stdout}` };
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
