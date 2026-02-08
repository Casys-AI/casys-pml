# Phase 1: Middleware Pipeline Foundation

**Estimation:** ~3-4h | **Prerequis:** aucun | **Debloque:** Phase 2, 3

## Objectif

Transformer le pipeline hardcode (rate limit → validation → backpressure → exec) en un **pipeline middleware composable** ou chaque etape est un middleware independant qu'on peut ajouter, retirer, ou reordonner.

C'est la fondation framework-first : l'auth (Phase 2) sera simplement un middleware de plus.

## Etat actuel

Le pipeline est inline dans `setupHandlers()` et `handleMcpPost()` :

```
concurrent-server.ts:174-243 (STDIO path)
  1. Rate limit check (if configured)
  2. Schema validation (if configured)
  3. RequestQueue acquire
  4. Tool handler execution
  5. RequestQueue release

concurrent-server.ts:657-728 (HTTP path) — DUPLIQUE le meme pipeline
```

**Probleme :** Le meme pipeline est duplique entre STDIO et HTTP. Ajouter l'auth = dupliquer une 3e fois.

## Design

### Type Middleware

```typescript
// lib/server/src/middleware/types.ts

/**
 * Context passé a travers le pipeline middleware.
 * Chaque middleware peut enrichir le context.
 */
export interface MiddlewareContext {
  /** Nom du tool appelé */
  toolName: string;
  /** Arguments du tool */
  args: Record<string, unknown>;
  /** Info auth (ajoutée par auth middleware) */
  authInfo?: AuthInfo;
  /** Metadata HTTP request (si HTTP transport) */
  request?: Request;
  /** Session ID (si HTTP transport) */
  sessionId?: string;
  /** Extensions par middlewares custom */
  [key: string]: unknown;
}

/**
 * Résultat retourné par le handler final ou un middleware qui court-circuite.
 */
export type MiddlewareResult = unknown;

/**
 * Fonction next() pour passer au middleware suivant.
 */
export type NextFunction = () => Promise<MiddlewareResult>;

/**
 * Un middleware MCP.
 * Reçoit le context et next(), retourne le résultat ou court-circuite.
 */
export type Middleware = (
  ctx: MiddlewareContext,
  next: NextFunction,
) => Promise<MiddlewareResult>;
```

### Middleware Runner

```typescript
// lib/server/src/middleware/runner.ts

/**
 * Exécute une chaine de middlewares en séquence (onion model).
 * Le dernier "middleware" est le handler du tool.
 */
export function createMiddlewareRunner(
  middlewares: Middleware[],
  handler: (ctx: MiddlewareContext) => Promise<MiddlewareResult>,
): (ctx: MiddlewareContext) => Promise<MiddlewareResult> {
  return (ctx: MiddlewareContext) => {
    let index = 0;

    const next = async (): Promise<MiddlewareResult> => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        return middleware(ctx, next);
      }
      return handler(ctx);
    };

    return next();
  };
}
```

### Middlewares built-in (refactor de l'existant)

```typescript
// lib/server/src/middleware/rate-limit.ts
export function createRateLimitMiddleware(
  limiter: RateLimiter,
  options: RateLimitOptions,
): Middleware {
  return async (ctx, next) => {
    const key = options.keyExtractor?.({ toolName: ctx.toolName, args: ctx.args }) ?? "default";

    if (options.onLimitExceeded === "reject") {
      if (!limiter.checkLimit(key)) {
        const waitTime = limiter.getTimeUntilSlot(key);
        throw new Error(`Rate limit exceeded. Retry after ${Math.ceil(waitTime / 1000)}s`);
      }
    } else {
      await limiter.waitForSlot(key);
    }

    return next();
  };
}
```

```typescript
// lib/server/src/middleware/validation.ts
export function createValidationMiddleware(
  validator: SchemaValidator,
): Middleware {
  return async (ctx, next) => {
    validator.validateOrThrow(ctx.toolName, ctx.args);
    return next();
  };
}
```

```typescript
// lib/server/src/middleware/backpressure.ts
export function createBackpressureMiddleware(
  queue: RequestQueue,
): Middleware {
  return async (ctx, next) => {
    await queue.acquire();
    try {
      return await next();
    } finally {
      queue.release();
    }
  };
}
```

### Integration dans ConcurrentMCPServer

```typescript
// Dans concurrent-server.ts

export class ConcurrentMCPServer {
  private middlewares: Middleware[] = [];
  private middlewareRunner: ((ctx: MiddlewareContext) => Promise<MiddlewareResult>) | null = null;

  constructor(options: ConcurrentServerOptions) {
    // ... existing code ...

    // Build middleware pipeline from config
    this.buildPipeline();
  }

  /**
   * Ajouter un middleware custom AVANT le handler.
   * Doit etre appelé avant start()/startHttp().
   */
  use(middleware: Middleware): this {
    if (this.started) {
      throw new Error("Cannot add middleware after server started");
    }
    this.middlewares.push(middleware);
    this.middlewareRunner = null; // Invalidate cached runner
    return this;
  }

  private buildPipeline(): void {
    const pipeline: Middleware[] = [];

    // 1. Rate limiting (si configuré)
    if (this.rateLimiter && this.options.rateLimit) {
      pipeline.push(createRateLimitMiddleware(this.rateLimiter, this.options.rateLimit));
    }

    // 2. Middlewares custom (auth, logging, etc.)
    pipeline.push(...this.middlewares);

    // 3. Schema validation (si activée)
    if (this.schemaValidator) {
      pipeline.push(createValidationMiddleware(this.schemaValidator));
    }

    // 4. Backpressure (toujours)
    pipeline.push(createBackpressureMiddleware(this.requestQueue));

    this.middlewareRunner = createMiddlewareRunner(pipeline, async (ctx) => {
      const tool = this.tools.get(ctx.toolName);
      if (!tool) throw new Error(`Unknown tool: ${ctx.toolName}`);
      return tool.handler(ctx.args);
    });
  }
}
```

