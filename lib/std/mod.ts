/**
 * Standard library tools - aggregated exports
 *
 * System tools:
 * - docker.ts     - Container/image management
 * - git.ts        - Repository operations
 * - network.ts    - HTTP, DNS, connectivity
 * - process.ts    - Process management
 * - archive.ts    - Compression (tar, zip)
 * - ssh.ts        - Remote execution
 * - kubernetes.ts - K8s cluster management
 * - database.ts   - SQL/NoSQL access
 * - media.ts      - Audio/video/image
 * - cloud.ts      - AWS, GCP, systemd
 * - sysinfo.ts    - System information
 * - packages.ts   - npm, pip, apt, brew
 * - text.ts       - sed, awk, jq, sort
 *
 * Data tools:
 * - algo.ts       - Sorting, searching algorithms
 * - collections.ts- Array/set/map operations
 * - crypto.ts     - Hashing, encoding, encryption
 * - datetime.ts   - Date/time manipulation
 * - format.ts     - Formatting (numbers, bytes, etc)
 * - http.ts       - HTTP client operations
 * - json.ts       - JSON manipulation
 * - math.ts       - Mathematical operations
 * - transform.ts  - Data transformations (CSV, XML)
 * - validation.ts - Data validation
 * - vfs.ts        - Virtual filesystem
 *
 * New tools:
 * - string.ts     - String manipulation
 * - path.ts       - Path utilities
 * - faker.ts      - Mock data generation
 * - color.ts      - Color manipulation
 * - geo.ts        - Geographic calculations
 * - qrcode.ts     - QR/barcode generation
 * - resilience.ts - Retry/rate limiting
 * - schema.ts     - Schema inference
 * - diff.ts       - Text diff/comparison
 *
 * @module lib/std/mod
 */

export { runCommand, type MiniTool } from "./common.ts";

// System tools
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

// Data tools
export { algoTools } from "./algo.ts";
export { collectionsTools } from "./collections.ts";
export { cryptoTools } from "./crypto.ts";
export { datetimeTools } from "./datetime.ts";
export { formatTools } from "./format.ts";
export { httpTools } from "./http.ts";
export { jsonTools } from "./json.ts";
export { mathTools } from "./math.ts";
export { transformTools } from "./transform.ts";
export { validationTools } from "./validation.ts";
export { vfsTools } from "./vfs.ts";

// New tools
export { stringTools } from "./string.ts";
export { pathTools } from "./path.ts";
export { fakerTools } from "./faker.ts";
export { colorTools } from "./color.ts";
export { geoTools } from "./geo.ts";
export { qrcodeTools } from "./qrcode.ts";
export { resilienceTools } from "./resilience.ts";
export { schemaTools } from "./schema.ts";
export { diffTools } from "./diff.ts";

// Imports for combined export
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
import { algoTools } from "./algo.ts";
import { collectionsTools } from "./collections.ts";
import { cryptoTools } from "./crypto.ts";
import { datetimeTools } from "./datetime.ts";
import { formatTools } from "./format.ts";
import { httpTools } from "./http.ts";
import { jsonTools } from "./json.ts";
import { mathTools } from "./math.ts";
import { transformTools } from "./transform.ts";
import { validationTools } from "./validation.ts";
import { vfsTools } from "./vfs.ts";
import { stringTools } from "./string.ts";
import { pathTools } from "./path.ts";
import { fakerTools } from "./faker.ts";
import { colorTools } from "./color.ts";
import { geoTools } from "./geo.ts";
import { qrcodeTools } from "./qrcode.ts";
import { resilienceTools } from "./resilience.ts";
import { schemaTools } from "./schema.ts";
import { diffTools } from "./diff.ts";

/** All system tools combined */
export const systemTools = [
  // System tools
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
  // Data tools
  ...algoTools,
  ...collectionsTools,
  ...cryptoTools,
  ...datetimeTools,
  ...formatTools,
  ...httpTools,
  ...jsonTools,
  ...mathTools,
  ...transformTools,
  ...validationTools,
  ...vfsTools,
  // New tools
  ...stringTools,
  ...pathTools,
  ...fakerTools,
  ...colorTools,
  ...geoTools,
  ...qrcodeTools,
  ...resilienceTools,
  ...schemaTools,
  ...diffTools,
];
