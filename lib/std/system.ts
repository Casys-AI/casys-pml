/**
 * System tools - execute system commands via Deno subprocess
 *
 * These tools require the actual binaries to be installed on the system.
 * They use Deno.Command for subprocess execution.
 *
 * This file re-exports all system tools from the tools/ subdirectory.
 * Each category is in its own file for maintainability:
 * - docker.ts   - Docker container/image management
 * - git.ts      - Git repository operations
 * - network.ts  - HTTP, DNS, connectivity tools
 * - process.ts  - Process management
 * - archive.ts  - Compression/extraction (tar, zip)
 * - ssh.ts      - Remote execution (ssh, scp, rsync)
 * - kubernetes.ts - K8s cluster management
 * - database.ts - SQL/NoSQL database access
 * - media.ts    - Audio/video/image processing
 * - cloud.ts    - Cloud CLI (AWS, GCP, systemd)
 * - sysinfo.ts  - System information (disk, memory, etc.)
 * - packages.ts - Package managers (npm, pip, apt, brew)
 * - text.ts     - Text processing (sed, awk, jq, etc.)
 *
 * @module lib/std/system
 */

// Re-export everything from the modular tools
export {
  runCommand,
  dockerTools,
  gitTools,
  networkTools,
  processTools,
  archiveTools,
  sshTools,
  kubernetesTools,
  databaseTools,
  mediaTools,
  cloudTools,
  sysinfoTools,
  packagesTools,
  textTools,
  allSystemTools,
} from "./tools/mod.ts";

// Default export: all system tools combined (backward compatible)
import { allSystemTools } from "./tools/mod.ts";
export const systemTools = allSystemTools;
