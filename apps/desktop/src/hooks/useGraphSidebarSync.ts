/**
 * useGraphSidebarSync - Bidirectional sync between graph camera and sidebar navigation
 *
 * Maps camera zoom level to semantic hierarchy level and vice versa.
 * Debounced to avoid jitter during rapid zoom changes.
 */

import { useEffect, useRef, useCallback } from 'preact/hooks';
import type { CameraState } from '../types';
import { currentLevel, navigateToLevel, maxLevel } from '../stores/navigation';

// Zoom thresholds for each semantic level
// level 0: zoom >= 1.0 (overview)
// level 1: zoom >= 1.5
// level 2: zoom >= 2.5
// level 3: zoom >= 4.0
// level 4: zoom >= 6.0
// level 5: zoom >= 8.0
export const ZOOM_THRESHOLDS = [1.0, 1.5, 2.5, 4.0, 6.0, 8.0] as const;

// Debounce delay in ms
const DEBOUNCE_MS = 100;

// Navigation lock duration - should match expected camera transition time
const NAVIGATION_LOCK_MS = 150;

/**
 * Map camera zoom to semantic level
 */
export function zoomToSemanticLevel(zoom: number): number {
  for (let i = ZOOM_THRESHOLDS.length - 1; i >= 0; i--) {
    if (zoom >= ZOOM_THRESHOLDS[i]) {
      return Math.min(i, maxLevel.value);
    }
  }
  return 0;
}

/**
 * Map semantic level to target camera zoom
 */
export function semanticLevelToZoom(level: number): number {
  if (level < 0) return ZOOM_THRESHOLDS[0];
  if (level >= ZOOM_THRESHOLDS.length) return ZOOM_THRESHOLDS[ZOOM_THRESHOLDS.length - 1];
  return ZOOM_THRESHOLDS[level];
}

interface UseGraphSidebarSyncOptions {
  /** Current camera state */
  camera: CameraState;
  /** Callback to update camera */
  setCamera: (camera: CameraState | ((prev: CameraState) => CameraState)) => void;
  /** Whether sync is enabled */
  enabled?: boolean;
}

interface UseGraphSidebarSyncResult {
  /** Handle sidebar navigation - updates camera */
  handleSidebarNavigate: (level: number, nodeId?: string) => void;
  /** Current semantic level based on zoom */
  semanticLevel: number;
}

/**
 * Hook for bidirectional sync between graph camera and sidebar navigation
 */
export function useGraphSidebarSync({
  camera,
  setCamera,
  enabled = true,
}: UseGraphSidebarSyncOptions): UseGraphSidebarSyncResult {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationLockRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedLevel = useRef<number>(currentLevel.value);
  const isNavigating = useRef(false);

  // Calculate semantic level from current zoom
  const semanticLevel = zoomToSemanticLevel(camera.zoom);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (navigationLockRef.current) {
        clearTimeout(navigationLockRef.current);
        navigationLockRef.current = null;
      }
    };
  }, []);

  // Effect: Camera zoom changes → update sidebar level
  useEffect(() => {
    if (!enabled) return;

    // Skip if we're in the middle of a navigation action
    if (isNavigating.current) return;

    // Debounce to avoid jitter
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const newLevel = zoomToSemanticLevel(camera.zoom);

      // Only update if level actually changed
      if (newLevel !== lastSyncedLevel.current) {
        lastSyncedLevel.current = newLevel;
        navigateToLevel(newLevel);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [camera.zoom, enabled]);

  // Handle sidebar navigation → update camera
  const handleSidebarNavigate = useCallback(
    (level: number, nodeId?: string) => {
      if (!enabled) {
        navigateToLevel(level, nodeId);
        return;
      }

      // Mark that we're navigating to prevent feedback loop
      isNavigating.current = true;

      // Clear any existing navigation lock timeout
      if (navigationLockRef.current) {
        clearTimeout(navigationLockRef.current);
      }

      // Update the store
      navigateToLevel(level, nodeId);
      lastSyncedLevel.current = level;

      // Calculate target zoom for this level
      const targetZoom = semanticLevelToZoom(level);

      // Update camera to target zoom
      setCamera((prev) => ({
        ...prev,
        zoom: targetZoom,
      }));

      // Reset navigation flag after lock duration
      navigationLockRef.current = setTimeout(() => {
        isNavigating.current = false;
        navigationLockRef.current = null;
      }, NAVIGATION_LOCK_MS);
    },
    [setCamera, enabled]
  );

  return {
    handleSidebarNavigate,
    semanticLevel,
  };
}

/**
 * Get zoom thresholds for configuration/display
 * @deprecated Use ZOOM_THRESHOLDS directly
 */
export function getZoomThresholds(): readonly number[] {
  return ZOOM_THRESHOLDS;
}
