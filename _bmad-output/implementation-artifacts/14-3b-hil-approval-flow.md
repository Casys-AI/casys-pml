# Story 14.3b: HIL Approval Flow for Stdio Mode

Status: draft

> **Epic:** 14 - JSR Package Local/Cloud MCP Routing
> **Extends:** Story 14.3 (Permission Inference - AC7-8 "Always Approve")
> **Fixes:** Story 14.4 (HIL callback approach doesn't work in stdio)
> **Prerequisites:** Story 14.3 (DONE), Story 14.4 (DONE)

## Story

As a developer using PML via Claude Code, I want dependency installation approval to work
seamlessly through Claude's native UI, So that I can approve, always-approve, or abort
without breaking the JSON-RPC protocol.

## Problem Context

### Why the Current Approach Doesn't Work

Story 14.4 implemented HIL as a blocking callback:

```typescript
// capability-loader.ts (current - BROKEN)
const approved = await this.hilCallback(prompt, dep);
// ↑ Tries to read from stdin, but stdin = JSON-RPC from Claude Code!
```

**Problems:**
1. **stdin is JSON-RPC** - not user terminal input
2. **Blocking** - stops the JSON-RPC loop
3. **No Claude UI** - user doesn't see Continue/Abort buttons

### The Correct Pattern

Claude Code expects MCP servers to return a response that triggers its native UI:

```
Tool call: serena:analyze
    │
    ▼
PML: Check permission → "ask"
    │
    ▼
PML: Return JSON-RPC response with approval_required
    │
    ▼
Claude Code: Shows [Continue] [Always] [Abort] UI
    │
    ├─► User clicks Continue → Claude calls with continue_workflow
    ├─► User clicks Always   → Claude calls with continue_workflow + always:true
    └─► User clicks Abort    → Claude stops (no call)
    │
    ▼
PML: Receives continue_workflow → proceeds with installation
```

## Acceptance Criteria

### AC1-2: Approval Required Response

**Given** a tool call for a capability with uninstalled dependencies
**And** the tool permission is "ask" (not in allow list)
**When** PML processes the request
**Then** it returns an MCP response with `approval_required: true`:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "Approval required to install serena@0.5.0"
    }],
    "approval_required": true,
    "approval_context": {
      "type": "dependency_install",
      "tool": "serena:analyze",
      "dependency": {
        "name": "serena",
        "version": "0.5.0",
        "install": "npx @anthropic/serena@0.5.0"
      },
      "workflow_id": "uuid-for-continuation"
    }
  }
}
```
**And** the response includes a unique `workflow_id` for continuation

### AC3-4: Continue Workflow Handling

**Given** Claude Code receives an `approval_required` response
**When** user clicks [Continue]
**Then** Claude calls the same tool with `continue_workflow` parameter:
```json
{
  "name": "tools/call",
  "params": {
    "name": "serena:analyze",
    "arguments": {
      "continue_workflow": {
        "workflow_id": "uuid-from-previous",
        "approved": true,
        "always": false
      }
    }
  }
}
```

**Given** PML receives a `continue_workflow` request
**When** `approved: true`
**Then** it proceeds with dependency installation
**And** executes the original tool call
**And** returns the tool result

### AC5-6: Always Approve & Permission Persistence

**Given** user clicks [Always] in Claude UI
**When** PML receives `continue_workflow` with `always: true`
**Then** it adds the tool pattern to user's allow list in `.pml.json`:
```json
{
  "permissions": {
    "allow": ["existing:tools", "serena:analyze"]
  }
}
```
**And** proceeds with installation
**And** future calls to `serena:analyze` skip approval

**Given** a tool is in the user's `allow` list
**When** it requires dependency installation
**Then** installation proceeds automatically (no approval_required)

### AC7-8: Auto-Approve for Allowed Tools

**Given** a tool call for `filesystem:read_file`
**And** `.pml.json` has `allow: ["filesystem:*"]`
**When** the capability requires dependencies
**Then** dependencies are installed automatically
**And** no `approval_required` is returned
**And** the tool executes immediately

### AC9-10: Abort Handling

**Given** user clicks [Abort] in Claude UI
**When** Claude doesn't call back (or calls with `approved: false`)
**Then** no installation occurs
**And** the workflow_id expires after timeout (5 min)

**Given** an expired or invalid `workflow_id`
**When** a `continue_workflow` request arrives
**Then** PML returns an error: "Workflow expired or not found"

## Tasks / Subtasks

### Phase 1: Types & Response Structure (~30m)

- [ ] Task 1: Add approval types to loader/types.ts
  - [ ] `ApprovalRequiredResponse` interface
  - [ ] `ContinueWorkflowParams` interface
  - [ ] `PendingWorkflow` for tracking state
  - [ ] Remove `HilCallback` type (no longer used)

### Phase 2: Workflow State Management (~45m)

- [ ] Task 2: Create workflow state tracker
  - [ ] Create `packages/pml/src/loader/workflow-state.ts`
  - [ ] `createPendingWorkflow(tool, dep)` → returns workflow_id
  - [ ] `getPendingWorkflow(workflow_id)` → returns context or null
  - [ ] `expireWorkflow(workflow_id)` → cleanup
  - [ ] In-memory store with 5min TTL

### Phase 3: Capability Loader Modifications (~1h)

- [ ] Task 3: Modify ensureDependency to return approval status
  - [ ] Check permission via `checkToolPermission(tool)`
  - [ ] If "allow" → install automatically, return `{ proceed: true }`
  - [ ] If "ask" → return `{ approval_required: true, workflow_id, dep }`
  - [ ] If "deny" → throw error

- [ ] Task 4: Remove HilCallback from CapabilityLoader
  - [ ] Remove `hilCallback` from constructor options
  - [ ] Remove blocking callback logic
  - [ ] Return approval status instead of blocking

### Phase 4: Stdio Command Integration (~1h)

- [ ] Task 5: Handle approval_required in handleToolsCall
  - [ ] Detect when loader returns approval_required
  - [ ] Format MCP response with approval_context
  - [ ] Store pending workflow

- [ ] Task 6: Handle continue_workflow parameter
  - [ ] Detect `continue_workflow` in tool arguments
  - [ ] Validate workflow_id
  - [ ] If `always: true` → call `addToAllowList(tool)`
  - [ ] Proceed with installation and execution

### Phase 5: Permission Persistence (~30m)

- [ ] Task 7: Add addToAllowList to permissions/loader.ts
  - [ ] Read current `.pml.json`
  - [ ] Add tool to `permissions.allow` array
  - [ ] Write back to file
  - [ ] Handle file not existing (create with defaults)

### Phase 6: Tests (~1h)

- [ ] Task 8: Unit tests for workflow state
  - [ ] Create, get, expire workflows
  - [ ] TTL expiration

- [ ] Task 9: Unit tests for approval flow
  - [ ] approval_required response format
  - [ ] continue_workflow handling
  - [ ] always → permission persistence

- [ ] Task 10: Integration test
  - [ ] Full flow: call → approval_required → continue → execute

## Dev Notes

### Pending Workflow State

```typescript
// packages/pml/src/loader/workflow-state.ts

