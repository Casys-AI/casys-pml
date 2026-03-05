import type { JsonObject, ToolFamily } from "./types.ts";

export interface ToolPolicyDecision {
  family: ToolFamily | null;
  hit: boolean;
  fallbackReason?: string;
  context?: JsonObject;
}

type ToolClassifier = (args: JsonObject) => ToolPolicyDecision;

const PROJECT_ROOT = "/tmp/vx-ax-policy/lib/vault-exec";

const EXEC_INSPECT_BINARIES = new Set([
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
  "stat",
  "tree",
]);

const EXEC_MUTATING_BINARIES = new Set([
  "mkdir",
  "mv",
  "cp",
  "rm",
  "touch",
  "chmod",
  "chown",
  "ln",
  "tee",
  "truncate",
  "install",
]);

const EXEC_NETWORK_BINARIES = new Set([
  "curl",
  "wget",
  "http",
  "https",
]);

const EXEC_RUNTIME_BINARIES = new Set([
  "python",
  "python3",
  "pip",
  "uv",
  "deno",
  "node",
  "npm",
  "pnpm",
  "yarn",
  "go",
  "cargo",
  "make",
  "cmake",
  "docker",
  "docker-compose",
  "podman",
  "openclaw",
]);

const EXEC_OPS_BINARIES = new Set([
  "ps",
  "top",
  "htop",
  "kill",
  "pkill",
  "pgrep",
  "service",
  "systemctl",
  "launchctl",
  "jobs",
]);

const PROCESS_ACTIONS = new Set([
  "poll",
  "log",
  "kill",
  "list",
  "write",
  "submit",
  "send-keys",
  "wait",
]);

const BROWSER_ACTIONS = new Set([
  "act",
  "snapshot",
  "navigate",
  "open",
  "start",
  "screenshot",
  "status",
  "tabs",
  "stop",
]);

const CRON_ACTIONS = new Set([
  "add",
  "update",
  "list",
  "runs",
  "remove",
  "run",
]);
const GATEWAY_ACTIONS = new Set([
  "config.patch",
  "config.get",
  "config.schema",
  "restart",
]);
const SUBAGENT_ACTIONS = new Set(["list", "steer", "kill"]);

export const SUPPORTED_TOOL_POLICIES = [
  "exec",
  "process",
  "read",
  "edit",
  "write",
  "browser",
  "web_fetch",
  "cron",
  "message",
  "memory_search",
  "memory_get",
  "sessions_spawn",
  "web_search",
  "gateway",
  "subagents",
  "image",
  "pdf",
  "tts",
  "whatsapp_login",
  "agents_list",
  "sessions_send",
  "sessions_history",
  "session_status",
  "sessions_list",
] as const;

const TOOL_CLASSIFIERS: Record<string, ToolClassifier> = {
  exec: classifyExec,
  process: classifyProcess,
  read: classifyRead,
  edit: classifyEdit,
  write: classifyWrite,
  browser: classifyBrowser,
  web_fetch: classifyWebFetch,
  cron: classifyCron,
  message: classifyMessage,
  memory_search: classifyMemorySearch,
  memory_get: classifyMemoryGet,
  sessions_spawn: classifySessionsSpawn,
  web_search: classifyWebSearch,
  gateway: classifyGateway,
  subagents: classifySubagents,
  image: classifyImage,
  pdf: classifyPdf,
  tts: classifyTts,
  whatsapp_login: classifyWhatsappLogin,
  agents_list: classifyAgentsList,
  sessions_send: classifySessionsSend,
  sessions_history: classifySessionsHistory,
  session_status: classifySessionStatus,
  sessions_list: classifySessionsList,
};

export function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase();
}

export function isToolPolicySupported(toolName: string): boolean {
  return normalizeToolName(toolName) in TOOL_CLASSIFIERS;
}

function hit(family: ToolFamily, context?: JsonObject): ToolPolicyDecision {
  return {
    family,
    hit: true,
    ...(context ? { context } : {}),
  };
}

