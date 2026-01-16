# API Reference

Public exports from `@casys/pml`.

## Package Exports

```typescript
// Main entry point
import { ... } from "jsr:@casys/pml";

// CLI entry point (for installation)
import { main } from "jsr:@casys/pml/cli";

// Sub-modules
import { ... } from "jsr:@casys/pml/workspace";
import { ... } from "jsr:@casys/pml/security";
import { ... } from "jsr:@casys/pml/permissions";
```

---

## Workspace

### resolveWorkspace()

Resolve the workspace root directory.

```typescript
function resolveWorkspace(logger?: WorkspaceLogger): Promise<WorkspaceResult>;
```

**Resolution order:**
1. `PML_WORKSPACE` environment variable
2. Auto-detect from project markers (package.json, deno.json, .git, etc.)
3. Fallback to current working directory

**Returns:** `WorkspaceResult`

```typescript
interface WorkspaceResult {
  root: string;           // Absolute path to workspace
  source: WorkspaceSource; // How it was resolved
  marker?: string;        // Project marker found (if detected)
}

type WorkspaceSource = "env" | "detected" | "fallback";
```

**Example:**

```typescript
const workspace = await resolveWorkspace();
console.log(workspace.root);   // "/home/user/my-project"
console.log(workspace.source); // "detected"
console.log(workspace.marker); // "package.json"
```

### findProjectRoot()

Find project root by walking up directory tree.

```typescript
function findProjectRoot(
  startDir: string,
  markers?: string[]
): Promise<{ root: string; marker: string } | null>;
```

### isValidWorkspace()

Check if a directory is a valid workspace.

```typescript
function isValidWorkspace(path: string): Promise<boolean>;
```

### PROJECT_MARKERS

List of files that indicate a project root.

```typescript
const PROJECT_MARKERS: string[] = [
  "package.json",
  "deno.json",
  "deno.jsonc",
  ".git",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  ".pml.json",
];
```

---

## Security

### validatePath()

Validate that a path is within the workspace.

```typescript
function validatePath(
  path: string,
  options: { workspaceRoot: string }
): Promise<PathValidationResult>;
```

**Returns:** `PathValidationResult`

```typescript
interface PathValidationResult {
  valid: boolean;
  normalizedPath?: string;  // Absolute path (if valid)
  error?: PathValidationError;
}

interface PathValidationError {
  code: PathValidationErrorCode;
  message: string;
  path: string;
  workspace: string;
}

type PathValidationErrorCode =
  | "PATH_OUTSIDE_WORKSPACE"
  | "PATH_TRAVERSAL_ATTACK"
  | "PATH_NOT_FOUND"
  | "PATH_INVALID"
  | "WORKSPACE_INVALID";
```

**Example:**

```typescript
const result = await validatePath("../../../etc/passwd", {
  workspaceRoot: "/home/user/project"
});

if (!result.valid) {
  console.error(result.error?.code); // "PATH_TRAVERSAL_ATTACK"
}
```

### createPathValidator()

Create a reusable path validator.

```typescript
function createPathValidator(workspaceRoot: string): {
  validate: (path: string) => Promise<PathValidationResult>;
};
```

### validatePathSync()

Synchronous path validation.

```typescript
function validatePathSync(
  path: string,
  options: { workspaceRoot: string }
): PathValidationResult;
```

---

## Permissions

### loadUserPermissions()

Load permissions from `.pml.json`.

```typescript
function loadUserPermissions(
  workspaceRoot?: string
): Promise<PermissionLoadResult>;
```

**Returns:** `PermissionLoadResult`

```typescript
interface PermissionLoadResult {
  permissions: PmlPermissions;
  source: "config" | "defaults";
  configPath?: string;
}

interface PmlPermissions {
  allow: string[];  // Auto-approved tools
  deny: string[];   // Always refused tools
  ask: string[];    // Require user confirmation
}
```

### checkPermission()

Check permission for a single tool.

```typescript
function checkPermission(
  toolName: string,
  permissions: PmlPermissions
): PermissionCheckResult;

type PermissionCheckResult = "allowed" | "denied" | "ask";
```

**Example:**

```typescript
const permissions = {
  allow: ["filesystem:read_*"],
  deny: ["shell:rm_rf"],
  ask: ["shell:*"]
};

checkPermission("filesystem:read_file", permissions); // "allowed"
checkPermission("shell:rm_rf", permissions);          // "denied"
checkPermission("shell:exec", permissions);           // "ask"
```

### checkCapabilityPermissions()

Check permissions for a capability that uses multiple tools.

```typescript
function checkCapabilityPermissions(
  tools: string[],
  permissions: PmlPermissions
): CapabilityPermissionResult;
```

