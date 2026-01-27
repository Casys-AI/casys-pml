/**
 * Navigation Store - Level-based navigation state management
 *
 * Uses Preact Signals for reactive state management.
 * NO module-level effects - persistence is handled by the App component.
 */

import { signal, computed } from '@preact/signals';

// Core navigation state
export const currentLevel = signal(0);
export const focusedNodeId = signal<string | null>(null);

// Max level in the current graph (updated by graph data)
export const maxLevel = signal(5);

// Computed: can zoom in/out
export const canZoomIn = computed(() => currentLevel.value < maxLevel.value);
export const canZoomOut = computed(() => currentLevel.value > 0);

// Computed: visible level range (window of 3 levels)
export const visibleLevelRange = computed(() => ({
  min: Math.max(0, currentLevel.value - 1),
  max: Math.min(maxLevel.value, currentLevel.value + 1),
}));

/**
 * Zoom into a specific node at a given level
 */
export function zoomIn(nodeId: string, level: number): void {
  focusedNodeId.value = nodeId;
  currentLevel.value = level;
}

/**
 * Zoom out one level
 */
export function zoomOut(): void {
  if (currentLevel.value > 0) {
    currentLevel.value = currentLevel.value - 1;
    focusedNodeId.value = null;
  }
}

/**
 * Navigate to a specific level
 */
export function navigateToLevel(level: number, nodeId?: string): void {
  if (level >= 0 && level <= maxLevel.value) {
    currentLevel.value = level;
    if (nodeId !== undefined) {
      focusedNodeId.value = nodeId;
    }
  }
}

/**
 * Reset navigation to initial state
 */
export function resetNavigation(): void {
  currentLevel.value = 0;
  focusedNodeId.value = null;
}

/**
 * Update max level from graph data
 */
export function setMaxLevel(level: number): void {
  maxLevel.value = level;
  if (currentLevel.value > level) {
    currentLevel.value = level;
  }
}
