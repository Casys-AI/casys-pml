/**
 * Dependency State Tracker
 *
 * Manages installed dependency state persisted to ${workspace}/.pml/deps.json.
 *
 * @module loader/dep-state
 */

import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import type { DepStateFile, InstalledDep, McpDependency } from "./types.ts";
import * as log from "@std/log";

/**
 * Options for DepState.
 */
export interface DepStateOptions {
  /** Workspace root path (for per-project state) */
  workspace?: string;
  /** Explicit state file path (overrides workspace) */
  statePath?: string;
}

/**
 * Get state file path for workspace.
 * Uses ${workspace}/.pml/deps.json for per-project state.
 */
function getStatePath(workspace?: string): string {
  if (workspace) {
    return join(workspace, ".pml", "deps.json");
  }
  // Fallback to home directory if no workspace provided
  return join(Deno.env.get("HOME") ?? "~", ".pml", "deps.json");
}

/**
 * Log debug message for dep-state operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:dep-state] ${message}`);
}

/**
 * Dependency state manager.
 *
 * Tracks which MCP dependencies are installed and their versions/hashes.
 */
export class DepState {
  private readonly statePath: string;
  private state: DepStateFile | null = null;
  private dirty = false;

  constructor(options?: DepStateOptions | string) {
    // Support both old string API and new options API for backwards compat
    if (typeof options === "string") {
      this.statePath = options;
    } else if (options?.statePath) {
      this.statePath = options.statePath;
    } else {
      this.statePath = getStatePath(options?.workspace);
    }
  }

  /**
   * Get the state file path.
   */
  getStatePath(): string {
    return this.statePath;
  }

  /**
   * Load state from disk.
   *
   * Creates default state if file doesn't exist.
   */
  async load(): Promise<void> {
    try {
      const content = await Deno.readTextFile(this.statePath);
      const data = JSON.parse(content);

      // Validate version
      if (data.version !== 1) {
        logDebug(`Unknown state version: ${data.version}, using default`);
        this.state = this.createDefaultState();
        return;
      }

      this.state = data as DepStateFile;
      logDebug(
        `Loaded ${Object.keys(this.state.installed).length} installed deps`,
      );
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        logDebug(`State file not found, using default`);
        this.state = this.createDefaultState();
        return;
      }

      logDebug(`Failed to load state: ${error}`);
      this.state = this.createDefaultState();
    }
  }

  /**
   * Save state to disk.
   */
  async save(): Promise<void> {
    if (!this.state) {
      throw new Error("State not loaded");
    }

    if (!this.dirty) {
      logDebug("State not dirty, skipping save");
      return;
    }

    // Ensure directory exists
    const dir = this.statePath.substring(0, this.statePath.lastIndexOf("/"));
    await ensureDir(dir);

    // Write state
    const content = JSON.stringify(this.state, null, 2);
    await Deno.writeTextFile(this.statePath, content);

    this.dirty = false;
    logDebug(`Saved state to ${this.statePath}`);
  }

  /**
   * Check if a dependency is installed with the correct version.
   */
  isInstalled(name: string, version: string): boolean {
    this.ensureLoaded();

    const dep = this.state!.installed[name];
    if (!dep) {
      return false;
    }

    return dep.version === version;
  }

  /**
   * Get installed dependency info.
   */
  getInstalled(name: string): InstalledDep | undefined {
    this.ensureLoaded();
    return this.state!.installed[name];
  }

  /**
   * Get all installed dependencies.
   */
  getAllInstalled(): InstalledDep[] {
    this.ensureLoaded();
    return Object.values(this.state!.installed);
  }

  /**
   * Mark a dependency as installed.
   */
  markInstalled(
    dep: McpDependency,
    integrity: string,
    installPath?: string,
  ): void {
    this.ensureLoaded();

    this.state!.installed[dep.name] = {
      name: dep.name,
      version: dep.version,
      integrity,
      installedAt: new Date().toISOString(),
      installCommand: dep.install,
      installPath,
    };

    this.dirty = true;
    logDebug(`Marked ${dep.name}@${dep.version} as installed`);
  }

  /**
   * Remove a dependency from installed state.
   */
  markUninstalled(name: string): void {
    this.ensureLoaded();

    if (this.state!.installed[name]) {
      delete this.state!.installed[name];
      this.dirty = true;
      logDebug(`Marked ${name} as uninstalled`);
    }
  }

  /**
   * Check if a dependency needs update (version mismatch).
   */
  needsUpdate(dep: McpDependency): boolean {
    this.ensureLoaded();

    const installed = this.state!.installed[dep.name];
    if (!installed) {
      return true; // Not installed = needs update
    }

    return installed.version !== dep.version;
  }

  /**
   * Get dependencies that need installation or update.
   */
  getMissingOrOutdated(deps: McpDependency[]): McpDependency[] {
    this.ensureLoaded();

    return deps.filter((dep) => {
      const installed = this.state!.installed[dep.name];
      if (!installed) {
        return true; // Not installed
      }
      return installed.version !== dep.version; // Version mismatch
    });
  }

  /**
   * Create default empty state.
   */
  private createDefaultState(): DepStateFile {
    return {
      version: 1,
      installed: {},
    };
  }

  /**
   * Ensure state is loaded.
   */
  private ensureLoaded(): void {
    if (!this.state) {
      throw new Error("State not loaded. Call load() first.");
    }
  }
}

/**
 * Create and load a new DepState instance.
 */
export async function createDepState(
  options?: DepStateOptions | string,
): Promise<DepState> {
  const state = new DepState(options);
  await state.load();
  return state;
}
