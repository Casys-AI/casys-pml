# Phase 2: Auth Core + Bearer + RFC 9728

**Estimation:** ~3-4h | **Prerequis:** Phase 1 (middleware pipeline) | **Debloque:** Phase 3

## Objectif

Ajouter le systeme d'authentification comme **middleware** dans le pipeline :
- Types auth (AuthInfo, AuthProvider, AuthOptions)
- Extraction Bearer token
- Reponses 401/403 standards
- Endpoint RFC 9728 (`/.well-known/oauth-protected-resource`)
- Injection de `authInfo` dans le MiddlewareContext

## Design

### Types Auth

```typescript
// lib/server/src/auth/types.ts

/**
 * Information extraite d'un token valide.
 * Immutable (Object.freeze) avant passage aux handlers.
 */
export interface AuthInfo {
  /** User ID (sub claim du JWT) */
  subject: string;
  /** OAuth client ID (optionnel) */
  clientId?: string;
  /** Scopes accordes */
  scopes: string[];
  /** Claims JWT additionnels */
  claims?: Record<string, unknown>;
  /** Timestamp d'expiration du token */
  expiresAt?: number;
}

/**
 * Options auth pour le serveur.
 */
export interface AuthOptions {
  /** Authorization servers qui emettent les tokens valides */
  authorizationServers: string[];
  /** Resource identifier pour ce MCP server (dans WWW-Authenticate) */
  resource: string;
  /** Scopes supportes par ce serveur */
  scopesSupported?: string[];
  /** Auth provider custom (override le JWT par defaut) */
  provider?: AuthProvider;
}

/**
 * RFC 9728 Protected Resource Metadata.
 * Retourne par /.well-known/oauth-protected-resource
 */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported: string[];
}
```

### AuthProvider Abstract Class

```typescript
// lib/server/src/auth/provider.ts

/**
 * Abstract class (pas interface) pour compatibilité DI (diod tokens).
 * Implementer pour custom auth (API keys, opaque tokens, etc.)
 */
export abstract class AuthProvider {
  /**
   * Valide un token et retourne AuthInfo.
   * @returns AuthInfo si valide, null si invalide
   */
  abstract verifyToken(token: string): Promise<AuthInfo | null>;

  /**
   * Retourne les metadonnees RFC 9728 pour ce provider.
   */
  abstract getResourceMetadata(): ProtectedResourceMetadata;
}
```

### Bearer Token Middleware

```typescript
// lib/server/src/auth/middleware.ts

/**
 * Extrait le Bearer token du header Authorization.
 */
export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

/**
 * Cree une reponse 401 Unauthorized avec WWW-Authenticate.
 */
export function createUnauthorizedResponse(
  resourceMetadataUrl: string,
  error?: string,
  errorDescription?: string,
): Response {
  const parts = [`Bearer resource_metadata="${resourceMetadataUrl}"`];
  if (error) parts.push(`error="${error}"`);
  if (errorDescription) parts.push(`error_description="${errorDescription}"`);

  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: null,
    error: { code: -32001, message: errorDescription ?? "Unauthorized" },
  }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": parts.join(", "),
    },
  });
}

/**
 * Cree une reponse 403 Forbidden pour scopes insuffisants.
 */
export function createForbiddenResponse(requiredScopes: string[]): Response {
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: null,
    error: {
      code: -32001,
      message: `Forbidden: requires scopes ${requiredScopes.join(", ")}`,
    },
  }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Middleware d'authentification pour le pipeline MCP.
 * Extrait le Bearer token, le valide via AuthProvider,
 * et injecte authInfo dans le context.
 */
export function createAuthMiddleware(provider: AuthProvider): Middleware {
  return async (ctx, next) => {
    // Pas de request = transport STDIO, pas d'auth
    if (!ctx.request) {
      return next();
    }

    const token = extractBearerToken(ctx.request);
    if (!token) {
      const metadata = provider.getResourceMetadata();
      const metadataUrl = `${metadata.resource}/.well-known/oauth-protected-resource`;
      // On throw pour que le HTTP handler attrape et retourne la Response 401
      throw new AuthError("missing_token", metadataUrl);
    }

    const authInfo = await provider.verifyToken(token);
    if (!authInfo) {
      const metadata = provider.getResourceMetadata();
      const metadataUrl = `${metadata.resource}/.well-known/oauth-protected-resource`;
      throw new AuthError("invalid_token", metadataUrl);
    }

    // Injecter authInfo immutable dans le context
    ctx.authInfo = Object.freeze(authInfo);
    return next();
  };
}

/**
 * Erreur d'authentification specifique.
 * Le HTTP handler la detecte pour retourner 401/403.
 */
export class AuthError extends Error {
  constructor(
    public readonly code: "missing_token" | "invalid_token" | "insufficient_scope",
    public readonly resourceMetadataUrl: string,
    public readonly requiredScopes?: string[],
  ) {
    super(
      code === "missing_token"
        ? "Authorization header required"
        : code === "invalid_token"
        ? "Invalid or expired token"
        : `Insufficient scope: requires ${requiredScopes?.join(", ")}`,
    );
    this.name = "AuthError";
  }
}
```

