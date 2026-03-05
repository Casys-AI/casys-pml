import type { JsonObject, ToolFamily } from "./types.ts";

const SHELL_UTIL_PREFIXES = [
  "ls",
  "cat",
  "sed",
  "awk",
  "grep",
  "rg",
  "find",
  "head",
  "tail",
  "cut",
  "sort",
  "uniq",
  "wc",
  "pwd",
  "echo",
  "xargs",
  "mkdir",
  "mv",
  "cp",
  "rm",
  "touch",
  "chmod",
  "chown",
  "ln",
  "tar",
  "gzip",
  "gunzip",
];

function readStringArg(
  args: JsonObject,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const raw = args[key];
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw.trim();
    }
  }
  return undefined;
}

function classifyExecFamily(args: JsonObject): ToolFamily {
  const command = readStringArg(args, ["command", "cmd", "script", "input"])
    ?.toLowerCase();

  if (!command) return "other";

  const startsWith = (prefix: string) =>
    command === prefix || command.startsWith(`${prefix} `);

  if (startsWith("git")) return "git";
  if (command.includes("openclaw")) return "openclaw";
  if (
    startsWith("python") || startsWith("python3") || startsWith("pip") ||
    startsWith("uv") || startsWith("pytest") || startsWith("ipython")
  ) {
    return "python";
  }
  if (
    startsWith("docker") || startsWith("docker-compose") || startsWith("podman")
  ) {
    return "docker";
  }
  if (startsWith("deno") || command.includes(" deno ")) return "deno";
  if (startsWith("gh")) return "gh";
  if (SHELL_UTIL_PREFIXES.some((prefix) => startsWith(prefix))) {
    return "shell-utils";
  }

  return "other";
}

function looksLikeJson(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function looksLikeYaml(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith("---") ||
    /^[a-zA-Z0-9_.-]+\s*:\s*.+$/m.test(trimmed);
}

function looksLikeMarkdown(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith("#") || trimmed.includes("[[") ||
    /^\s*[-*+]\s+/m.test(trimmed);
}

function looksLikeScript(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith("#!") ||
    /(\bfunction\b|\bimport\b|\bexport\b|\bdef\b|\becho\b)/.test(trimmed);
}

function classifyWriteFamily(args: JsonObject): ToolFamily {
  const filePath = readStringArg(args, [
    "file_path",
    "path",
    "filename",
    "file",
  ])
    ?.toLowerCase();
  const content = readStringArg(args, ["content", "text", "body", "data"]) ??
    "";

  if (filePath?.endsWith(".json") || looksLikeJson(content)) return "json";
  if (
    filePath?.endsWith(".yaml") || filePath?.endsWith(".yml") ||
    looksLikeYaml(content)
  ) {
    return "yaml";
  }
  if (
    filePath?.endsWith(".sh") || filePath?.endsWith(".bash") ||
    filePath?.endsWith(".zsh") || filePath?.endsWith(".py") ||
    filePath?.endsWith(".js") || filePath?.endsWith(".ts") ||
    filePath?.endsWith(".sql") || looksLikeScript(content)
  ) {
    return "script";
  }
  if (filePath?.endsWith(".md") || looksLikeMarkdown(content)) {
    return "markdown";
  }
  return "other";
}

/**
 * L2 classifier for tools that need sub-granularity.
 * - exec -> command family
 * - write -> content family
 */
export function classifyToolFamily(
  toolName: string,
  args: JsonObject,
): ToolFamily | null {
  const normalized = toolName.trim().toLowerCase();
  if (normalized === "exec") {
    return classifyExecFamily(args);
  }
  if (normalized === "write") {
    return classifyWriteFamily(args);
  }
  return null;
}