interface PendingWorkflow {
  id: string;
  tool: string;
  dependency: McpDependency;
  originalArgs: unknown;
  createdAt: Date;
  expiresAt: Date;
}

class WorkflowState {
  private pending = new Map<string, PendingWorkflow>();
  private readonly ttlMs = 5 * 60 * 1000; // 5 min

  create(tool: string, dep: McpDependency, args: unknown): string {
    const id = crypto.randomUUID();
    this.pending.set(id, {
      id,
      tool,
      dependency: dep,
      originalArgs: args,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.ttlMs),
    });
    return id;
  }

  get(id: string): PendingWorkflow | null {
    const workflow = this.pending.get(id);
    if (!workflow) return null;
    if (workflow.expiresAt < new Date()) {
      this.pending.delete(id);
      return null;
    }
    return workflow;
  }

  complete(id: string): void {
    this.pending.delete(id);
  }
}
```

### Modified Capability Loader

```typescript
// capability-loader.ts - ensureDependency returns status, doesn't block

interface DependencyCheckResult {
  proceed: boolean;
  approval_required?: boolean;
  workflow_id?: string;
  dependency?: McpDependency;
}

private async checkDependency(
  dep: McpDependency,
  tool: string,
  args: unknown,
): Promise<DependencyCheckResult> {
  // Already installed?
  if (this.depState.isInstalled(dep.name, dep.version)) {
    return { proceed: true };
  }

  // Check permission
  const permission = checkToolPermission(tool); // from permissions/loader.ts

  if (permission === "allow") {
    // Auto-install
    await this.installer.install(dep);
    return { proceed: true };
  }

  if (permission === "deny") {
    throw new LoaderError("TOOL_DENIED", `Tool ${tool} is denied by user config`);
  }

  // permission === "ask" → return approval_required
  const workflow_id = this.workflowState.create(tool, dep, args);
  return {
    proceed: false,
    approval_required: true,
    workflow_id,
    dependency: dep,
  };
}
```

### Stdio Command Handler

```typescript
// stdio-command.ts