### Scope Enforcement

```typescript
// lib/server/src/auth/scope-middleware.ts

/**
 * Middleware de verification des scopes par tool.
 * Place APRES le auth middleware dans le pipeline.
 */
export function createScopeMiddleware(
  toolScopes: Map<string, string[]>,
): Middleware {
  return async (ctx, next) => {
    const requiredScopes = toolScopes.get(ctx.toolName);
    if (!requiredScopes?.length) return next(); // Pas de scopes requis

    if (!ctx.authInfo) return next(); // Pas d'auth configuree

    const hasAll = requiredScopes.every(s => ctx.authInfo!.scopes.includes(s));
    if (!hasAll) {
      throw new AuthError("insufficient_scope", "", requiredScopes);
    }

    return next();
  };
}
```

### Integration HTTP (Protected Resource Metadata)

```typescript
// Dans concurrent-server.ts, methode startHttp()

// Ajouter AVANT les routes MCP :
app.get("/.well-known/oauth-protected-resource", (c) => {
  if (!this.authProvider) {
    return c.text("Not Found", 404);
  }
  return c.json(this.authProvider.getResourceMetadata());
});

// Dans le error handler du POST /mcp :
if (error instanceof AuthError) {
  if (error.code === "missing_token" || error.code === "invalid_token") {
    return createUnauthorizedResponse(
      error.resourceMetadataUrl,
      error.code,
      error.message,
    );
  }
  if (error.code === "insufficient_scope") {
    return createForbiddenResponse(error.requiredScopes ?? []);
  }
}
```

### Integration dans ConcurrentServerOptions

```typescript
// Dans types.ts, ajouter a ConcurrentServerOptions :
auth?: AuthOptions;

// Dans MCPTool, ajouter :
requiredScopes?: string[];
```

## Fichiers a creer/modifier

| Fichier | Action |
|---------|--------|
| `lib/server/src/auth/types.ts` | **Nouveau** - AuthInfo, AuthOptions, ProtectedResourceMetadata |
| `lib/server/src/auth/provider.ts` | **Nouveau** - AuthProvider abstract class |
| `lib/server/src/auth/middleware.ts` | **Nouveau** - Bearer extraction, 401/403, AuthError, createAuthMiddleware |
| `lib/server/src/auth/scope-middleware.ts` | **Nouveau** - Scope enforcement middleware |
| `lib/server/src/auth/mod.ts` | **Nouveau** - Re-exports auth module |
| `lib/server/src/concurrent-server.ts` | **Modifier** - AuthProvider dans constructor, RFC 9728 endpoint, AuthError handling |
| `lib/server/src/types.ts` | **Modifier** - Ajouter auth?, requiredScopes? |
| `lib/server/mod.ts` | **Modifier** - Exporter auth types |

