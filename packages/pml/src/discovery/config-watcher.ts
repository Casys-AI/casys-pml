/**
 * Config File Watcher
 *
 * Watches .pml.json for changes to mcpServers configuration.
 * Triggers re-discovery when servers are added/removed/modified.
 *
 * @module discovery/config-watcher
 */

import type { McpServerConfig, PmlConfig } from "../types.ts";
import * as log from "@std/log";

/**
 * Callback for when MCP servers configuration changes.
 */
export type McpServersChangedCallback = (
  servers: Record<string, McpServerConfig>,
  added: string[],
  removed: string[],
) => Promise<void>;

/**
 * Config watcher for .pml.json mcpServers changes.
 *
 * Uses Deno.watchFs to detect file changes, then compares
 * the mcpServers section to detect actual changes.
 */
export class ConfigWatcher {
  private watcher: Deno.FsWatcher | null = null;
  private lastMcpServersHash: string = "";
  private lastMcpServers: Record<string, McpServerConfig> = {};
  private isWatching = false;

  /**
   * Start watching config file for changes.
   *
   * @param configPath - Path to .pml.json
   * @param onMcpServersChanged - Callback when mcpServers changes
   */
  async start(
    configPath: string,
    onMcpServersChanged: McpServersChangedCallback,
  ): Promise<void> {
    if (this.isWatching) {
      log.warn("[config-watcher] Already watching, call stop() first");
      return;
    }

    // Compute initial hash
    const initialConfig = await this.loadConfig(configPath);
    this.lastMcpServers = initialConfig?.mcpServers || {};
    this.lastMcpServersHash = this.computeHash(this.lastMcpServers);
    this.isWatching = true;

    log.debug(`[config-watcher] Starting watch on ${configPath}`);

    // Start watching
    this.watcher = Deno.watchFs(configPath);

    // Process events in background
    this.processEvents(configPath, onMcpServersChanged).catch((error) => {
      log.debug(`[config-watcher] Event processing error: ${error}`);
    });
  }

  /**
   * Process file system events.
   */
  private async processEvents(
    configPath: string,
    onMcpServersChanged: McpServersChangedCallback,
  ): Promise<void> {
    if (!this.watcher) return;

    try {
      for await (const event of this.watcher) {
        if (!this.isWatching) break;

        if (event.kind === "modify" || event.kind === "create") {
          await this.checkForChanges(configPath, onMcpServersChanged);
        }
      }
    } catch (error) {
      if (this.isWatching) {
        log.debug(`[config-watcher] Watcher error: ${error}`);
      }
    }
  }

  /**
   * Check if mcpServers changed and trigger callback.
   */
  private async checkForChanges(
    configPath: string,
    onMcpServersChanged: McpServersChangedCallback,
  ): Promise<void> {
    const config = await this.loadConfig(configPath);
    const newServers = config?.mcpServers || {};
    const newHash = this.computeHash(newServers);

    if (newHash !== this.lastMcpServersHash) {
      log.debug("[config-watcher] mcpServers changed, triggering callback");

      // Compute added/removed servers
      const oldKeys = new Set(Object.keys(this.lastMcpServers));
      const newKeys = new Set(Object.keys(newServers));

      const added = [...newKeys].filter((k) => !oldKeys.has(k));
      const removed = [...oldKeys].filter((k) => !newKeys.has(k));

      // Update state
      this.lastMcpServers = newServers;
      this.lastMcpServersHash = newHash;

      // Trigger callback
      try {
        await onMcpServersChanged(newServers, added, removed);
      } catch (error) {
        log.warn(`[config-watcher] Callback error: ${error}`);
      }
    }
  }

  /**
   * Stop watching.
   */
  stop(): void {
    this.isWatching = false;
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {
        // Ignore close errors
      }
      this.watcher = null;
    }
    log.debug("[config-watcher] Stopped");
  }

  /**
   * Load PML config from file.
   */
  private async loadConfig(path: string): Promise<PmlConfig | null> {
    try {
      const content = await Deno.readTextFile(path);
      return JSON.parse(content) as PmlConfig;
    } catch {
      return null;
    }
  }

  /**
   * Compute hash of mcpServers for change detection.
   * Uses JSON.stringify with sorted keys for deterministic comparison.
   */
  private computeHash(servers: Record<string, McpServerConfig>): string {
    return JSON.stringify(servers, Object.keys(servers).sort());
  }
}