function fallback(reason: string, context?: JsonObject): ToolPolicyDecision {
  return {
    family: null,
    hit: false,
    fallbackReason: reason,
    ...(context ? { context } : {}),
  };
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function readStringArg(args: JsonObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(args[key]);
    if (value) return value;
  }
  return undefined;
}

function hasKey(args: JsonObject, key: string): boolean {
  return Object.hasOwn(args, key);
}

function normalizePathNamespace(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (
    normalized.startsWith(`${PROJECT_ROOT}/`) || normalized === PROJECT_ROOT
  ) {
    return "project_abs";
  }
  if (normalized.startsWith("/home/") && normalized.includes("/.openclaw/")) {
    return "openclaw_abs";
  }
  if (normalized.startsWith("~/") || normalized.startsWith("$HOME/")) {
    return "tilde";
  }
  if (normalized.startsWith("/tmp/")) {
    return "tmp_abs";
  }
  if (normalized.startsWith("/")) {
    return "abs_other";
  }
  return "relative";
}

function resolvePathArg(args: JsonObject):
  | { keyVariant: string; value: string; namespace: string }
  | undefined {
  const keys = ["file_path", "path", "filename", "file"];
  for (const key of keys) {
    const value = asString(args[key]);
    if (value) {
      return {
        keyVariant: key,
        value,
        namespace: normalizePathNamespace(value),
      };
    }
  }
  return undefined;
}

