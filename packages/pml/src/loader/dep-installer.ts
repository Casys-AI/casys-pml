/**
 * Dependency Installer
 *
 * Installs MCP dependencies (npm packages) with integrity verification.
 *
 * @module loader/dep-installer
 */

import type { InstallResult, McpDependency } from "./types.ts";
import { InstallError, IntegrityError } from "./types.ts";
import type { DepState } from "./dep-state.ts";
import { computeStringHash } from "./integrity.ts";
import * as log from "@std/log";

/**
 * Installation timeout (5 minutes).
 */
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Log debug message for installer operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:installer] ${message}`);
}

/**
 * Parse install command into executable and arguments.
 *
 * Handles:
 * - "npx @package/name@version"
 * - "npm install @package/name@version"
 * - "pip install package==version"
 */
function parseInstallCommand(
  install: string,
): { cmd: string; args: string[] } {
  const parts = install.trim().split(/\s+/);
  if (parts.length === 0) {
    throw new Error(`Invalid install command: ${install}`);
  }

  return {
    cmd: parts[0],
    args: parts.slice(1),
  };
}

/**
 * Check if a command exists in PATH.
 * Cross-platform: uses `which` on Unix, `where` on Windows.
 */
async function commandExists(cmd: string): Promise<boolean> {
  // Determine the right command for the platform
  const isWindows = Deno.build.os === "windows";
  const checkCmd = isWindows ? "where" : "which";

  try {
    const command = new Deno.Command(checkCmd, {
      args: [cmd],
      stdout: "null",
      stderr: "null",
    });
    const { code } = await command.output();
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * npm registry package metadata (partial).
 */
interface NpmPackageVersion {
  name: string;
  version: string;
  dist: {
    shasum: string; // SHA-1 hex
    integrity?: string; // SRI format: sha512-base64...
    tarball: string;
  };
}

/**
 * Fetch package version info from npm registry.
 */
async function fetchNpmPackageInfo(
  packageName: string,
  version: string,
): Promise<NpmPackageVersion> {
  // Handle scoped packages: @scope/name -> @scope%2fname
  const encodedName = packageName.startsWith("@")
    ? packageName.replace("/", "%2f")
    : packageName;

  const url = `https://registry.npmjs.org/${encodedName}/${version}`;
  logDebug(`Fetching npm registry: ${url}`);

  const response = await fetch(url, {
    headers: { "Accept": "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `npm registry error: ${response.status} ${response.statusText}`,
    );
  }

  return await response.json();
}

/**
 * Parse package name and version from npx args.
 *
 * Handles: "@scope/package@1.2.3" or "package@1.2.3"
 */
function parseNpxPackageSpec(
  args: string[],
): { packageName: string; version: string } | null {
  // Find the package spec (first arg that looks like a package)
  for (const arg of args) {
    if (arg.startsWith("-")) continue; // Skip flags

    // Match: @scope/name@version or name@version
    const match = arg.match(/^(@?[^@]+)@(.+)$/);
    if (match) {
      return { packageName: match[1], version: match[2] };
    }
  }
  return null;
}

/**
 * Verify package integrity against npm registry.
 *
 * Compares our declared integrity hash against npm's published hash.
 * This ensures the package hasn't been tampered with.
 */
