/**
 * System info tools - disk, memory, user, hostname
 *
 * @module lib/std/tools/sysinfo
 */

import { runCommand, type MiniTool } from "./common.ts";

export const sysinfoTools: MiniTool[] = [
  {
    name: "env_get",
    description: "Get environment variable value",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Variable name" },
      },
      required: ["name"],
    },
    handler: ({ name }) => {
      const value = Deno.env.get(name as string);
      return { name, value, exists: value !== undefined };
    },
  },
  {
    name: "env_list",
    description: "List all environment variables",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Filter by name prefix" },
      },
    },
    handler: ({ filter }) => {
      const env = Deno.env.toObject();
      if (filter) {
        const prefix = filter as string;
        const filtered: Record<string, string> = {};
        for (const [k, v] of Object.entries(env)) {
          if (k.startsWith(prefix)) filtered[k] = v;
        }
        return { count: Object.keys(filtered).length, variables: filtered };
      }
      return { count: Object.keys(env).length, variables: env };
    },
  },
  {
    name: "chmod",
    description: "Change file permissions",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory path" },
        mode: { type: "string", description: "Permission mode (e.g., 755, +x, u+rw)" },
        recursive: { type: "boolean", description: "Apply recursively" },
      },
      required: ["path", "mode"],
    },
    handler: async ({ path, mode, recursive }) => {
      const args = [];
      if (recursive) args.push("-R");
      args.push(mode as string, path as string);

      const result = await runCommand("chmod", args);
      if (result.code !== 0) {
        throw new Error(`chmod failed: ${result.stderr}`);
      }
      return { success: true, path, mode };
    },
  },
  {
    name: "chown",
    description: "Change file ownership",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory path" },
        owner: { type: "string", description: "Owner (user:group or just user)" },
        recursive: { type: "boolean", description: "Apply recursively" },
      },
      required: ["path", "owner"],
    },
    handler: async ({ path, owner, recursive }) => {
      const args = [];
      if (recursive) args.push("-R");
      args.push(owner as string, path as string);

      const result = await runCommand("chown", args);
      if (result.code !== 0) {
        throw new Error(`chown failed: ${result.stderr}`);
      }
      return { success: true, path, owner };
    },
  },
  {
    name: "df",
    description: "Show disk space usage",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to check (optional)" },
        human: { type: "boolean", description: "Human readable sizes (default: true)" },
      },
    },
    handler: async ({ path, human = true }) => {
      const args = [];
      if (human) args.push("-h");
      args.push("-P");
      if (path) args.push(path as string);

      const result = await runCommand("df", args);
      if (result.code !== 0) {
        throw new Error(`df failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n");
      const filesystems = lines.slice(1).map((line) => {
        const parts = line.split(/\s+/);
        return {
          filesystem: parts[0],
          size: parts[1],
          used: parts[2],
          available: parts[3],
          usePercent: parts[4],
          mountPoint: parts[5],
        };
      });

      return { filesystems };
    },
  },
  {
    name: "du",
    description: "Show directory/file size",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to check" },
        depth: { type: "number", description: "Max depth to report" },
        human: { type: "boolean", description: "Human readable sizes (default: true)" },
        summarize: { type: "boolean", description: "Show only total" },
      },
      required: ["path"],
    },
    handler: async ({ path, depth, human = true, summarize }) => {
      const args = [];
      if (human) args.push("-h");
      if (summarize) args.push("-s");
      else if (depth !== undefined) args.push("-d", String(depth));
      args.push(path as string);

      const result = await runCommand("du", args);
      if (result.code !== 0) {
        throw new Error(`du failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n");
      const items = lines.map((line) => {
        const [size, ...pathParts] = line.split("\t");
        return { size: size.trim(), path: pathParts.join("\t").trim() };
      });

      return { items };
    },
  },
  {
    name: "free",
    description: "Show memory usage",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        human: { type: "boolean", description: "Human readable sizes (default: true)" },
      },
    },
    handler: async ({ human = true }) => {
      const args = [];
      if (human) args.push("-h");

      const result = await runCommand("free", args);
      if (result.code !== 0) {
        throw new Error(`free failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n");
      const memLine = lines.find((l) => l.startsWith("Mem:"));
      const swapLine = lines.find((l) => l.startsWith("Swap:"));

      const parseLine = (line: string | undefined) => {
        if (!line) return null;
        const parts = line.split(/\s+/);
        return {
          total: parts[1],
          used: parts[2],
          free: parts[3],
          shared: parts[4],
          buffCache: parts[5],
          available: parts[6],
        };
      };

      return {
        memory: parseLine(memLine),
        swap: parseLine(swapLine),
      };
    },
  },
  {
    name: "whoami",
    description: "Get current username",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const result = await runCommand("whoami", []);
      return { username: result.stdout.trim() };
    },
  },
  {
    name: "id",
    description: "Get user and group IDs",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string", description: "User to check (default: current)" },
      },
    },
    handler: async ({ user }) => {
      const args = user ? [user as string] : [];
      const result = await runCommand("id", args);
      if (result.code !== 0) {
        throw new Error(`id failed: ${result.stderr}`);
      }

      const output = result.stdout.trim();
      const uidMatch = output.match(/uid=(\d+)\(([^)]+)\)/);
      const gidMatch = output.match(/gid=(\d+)\(([^)]+)\)/);
      const groupsMatch = output.match(/groups=(.+)/);

      return {
        uid: uidMatch ? parseInt(uidMatch[1]) : null,
        user: uidMatch ? uidMatch[2] : null,
        gid: gidMatch ? parseInt(gidMatch[1]) : null,
        group: gidMatch ? gidMatch[2] : null,
        groups: groupsMatch ? groupsMatch[1] : null,
      };
    },
  },
  {
    name: "hostname",
    description: "Get system hostname",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        fqdn: { type: "boolean", description: "Get fully qualified domain name" },
      },
    },
    handler: async ({ fqdn }) => {
      const args = fqdn ? ["-f"] : [];
      const result = await runCommand("hostname", args);
      return { hostname: result.stdout.trim() };
    },
  },
  {
    name: "uptime",
    description: "Get system uptime",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const result = await runCommand("uptime", ["-p"]);
      const uptime = result.stdout.trim();

      const loadResult = await runCommand("uptime", []);
      const loadMatch = loadResult.stdout.match(/load average: ([\d.]+), ([\d.]+), ([\d.]+)/);

      return {
        uptime,
        loadAverage: loadMatch
          ? {
              "1min": parseFloat(loadMatch[1]),
              "5min": parseFloat(loadMatch[2]),
              "15min": parseFloat(loadMatch[3]),
            }
          : null,
      };
    },
  },
  {
    name: "uname",
    description: "Get system information",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const result = await runCommand("uname", ["-a"]);
      const parts = result.stdout.trim().split(" ");

      return {
        full: result.stdout.trim(),
        kernel: parts[0],
        hostname: parts[1],
        kernelRelease: parts[2],
        kernelVersion: parts[3],
        machine: parts.find((p) => p.match(/x86_64|arm64|aarch64/)) || parts[parts.length - 1],
      };
    },
  },
];