**Returns:** `CapabilityPermissionResult`

```typescript
interface CapabilityPermissionResult {
  canExecute: boolean;       // false if any tool is denied
  approvalMode: ApprovalMode; // "hil" if any tool requires ask
  blockedTool?: string;      // Tool that blocked execution
  reason?: string;           // Human-readable reason
}

type ApprovalMode = "hil" | "auto";
```

### inferCapabilityApprovalMode()

Infer approval mode from capability metadata.

```typescript
function inferCapabilityApprovalMode(
  toolsUsed: string[],
  permissions: PmlPermissions
): ApprovalMode;
```

### matchesPattern()

Check if a tool name matches a permission pattern.

```typescript
function matchesPattern(toolName: string, pattern: string): boolean;
```

**Example:**

```typescript
matchesPattern("filesystem:read_file", "filesystem:*");     // true
matchesPattern("filesystem:read_file", "filesystem:read_*"); // true
matchesPattern("shell:exec", "filesystem:*");               // false
```

---

## Routing

### initializeRouting()

Initialize routing configuration (call at startup).

```typescript
function initializeRouting(options: {
  cloudUrl: string;
  forceSync?: boolean;
}): Promise<RoutingSyncResult>;
```

**Returns:** `RoutingSyncResult`

```typescript
interface RoutingSyncResult {
  success: boolean;
  updated: boolean;
  version: string;
  error?: string;
  fromCache: boolean;
}
```

### resolveToolRouting()

Determine where a tool should execute.

```typescript
function resolveToolRouting(toolName: string): ToolRouting;

type ToolRouting = "client" | "server";
```

**Example:**

```typescript
resolveToolRouting("filesystem:read_file"); // "client"
resolveToolRouting("tavily:search");        // "server"
```

### isClientTool() / isServerTool()

Check tool routing directly.

```typescript
function isClientTool(toolName: string): boolean;
function isServerTool(toolName: string): boolean;
```

### getClientTools() / getServerTools()

Get lists of tool namespaces.

```typescript
function getClientTools(): string[];
function getServerTools(): string[];
```

### extractNamespace()

Extract namespace from tool name.

```typescript
function extractNamespace(toolName: string): string;
```

**Example:**

```typescript
extractNamespace("filesystem:read_file"); // "filesystem"
extractNamespace("tavily:search");        // "tavily"
```

### resetRouting()

Reset routing state (for testing).

```typescript
function resetRouting(): void;
```

---

## Types

### Configuration Types

```typescript
interface PmlConfig {
  version: string;
  workspace?: string;
  cloud?: PmlCloudConfig;
  server?: PmlServerConfig;
  permissions?: PmlPermissions;
  env?: Record<string, string>;
}

interface PmlCloudConfig {
  url: string;
}

interface PmlServerConfig {
  port: number;
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

interface McpServerConfig {
  type: "http" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}
```

### Routing Types

```typescript
interface RoutingConfig {
  version: string;
  clientTools: string[];
  serverTools: string[];
  defaultRouting: ToolRouting;
}

interface RoutingCache {
  config: RoutingConfig;
  lastSync: string;
  cloudUrl: string;
}
```

### Init Types

```typescript
interface InitOptions {
  apiKey?: string;
  port?: number;
  cloudUrl?: string;
  yes?: boolean;
  force?: boolean;
}

interface InitResult {
  success: boolean;
  mcpConfigPath: string;
  pmlConfigPath: string;
  backedUp?: string;
  error?: string;
}
```

### Loader Types

```typescript
interface CapabilityLoadResult {
  status: "success" | "error" | "approval_required";
  // ... varies by status
}

interface LoadSuccessResult {
  status: "success";
  execute: (args: unknown, context: ExecutionContext) => Promise<unknown>;
  metadata: CapabilityMetadata;
}

interface ApprovalRequiredResult {
  type: "dependency" | "api_key" | "integrity" | "tool_permission";
  // ... varies by type
}

interface CapabilityMetadata {
  name: string;
  version: string;
  tools: string[];
  envRequired?: string[];
}
```

### Error Classes

```typescript
class LoaderError extends Error {
  code: LoaderErrorCode;
}

class InstallError extends Error {
  dependency: string;
}

class IntegrityError extends Error {
  expected: string;
  actual: string;
}

class CapabilityBlockedError extends Error {
  tool: string;
  reason: string;
}

class MissingKeysError extends Error {
  keys: string[];
}
```

---

## CLI Entry Point

### main()

Run the CLI.

```typescript
import { main } from "jsr:@casys/pml/cli";

await main();
```

### initProject()

Programmatically initialize a project.

```typescript
import { initProject } from "jsr:@casys/pml";

const result = await initProject({
  port: 3003,
  yes: true,
});
```