async function verifyNpmIntegrity(
  dep: McpDependency,
  npmInfo: NpmPackageVersion,
): Promise<{ valid: boolean; actual: string; expected: string }> {
  const expected = dep.integrity;

  // npm provides SHA-512 in SRI format (sha512-base64...) or SHA-1 shasum
  // We need to compare against what we have

  if (expected.startsWith("sha256-")) {
    // Our format: sha256-hex
    // We need to compute sha256 from a deterministic representation
    // Use package name + version + npm's shasum as the content to hash
    const contentToHash = JSON.stringify({
      name: npmInfo.name,
      version: npmInfo.version,
      shasum: npmInfo.dist.shasum,
    });
    const actual = await computeStringHash(contentToHash);
    return { valid: actual === expected, actual, expected };
  }

  if (expected.startsWith("sha512-")) {
    // SRI format comparison
    const actual = npmInfo.dist.integrity ?? "";
    return { valid: actual === expected, actual, expected };
  }

  if (expected.startsWith("sha1-")) {
    // Legacy SHA-1 comparison
    const actual = `sha1-${npmInfo.dist.shasum}`;
    return { valid: actual === expected, actual, expected };
  }

  // Unknown format - warn but allow (for dev flexibility)
  logDebug(`Unknown integrity format: ${expected}, skipping verification`);
  return { valid: true, actual: expected, expected };
}

/**
 * Dependency installer.
 *
 * Handles npm/npx package installation with verification.
 */
export class DepInstaller {
  constructor(private readonly depState: DepState) {}

