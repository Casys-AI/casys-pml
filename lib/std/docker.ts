/**
 * Docker tools - container and image management
 *
 * @module lib/std/tools/docker
 */

import { runCommand, type MiniTool } from "./common.ts";

export const dockerTools: MiniTool[] = [
  {
    name: "docker_ps",
    description: "List Docker containers (docker ps)",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        all: { type: "boolean", description: "Show all containers (default: only running)" },
        format: { type: "string", description: "Output format (json, table)" },
      },
    },
    handler: async ({ all = false, format = "json" }) => {
      const args = ["ps"];
      if (all) args.push("-a");
      if (format === "json") args.push("--format", "{{json .}}");

      const result = await runCommand("docker", args);
      if (result.code !== 0) {
        throw new Error(`docker ps failed: ${result.stderr}`);
      }

      if (format === "json") {
        const lines = result.stdout.trim().split("\n").filter(Boolean);
        const containers = lines.map((line) => JSON.parse(line));
        return { containers, count: containers.length };
      }
      return result.stdout;
    },
  },
  {
    name: "docker_images",
    description: "List Docker images (docker images)",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        all: { type: "boolean", description: "Show all images including intermediates" },
        format: { type: "string", description: "Output format (json, table)" },
      },
    },
    handler: async ({ all = false, format = "json" }) => {
      const args = ["images"];
      if (all) args.push("-a");
      if (format === "json") args.push("--format", "{{json .}}");

      const result = await runCommand("docker", args);
      if (result.code !== 0) {
        throw new Error(`docker images failed: ${result.stderr}`);
      }

      if (format === "json") {
        const lines = result.stdout.trim().split("\n").filter(Boolean);
        const images = lines.map((line) => JSON.parse(line));
        return { images, count: images.length };
      }
      return result.stdout;
    },
  },
  {
    name: "docker_logs",
    description: "Get logs from a Docker container",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        container: { type: "string", description: "Container ID or name" },
        tail: { type: "number", description: "Number of lines to show from end (default: 100)" },
        since: { type: "string", description: "Show logs since timestamp (e.g., '10m', '1h')" },
      },
      required: ["container"],
    },
    handler: async ({ container, tail = 100, since }) => {
      const args = ["logs", "--tail", String(tail)];
      if (since) args.push("--since", since as string);
      args.push(container as string);

      const result = await runCommand("docker", args);
      if (result.code !== 0) {
        throw new Error(`docker logs failed: ${result.stderr}`);
      }
      return { logs: result.stdout, stderr: result.stderr };
    },
  },
  {
    name: "docker_compose_ps",
    description: "List Docker Compose services",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "Compose file path (default: docker-compose.yml)" },
        cwd: { type: "string", description: "Working directory" },
      },
    },
    handler: async ({ file, cwd }) => {
      const args = ["compose"];
      if (file) args.push("-f", file as string);
      args.push("ps", "--format", "json");

      const result = await runCommand("docker", args, { cwd: cwd as string });
      if (result.code !== 0) {
        throw new Error(`docker compose ps failed: ${result.stderr}`);
      }

      try {
        const services = JSON.parse(result.stdout);
        return { services, count: services.length };
      } catch {
        return { output: result.stdout };
      }
    },
  },
  {
    name: "docker_stats",
    description: "Get Docker container resource usage statistics",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        container: { type: "string", description: "Container ID or name (optional, all if omitted)" },
      },
    },
    handler: async ({ container }) => {
      const args = ["stats", "--no-stream", "--format", "{{json .}}"];
      if (container) args.push(container as string);

      const result = await runCommand("docker", args);
      if (result.code !== 0) {
        throw new Error(`docker stats failed: ${result.stderr}`);
      }

      const lines = result.stdout.trim().split("\n").filter(Boolean);
      const stats = lines.map((line) => JSON.parse(line));
      return { stats, count: stats.length };
    },
  },
];
