# No Silent Fallbacks Policy

## Rule: FAIL-FAST, NO SILENT FALLBACKS

**Priority:** CRITICAL

### Problem

Silent fallbacks hide critical bugs that only surface at runtime in unexpected ways. Example from 2026-01-21:

```typescript
// BAD - Silent fallback caused code:* tasks to fail silently
private createExecutorInstance(toolExecutor, context): IDAGExecutor {
  if (this.deps.createExecutor) {
    return this.deps.createExecutor();  // ControlledExecutor - handles code:* tasks
  }
  // SILENT FALLBACK - SimpleDAGExecutor doesn't handle code:* tasks!
  return new SimpleDAGExecutor(toolExecutor, context);
}
```

This caused `pml:execute` to crash on any code with JS operations (filter, map, split) because:
1. `bootstrap.ts` didn't provide `createExecutor`
2. Fallback `SimpleDAGExecutor` was used silently
3. `SimpleDAGExecutor` routes ALL tasks via MCP RPC
4. `code:filter` → `mcp.code.filter()` → "MCP server 'code' not connected" ERROR

### Required Pattern

**Option A: Fail Fast (Preferred)**
```typescript
private createExecutorInstance(toolExecutor, context): IDAGExecutor {
  if (!this.deps.createExecutor) {
    throw new Error(
      "[WorkerBridgeFactoryAdapter] createExecutor is required for code:* task support. " +
      "Provide createExecutor in WorkerBridgeFactoryAdapterDeps."
    );
  }
  return this.deps.createExecutor();
}
```

**Option B: Warn + Fallback (If fallback is truly acceptable)**
```typescript
private createExecutorInstance(toolExecutor, context): IDAGExecutor {
  if (this.deps.createExecutor) {
    return this.deps.createExecutor();
  }

  log.warn(
    "[WorkerBridgeFactoryAdapter] createExecutor not provided - using SimpleDAGExecutor. " +
    "WARNING: code:* tasks (filter, map, split, etc.) will NOT work!"
  );
  return new SimpleDAGExecutor(toolExecutor, context);
}
```

### When Writing Code

1. **Never use silent fallbacks** for critical functionality
2. **Always log.warn()** at minimum when using a fallback
3. **Prefer throwing errors** over degraded behavior that hides bugs
4. **Document fallback limitations** in the warning message
5. **Consider if fallback is even needed** - often it's not, and fail-fast is better

### Code Review Checklist

- [ ] Are there any `if (x) { ... } else { fallback }` patterns?
- [ ] If yes, does the fallback log a warning?
- [ ] Is the fallback behavior clearly documented?
- [ ] Would fail-fast be more appropriate than fallback?
- [ ] Are tests covering the fallback path?

---

*Added: 2026-01-21 after discovering silent fallback in WorkerBridgeFactoryAdapter caused code:* tasks to fail*
