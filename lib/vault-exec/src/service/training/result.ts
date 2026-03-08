function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

async function ensureDir(path: string): Promise<void> {
  await Deno.mkdir(path, { recursive: true });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Deno.writeTextFile(path, JSON.stringify(value, null, 2));
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await Deno.readTextFile(path);
  return JSON.parse(raw) as T;
}

interface LiveTrainingResultManifest {
  version: 1;
  buildId: string;
  runId: string;
  createdAt: string;
  metrics: LiveTrainingMetrics;
  gruWeights: {
    fileName: string;
    vocabSize: number;
    epoch: number;
    accuracy: number;
  };
}

export interface LiveTrainingFailure {
  buildId: string;
  failedAt: string;
  error: string;
}

export interface LiveTrainingMetrics {
  runId: string;
  buildId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  gruWeightsSource: "loaded" | "initialized";
  epochs: number;
  exampleCount: number;
  vocabSize: number;
  avgLoss: number;
  accuracy: number;
  top3Accuracy: number;
  mrr: number;
  majorityNextBaseline: number;
}

export interface LiveTrainingResult {
  buildId: string;
  runId: string;
  createdAt: string;
  metrics: LiveTrainingMetrics;
  gruWeights: {
    bytes: Uint8Array;
    vocabSize: number;
    epoch: number;
    accuracy: number;
  };
}

export function isLiveTrainingResultForBuild(
  result: Pick<LiveTrainingResult, "buildId">,
  activeBuildId: string,
): boolean {
  return result.buildId === activeBuildId;
}

export async function writeLiveTrainingResult(
  resultDir: string,
  result: LiveTrainingResult,
): Promise<void> {
  await ensureDir(resultDir);
  await Deno.writeFile(
    joinPath(resultDir, "gru-weights.blob"),
    result.gruWeights.bytes,
  );
  await writeJson(joinPath(resultDir, "metrics.json"), result.metrics);
  await writeJson(joinPath(resultDir, "manifest.json"), {
    version: 1,
    buildId: result.buildId,
    runId: result.runId,
    createdAt: result.createdAt,
    metrics: result.metrics,
    gruWeights: {
      fileName: "gru-weights.blob",
      vocabSize: result.gruWeights.vocabSize,
      epoch: result.gruWeights.epoch,
      accuracy: result.gruWeights.accuracy,
    },
  } satisfies LiveTrainingResultManifest);
}

export async function readLiveTrainingResult(
  resultDir: string,
): Promise<LiveTrainingResult> {
  const manifest = await readJson<LiveTrainingResultManifest>(
    joinPath(resultDir, "manifest.json"),
  );
  const metrics = await readJson<LiveTrainingMetrics>(
    joinPath(resultDir, "metrics.json"),
  );

  return {
    buildId: manifest.buildId,
    runId: manifest.runId,
    createdAt: manifest.createdAt,
    metrics,
    gruWeights: {
      bytes: await Deno.readFile(
        joinPath(resultDir, manifest.gruWeights.fileName),
      ),
      vocabSize: manifest.gruWeights.vocabSize,
      epoch: manifest.gruWeights.epoch,
      accuracy: manifest.gruWeights.accuracy,
    },
  };
}

export async function writeLiveTrainingFailure(
  resultDir: string,
  failure: LiveTrainingFailure,
): Promise<void> {
  await ensureDir(resultDir);
  await writeJson(joinPath(resultDir, "failure.json"), failure);
}

export async function readLiveTrainingFailure(
  resultDir: string,
): Promise<LiveTrainingFailure | null> {
  try {
    return await readJson<LiveTrainingFailure>(joinPath(resultDir, "failure.json"));
  } catch {
    return null;
  }
}
