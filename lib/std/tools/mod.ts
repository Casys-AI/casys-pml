/**
 * System tools - aggregated exports
 *
 * @module lib/std/tools/mod
 */

export { runCommand, type MiniTool } from "./common.ts";

export { dockerTools } from "./docker.ts";
export { gitTools } from "./git.ts";
export { networkTools } from "./network.ts";
export { processTools } from "./process.ts";
export { archiveTools } from "./archive.ts";
export { sshTools } from "./ssh.ts";
export { kubernetesTools } from "./kubernetes.ts";
export { databaseTools } from "./database.ts";
export { mediaTools } from "./media.ts";
export { cloudTools } from "./cloud.ts";
export { sysinfoTools } from "./sysinfo.ts";
export { packagesTools } from "./packages.ts";
export { textTools } from "./text.ts";

import { dockerTools } from "./docker.ts";
import { gitTools } from "./git.ts";
import { networkTools } from "./network.ts";
import { processTools } from "./process.ts";
import { archiveTools } from "./archive.ts";
import { sshTools } from "./ssh.ts";
import { kubernetesTools } from "./kubernetes.ts";
import { databaseTools } from "./database.ts";
import { mediaTools } from "./media.ts";
import { cloudTools } from "./cloud.ts";
import { sysinfoTools } from "./sysinfo.ts";
import { packagesTools } from "./packages.ts";
import { textTools } from "./text.ts";

/**
 * All system tools combined
 */
export const allSystemTools = [
  ...dockerTools,
  ...gitTools,
  ...networkTools,
  ...processTools,
  ...archiveTools,
  ...sshTools,
  ...kubernetesTools,
  ...databaseTools,
  ...mediaTools,
  ...cloudTools,
  ...sysinfoTools,
  ...packagesTools,
  ...textTools,
];
