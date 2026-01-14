# ADR-062: Client-Server Workflow State Separation

**Status:** Accepted
**Date:** 2026-01-11
**Epic:** 14 - JSR Package Local/Cloud MCP Routing
**Supersedes:** Story 14.3b assumption of "stateless approval"

## Context

During Epic 14 implementation, Story 14.3b assumed that HIL approval flows could be **stateless** - the capability metadata would contain all needed context. However, testing revealed this assumption was incorrect.

### The Problem

When a `continue_workflow` arrives after dependency approval:

1. The **client** generated the `workflow_id` (for MCP installation approval)
2. The **client** forwarded `continue_workflow` to the **server**
3. The **server** looked up `workflow_id` in its `WorkflowRepository`
4. **Not found** → `result: null` → Nothing happens

The workflow_id was generated client-side but never stored, and the server had no knowledge of it.

### Discovery

The code that needs to be re-executed after approval (`mcp.filesystem.read_file(...)`) is only available at the moment of the first execution. When `continue_workflow` arrives, we need to:

1. Retrieve the original code
2. Re-execute it with the dependency now installed

This requires **state** - the "stateless" assumption was wrong.

## Decision

Implement a **dual workflow system** with clear separation of concerns:

### Client-Side: `PendingWorkflowStore`

**Location:** `packages/pml/src/workflow/pending-store.ts`

**Manages:**
- Dependency installation approvals (MCP not installed)
- API key configuration approvals (key missing from `.env`)
- Integrity update approvals (hash changed in lockfile)

**Storage:** In-memory Map (lives for duration of Claude Code session)

**TTL:** 5 minutes (matches MCP workflow expiration)

**Stored data:**
```typescript
interface PendingWorkflow {
  code: string;           // Original code to re-execute
  toolId: string;         // Tool that triggered approval
  approvalType: ApprovalType;  // "dependency" | "api_key_required" | "integrity"
  dependency?: McpDependency;  // For dependency approvals
  createdAt: number;      // For TTL expiration
}
```

### Server-Side: `WorkflowRepository` + `CheckpointManager`

**Location:** `src/dag/checkpoint-manager.ts`, `src/domain/interfaces/workflow-repository.ts`

**Manages:**
- DAG multi-layer HIL approvals
- Per-layer checkpoints for resume
- Long-running workflow state

**Storage:** PostgreSQL (persists across restarts)

**Stored data:** Full `WorkflowState` including layer results, task states, messages

### Routing Logic

When `continue_workflow` arrives at the client:

```typescript
// In stdio-command.ts
if (execContinueWorkflow) {
  // Check if this is a LOCAL workflow
  const pending = pendingWorkflowStore.get(workflowId);

  if (pending) {
    // Handle locally - install dep, re-execute code
    await installDependency(pending.dependency);
    const result = await executeLocalCode(pending.code, ...);
    pendingWorkflowStore.delete(workflowId);
    return result;
  }

  // Not local → forward to server (DAG HIL)
  await forwardToCloud(continue_workflow);
}
```

## Rationale

### Why Two Systems?

| Aspect | Client Workflows | Server Workflows |
|--------|-----------------|------------------|
| **Who acts?** | Client only (install on user machine) | Server only (execute DAG layers) |
| **Duration** | Seconds | Minutes to hours |
| **Persistence** | Not needed (one-shot) | Required (resume after crash) |
| **Data size** | Small (code + dep info) | Large (full DAG state) |
| **Access** | User's filesystem, .env | Server's DB, compute |

### Why Not Unify?

1. **Security boundary:** Server cannot access user's filesystem to install MCPs
2. **State size:** DAG checkpoints are much larger than pending installations
3. **Persistence needs:** DAG workflows must survive restarts; installations are immediate
4. **Simplicity:** Each system optimized for its use case

### Why Stateful (Correcting 14.3b)?

Story 14.3b claimed: "No workflow state storage needed!"

This was incorrect because:
1. The **code** is not in the approval response
2. The **code** cannot be re-derived from the `continue_workflow` message
3. The client must store the code to re-execute after approval

MCP's stateful connection (persistent stdio process) makes in-memory storage safe:
- If the process dies, the MCP connection dies too
- New connection = new session = no stale state

## Consequences

### Positive

- Clear separation of concerns
- Each system optimized for its use case
- No cross-boundary state sharing
- Leverages MCP's stateful connection

### Negative

- Two workflow systems to maintain
- Risk of workflow_id collision (mitigated by UUID uniqueness)
- Client state lost on process restart (acceptable - connection dies too)

### Implementation

**Files created:**
- `packages/pml/src/workflow/pending-store.ts` - PendingWorkflowStore class
- `packages/pml/src/workflow/mod.ts` - Module exports
- `packages/pml/tests/workflow/pending_store_test.ts` - 15 TDD tests

**Files modified:**
- `packages/pml/src/cli/stdio-command.ts`:
  - Import PendingWorkflowStore
  - Store workflow on `approval_required`
  - Intercept local `continue_workflow` before forwarding to cloud

## Related

- **Epic 14:** JSR Package Local/Cloud MCP Routing
- **Story 14.3b:** HIL Approval Flow (superseded assumption)
- **Story 14.4:** Dynamic MCP Loader
- **ADR-059:** Hybrid Routing Server Analysis Package Execution
- **Spike:** `_bmad-output/spikes/2026-01-11-spike-client-workflow-state.md`