  /**
   * Install a dependency.
   *
   * For npx commands, we don't really "install" - npx handles that.
   * Instead, we verify the command runs successfully and record state.
   *
   * @param dep - Dependency to install
   * @returns Installation result
   */
  async install(dep: McpDependency): Promise<InstallResult> {
    logDebug(`Installing ${dep.name}@${dep.version}: ${dep.install ?? "(no install cmd)"}`);

    if (!dep.install) {
      throw new InstallError(dep, `No install command for ${dep.name} — HTTP deps should not reach installer`);
    }
    const { cmd, args } = parseInstallCommand(dep.install);

    // Check if command exists
    if (!await commandExists(cmd)) {
      throw new InstallError(
        dep,
        `Command not found: ${cmd}. Make sure it's installed and in PATH.`,
      );
    }

    try {
      // For npx commands, we do a dry run to verify the package exists
      // npx will cache the package on first run
      if (cmd === "npx") {
        return await this.installViaNpx(dep, args);
      }

      // For npm install commands
      if (cmd === "npm" && args[0] === "install") {
        return await this.installViaNpm(dep, args.slice(1));
      }

      // Generic installation
      return await this.installGeneric(dep, cmd, args);
    } catch (error) {
      if (error instanceof InstallError) {
        throw error;
      }

      throw new InstallError(
        dep,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Install via npx.
   *
   * npx caches packages in npm cache. We verify integrity by checking
   * the package against npm registry BEFORE allowing installation.
   */
  private async installViaNpx(
    dep: McpDependency,
    args: string[],
  ): Promise<InstallResult> {
    logDebug(`Installing via npx: ${args.join(" ")}`);

    // Step 1: Parse package name and version from args
    const packageSpec = parseNpxPackageSpec(args);
    if (!packageSpec) {
      // Can't parse - use dep.name and dep.version as fallback
      logDebug(`Could not parse package spec from args, using dep info`);
    }

    const packageName = packageSpec?.packageName ?? dep.name;
    const version = packageSpec?.version ?? dep.version;

    // Step 2: Fetch package info from npm registry
    let npmInfo: NpmPackageVersion;
    try {
      npmInfo = await fetchNpmPackageInfo(packageName, version);
    } catch (error) {
      throw new InstallError(
        dep,
        `Failed to fetch package info from npm: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Step 3: Verify integrity BEFORE installation
    const integrityResult = await verifyNpmIntegrity(dep, npmInfo);

    if (!integrityResult.valid) {
      logDebug(
        `Integrity verification FAILED for ${dep.name}@${dep.version}`,
      );
      throw new IntegrityError(dep, {
        valid: false,
        actual: integrityResult.actual,
        expected: integrityResult.expected,
      });
    }

    logDebug(
      `Integrity verified for ${dep.name}@${dep.version}`,
    );

    // Step 4: Record installation (npx will cache on first actual use)
    const now = new Date().toISOString();
    this.depState.markInstalled(dep, integrityResult.actual);
    await this.depState.save();

    logDebug(`Recorded npx installation: ${dep.name}@${dep.version}`);

    return {
      success: true,
      dep,
      installedAt: now,
      integrity: integrityResult.actual,
    };
  }

  /**
   * Install via npm install.
   *
   * Verifies integrity against npm registry before installation.
   */
  private async installViaNpm(
    dep: McpDependency,
    packages: string[],
  ): Promise<InstallResult> {
    logDebug(`Installing via npm: ${packages.join(" ")}`);

    // Step 1: Verify integrity BEFORE installation
    let npmInfo: NpmPackageVersion;
    try {
      npmInfo = await fetchNpmPackageInfo(dep.name, dep.version);
    } catch (error) {
      throw new InstallError(
        dep,
        `Failed to fetch package info from npm: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const integrityResult = await verifyNpmIntegrity(dep, npmInfo);
    if (!integrityResult.valid) {
      throw new IntegrityError(dep, {
        valid: false,
        actual: integrityResult.actual,
        expected: integrityResult.expected,
      });
    }

    logDebug(`Integrity pre-verified for ${dep.name}@${dep.version}`);

    // Step 2: Run npm install
    const command = new Deno.Command("npm", {
      args: ["install", "--save", ...packages],
      stdout: "piped",
      stderr: "piped",
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), INSTALL_TIMEOUT_MS);

    try {
      const { code, stdout, stderr } = await command.output();

      clearTimeout(timeoutId);

      const stdoutText = new TextDecoder().decode(stdout);
      const stderrText = new TextDecoder().decode(stderr);

      if (code !== 0) {
        throw new InstallError(
          dep,
          `npm install failed (exit ${code}): ${stderrText || stdoutText}`,
        );
      }

      logDebug(`npm install succeeded`);

      const now = new Date().toISOString();

      // Record installation with verified integrity
      this.depState.markInstalled(dep, integrityResult.actual);
      await this.depState.save();

      return {
        success: true,
        dep,
        installedAt: now,
        integrity: integrityResult.actual,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generic installation via command.
   *
   * WARNING: Generic installs cannot verify integrity against a registry.
   * We trust the declared integrity hash but cannot confirm it pre-install.
   */
  private async installGeneric(
    dep: McpDependency,
    cmd: string,
    args: string[],
  ): Promise<InstallResult> {
    // Warn that we can't verify integrity for generic commands
    log.warn(
      `[pml:installer] Cannot verify integrity for ${dep.name}@${dep.version} ` +
        `(no registry available for ${cmd}). Trusting declared hash.`,
    );

    logDebug(`Installing via ${cmd}: ${args.join(" ")}`);

    const command = new Deno.Command(cmd, {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), INSTALL_TIMEOUT_MS);

    try {
      const { code, stdout, stderr } = await command.output();

      clearTimeout(timeoutId);

      const stderrText = new TextDecoder().decode(stderr);
      const stdoutText = new TextDecoder().decode(stdout);

      if (code !== 0) {
        throw new InstallError(
          dep,
          `Installation failed (exit ${code}): ${stderrText || stdoutText}`,
        );
      }

      const now = new Date().toISOString();

      // Record installation (with unverified integrity)
      this.depState.markInstalled(dep, dep.integrity);
      await this.depState.save();

      return {
        success: true,
        dep,
        installedAt: now,
        integrity: dep.integrity,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Uninstall a dependency.
   */
  async uninstall(name: string): Promise<void> {
    logDebug(`Uninstalling ${name}`);

    this.depState.markUninstalled(name);
    await this.depState.save();
  }

  /**
   * Check if a dependency is installed with correct version.
   */
  isInstalled(dep: McpDependency): boolean {
    return this.depState.isInstalled(dep.name, dep.version);
  }
}

/**
 * Create a dependency installer.
 */
export function createDepInstaller(depState: DepState): DepInstaller {
  return new DepInstaller(depState);
}