async function handleToolsCall(
  id: string | number,
  params: { name: string; arguments?: Record<string, unknown> },
  loader: CapabilityLoader,
): Promise<void> {
  const { name, arguments: args } = params;

  // Check for continue_workflow
  if (args?.continue_workflow) {
    const { workflow_id, approved, always } = args.continue_workflow;

    if (!approved) {
      sendError(id, -32000, "Workflow aborted by user");
      return;
    }

    // Always approve → persist to .pml.json
    if (always) {
      const workflow = loader.getWorkflow(workflow_id);
      if (workflow) {
        await addToAllowList(workflow.tool);
      }
    }

    // Continue with installation
    const result = await loader.continueWorkflow(workflow_id);
    sendResponse({ jsonrpc: "2.0", id, result });
    return;
  }

  // Normal call
  try {
    const result = await loader.call(name, args ?? {});

    // Check if approval required
    if (result.approval_required) {
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{
            type: "text",
            text: `Approval required: Install ${result.dependency.name}@${result.dependency.version}?`
          }],
          approval_required: true,
          approval_context: {
            type: "dependency_install",
            tool: name,
            dependency: result.dependency,
            workflow_id: result.workflow_id,
          }
        }
      });
      return;
    }

    // Normal result
    sendResponse({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      }
    });
  } catch (error) {
    sendError(id, -32603, error.message);
  }
}
```

### Permission Persistence

```typescript
// packages/pml/src/permissions/loader.ts

export async function addToAllowList(
  tool: string,
  workspace: string,
): Promise<void> {
  const configPath = join(workspace, ".pml.json");

  let config: PmlConfig = { version: "0.1.0" };

  if (await exists(configPath)) {
    const content = await Deno.readTextFile(configPath);
    config = JSON.parse(content);
  }

  // Ensure permissions structure
  config.permissions = config.permissions ?? { allow: [], deny: [], ask: ["*"] };

  // Add tool if not already present
  if (!config.permissions.allow.includes(tool)) {
    config.permissions.allow.push(tool);
  }

  // Write back
  await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
}
```

## Future Optimization (Option B)

Pre-spawn allowed MCPs at startup for better latency:

```typescript
// In stdio-command.ts startup

async function prespawnAllowedMcps(loader: CapabilityLoader): Promise<void> {
  const allowed = await getAllowedTools(); // from .pml.json
  const deps = await loader.getDepsForTools(allowed);

  // Spawn in background (don't await)
  for (const dep of deps) {
    loader.stdioManager.getOrSpawn(dep).catch(() => {
      // Ignore errors - just optimization
    });
  }
}
```

## Estimation

- **Effort:** 1-2 days
- **LOC:** ~400 net
  - workflow-state.ts: ~60 lines
  - capability-loader.ts modifications: ~100 lines
  - stdio-command.ts modifications: ~80 lines
  - permissions/loader.ts addition: ~40 lines
  - tests: ~120 lines
- **Risk:** Low
  - Clear pattern from existing pml_execute flow
  - No external dependencies

## Dependencies

- Story 14.3 (DONE): Permission checking (`checkToolPermission`)
- Story 14.4 (DONE): CapabilityLoader, DepInstaller, StdioManager

## References

- Epic 14 lines 361-372: HIL PAUSE flow concept
- Story 14.3 AC7-8: "Always Approve" UI concept
- packages/pml/src/loader/capability-loader.ts: Current (broken) HilCallback

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Context Reference

- `packages/pml/src/loader/capability-loader.ts:210-223` - Current blocking HIL
- `packages/pml/src/cli/stdio-command.ts:105-143` - handleToolsCall
- `packages/pml/src/permissions/loader.ts` - Permission loading

### Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-06 | Story created from code review findings | Claude Opus 4.5 |
