# Consistency Rules

## Cross-Cutting Patterns

**Date/Time Handling:**

- All timestamps: ISO 8601 format (`2025-11-03T10:30:45.123Z`)
- Library: Native `Date` object, no moment.js
- Storage: PostgreSQL `TIMESTAMPTZ` type

**Async Patterns:**

- All I/O operations: `async/await` (no callbacks)
- Parallel operations: `Promise.all()` for independent tasks
- Sequential: `for...of` with `await` for dependent tasks

**Configuration Access:**

```typescript
// Single source of truth
const config = await loadConfig("~/.cai/config.yaml");
// Pass explicitly, no global state
```

**Retries:**

```typescript
// src/utils/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000,
): Promise<T> {
  // Exponential backoff: 1s, 2s, 4s
}
```

---
