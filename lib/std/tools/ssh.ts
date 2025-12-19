/**
 * SSH tools - remote execution and file transfer
 *
 * @module lib/std/tools/ssh
 */

import { runCommand, type MiniTool } from "./common.ts";

export const sshTools: MiniTool[] = [
  {
    name: "ssh_exec",
    description: "Execute command on remote host via SSH",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Remote host (user@host)" },
        command: { type: "string", description: "Command to execute" },
        port: { type: "number", description: "SSH port (default: 22)" },
        identity: { type: "string", description: "Identity file path" },
        timeout: { type: "number", description: "Connection timeout in seconds" },
      },
      required: ["host", "command"],
    },
    handler: async ({ host, command, port, identity, timeout = 30 }) => {
      const args = ["-o", "StrictHostKeyChecking=no", "-o", `ConnectTimeout=${timeout}`];
      if (port) args.push("-p", String(port));
      if (identity) args.push("-i", identity as string);
      args.push(host as string, command as string);

      const result = await runCommand("ssh", args, { timeout: (timeout as number) * 1000 + 5000 });
      return {
        host,
        command,
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        success: result.code === 0,
      };
    },
  },
  {
    name: "scp_copy",
    description: "Copy files via SCP",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source path (local or user@host:path)" },
        destination: { type: "string", description: "Destination path" },
        recursive: { type: "boolean", description: "Copy directories recursively" },
        port: { type: "number", description: "SSH port" },
        identity: { type: "string", description: "Identity file path" },
      },
      required: ["source", "destination"],
    },
    handler: async ({ source, destination, recursive = false, port, identity }) => {
      const args = ["-o", "StrictHostKeyChecking=no"];
      if (recursive) args.push("-r");
      if (port) args.push("-P", String(port));
      if (identity) args.push("-i", identity as string);
      args.push(source as string, destination as string);

      const result = await runCommand("scp", args, { timeout: 300000 });
      if (result.code !== 0) {
        throw new Error(`scp failed: ${result.stderr}`);
      }
      return { success: true, source, destination };
    },
  },
  {
    name: "rsync",
    description: "Sync files with rsync",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source path" },
        destination: { type: "string", description: "Destination path" },
        delete: { type: "boolean", description: "Delete extraneous files from destination" },
        dryRun: { type: "boolean", description: "Dry run (show what would be done)" },
        exclude: { type: "array", items: { type: "string" }, description: "Patterns to exclude" },
      },
      required: ["source", "destination"],
    },
    handler: async ({ source, destination, delete: del = false, dryRun = false, exclude = [] }) => {
      const args = ["-avz", "--progress"];
      if (del) args.push("--delete");
      if (dryRun) args.push("--dry-run");
      for (const pattern of exclude as string[]) {
        args.push("--exclude", pattern);
      }
      args.push(source as string, destination as string);

      const result = await runCommand("rsync", args, { timeout: 600000 });
      if (result.code !== 0) {
        throw new Error(`rsync failed: ${result.stderr}`);
      }
      return { success: true, output: result.stdout, dryRun };
    },
  },
];
