/**
 * SHGAT Hierarchy Builder
 *
 * Extracted helper for building multi-level hierarchy structures.
 *
 * @module shgat/core/hierarchy-builder
 */

import { getLogger } from "./logger.ts";
import type { LevelParams, SHGATConfig } from "./types.ts";
import {
  buildMultiLevelIncidence,
  computeHierarchyLevels,
  type GraphBuilder,
  type HierarchyResult,
  type MultiLevelIncidence,
} from "../graph/mod.ts";
import { initializeLevelParameters } from "../initialization/index.ts";

const log = getLogger();

// ==========================================================================
// Result Interface
// ==========================================================================

/**
 * Result of hierarchy rebuild
 */
export interface HierarchyBuildResult {
  hierarchy: HierarchyResult;
  multiLevelIncidence: MultiLevelIncidence;
  levelParams: Map<number, LevelParams>;
}

// ==========================================================================
// Empty Hierarchy
// ==========================================================================

/**
 * Create empty hierarchy structures for graphs with no capabilities
 */
export function createEmptyHierarchy(): HierarchyBuildResult {
  return {
    hierarchy: {
      hierarchyLevels: new Map(),
      maxHierarchyLevel: 0,
      capabilities: new Map(),
    },
    multiLevelIncidence: {
      toolToCapIncidence: new Map(),
      capToCapIncidence: new Map(),
      parentToChildIncidence: new Map(),
      capToToolIncidence: new Map(),
    },
    levelParams: new Map(),
  };
}

// ==========================================================================
// Hierarchy Builder
// ==========================================================================

/**
 * Rebuild multi-level hierarchy and incidence structures
 *
 * This function:
 * 1. Computes hierarchy levels from capability parents/children
 * 2. Updates hierarchyLevel on each capability node
 * 3. Builds multi-level incidence structure
 * 4. Initializes level parameters if needed
 *
 * @param config - SHGAT configuration
 * @param graphBuilder - Graph builder with registered nodes
 * @param existingLevelParams - Existing level params to preserve if possible
 * @returns HierarchyBuildResult with all structures
 */
export function rebuildHierarchy(
  config: SHGATConfig,
  graphBuilder: GraphBuilder,
  existingLevelParams: Map<number, LevelParams>,
): HierarchyBuildResult {
  const capabilityNodes = graphBuilder.getCapabilityNodes();

  // Handle empty graph
  if (capabilityNodes.size === 0) {
    return createEmptyHierarchy();
  }

  // 1. Compute hierarchy levels
  const hierarchy = computeHierarchyLevels(capabilityNodes);

  // 2. Update hierarchyLevel on each capability
  for (const [level, capIds] of hierarchy.hierarchyLevels) {
    for (const capId of capIds) {
      const cap = capabilityNodes.get(capId);
      if (cap) cap.hierarchyLevel = level;
    }
  }

  // 3. Build multi-level incidence structure
  const multiLevelIncidence = buildMultiLevelIncidence(capabilityNodes, hierarchy);

  // 4. Initialize level parameters if needed
  let levelParams = existingLevelParams;
  if (levelParams.size === 0 || levelParams.size <= hierarchy.maxHierarchyLevel) {
    levelParams = initializeLevelParameters(config, hierarchy.maxHierarchyLevel);
  }

  log.debug("[SHGAT] Rebuilt hierarchy", {
    maxLevel: hierarchy.maxHierarchyLevel,
    levels: Array.from(hierarchy.hierarchyLevels.keys()),
  });

  return {
    hierarchy,
    multiLevelIncidence,
    levelParams,
  };
}