## Comportement STDIO vs HTTP

| Transport | Comportement auth |
|-----------|------------------|
| **STDIO** | Auth middleware skip (pas de `ctx.request`) - STDIO est local, pas d'auth |
| **HTTP sans auth config** | Pas de middleware auth dans le pipeline - tout passe |
| **HTTP avec auth config** | Auth middleware actif - 401 sans token, 401 token invalide, 403 scopes insuffisants |

## Acceptance Criteria

- [ ] AC1: Request HTTP sans `Authorization` header → 401 + `WWW-Authenticate: Bearer resource_metadata="..."`
- [ ] AC2: Request HTTP avec Bearer token invalide → 401 avec error description
- [ ] AC3: Tool avec `requiredScopes: ["admin"]` + token sans "admin" → 403 Forbidden
- [ ] AC4: Token valide + scopes OK → tool execute, handler recoit `context.authInfo`
- [ ] AC5: Serveur sans `auth` config → tout fonctionne normalement (pas d'auth)
- [ ] AC6: GET `/.well-known/oauth-protected-resource` → JSON RFC 9728 conforme
- [ ] AC7: Transport STDIO → auth middleware skip, pas d'impact
- [ ] AC8: `authInfo` est `Object.freeze()` (immutable) - **PARTIEL**: shallow freeze, voir M-2

## Implementation Status

**Phase 2 implémentée le 2026-02-06.** 23 tests auth + 72 existants = 95 tests, tous passent.

## Code Review Action Items (2026-02-06)

### C-2: CRITICAL - Auth bypass sur endpoints non-tools/call

**Problème:** Seul `tools/call` passe par le middleware pipeline (et donc par l'auth middleware). Les endpoints `tools/list`, `resources/list`, `resources/read`, et `initialize` répondent sans vérifier le Bearer token. Un attaquant peut lister tous les tools/resources sans authentification.

**Fichier:** `lib/server/src/concurrent-server.ts` - `handleMcpPost()` lines 755-768 (tools/list), lines après (resources/list, resources/read)

**Fix:** Extraire la vérification auth en amont de `handleMcpPost`, ou appliquer le auth middleware à TOUS les endpoints MCP (sauf `initialize` qui est le handshake initial - débat: certaines implémentations l'auth-gate aussi).

**Décision à prendre:** `initialize` doit-il être auth-gated? Argument pour: empêche l'enumération de sessions. Argument contre: le client doit d'abord discover les capabilities avant de s'authentifier.

### C-3: CRITICAL - Scope middleware silent fallback (no-silent-fallbacks violation)

**Problème:** Dans `scope-middleware.ts:34`, quand `authInfo` est absent mais qu'on est en HTTP (donc `ctx.request` existe), le middleware passe silencieusement. Un tool avec `requiredScopes: ["admin"]` serait accessible sans auth si le auth middleware est absent du pipeline.

**Fichier:** `lib/server/src/auth/scope-middleware.ts:33-34`

**Fix:** Distinguer STDIO (pas de `ctx.request`) vs HTTP sans auth :
```typescript
if (!authInfo) {
  if (!ctx.request) return next(); // STDIO: OK, pas d'auth
  throw new AuthError("missing_token", "", requiredScopes);
  // ou au minimum: log.warn("scope check skipped: no authInfo on HTTP request")
}
```

**Réf:** `.claude/rules/no-silent-fallbacks.md`

### M-1: MAJOR - WWW-Authenticate header injection

**Problème:** `createUnauthorizedResponse()` insère les valeurs `error` et `errorDescription` dans le header `WWW-Authenticate` sans échapper les guillemets. Si une erreur contient `"`, cela corrompt le header.

**Fichier:** `lib/server/src/auth/middleware.ts:59-61`

**Fix:** Échapper les guillemets dans les valeurs :
```typescript
const escape = (s: string) => s.replace(/"/g, '\\"');
if (error) parts.push(`error="${escape(error)}"`);
if (errorDescription) parts.push(`error_description="${escape(errorDescription)}"`);
```

### M-2: MAJOR - Object.freeze shallow sur authInfo

**Problème:** `Object.freeze()` ne freeze que le premier niveau. `authInfo.claims` (objet) et `authInfo.scopes` (array) restent mutables. Un middleware malicieux pourrait modifier `authInfo.scopes.push("admin")`.

**Fichier:** `lib/server/src/auth/middleware.ts:134`

**Fix:** Deep-freeze récursif ou au minimum freeze les propriétés imbriquées :
```typescript
if (authInfo.claims) Object.freeze(authInfo.claims);
Object.freeze(authInfo.scopes);
ctx.authInfo = Object.freeze(authInfo);
```

### M-3: MAJOR - initialize endpoint non auth-gated

**Problème:** L'endpoint `initialize` crée une session sans vérifier le Bearer token. Permet la création illimitée de sessions (DoS potentiel).

**Fichier:** `lib/server/src/concurrent-server.ts` - handleMcpPost, case `initialize`

**Fix:** Deux options :
- A) Auth-gate `initialize` (le client doit avoir un token valide pour créer une session)
- B) Rate-limit `initialize` séparément (pas d'auth, mais limité en fréquence)

**Note:** La spec MCP ne prescrit pas explicitement. Option B est plus compatible.

### M-5: MAJOR - "Authorization" manquant dans CORS allowHeaders

**Problème:** Le CORS est configuré avec `allowHeaders: ["Content-Type", "Accept", "mcp-session-id", "last-event-id"]` mais n'inclut pas `"Authorization"`. Les clients browser ne pourront pas envoyer le Bearer token (le preflight CORS rejettera le header).

**Fichier:** `lib/server/src/concurrent-server.ts:629`

**Fix:** Ajouter `"Authorization"` dans `allowHeaders` :
```typescript
allowHeaders: ["Content-Type", "Accept", "Authorization", "mcp-session-id", "last-event-id"],
```

**Tous les items ci-dessus CORRIGES (review 1+2).**

## Code Review Action Items - Review 3 (2026-02-06)

| ID | Severite | Issue | Fix |
|----|----------|-------|-----|
| CR3-C2 | Critical | SSE GET `/mcp` sans auth : quand auth configure, n'importe qui ouvre un SSE sans token | Fix: `verifyHttpAuth` ajoute dans `handleMcpGet` avant stream |
| CR3-C3 | Critical | Session ID jamais valide sur POST : client peut skip `initialize` et appeler `tools/call` | Fix: validation `Mcp-Session-Id` header sur tous POST (sauf initialize), 404 si inconnu |
| CR3-M3 | Major | URL metadata double slash si `resource` a trailing `/` (concat string) | Fix: helper `buildMetadataUrl` strip trailing slash. Aussi dans auth middleware |
| CR3-M4 | Major | Requete sans `id` ET sans `method` → 202 silencieux (NSF violation) | Fix: 202 seulement si `method` present et `id` absent. Sinon -32600 "missing method" |
| CR3-M5 | Major | Catch global `handleMcpPost` perd le request `id` → viole JSON-RPC 2.0 | Fix: `requestId` capture avant le try, utilise dans le catch |
| CR3-m3 | Minor | `lastActivity` jamais mise a jour apres initialize → sessions actives expirees | Fix: update `session.lastActivity` quand session ID valide sur POST |
| CR3-m4 | Minor | `parseInt(lastEventId)` → NaN si header non-numerique | Fix: `Number.isNaN(parsed) ? 0 : parsed` |

**Tous les items fixes le 2026-02-06.** 137 tests passent.
