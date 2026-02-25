/**
 * Lightweight MLflow REST API client.
 * Works in both Deno and Node.js (uses only global `fetch`).
 * All metric logging is fire-and-forget — never blocks training on tracking failure.
 * Auto-disables on connection failure (circuit breaker).
 *
 * @module mlflow/client
 */

export interface MLflowClientConfig {
  trackingUri: string;
  experimentName: string;
  runName?: string;
  tags?: Record<string, string>;
}

export class MLflowClient {
  private readonly baseUrl: string;
  private readonly experimentName: string;
  private readonly runName?: string;
  private readonly tags: Record<string, string>;
  private runId: string | null = null;
  private experimentId: string | null = null;
  private disabled = false;

  constructor(config: MLflowClientConfig) {
    this.baseUrl = config.trackingUri.replace(/\/$/, "");
    this.experimentName = config.experimentName;
    this.runName = config.runName;
    this.tags = config.tags ?? {};
  }

  private async post(endpoint: string, body: unknown): Promise<Record<string, unknown> | null> {
    if (this.disabled) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/2.0/mlflow${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[MLflow] ${endpoint} failed (${res.status}): ${text}`);
        return null;
      }
      return (await res.json()) as Record<string, unknown>;
    } catch (e) {
      console.error(`[MLflow] ${endpoint} error: ${e instanceof Error ? e.message : e}`);
      this.disabled = true;
      console.error("[MLflow] Tracking disabled for this run (connection failed)");
      return null;
    }
  }

  private async get(endpoint: string): Promise<Record<string, unknown> | null> {
    if (this.disabled) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/2.0/mlflow${endpoint}`, {
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as Record<string, unknown>;
    } catch (e) {
      console.error(`[MLflow] GET ${endpoint} error: ${e instanceof Error ? e.message : e}`);
      this.disabled = true;
      console.error("[MLflow] Tracking disabled for this run (connection failed)");
      return null;
    }
  }

  private async getOrCreateExperiment(): Promise<string | null> {
    if (this.experimentId) return this.experimentId;

    // Try existing experiment
    const existing = await this.get(
      `/experiments/get-by-name?experiment_name=${encodeURIComponent(this.experimentName)}`,
    );
    // deno-lint-ignore no-explicit-any
    const existingId = (existing as any)?.experiment?.experiment_id;
    if (existingId) {
      this.experimentId = existingId;
      return this.experimentId;
    }

    // Create new
    const created = await this.post("/experiments/create", { name: this.experimentName });
    // deno-lint-ignore no-explicit-any
    const createdId = (created as any)?.experiment_id;
    if (createdId) {
      this.experimentId = createdId;
      return this.experimentId;
    }

    return null;
  }

  /** Start a new run. Must be called before logging. Returns true if successful. */
  async startRun(params: Record<string, string>): Promise<boolean> {
    const experimentId = await this.getOrCreateExperiment();
    if (!experimentId) return false;

    const tags = Object.entries(this.tags).map(([key, value]) => ({ key, value }));

    const runBody: Record<string, unknown> = {
      experiment_id: experimentId,
      start_time: Date.now(),
      tags,
    };
    if (this.runName) runBody.run_name = this.runName;

    const result = await this.post("/runs/create", runBody);
    // deno-lint-ignore no-explicit-any
    const runId = (result as any)?.run?.info?.run_id;
    if (!runId) return false;

    this.runId = runId;

    // Log hyperparameters
    if (Object.keys(params).length > 0) {
      const paramList = Object.entries(params).map(([key, value]) => ({ key, value: String(value) }));
      await this.post("/runs/log-batch", {
        run_id: this.runId,
        params: paramList,
        metrics: [],
        tags: [],
      });
    }

    console.error(`[MLflow] Run started: ${this.runId} (experiment: ${this.experimentName})`);
    return true;
  }

  /** Log metrics for a given step (epoch). */
  async logMetrics(metrics: Record<string, number>, step: number): Promise<void> {
    if (!this.runId || this.disabled) return;

    const timestamp = Date.now();
    const metricList = Object.entries(metrics)
      .filter(([_, v]) => Number.isFinite(v))
      .map(([key, value]) => ({ key, value, timestamp, step }));

    if (metricList.length === 0) return;

    await this.post("/runs/log-batch", {
      run_id: this.runId,
      metrics: metricList,
      params: [],
      tags: [],
    });
  }

  /** End the run. Await this to ensure clean closure. */
  async endRun(status: "FINISHED" | "FAILED" = "FINISHED"): Promise<void> {
    if (!this.runId || this.disabled) return;
    await this.post("/runs/update", {
      run_id: this.runId,
      status,
      end_time: Date.now(),
    });
    console.error(`[MLflow] Run ended: ${this.runId} (${status})`);
  }

  /** Get the current run ID (null if not started). */
  getRunId(): string | null {
    return this.runId;
  }

  // ─── Artifact Upload ──────────────────────────────────────────

  /** Upload an artifact to the current run via the MLflow artifacts proxy. */
  async uploadArtifact(artifactPath: string, content: string | Uint8Array): Promise<boolean> {
    if (!this.runId || this.disabled) return false;
    try {
      const body = typeof content === "string" ? new TextEncoder().encode(content) : content;
      const res = await fetch(
        `${this.baseUrl}/api/2.0/mlflow-artifacts/artifacts/${encodeURIComponent(artifactPath)}?run_uuid=${this.runId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body,
          signal: AbortSignal.timeout(30000), // 30s for large files
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[MLflow] Artifact upload failed (${res.status}): ${text}`);
        return false;
      }
      console.error(`[MLflow] Artifact uploaded: ${artifactPath} (${body.length} bytes)`);
      return true;
    } catch (e) {
      console.error(`[MLflow] Artifact upload error: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  // ─── Model Registry ───────────────────────────────────────────

  /** Register a model in the Model Registry. Idempotent — ignores RESOURCE_ALREADY_EXISTS. */
  async registerModel(name: string, description?: string): Promise<boolean> {
    if (this.disabled) return false;
    const body: Record<string, unknown> = { name };
    if (description) body.description = description;

    const result = await this.post("/registered-models/create", body);
    if (result) {
      console.error(`[MLflow] Model registered: ${name}`);
      return true;
    }
    // Already exists is fine — idempotent
    return true;
  }

  /**
   * Create a new model version linked to the current run.
   * Returns the version number string (e.g., "1", "2") or null on failure.
   */
  async createModelVersion(
    modelName: string,
    description?: string,
  ): Promise<string | null> {
    if (!this.runId || this.disabled) return null;

    const body: Record<string, unknown> = {
      name: modelName,
      source: `runs:/${this.runId}/artifacts`,
      run_id: this.runId,
    };
    if (description) body.description = description;

    const result = await this.post("/model-versions/create", body);
    // deno-lint-ignore no-explicit-any
    const version = (result as any)?.model_version?.version;
    if (version) {
      console.error(`[MLflow] Model version created: ${modelName} v${version}`);
      return String(version);
    }
    return null;
  }

  /** Set an alias (e.g., "production", "champion") on a model version. */
  async setModelAlias(modelName: string, alias: string, version: string): Promise<boolean> {
    if (this.disabled) return false;
    const result = await this.post("/registered-models/set-alias", {
      name: modelName,
      alias,
      version,
    });
    if (result !== null) {
      console.error(`[MLflow] Alias set: ${modelName}@${alias} → v${version}`);
      return true;
    }
    return false;
  }

  /**
   * End-to-end: upload summary artifact, register model, create version, set alias.
   * Call this after endRun() with the final metrics summary.
   */
  async publishModelVersion(
    modelName: string,
    summary: Record<string, unknown>,
    alias = "latest",
  ): Promise<string | null> {
    // Upload summary as artifact
    await this.uploadArtifact("summary.json", JSON.stringify(summary, null, 2));

    // Register model (idempotent)
    await this.registerModel(modelName);

    // Create version linked to this run
    const version = await this.createModelVersion(
      modelName,
      `Run ${this.runId} — ${new Date().toISOString().slice(0, 16)}`,
    );
    if (!version) return null;

    // Set alias
    await this.setModelAlias(modelName, alias, version);

    return version;
  }
}

/**
 * Create an MLflow client if trackingUri is provided.
 * Returns null if tracking is not configured — training proceeds without logging.
 */
export function createMLflowClient(
  trackingUri: string | undefined,
  experimentName: string,
  runName?: string,
  tags?: Record<string, string>,
): MLflowClient | null {
  if (!trackingUri) return null;
  return new MLflowClient({ trackingUri, experimentName, runName, tags });
}
