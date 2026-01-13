/**
 * Binary Resolver
 *
 * Downloads and caches MCP server binaries from GitHub releases.
 * Used for servers like mcp-std that are distributed as compiled binaries.
 *
 * @module loader/binary-resolver
 */

import * as log from "@std/log";
import { join } from "@std/path";

/**
 * Configuration for binary resolution.
 */
export interface BinaryConfig {
  /** Package name (e.g., "mcp-std") */
  name: string;
  /** Version (e.g., "0.2.1") */
  version: string;
  /** GitHub repo (e.g., "Casys-AI/casys-pml-cloud") */
  repo: string;
}

/**
 * OS type for binary naming.
 */
export type OsType = "linux" | "darwin" | "windows";

/**
 * Architecture type for binary naming.
 */
export type ArchType = "x64" | "arm64";

/**
 * Log debug message for binary resolver operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:binary] ${message}`);
}

/**
 * Get current OS and architecture.
 */
export function getOsArch(): { os: OsType; arch: ArchType } {
  const os = Deno.build.os as OsType;

  // Map Deno arch names to our naming convention
  let arch: ArchType;
  switch (Deno.build.arch) {
    case "x86_64":
      arch = "x64";
      break;
    case "aarch64":
      arch = "arm64";
      break;
    default:
      arch = "x64"; // Default fallback
  }

  return { os, arch };
}

/**
 * Get binary asset name for a given OS and architecture.
 */
export function getBinaryAssetName(
  name: string,
  os: OsType,
  arch: ArchType,
): string {
  const baseName = `${name}-${os}-${arch}`;
  return os === "windows" ? `${baseName}.exe` : baseName;
}

/**
 * Get cache directory path for a binary.
 */
export function getCachePath(name: string, version: string): string {
  // Use standard cache directory
  const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "/tmp";
  return join(homeDir, ".cache", "casys", name, version);
}

/**
 * Binary resolver for downloading and caching MCP server binaries.
 */
export class BinaryResolver {
  private readonly config: BinaryConfig;
  private readonly cacheDir: string;

  constructor(config: BinaryConfig) {
    this.config = config;
    this.cacheDir = getCachePath(config.name, config.version);
  }

  /**
   * Get download URL for a specific OS/arch.
   */
  getDownloadUrl(os: OsType, arch: ArchType): string {
    const assetName = getBinaryAssetName(this.config.name, os, arch);
    return `https://github.com/${this.config.repo}/releases/download/v${this.config.version}/${assetName}`;
  }

  /**
   * Get the local binary path.
   */
  getBinaryPath(): string {
    const { os, arch } = getOsArch();
    const assetName = getBinaryAssetName(this.config.name, os, arch);
    return join(this.cacheDir, assetName);
  }

  /**
   * Check if binary is already cached.
   */
  async isCached(): Promise<boolean> {
    const binaryPath = this.getBinaryPath();
    try {
      const stat = await Deno.stat(binaryPath);
      return stat.isFile;
    } catch {
      return false;
    }
  }

  /**
   * Clear cached binary.
   */
  async clearCache(): Promise<void> {
    try {
      await Deno.remove(this.cacheDir, { recursive: true });
      logDebug(`Cleared cache: ${this.cacheDir}`);
    } catch {
      // Ignore if doesn't exist
    }
  }

  /**
   * Download binary from GitHub releases.
   */
  private async download(): Promise<string> {
    const { os, arch } = getOsArch();
    const url = this.getDownloadUrl(os, arch);
    const binaryPath = this.getBinaryPath();

    logDebug(`Downloading ${this.config.name} from ${url}`);

    // Ensure cache directory exists
    await Deno.mkdir(this.cacheDir, { recursive: true });

    // Download binary
    const response = await fetch(url, {
      redirect: "follow",
    });

    if (!response.ok) {
      // Consume body to avoid leak
      await response.body?.cancel();
      throw new Error(
        `Failed to download binary: ${response.status} ${response.statusText} (${url})`,
      );
    }

    // Write to file
    const data = new Uint8Array(await response.arrayBuffer());
    await Deno.writeFile(binaryPath, data);

    // Make executable on Unix
    if (os !== "windows") {
      await Deno.chmod(binaryPath, 0o755);
    }

    logDebug(`Downloaded ${this.config.name} to ${binaryPath}`);

    return binaryPath;
  }

  /**
   * Resolve binary path, downloading if necessary.
   */
  async resolve(): Promise<string> {
    // Check cache first
    if (await this.isCached()) {
      const binaryPath = this.getBinaryPath();
      logDebug(`Using cached binary: ${binaryPath}`);
      return binaryPath;
    }

    // Download
    return await this.download();
  }
}

/** Cached latest version to avoid repeated API calls */
let cachedLatestVersion: string | null = null;

/**
 * Get latest release version from GitHub.
 */
async function getLatestVersion(repo: string): Promise<string> {
  if (cachedLatestVersion) {
    return cachedLatestVersion;
  }

  const response = await fetch(
    `https://api.github.com/repos/${repo}/releases/latest`,
    { headers: { "Accept": "application/vnd.github.v3+json" } }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch latest version: ${response.status}`);
  }

  const data = await response.json();
  // tag_name is like "v0.2.1", strip the "v"
  const version = data.tag_name?.replace(/^v/, "");
  if (!version) {
    throw new Error("No version found in latest release");
  }

  cachedLatestVersion = version;
  logDebug(`Latest version for ${repo}: ${version}`);
  return version;
}

/**
 * Create a binary resolver for mcp-std.
 * If version is "latest", fetches the latest release version from GitHub.
 */
export async function createStdBinaryResolver(version: string): Promise<BinaryResolver> {
  const resolvedVersion = version === "latest"
    ? await getLatestVersion("Casys-AI/mcp-std")
    : version;

  return new BinaryResolver({
    name: "mcp-std",
    version: resolvedVersion,
    repo: "Casys-AI/mcp-std",
  });
}