### Ordre du pipeline

```
Request → RateLimit → [Custom middlewares (auth, logging...)] → Validation → Backpressure → Handler
```

**Pourquoi cet ordre :**
1. Rate limit en premier = rejeter les abus avant tout traitement
2. Custom middlewares (auth) = vérifier l'identité avant validation/execution
3. Validation = vérifier les arguments avant d'occuper un slot
4. Backpressure = en dernier car c'est le goulot d'étranglement

## Fichiers a creer/modifier

| Fichier | Action |
|---------|--------|
| `lib/server/src/middleware/types.ts` | **Nouveau** - Types Middleware, MiddlewareContext, NextFunction |
| `lib/server/src/middleware/runner.ts` | **Nouveau** - createMiddlewareRunner |
| `lib/server/src/middleware/rate-limit.ts` | **Nouveau** - Refactor depuis concurrent-server.ts |
| `lib/server/src/middleware/validation.ts` | **Nouveau** - Refactor depuis concurrent-server.ts |
| `lib/server/src/middleware/backpressure.ts` | **Nouveau** - Refactor depuis concurrent-server.ts |
| `lib/server/src/middleware/mod.ts` | **Nouveau** - Re-exports |
| `lib/server/src/concurrent-server.ts` | **Modifier** - Utiliser pipeline, ajouter `use()`, supprimer inline pipeline |
| `lib/server/src/types.ts` | **Modifier** - Ajouter MiddlewareContext dans les exports si necessaire |
| `lib/server/mod.ts` | **Modifier** - Exporter middleware types |

## Backward Compatibility

- `ConcurrentServerOptions` reste identique (rate limiting, validation, backpressure via config)
- Les options existantes construisent automatiquement les middlewares correspondants
- `.use()` est optionnel et additif
- Aucun breaking change pour les consumers existants

## Acceptance Criteria

- [ ] **AC1:** Given a tools/call request via STDIO, when the middleware pipeline executes, then rate-limit, validation, and backpressure run in the correct order (same as HTTP)
- [ ] **AC2:** Given a tools/call request via HTTP, when the middleware pipeline executes, then the same middleware runner is used as STDIO (no code duplication)
- [ ] **AC3:** Given `server.use(customMiddleware)` called before `start()`, when a tool is called, then the custom middleware executes between rate-limit and validation
- [ ] **AC4:** Given existing `ConcurrentServerOptions` with `rateLimit` and `validateSchema`, when the server starts, then the corresponding built-in middlewares are auto-configured (backward compat)
- [ ] **AC5:** Given `server.use()` called after `start()`, when the call is made, then it throws an Error immediately (fail-fast)
- [ ] **AC6:** Given a middleware that calls `next()`, when the pipeline executes, then middlewares run in onion order (m1-before → m2-before → handler → m2-after → m1-after)
- [ ] **AC7:** Given a middleware that does NOT call `next()`, when the pipeline executes, then subsequent middlewares and handler are skipped (short-circuit)

## Implementation Status

**Phase 1 implémentée le 2026-02-06.** 72 tests existants + 9 nouveaux (runner_test.ts) = tous passent.

## Code Review Action Items (2026-02-06)

### C-1: CRITICAL - next() callable multiple fois (runner.ts)

**Problème:** Le middleware runner ne protège pas contre un middleware qui appelle `next()` deux fois. Cela exécuterait le handler ou les middlewares suivants en double, causant potentiellement des effets de bord (double-write, double-billing, etc.).

**Fichier:** `lib/server/src/middleware/runner.ts:44-49`

**Fix:** Ajouter un guard `called` dans `next()` :
```typescript
const next = async (): Promise<MiddlewareResult> => {
  if (index < middlewares.length) {
    const middleware = middlewares[index++];
    return middleware(ctx, next);
  }
  if (handlerCalled) throw new Error("next() called after pipeline completed");
  handlerCalled = true;
  return handler(ctx);
};
```

**Priorité:** Corriger avant Phase 3 (JWT avec appels async où le risque de double-call augmente).

**Status:** CORRIGE (handlerCalled guard ajoute).

## Code Review Action Items - Review 3 (2026-02-06)

| ID | Severite | Issue | Fix |
|----|----------|-------|-----|
| CR3-C1 | Critical | Race condition TOCTOU dans `RequestQueue.acquire()` (queue strategy) : entre check `inFlight < max` et `inFlight++`, un autre waiter peut passer | Fix: `release()` transfere le slot directement au waiter (pas de decrement/recheck), `acquire()` claim avant await |
| CR3-M6 | Major | `registerTool()`/`registerTools()` apres `start()` fonctionne mais `requiredScopes` ignore (pipeline deja built) | Fix: throw si `started === true` (meme pattern que `use()`) |
| CR3-M2 | Major | `RateLimiter.waitForSlot()` sans timeout max → requetes bloquees indefiniment | Fix: ajout timeout = windowMs, throw si depasse |

**Tous les items fixes le 2026-02-06.** 137 tests passent.
