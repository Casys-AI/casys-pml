/**
 * Lead Analysis Store Port
 * 
 * Port for persisting and retrieving lead analysis snapshots.
 * Uses entities from @casys/core for type safety and domain consistency.
 */

import type { LeadSnapshot, LeadUnlockRecord } from '@casys/core';

/**
 * Parameters for saving a lead snapshot
 */
export interface SaveLeadSnapshotParams {
  snapshot: LeadSnapshot;
}

export interface LeadAnalysisStorePort {
  getByDomain(domain: string): Promise<LeadSnapshot | null>;
  getById(id: string): Promise<LeadSnapshot | null>;
  save(params: SaveLeadSnapshotParams): Promise<void>;
  upsertUnlock(record: LeadUnlockRecord): Promise<void>;
  findUnlockToken(domain: string, email: string): Promise<string | null>;
}
