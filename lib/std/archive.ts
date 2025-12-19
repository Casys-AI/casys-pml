/**
 * Archive tools - compression and extraction
 *
 * @module lib/std/tools/archive
 */

import { runCommand, type MiniTool } from "./common.ts";

export const archiveTools: MiniTool[] = [
  {
    name: "tar_create",
    description: "Create a tar archive",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        output: { type: "string", description: "Output archive path" },
        files: { type: "array", items: { type: "string" }, description: "Files/directories to archive" },
        compress: { type: "string", enum: ["none", "gzip", "bzip2", "xz"], description: "Compression type" },
        cwd: { type: "string", description: "Working directory" },
      },
      required: ["output", "files"],
    },
    handler: async ({ output, files, compress = "gzip", cwd }) => {
      const args = ["-c"];
      switch (compress) {
        case "gzip": args.push("-z"); break;
        case "bzip2": args.push("-j"); break;
        case "xz": args.push("-J"); break;
      }
      args.push("-f", output as string, ...(files as string[]));

      const result = await runCommand("tar", args, { cwd: cwd as string });
      if (result.code !== 0) {
        throw new Error(`tar create failed: ${result.stderr}`);
      }
      return { success: true, archive: output, files: files };
    },
  },
  {
    name: "tar_extract",
    description: "Extract a tar archive",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        archive: { type: "string", description: "Archive path" },
        destination: { type: "string", description: "Extraction destination" },
        list: { type: "boolean", description: "List contents only, don't extract" },
      },
      required: ["archive"],
    },
    handler: async ({ archive, destination, list = false }) => {
      const args = list ? ["-tvf", archive as string] : ["-xf", archive as string];
      if (destination && !list) {
        args.push("-C", destination as string);
      }

      const result = await runCommand("tar", args);
      if (result.code !== 0) {
        throw new Error(`tar extract failed: ${result.stderr}`);
      }

      if (list) {
        return { files: result.stdout.trim().split("\n") };
      }
      return { success: true, destination: destination || "." };
    },
  },
  {
    name: "zip_create",
    description: "Create a zip archive",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        output: { type: "string", description: "Output zip path" },
        files: { type: "array", items: { type: "string" }, description: "Files to zip" },
        recursive: { type: "boolean", description: "Recurse into directories (default: true)" },
      },
      required: ["output", "files"],
    },
    handler: async ({ output, files, recursive = true }) => {
      const args = recursive ? ["-r", output as string] : [output as string];
      args.push(...(files as string[]));

      const result = await runCommand("zip", args);
      if (result.code !== 0) {
        throw new Error(`zip failed: ${result.stderr}`);
      }
      return { success: true, archive: output };
    },
  },
  {
    name: "unzip",
    description: "Extract a zip archive",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        archive: { type: "string", description: "Zip archive path" },
        destination: { type: "string", description: "Extraction destination" },
        list: { type: "boolean", description: "List contents only" },
      },
      required: ["archive"],
    },
    handler: async ({ archive, destination, list = false }) => {
      const args = list ? ["-l", archive as string] : [archive as string];
      if (destination && !list) {
        args.push("-d", destination as string);
      }

      const result = await runCommand("unzip", args);
      if (result.code !== 0) {
        throw new Error(`unzip failed: ${result.stderr}`);
      }

      return list ? { contents: result.stdout } : { success: true, destination: destination || "." };
    },
  },
];
