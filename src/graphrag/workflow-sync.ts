/**
 * Workflow Templates Sync Service (Story 5.2)
 *
 * Synchronizes workflow templates from YAML to the tool_dependency table.
 * Supports checksums for change detection and auto-bootstrap on empty graph.
 *
 * @module graphrag/workflow-sync
 */

import * as log from "@std/log";
import type { PGliteClient } from "../db/client.ts";
import { WorkflowLoader, type WorkflowEdge } from "./workflow-loader.ts";

/**
 * Config key for storing workflow file checksum in adaptive_config table
 */
const CHECKSUM_CONFIG_KEY = "workflow_templates_checksum";

/**
 * Sync result with statistics
 */
export interface SyncResult {
  success: boolean;
  edgesCreated: number;
  edgesUpdated: number;
  workflowsProcessed: number;
  warnings: string[];
  error?: string;
}

/**
 * Workflow Templates Sync Service
 *
 * Handles synchronization of YAML workflow templates to the database.
 */
export class WorkflowSyncService {
  private loader: WorkflowLoader;

  constructor(private db: PGliteClient) {
    this.loader = new WorkflowLoader();
  }

  /**
   * Sync workflow templates from YAML to database (AC #2, #3)
   *
   * Converts workflow steps to edges and upserts to tool_dependency table
   * with source='user' marker.
   *
   * @param yamlPath - Path to workflow templates YAML file
   * @param force - Force sync even if checksum unchanged
   * @returns Sync result with statistics
   */
  async sync(yamlPath: string, force: boolean = false): Promise<SyncResult> {
    log.info(`[WorkflowSync] Starting sync from: ${yamlPath} (force=${force})`);

    try {
      // 1. Check if sync is needed (checksum comparison)
      if (!force) {
        const needsSync = await this.needsSync(yamlPath);
        if (!needsSync) {
          log.info("[WorkflowSync] File unchanged, skipping sync");
          return {
            success: true,
            edgesCreated: 0,
            edgesUpdated: 0,
            workflowsProcessed: 0,
            warnings: [],
          };
        }
      }

      // 2. Load and validate workflows
      const { validWorkflows, validationResults, edges } = await this.loader.loadAndProcess(yamlPath);

      // Collect warnings
      const warnings: string[] = [];
      for (const result of validationResults) {
        for (const warning of result.warnings) {
          warnings.push(warning);
        }
        for (const error of result.errors) {
          warnings.push(`[Error] ${error}`);
        }
      }

      if (validWorkflows.length === 0) {
        log.warn("[WorkflowSync] No valid workflows found");
        return {
          success: true,
          edgesCreated: 0,
          edgesUpdated: 0,
          workflowsProcessed: 0,
          warnings,
        };
      }

      // 3. Upsert edges to database
      const { created, updated } = await this.upsertEdges(edges);

      // 4. Store new checksum
      const newChecksum = await this.loader.calculateChecksum(yamlPath);
      await this.storeChecksum(newChecksum);

      log.info(
        `[WorkflowSync] Sync complete: ${created} created, ${updated} updated, ${validWorkflows.length} workflows`,
      );

      return {
        success: true,
        edgesCreated: created,
        edgesUpdated: updated,
        workflowsProcessed: validWorkflows.length,
        warnings,
      };
    } catch (error) {
      log.error(`[WorkflowSync] Sync failed: ${error}`);
      return {
        success: false,
        edgesCreated: 0,
        edgesUpdated: 0,
        workflowsProcessed: 0,
        warnings: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Upsert edges to tool_dependency table (AC #2, #3)
   *
   * - Sets source='user' for all edges (AC #3)
   * - Sets initial confidence=0.90 for user-defined patterns
   * - Preserves existing observed_count on upsert (AC: 2.4)
   */
  private async upsertEdges(edges: WorkflowEdge[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const edge of edges) {
      try {
        // Check if edge exists
        const existing = await this.db.queryOne(
          `SELECT observed_count FROM tool_dependency
           WHERE from_tool_id = $1 AND to_tool_id = $2`,
          [edge.from, edge.to],
        );

        if (existing) {
          // Update existing edge - preserve observed_count, update source and confidence
          await this.db.query(
            `UPDATE tool_dependency
             SET source = 'user',
                 confidence_score = GREATEST(confidence_score, 0.90),
                 last_observed = NOW()
             WHERE from_tool_id = $1 AND to_tool_id = $2`,
            [edge.from, edge.to],
          );
          updated++;
        } else {
          // Create new edge with source='user' and confidence=0.90
          await this.db.query(
            `INSERT INTO tool_dependency (from_tool_id, to_tool_id, observed_count, confidence_score, source)
             VALUES ($1, $2, 1, 0.90, 'user')`,
            [edge.from, edge.to],
          );
          created++;
        }
      } catch (error) {
        log.warn(`[WorkflowSync] Failed to upsert edge ${edge.from} → ${edge.to}: ${error}`);
      }
    }

    return { created, updated };
  }

  /**
   * Check if sync is needed by comparing checksums (AC #4)
   */
  async needsSync(yamlPath: string): Promise<boolean> {
    try {
      const currentChecksum = await this.loader.calculateChecksum(yamlPath);
      if (!currentChecksum) {
        return false; // File doesn't exist
      }

      const storedChecksum = await this.getStoredChecksum();
      return currentChecksum !== storedChecksum;
    } catch {
      return true; // Error = assume sync needed
    }
  }

  /**
   * Get stored checksum from config table
   */
  private async getStoredChecksum(): Promise<string | null> {
    try {
      const result = await this.db.queryOne(
        `SELECT value as checksum FROM config WHERE key = $1`,
        [CHECKSUM_CONFIG_KEY],
      );
      return result?.checksum as string || null;
    } catch {
      return null;
    }
  }

  /**
   * Store checksum in adaptive_config table
   */
  private async storeChecksum(checksum: string): Promise<void> {
    // Use config_value as text (adaptive_config.config_value is REAL, so we use a workaround)
    // Actually, let's use the config table instead
    await this.db.query(
      `INSERT INTO config (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [CHECKSUM_CONFIG_KEY, checksum],
    );
  }

  /**
   * Check if graph is empty (0 edges) - for bootstrap detection (AC #6)
   */
  async isGraphEmpty(): Promise<boolean> {
    try {
      const result = await this.db.queryOne(
        `SELECT COUNT(*) as count FROM tool_dependency`,
      );
      return (result?.count as number) === 0;
    } catch {
      return true; // Error = assume empty
    }
  }

  /**
   * Auto-bootstrap if graph is empty and file exists (AC #6)
   *
   * @param yamlPath - Path to workflow templates YAML file
   * @returns true if bootstrap was performed
   */
  async bootstrapIfEmpty(yamlPath: string): Promise<boolean> {
    const isEmpty = await this.isGraphEmpty();
    if (!isEmpty) {
      log.debug("[WorkflowSync] Graph not empty, skipping bootstrap");
      return false;
    }

    // Check if file exists
    try {
      await Deno.stat(yamlPath);
    } catch {
      log.debug("[WorkflowSync] Workflow templates file not found, skipping bootstrap");
      return false;
    }

    log.info("[WorkflowSync] Bootstrapping graph from workflow-templates.yaml");
    const result = await this.sync(yamlPath, true);

    if (result.success && result.edgesCreated > 0) {
      log.info(`[WorkflowSync] Bootstrap complete: ${result.edgesCreated} edges created`);
      return true;
    }

    return false;
  }

  /**
   * Get statistics about user-defined vs learned edges
   */
  async getEdgeStats(): Promise<{ user: number; learned: number; total: number }> {
    try {
      const result = await this.db.query(
        `SELECT source, COUNT(*) as count FROM tool_dependency GROUP BY source`,
      );

      let user = 0;
      let learned = 0;

      for (const row of result) {
        if (row.source === "user") {
          user = row.count as number;
        } else {
          learned += row.count as number;
        }
      }

      return { user, learned, total: user + learned };
    } catch {
      return { user: 0, learned: 0, total: 0 };
    }
  }
}