function tokenize(command: string): string[] {
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return tokens.map((token) => token.replace(/^['"]|['"]$/g, ""));
}

function normalizeExecCommand(command: string): string {
  return command.replace(/\s+/g, " ").trim();
}

function unwrapExecCommand(command: string): {
  wrappers: string[];
  primaryBinary?: string;
  unwrapped: string;
} {
  const wrappers: string[] = [];
  let current = command;

  for (let depth = 0; depth < 6; depth++) {
    const tokens = tokenize(current);
    if (tokens.length === 0) break;

    if (tokens[0] === "timeout" && tokens.length >= 3) {
      wrappers.push("timeout");
      current = tokens.slice(2).join(" ");
      continue;
    }

    if (tokens[0] === "env" && tokens.length >= 3) {
      let idx = 1;
      while (
        idx < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(tokens[idx])
      ) {
        idx += 1;
      }
      if (idx < tokens.length) {
        wrappers.push("env");
        current = tokens.slice(idx).join(" ");
        continue;
      }
    }

    if (tokens[0] === "sudo" && tokens.length >= 2) {
      wrappers.push("sudo");
      current = tokens.slice(1).join(" ");
      continue;
    }

    if (tokens[0] === "nohup" && tokens.length >= 2) {
      wrappers.push("nohup");
      current = tokens.slice(1).join(" ");
      continue;
    }

    if (
      (tokens[0] === "bash" || tokens[0] === "sh" || tokens[0] === "zsh") &&
      (tokens[1] === "-c" || tokens[1] === "-lc") &&
      tokens.length >= 3
    ) {
      wrappers.push(`${tokens[0]} ${tokens[1]}`);
      current = tokens.slice(2).join(" ");
      continue;
    }

    break;
  }

  const finalTokens = tokenize(current);
  return {
    wrappers,
    primaryBinary: finalTokens[0]?.toLowerCase(),
    unwrapped: current,
  };
}

function classifyExecFamilyFromPrimary(
  primaryBinary: string,
  normalizedUnwrapped: string,
): ToolFamily {
  if (primaryBinary === "git" || primaryBinary === "gh") return "git_vcs";
  if (
    normalizedUnwrapped.includes(" pytest") ||
    normalizedUnwrapped.startsWith("pytest") ||
    normalizedUnwrapped.includes(" deno test") ||
    normalizedUnwrapped.includes(" npm test") ||
    normalizedUnwrapped.includes(" pnpm test") ||
    normalizedUnwrapped.includes(" vitest") ||
    normalizedUnwrapped.includes(" go test") ||
    normalizedUnwrapped.includes(" cargo test")
  ) {
    return "test_validation";
  }
  if (EXEC_NETWORK_BINARIES.has(primaryBinary)) return "network_http";
  if (EXEC_INSPECT_BINARIES.has(primaryBinary)) return "inspect_fs_text";
  if (EXEC_MUTATING_BINARIES.has(primaryBinary)) return "mutating_write";
  if (EXEC_RUNTIME_BINARIES.has(primaryBinary)) return "runtime_build";
  if (EXEC_OPS_BINARIES.has(primaryBinary)) return "ops_process";
  return "other_shell";
}

function classifyExec(args: JsonObject): ToolPolicyDecision {
  const rawCommand = readStringArg(args, ["command", "cmd", "script", "input"]);
  if (!rawCommand) return fallback("missing_command");

  const normalizedCommand = normalizeExecCommand(rawCommand);
  const unwrapped = unwrapExecCommand(normalizedCommand);
  if (!unwrapped.primaryBinary) {
    return fallback("unparseable_command", {
      normalizedCommand,
      wrappers: unwrapped.wrappers,
    });
  }

  const family = classifyExecFamilyFromPrimary(
    unwrapped.primaryBinary,
    normalizeExecCommand(unwrapped.unwrapped.toLowerCase()),
  );

  return hit(family, {
    normalizedCommand,
    wrappers: unwrapped.wrappers,
    primaryBinary: unwrapped.primaryBinary,
  });
}

function classifyActionEnum(
  args: JsonObject,
  allowedActions: Set<string>,
  toolName: string,
): ToolPolicyDecision {
  const action = asString(args.action)?.toLowerCase();
  if (!action) return fallback(`missing_action:${toolName}`);
  if (!allowedActions.has(action)) {
    return fallback(`unknown_action:${toolName}`);
  }
  return hit(action);
}

function classifyProcess(args: JsonObject): ToolPolicyDecision {
  return classifyActionEnum(args, PROCESS_ACTIONS, "process");
}

function classifyRead(args: JsonObject): ToolPolicyDecision {
  const path = resolvePathArg(args);
  if (!path) return fallback("missing_path:read");
  return hit(`${path.namespace}:${path.keyVariant}`);
}

function classifyEdit(args: JsonObject): ToolPolicyDecision {
  const path = resolvePathArg(args);
  if (!path) return fallback("missing_path:edit");

  const snake = hasKey(args, "old_string") && hasKey(args, "new_string");
  const camel = hasKey(args, "oldText") && hasKey(args, "newText");

  if (!snake && !camel) return fallback("unknown_edit_schema");
  if (snake && camel) return fallback("ambiguous_edit_schema");

  const schema = snake ? "snake_case" : "camel_case";
  return hit(`${schema}:${path.namespace}`);
}

function classifyWrite(args: JsonObject): ToolPolicyDecision {
  const path = resolvePathArg(args);
  if (!path) return fallback("missing_path:write");
  return hit(`${path.namespace}:${path.keyVariant}`);
}

function classifyBrowser(args: JsonObject): ToolPolicyDecision {
  return classifyActionEnum(args, BROWSER_ACTIONS, "browser");
}

function classifyWebFetch(args: JsonObject): ToolPolicyDecision {
  const url = readStringArg(args, ["url", "href"]);
  if (!url) return fallback("missing_url:web_fetch");

  const extractMode = asString(args.extractMode)?.toLowerCase() === "text"
    ? "text"
    : "default";
  const maxChars = asNumber(args.maxChars);
  let bucket = "default";
  if (typeof maxChars === "number") {
    if (maxChars <= 2_000) bucket = "small";
    else if (maxChars <= 10_000) bucket = "medium";
    else bucket = "large";
  }
  return hit(`${extractMode}:${bucket}`);
}

function classifyCron(args: JsonObject): ToolPolicyDecision {
  return classifyActionEnum(args, CRON_ACTIONS, "cron");
}

function classifyMessage(args: JsonObject): ToolPolicyDecision {
  const action = asString(args.action)?.toLowerCase();
  if (action && action !== "send" && action !== "reply" && action !== "react") {
    return fallback("unknown_action:message");
  }

  const message = readStringArg(args, ["message", "text", "body"]);
  const media = args.media;
  const images = args.images;
  const asVoice = args.asVoice === true;
  const filePath = readStringArg(args, ["filePath", "file_path", "file"]);

  const hasMedia = (Array.isArray(media) && media.length > 0) ||
    (typeof media === "string" && media.trim().length > 0) ||
    (Array.isArray(images) && images.length > 0);

  if (asVoice && (message || hasMedia)) return hit("voice");
  if (hasMedia) return hit("media");
  if (filePath) return hit("file_attachment");
  if (message) return hit("text_only");

  return fallback("missing_payload:message");
}

function classifyMemorySearch(args: JsonObject): ToolPolicyDecision {
  const query = readStringArg(args, ["query"]);
  if (!query) return fallback("missing_query:memory_search");
  if (typeof asNumber(args.maxResults) === "number") return hit("bounded");
  if (typeof asNumber(args.minScore) === "number") return hit("scored");
  return hit("default");
}

function classifyMemoryGet(args: JsonObject): ToolPolicyDecision {
  const path = readStringArg(args, ["path"]);
  if (!path) return fallback("missing_path:memory_get");
  if (
    typeof asNumber(args.from) === "number" ||
    typeof asNumber(args.lines) === "number"
  ) {
    return hit("range_read");
  }
  return hit("full_read");
}

function classifySessionsSpawn(args: JsonObject): ToolPolicyDecision {
  const task = readStringArg(args, ["task"]);
  if (!task) return fallback("missing_task:sessions_spawn");

  const runtime = readStringArg(args, ["runtime"]);
  const agentId = readStringArg(args, ["agentId"]);
  const cwd = readStringArg(args, ["cwd"]);
  if (runtime || agentId || cwd) return hit("runtime_specific");

  const model = readStringArg(args, ["model"]);
  if (model) return hit("model_pinned");

  const label = readStringArg(args, ["label"]);
  if (label) return hit("minimal");

  return fallback("missing_mode_fields:sessions_spawn");
}

function classifyWebSearch(args: JsonObject): ToolPolicyDecision {
  const query = readStringArg(args, ["query"]);
  if (!query) return fallback("missing_query:web_search");

  const hasCountry = readStringArg(args, ["country"]) !== undefined;
  const hasLanguage =
    readStringArg(args, ["language", "search_lang"]) !== undefined;
  const hasFreshness = readStringArg(args, ["freshness"]) !== undefined;

  const filters =
    [hasCountry, hasLanguage, hasFreshness].filter(Boolean).length;

  if (filters > 1) return hit("mixed_filtered");
  if (hasFreshness) return hit("freshness_filtered");
  if (hasCountry) return hit("country_filtered");
  if (hasLanguage) return hit("language_filtered");
  return hit("default");
}

function classifyGateway(args: JsonObject): ToolPolicyDecision {
  const action = asString(args.action)?.toLowerCase();
  if (!action) return fallback("missing_action:gateway");
  if (!GATEWAY_ACTIONS.has(action)) return fallback("unknown_action:gateway");

  if (
    action === "config.patch" &&
    !hasKey(args, "patch") &&
    readStringArg(args, ["raw"]) === undefined
  ) {
    return fallback("missing_patch_payload:gateway");
  }

  return hit(action);
}

function classifySubagents(args: JsonObject): ToolPolicyDecision {
  const action = asString(args.action)?.toLowerCase();
  if (!action) return fallback("missing_action:subagents");
  if (!SUBAGENT_ACTIONS.has(action)) {
    return fallback("unknown_action:subagents");
  }

  if (
    action === "steer" &&
    readStringArg(args, ["target", "id", "agentId"]) === undefined
  ) {
    return fallback("missing_target:subagents");
  }

  return hit(action);
}

function classifyImage(args: JsonObject): ToolPolicyDecision {
  const image = args.image;
  const images = args.images;

  if (Array.isArray(images) && images.length > 1) return hit("multi");
  if ((Array.isArray(images) && images.length === 1) || image !== undefined) {
    return hit("single");
  }

  return fallback("missing_image_payload:image");
}

function classifySessionsSend(args: JsonObject): ToolPolicyDecision {
  const message = readStringArg(args, ["message", "text", "body"]);
  if (!message) return fallback("missing_message:sessions_send");

  const sessionKey = readStringArg(args, ["sessionKey"]);
  const agentId = readStringArg(args, ["agentId"]);

  if (sessionKey) return hit("session_key");
  if (agentId) return hit("agent_id");
  return fallback("missing_destination:sessions_send");
}

function classifySessionsHistory(args: JsonObject): ToolPolicyDecision {
  const sessionKey = readStringArg(args, ["sessionKey"]);
  if (!sessionKey) return fallback("missing_sessionKey:sessions_history");

  if (args.includeTools === true) return hit("with_tools");
  if (args.includeTools === false || !hasKey(args, "includeTools")) {
    return hit("without_tools");
  }

  return fallback("invalid_includeTools:sessions_history");
}

function classifySessionStatus(args: JsonObject): ToolPolicyDecision {
  if (!hasKey(args, "model")) return hit("default_scope");
  if (asString(args.model)) return hit("model_scoped");
  return fallback("invalid_model:session_status");
}

function classifySessionsList(args: JsonObject): ToolPolicyDecision {
  const kinds = args.kinds;
  if (kinds !== undefined && !Array.isArray(kinds)) {
    return fallback("invalid_kinds:sessions_list");
  }

  const limit = args.limit;
  const activeMinutes = args.activeMinutes;
  const messageLimit = args.messageLimit;

  if (limit !== undefined && typeof asNumber(limit) !== "number") {
    return fallback("invalid_limit:sessions_list");
  }
  if (
    activeMinutes !== undefined && typeof asNumber(activeMinutes) !== "number"
  ) {
    return fallback("invalid_activeMinutes:sessions_list");
  }
  if (
    messageLimit !== undefined && typeof asNumber(messageLimit) !== "number"
  ) {
    return fallback("invalid_messageLimit:sessions_list");
  }

  const hasFilters = hasKey(args, "limit") ||
    hasKey(args, "activeMinutes") ||
    hasKey(args, "kinds") ||
    hasKey(args, "messageLimit");

  return hit(hasFilters ? "filtered" : "none");
}

function classifyPdf(args: JsonObject): ToolPolicyDecision {
  if (args.pdf !== undefined) return hit("single");
  if (Array.isArray(args.pdfs) && args.pdfs.length > 0) {
    return hit(args.pdfs.length > 1 ? "multi" : "single");
  }
  return fallback("missing_pdf_payload:pdf");
}

function classifyTts(args: JsonObject): ToolPolicyDecision {
  const text = readStringArg(args, ["text"]);
  if (!text) return fallback("missing_text:tts");
  return hasKey(args, "channel") ? hit("channel_scoped") : hit("default");
}

function classifyWhatsappLogin(args: JsonObject): ToolPolicyDecision {
  const action = readStringArg(args, ["action"]);
  if (!action) return fallback("missing_action:whatsapp_login");
  if (action !== "start" && action !== "wait") {
    return fallback("unknown_action:whatsapp_login");
  }
  return hit(action);
}

function classifyAgentsList(_args: JsonObject): ToolPolicyDecision {
  return hit("list");
}

export function classifyToolCallL2(
  toolName: string,
  args: JsonObject,
): ToolPolicyDecision {
  const normalized = normalizeToolName(toolName);
  const classifier = TOOL_CLASSIFIERS[normalized];
  if (!classifier) {
    return fallback("unsupported_tool");
  }

  return classifier(args);
}

export function classifyToolFamily(
  toolName: string,
  args: JsonObject,
): ToolFamily | null {
  return classifyToolCallL2(toolName, args).family;
}
