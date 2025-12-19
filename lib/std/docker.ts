/**
 * Docker tools - container and image management
 *
 * @module lib/std/tools/docker
 */

import { runCommand, type MiniTool } from "./common.ts";

export const dockerTools: MiniTool[] = [
  {
    name: "docker_ps",
    description: "List running Docker containers. Shows container status, ports, names, images, and resource usage. Use to check what services are running, debug deployment issues, monitor container health, or find container IDs for other operations. Keywords: docker ps, container list, running services, container status.",
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
    description: "List available Docker images on the system. Shows image repository, tags, sizes, and creation dates. Use to check available images before running containers, find unused images for cleanup, or verify image pulls. Keywords: docker images, image list, repository tags, container images.",
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
    description: "Fetch logs from a Docker container for debugging and monitoring. Retrieve stdout/stderr output, filter by time range, or tail recent lines. Essential for troubleshooting container issues, viewing application output, debugging crashes, and monitoring service behavior. Keywords: container logs, debug output, stderr stdout, application logs.",
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
    description: "List services defined in Docker Compose stack. Shows service status, ports, and health for multi-container applications. Use to monitor docker-compose deployments, check which services are running, verify orchestrated application state. Keywords: compose services, multi-container, stack status, docker-compose.",
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
    description: "Get real-time resource usage statistics for Docker containers. Shows CPU percentage, memory usage/limit, network I/O, and block I/O. Use for performance monitoring, identifying resource-hungry containers, capacity planning, and detecting memory leaks. Keywords: container metrics, CPU memory, resource usage, performance stats.",
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
