/**
 * PML Upgrade Command
 *
 * Self-updates PML to the latest version by downloading from GitHub Releases.
 *
 * @module cli/upgrade-command
 */

import { Command } from "@cliffy/command";
import { bold, green, red, yellow } from "@std/fmt/colors";

/** GitHub repository for releases (public repo) */
const GITHUB_REPO = "Casys-AI/pml-std";

/** Current version (must match deno.json) */
const CURRENT_VERSION = "0.1.0";

/** Release info from GitHub API */
interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

/**
 * Detect current platform and return binary name.
 */
function getBinaryName(): string {
  const os = Deno.build.os;
  const arch = Deno.build.arch;

  if (os === "linux") {
    return "pml-linux-x64";
  } else if (os === "darwin") {
    return arch === "aarch64" ? "pml-macos-arm64" : "pml-macos-x64";
  } else if (os === "windows") {
    return "pml-windows-x64.exe";
  }

  throw new Error(`Unsupported platform: ${os}-${arch}`);
}

/**
 * Compare semantic versions.
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  // Strip 'v' prefix if present
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
 * Fetch latest release from GitHub.
 */
async function fetchLatestRelease(): Promise<GitHubRelease> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

  const response = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "pml-upgrade",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("No releases found. The repository may not have any releases yet.");
    }
    throw new Error(`Failed to fetch release: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Download file to path.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const data = await response.arrayBuffer();
  await Deno.writeFile(destPath, new Uint8Array(data));
}

/**
 * Replace current binary with new one atomically.
 */
async function replaceBinary(newBinaryPath: string): Promise<void> {
  const currentPath = Deno.execPath();
  const backupPath = `${currentPath}.old`;

  // Make new binary executable
  if (Deno.build.os !== "windows") {
    await Deno.chmod(newBinaryPath, 0o755);
  }

  // Rename current to backup
  try {
    await Deno.rename(currentPath, backupPath);
  } catch (error) {
    // On some systems, we might not be able to rename the running binary
    // In that case, we'll try a different approach
    if (error instanceof Deno.errors.Busy || error instanceof Deno.errors.PermissionDenied) {
      console.log(yellow("Cannot replace running binary directly."));
      console.log(`New binary downloaded to: ${newBinaryPath}`);
      console.log("Please replace manually or restart and run upgrade again.");
      return;
    }
    throw error;
  }

  // Move new to current
  try {
    await Deno.rename(newBinaryPath, currentPath);
  } catch (error) {
    // Rollback: restore backup
    await Deno.rename(backupPath, currentPath);
    throw error;
  }

  // Cleanup backup
  try {
    await Deno.remove(backupPath);
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create the upgrade command.
 */
// deno-lint-ignore no-explicit-any
export function createUpgradeCommand(): Command<any> {
  return new Command()
    .description("Upgrade PML to the latest version")
    .option("-c, --check", "Check for updates without installing")
    .option("-f, --force", "Force upgrade even if already on latest version")
    .action(async (options) => {
      console.log();
      console.log(bold("PML Upgrade"));
      console.log();

      try {
        // Fetch latest release
        console.log("Checking for updates...");
        const release = await fetchLatestRelease();
        const latestVersion = release.tag_name.replace(/^v/, "");

        console.log(`Current version: ${CURRENT_VERSION}`);
        console.log(`Latest version:  ${latestVersion}`);
        console.log();

        // Compare versions
        const comparison = compareVersions(latestVersion, CURRENT_VERSION);

        if (comparison === 0 && !options.force) {
          console.log(green("✓ Already up to date!"));
          return;
        }

        if (comparison < 0 && !options.force) {
          console.log(yellow("⚠ Current version is newer than latest release."));
          console.log("Use --force to downgrade.");
          return;
        }

        // Check only mode
        if (options.check) {
          if (comparison > 0) {
            console.log(yellow(`Update available: ${CURRENT_VERSION} → ${latestVersion}`));
            console.log("Run 'pml upgrade' to install.");
          }
          return;
        }

        // Find binary asset
        const binaryName = getBinaryName();
        const asset = release.assets.find((a) => a.name === binaryName);

        if (!asset) {
          console.log(red(`✗ Binary not found for platform: ${binaryName}`));
          console.log("Available assets:", release.assets.map((a) => a.name).join(", "));
          Deno.exit(1);
        }

        // Download new binary
        console.log(`Downloading ${binaryName}...`);
        const tempPath = await Deno.makeTempFile({ prefix: "pml-upgrade-" });

        try {
          await downloadFile(asset.browser_download_url, tempPath);
          console.log("Download complete.");

          // Replace binary
          console.log("Installing...");
          await replaceBinary(tempPath);

          console.log();
          console.log(green(`✓ Upgraded from ${CURRENT_VERSION} to ${latestVersion}`));
          console.log();
          console.log("Restart your terminal to use the new version.");
        } finally {
          // Cleanup temp file if it still exists
          try {
            await Deno.remove(tempPath);
          } catch {
            // Ignore
          }
        }
      } catch (error) {
        console.log();
        console.log(red(`✗ Upgrade failed: ${(error as Error).message}`));
        Deno.exit(1);
      }
    });
}
