/**
 * Text processing tools - sed, awk, jq, sort, etc.
 *
 * @module lib/std/tools/text
 */

import { runCommand, type MiniTool } from "./common.ts";

export const textTools: MiniTool[] = [
  {
    name: "sed",
    description: "Stream editor for text transformation",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or input file path" },
        expression: { type: "string", description: "sed expression (e.g., 's/old/new/g')" },
        inPlace: { type: "boolean", description: "Modify file in place" },
      },
      required: ["expression"],
    },
    handler: async ({ input, file, expression, inPlace }) => {
      if (input) {
        const cmd = new Deno.Command("sed", {
          args: [expression as string],
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout, stderr } = await process.output();
        return {
          output: new TextDecoder().decode(stdout),
          stderr: new TextDecoder().decode(stderr),
        };
      } else if (file) {
        const args = inPlace ? ["-i", expression as string, file as string] : [expression as string, file as string];
        const result = await runCommand("sed", args);
        return { output: result.stdout, stderr: result.stderr };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "awk",
    description: "Pattern scanning and text processing",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or input file path" },
        program: { type: "string", description: "awk program (e.g., '{print $1}')" },
        fieldSeparator: { type: "string", description: "Field separator (default: whitespace)" },
      },
      required: ["program"],
    },
    handler: async ({ input, file, program, fieldSeparator }) => {
      const args: string[] = [];
      if (fieldSeparator) args.push("-F", fieldSeparator as string);
      args.push(program as string);

      if (input) {
        const cmd = new Deno.Command("awk", {
          args,
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout, stderr } = await process.output();
        return {
          output: new TextDecoder().decode(stdout),
          stderr: new TextDecoder().decode(stderr),
        };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("awk", args);
        return { output: result.stdout, stderr: result.stderr };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "jq",
    description: "JSON processor",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "JSON input" },
        file: { type: "string", description: "Or JSON file path" },
        filter: { type: "string", description: "jq filter (e.g., '.name', '.[0]')" },
        raw: { type: "boolean", description: "Raw output (no quotes on strings)" },
      },
      required: ["filter"],
    },
    handler: async ({ input, file, filter, raw }) => {
      const args: string[] = [];
      if (raw) args.push("-r");
      args.push(filter as string);

      if (input) {
        const cmd = new Deno.Command("jq", {
          args,
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout, stderr } = await process.output();
        const output = new TextDecoder().decode(stdout);
        const stderrStr = new TextDecoder().decode(stderr);
        try {
          return { result: JSON.parse(output) };
        } catch {
          return { output, stderr: stderrStr || undefined };
        }
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("jq", args);
        try {
          return { result: JSON.parse(result.stdout) };
        } catch {
          return { output: result.stdout, stderr: result.stderr || undefined };
        }
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "wc",
    description: "Word, line, character count",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or file path" },
        mode: {
          type: "string",
          enum: ["all", "lines", "words", "chars", "bytes"],
          description: "Count mode (default: all)",
        },
      },
    },
    handler: async ({ input, file, mode = "all" }) => {
      const args: string[] = [];
      switch (mode) {
        case "lines": args.push("-l"); break;
        case "words": args.push("-w"); break;
        case "chars": args.push("-m"); break;
        case "bytes": args.push("-c"); break;
      }

      if (input) {
        const cmd = new Deno.Command("wc", {
          args,
          stdin: "piped",
          stdout: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout } = await process.output();
        const output = new TextDecoder().decode(stdout).trim();
        const parts = output.split(/\s+/).map((n) => parseInt(n)).filter((n) => !isNaN(n));

        if (mode === "all") {
          return { lines: parts[0], words: parts[1], bytes: parts[2] };
        }
        return { count: parts[0] };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("wc", args);
        const parts = result.stdout.trim().split(/\s+/).map((n) => parseInt(n)).filter((n) => !isNaN(n));

        if (mode === "all") {
          return { lines: parts[0], words: parts[1], bytes: parts[2], file };
        }
        return { count: parts[0], file };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "head",
    description: "Get first N lines of text",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "File path" },
        input: { type: "string", description: "Or input text" },
        lines: { type: "number", description: "Number of lines (default: 10)" },
      },
    },
    handler: async ({ file, input, lines = 10 }) => {
      if (input) {
        const allLines = (input as string).split("\n");
        return { output: allLines.slice(0, lines as number).join("\n") };
      } else if (file) {
        const result = await runCommand("head", ["-n", String(lines), file as string]);
        return { output: result.stdout };
      } else {
        throw new Error("Either file or input required");
      }
    },
  },
  {
    name: "tail",
    description: "Get last N lines of text",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "File path" },
        input: { type: "string", description: "Or input text" },
        lines: { type: "number", description: "Number of lines (default: 10)" },
      },
    },
    handler: async ({ file, input, lines = 10 }) => {
      if (input) {
        const allLines = (input as string).split("\n");
        return { output: allLines.slice(-(lines as number)).join("\n") };
      } else if (file) {
        const result = await runCommand("tail", ["-n", String(lines), file as string]);
        return { output: result.stdout };
      } else {
        throw new Error("Either file or input required");
      }
    },
  },
  {
    name: "sort_lines",
    description: "Sort lines of text",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or file path" },
        reverse: { type: "boolean", description: "Reverse order" },
        numeric: { type: "boolean", description: "Numeric sort" },
        unique: { type: "boolean", description: "Remove duplicates" },
      },
    },
    handler: async ({ input, file, reverse, numeric, unique }) => {
      const args: string[] = [];
      if (reverse) args.push("-r");
      if (numeric) args.push("-n");
      if (unique) args.push("-u");

      if (input) {
        const cmd = new Deno.Command("sort", {
          args,
          stdin: "piped",
          stdout: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout } = await process.output();
        return { output: new TextDecoder().decode(stdout) };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("sort", args);
        return { output: result.stdout };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "uniq",
    description: "Filter or count unique lines",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text (should be sorted)" },
        file: { type: "string", description: "Or file path" },
        count: { type: "boolean", description: "Prefix lines with count" },
        duplicatesOnly: { type: "boolean", description: "Only show duplicates" },
      },
    },
    handler: async ({ input, file, count, duplicatesOnly }) => {
      const args: string[] = [];
      if (count) args.push("-c");
      if (duplicatesOnly) args.push("-d");

      if (input) {
        const cmd = new Deno.Command("uniq", {
          args,
          stdin: "piped",
          stdout: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout } = await process.output();
        return { output: new TextDecoder().decode(stdout) };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("uniq", args);
        return { output: result.stdout };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "cut",
    description: "Extract columns/fields from text",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or file path" },
        delimiter: { type: "string", description: "Field delimiter (default: tab)" },
        fields: { type: "string", description: "Fields to extract (e.g., '1,3' or '2-4')" },
        characters: { type: "string", description: "Character positions (e.g., '1-10')" },
      },
    },
    handler: async ({ input, file, delimiter, fields, characters }) => {
      const args: string[] = [];
      if (delimiter) args.push("-d", delimiter as string);
      if (fields) args.push("-f", fields as string);
      if (characters) args.push("-c", characters as string);

      if (input) {
        const cmd = new Deno.Command("cut", {
          args,
          stdin: "piped",
          stdout: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout } = await process.output();
        return { output: new TextDecoder().decode(stdout) };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("cut", args);
        return { output: result.stdout };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "diff",
    description: "Compare two files",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file1: { type: "string", description: "First file" },
        file2: { type: "string", description: "Second file" },
        unified: { type: "boolean", description: "Unified format (default: true)" },
        context: { type: "number", description: "Lines of context (default: 3)" },
      },
      required: ["file1", "file2"],
    },
    handler: async ({ file1, file2, unified = true, context = 3 }) => {
      const args: string[] = [];
      if (unified) args.push("-u", `-U${context}`);
      args.push(file1 as string, file2 as string);

      const result = await runCommand("diff", args);
      return {
        identical: result.code === 0,
        diff: result.stdout,
      };
    },
  },
];
