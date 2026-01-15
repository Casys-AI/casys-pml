/**
 * Version Check Module
 *
 * Checks GitHub releases for newer PML versions.
 * Caches results for 24h to avoid API spam.
 *
 * @module cli/shared/version-check
 */

import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { PACKAGE_VERSION } from "./constants.ts";

/** GitHub repository for releases */
const GITHUB_REPO = "Casys-AI/casys-pml";

/** Cache duration: 24 hours */
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

/** Cache file path */
function getCachePath(): string {
  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || ".";
  return join(home, ".pml", "version-check.json");
}

/** Cached version check result */
interface VersionCache {
  checkedAt: string;
  latestVersion: string | null;
}

/**
 * Compare semantic versions.
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const cleanA = a.replace(/^v/, "");
  const cleanB = b.replace(/^v/, "");

  const partsA = cleanA.split(".").map(Number);
  const partsB = cleanB.split(".").map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}

/**
 * Load cached version check result.
 */
async function loadCache(): Promise<VersionCache | null> {
  try {
    const content = await Deno.readTextFile(getCachePath());
    return JSON.parse(content) as VersionCache;
  } catch {
    return null;
  }
}

/**
 * Save version check result to cache.
 */
async function saveCache(latestVersion: string | null): Promise<void> {
  try {
    const cachePath = getCachePath();
    const dir = cachePath.substring(0, cachePath.lastIndexOf("/"));
    await ensureDir(dir);

    const cache: VersionCache = {
      checkedAt: new Date().toISOString(),
      latestVersion,
    };

    await Deno.writeTextFile(cachePath, JSON.stringify(cache, null, 2));
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Fetch latest version from GitHub releases.
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "pml-version-check",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.tag_name?.replace(/^v/, "") || null;
  } catch {
    return null;
  }
}

/**
 * Check for updates.
 * Returns the latest version if newer than current, null otherwise.
 * Uses 24h cache to avoid API spam.
 */
export async function checkForUpdates(): Promise<string | null> {
  // Check cache first
  const cache = await loadCache();

  if (cache) {
    const cacheAge = Date.now() - new Date(cache.checkedAt).getTime();

    if (cacheAge < CACHE_DURATION_MS) {
      // Use cached result
      if (cache.latestVersion && compareVersions(cache.latestVersion, PACKAGE_VERSION) > 0) {
        return cache.latestVersion;
      }
      return null;
    }
  }

  // Fetch fresh data
  const latestVersion = await fetchLatestVersion();

  // Save to cache
  await saveCache(latestVersion);

  // Compare versions
  if (latestVersion && compareVersions(latestVersion, PACKAGE_VERSION) > 0) {
    return latestVersion;
  }

  return null;
}

/** Current package version */
export { PACKAGE_VERSION };
