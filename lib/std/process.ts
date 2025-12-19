/**
 * Process tools - process management and system info
 *
 * @module lib/std/tools/process
 */

import { runCommand, type MiniTool } from "./common.ts";

export const processTools: MiniTool[] = [
  {
    name: "ps_list",
    description: "List running processes",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Filter by process name" },
        user: { type: "string", description: "Filter by user" },
        sort: { type: "string", enum: ["cpu", "mem", "pid", "time"], description: "Sort by field" },
        limit: { type: "number", description: "Limit number of results" },
      },
    },
    handler: async ({ filter, user, sort = "cpu", limit = 20 }) => {
      const sortField = { cpu: "-%cpu", mem: "-%mem", pid: "pid", time: "-time" }[sort as string] || "-%cpu";
      const args = ["aux", "--sort", sortField];

      const result = await runCommand("ps", args);
      if (result.code !== 0) {
        throw new Error(`ps failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n");
      let processes = lines.slice(1).map((line) => {
        const parts = line.split(/\s+/);
        return {
          user: parts[0],
          pid: parseInt(parts[1], 10),
          cpu: parseFloat(parts[2]),
          mem: parseFloat(parts[3]),
          vsz: parseInt(parts[4], 10),
          rss: parseInt(parts[5], 10),
          tty: parts[6],
          stat: parts[7],
          start: parts[8],
          time: parts[9],
          command: parts.slice(10).join(" "),
        };
      });

      if (filter) {
        const f = (filter as string).toLowerCase();
        processes = processes.filter((p) => p.command.toLowerCase().includes(f));
      }
      if (user) {
        processes = processes.filter((p) => p.user === user);
      }

      processes = processes.slice(0, limit as number);

      return { processes, count: processes.length };
    },
  },
  {
    name: "which_command",
    description: "Find the path of a command",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to find" },
      },
      required: ["command"],
    },
    handler: async ({ command }) => {
      const result = await runCommand("which", [command as string]);
      return {
        command,
        found: result.code === 0,
        path: result.stdout.trim() || null,
      };
    },
  },
  {
    name: "kill_process",
    description: "Kill a process by PID or name",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        pid: { type: "number", description: "Process ID" },
        name: { type: "string", description: "Process name (uses pkill)" },
        signal: { type: "string", description: "Signal (default: TERM)" },
        force: { type: "boolean", description: "Use SIGKILL" },
      },
    },
    handler: async ({ pid, name, signal, force }) => {
      const sig = force ? "KILL" : (signal || "TERM");

      if (pid) {
        const result = await runCommand("kill", [`-${sig}`, String(pid)]);
        if (result.code !== 0) {
          throw new Error(`kill failed: ${result.stderr}`);
        }
        return { success: true, pid, signal: sig };
      } else if (name) {
        const result = await runCommand("pkill", [`-${sig}`, name as string]);
        return { success: result.code === 0, name, signal: sig };
      } else {
        throw new Error("Either pid or name required");
      }
    },
  },
  {
    name: "lsof",
    description: "List open files or network connections",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        port: { type: "number", description: "List processes using this port" },
        path: { type: "string", description: "List processes using this file" },
        pid: { type: "number", description: "List files open by this PID" },
      },
    },
    handler: async ({ port, path, pid }) => {
      const args: string[] = [];
      if (port) args.push("-i", `:${port}`);
      else if (path) args.push(path as string);
      else if (pid) args.push("-p", String(pid));
      else args.push("-i");

      const result = await runCommand("lsof", args);

      const lines = result.stdout.trim().split("\n");
      if (lines.length < 2) return { processes: [] };

      const processes = lines.slice(1).map((line) => {
        const parts = line.split(/\s+/);
        return {
          command: parts[0],
          pid: parseInt(parts[1]),
          user: parts[2],
          fd: parts[3],
          type: parts[4],
          name: parts.slice(8).join(" "),
        };
      });

      return { processes };
    },
  },
  {
    name: "which",
    description: "Find command location",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to find" },
        all: { type: "boolean", description: "Show all matches" },
      },
      required: ["command"],
    },
    handler: async ({ command, all }) => {
      const args = all ? ["-a", command as string] : [command as string];
      const result = await runCommand("which", args);

      if (result.code !== 0) {
        return { found: false, command };
      }

      const paths = result.stdout.trim().split("\n").filter((p) => p);
      return {
        found: true,
        command,
        path: paths[0],
        allPaths: all ? paths : undefined,
      };
    },
  },
];
