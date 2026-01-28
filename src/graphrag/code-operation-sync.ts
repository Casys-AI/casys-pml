/**
 * Code Operation Embeddings Sync Service
 *
 * Synchronizes code operation embeddings to the tool_embedding table.
 * Uses checksums for change detection and auto-bootstrap on startup.
 *
 * @module graphrag/code-operation-sync
 */

import * as log from "@std/log";
import type { DbClient } from "../db/types.ts";
import { OPERATION_DESCRIPTIONS } from "../capabilities/operation-descriptions.ts";
import { EmbeddingModel } from "../vector/embeddings.ts";

/**
 * Config key for storing operation descriptions checksum
 */
const CHECKSUM_CONFIG_KEY = "code_operations_checksum";

/**
 * Sync result with statistics
 */
export interface CodeOperationSyncResult {
  success: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  error?: string;
}

/**
 * Compute checksum of operation descriptions for change detection
 */
function computeChecksum(): string {
  // Include all fields that affect embeddings
  const data = OPERATION_DESCRIPTIONS.map((op) => ({
    id: op.toolId,
    desc: op.description,
    cat: op.category,
  }));

  // Simple hash based on JSON string
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `v1_${Math.abs(hash).toString(16)}_${OPERATION_DESCRIPTIONS.length}`;
}

/**
 * Code Operation Embeddings Sync Service
 *
 * Handles synchronization of code operation embeddings to the database.
 */
export class CodeOperationSyncService {
  constructor(private db: DbClient) {}

  /**
   * Get stored checksum from database
   */
  private async getStoredChecksum(): Promise<string | null> {
    try {
      const result = await this.db.queryOne(
        `SELECT value FROM config WHERE key = $1`,
        [CHECKSUM_CONFIG_KEY],
      );
      return result?.value as string || null;
    } catch {
      return null;
    }
  }

  /**
   * Store checksum in database
   */
  private async storeChecksum(checksum: string): Promise<void> {
    await this.db.query(
      `INSERT INTO config (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [CHECKSUM_CONFIG_KEY, checksum],
    );
  }

  /**
   * Sync code operation embeddings to database
   *
   * @param force Force sync even if checksum unchanged
   * @returns Sync result with statistics
   */
  async sync(force = false): Promise<CodeOperationSyncResult> {
    const currentChecksum = computeChecksum();

    try {
      // Check if sync needed
      if (!force) {
        const storedChecksum = await this.getStoredChecksum();
        if (storedChecksum === currentChecksum) {
          log.debug("[CodeOperationSync] Checksums match, skipping sync");
          return {
            success: true,
            inserted: 0,
            updated: 0,
            skipped: OPERATION_DESCRIPTIONS.length,
          };
        }
        log.info(`[CodeOperationSync] Checksum changed: ${storedChecksum} → ${currentChecksum}`);
      }

      log.info(`[CodeOperationSync] Syncing ${OPERATION_DESCRIPTIONS.length} code operations...`);

      // Load embedding model
      const embeddingModel = new EmbeddingModel();
      await embeddingModel.load();

      let inserted = 0;
      let updated = 0;
      let skipped = 0;

      try {
        for (const operation of OPERATION_DESCRIPTIONS) {
          try {
            // Generate embedding from description
            const embedding = await embeddingModel.encode(operation.description);

            // Metadata object (driver will serialize for JSONB)
            const metadata = {
              description: operation.description,
              category: operation.category,
              source: "pure_operations",
            };

            // Check if exists
            const existing = await this.db.query(
              `SELECT tool_id FROM tool_embedding WHERE tool_id = $1`,
              [operation.toolId],
            );

            if (existing.length > 0) {
              // Update existing
              await this.db.query(
                `UPDATE tool_embedding
                 SET embedding = $1::vector,
                     tool_name = $2,
                     metadata = $3,
                     created_at = NOW()
                 WHERE tool_id = $4`,
                [
                  `[${embedding.join(",")}]`,
                  operation.name,
                  metadata,
                  operation.toolId,
                ],
              );
              updated++;
            } else {
              // Insert new - extract server_id from toolId prefix (e.g., "code:filter" -> "code", "loop:for" -> "loop")
              const serverId = operation.toolId.split(":")[0] || "code";
              await this.db.query(
                `INSERT INTO tool_embedding (tool_id, server_id, tool_name, embedding, metadata, created_at)
                 VALUES ($1, $2, $3, $4::vector, $5, NOW())`,
                [
                  operation.toolId,
                  serverId,
                  operation.name,
                  `[${embedding.join(",")}]`,
                  metadata,
                ],
              );
              inserted++;
            }
          } catch (error) {
            log.warn(`[CodeOperationSync] Failed to process ${operation.toolId}: ${error}`);
            skipped++;
          }
        }

        // Store new checksum
        await this.storeChecksum(currentChecksum);

        log.info(
          `[CodeOperationSync] Sync complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped`,
        );

        return { success: true, inserted, updated, skipped };
      } finally {
        await embeddingModel.dispose();
      }
    } catch (error) {
      log.error(`[CodeOperationSync] Sync failed: ${error}`);
      return {
        success: false,
        inserted: 0,
        updated: 0,
        skipped: 0,
        error: String(error),
      };
    }
  }

  /**
   * Bootstrap code operations if none exist
   *
   * Called at startup to ensure code operations are seeded.
   * Only syncs if no code:* entries exist in tool_embedding.
   *
   * @returns true if bootstrap was performed
   */
  async bootstrapIfEmpty(): Promise<boolean> {
    try {
      // Check if any code/loop operations exist
      const result = await this.db.query(
        `SELECT COUNT(*) as count FROM tool_embedding WHERE tool_id LIKE 'code:%' OR tool_id LIKE 'loop:%'`,
      );
      const count = Number(result[0]?.count ?? 0);

      if (count > 0) {
        log.debug(`[CodeOperationSync] ${count} code/loop operations already exist, checking for updates...`);
        // Still check for updates (new operations added to source)
        const syncResult = await this.sync(false);
        return syncResult.inserted > 0;
      }

      log.info("[CodeOperationSync] No code/loop operations found, bootstrapping...");
      const syncResult = await this.sync(true);
      return syncResult.success && syncResult.inserted > 0;
    } catch (error) {
      log.warn(`[CodeOperationSync] Bootstrap check failed: ${error}`);
      return false;
    }
  }
}
