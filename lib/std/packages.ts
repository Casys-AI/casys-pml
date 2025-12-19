/**
 * Package manager tools - npm, pip, apt, brew
 *
 * @module lib/std/tools/packages
 */

import { runCommand, type MiniTool } from "./common.ts";

export const packagesTools: MiniTool[] = [
  {
    name: "npm_run",
    description: "Run npm commands",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", enum: ["install", "run", "test", "build", "list", "outdated", "update", "audit"], description: "npm command" },
        args: { type: "array", items: { type: "string" }, description: "Additional arguments" },
        cwd: { type: "string", description: "Working directory" },
      },
      required: ["command"],
    },
    handler: async ({ command, args = [], cwd }) => {
      const cmdArgs = [command as string, ...(args as string[])];
      const result = await runCommand("npm", cmdArgs, { cwd: cwd as string, timeout: 300000 });
      return {
        command: `npm ${cmdArgs.join(" ")}`,
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        success: result.code === 0,
      };
    },
  },
  {
    name: "pip_run",
    description: "Run pip commands",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", enum: ["install", "uninstall", "list", "freeze", "show", "search", "check"], description: "pip command" },
        packages: { type: "array", items: { type: "string" }, description: "Package names" },
        upgrade: { type: "boolean", description: "Upgrade packages" },
      },
      required: ["command"],
    },
    handler: async ({ command, packages = [], upgrade = false }) => {
      const args = [command as string];
      if (upgrade && command === "install") args.push("--upgrade");
      args.push(...(packages as string[]));

      const result = await runCommand("pip", args, { timeout: 300000 });
      return {
        command: `pip ${args.join(" ")}`,
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        success: result.code === 0,
      };
    },
  },
  {
    name: "apt_install",
    description: "Install packages with apt (Debian/Ubuntu)",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        packages: { type: "array", items: { type: "string" }, description: "Packages to install" },
        update: { type: "boolean", description: "Run apt update first" },
      },
      required: ["packages"],
    },
    handler: async ({ packages, update }) => {
      if (update) {
        await runCommand("apt", ["update"], { timeout: 120000 });
      }

      const result = await runCommand("apt", ["install", "-y", ...(packages as string[])], { timeout: 300000 });
      if (result.code !== 0) {
        throw new Error(`apt install failed: ${result.stderr}`);
      }
      return { success: true, packages, output: result.stdout };
    },
  },
  {
    name: "apt_search",
    description: "Search for packages with apt",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
    handler: async ({ query }) => {
      const result = await runCommand("apt", ["search", query as string]);
      return { output: result.stdout };
    },
  },
  {
    name: "brew_install",
    description: "Install packages with Homebrew (macOS)",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        packages: { type: "array", items: { type: "string" }, description: "Packages to install" },
        cask: { type: "boolean", description: "Install as cask" },
      },
      required: ["packages"],
    },
    handler: async ({ packages, cask }) => {
      const args = cask ? ["install", "--cask"] : ["install"];
      args.push(...(packages as string[]));

      const result = await runCommand("brew", args, { timeout: 300000 });
      if (result.code !== 0) {
        throw new Error(`brew install failed: ${result.stderr}`);
      }
      return { success: true, packages, output: result.stdout };
    },
  },
];
