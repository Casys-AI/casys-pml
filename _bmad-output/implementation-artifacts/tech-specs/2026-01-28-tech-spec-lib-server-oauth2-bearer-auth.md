---
title: 'OAuth2/Bearer Auth pour lib/server (MCP HTTP)'
slug: 'lib-server-oauth2-bearer-auth'
created: '2026-01-28'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'Deno 2.x'
  - '@modelcontextprotocol/sdk ^1.15.1'
  - 'jose (npm:jose - JWT/JWKS validation)'
  - 'Deno.serve (HTTP transport)'
  - 'WebStandardStreamableHTTPServerTransport (SDK)'
files_to_modify:
  - 'lib/server/src/types.ts (add AuthInfo, AuthProvider, AuthOptions)'
  - 'lib/server/src/concurrent-server.ts (add auth config, startHttp method)'
  - 'lib/server/src/auth/types.ts (new - auth-specific types)'
  - 'lib/server/src/auth/provider.ts (new - AuthProvider interface)'
  - 'lib/server/src/auth/jwt-provider.ts (new - JwtAuthProvider implementation)'
  - 'lib/server/src/auth/presets.ts (new - preset factories for GitHub/Google/Auth0)'
  - 'lib/server/src/auth/config.ts (new - env-based auth configuration loader)'
  - 'lib/server/src/auth/middleware.ts (new - Bearer token extraction)'
  - 'lib/server/src/auth/mod.ts (new - auth module exports)'
  - 'lib/server/mod.ts (export auth types)'
code_patterns:
  - 'Interface-first design (AuthProvider abstract class for DI)'
  - 'Optional configuration (auth?: AuthOptions in ConcurrentServerOptions)'
  - 'Bearer token extraction pattern (see src/mcp/routing/middleware.ts:30-49)'
  - 'SDK transport wrapping (WebStandardStreamableHTTPServerTransport accepts authInfo)'
  - 'Fail-fast validation at startup'
test_patterns:
  - 'Deno.test with @std/assert'
  - 'Test files: *_test.ts colocated in src/'
  - 'Mock pattern for AuthProvider'
  - 'Test JWT with forged tokens (jose createLocalJWKSet)'
---

# Tech-Spec: OAuth2/Bearer Auth pour lib/server (MCP HTTP)

**Created:** 2026-01-28

## Overview

### Problem Statement

`lib/server` (ConcurrentMCPServer) ne supporte actuellement que le transport stdio et n'a aucun mécanisme d'authentification. Les MCP HTTP tiers qui veulent protéger leurs endpoints selon la spec MCP Auth (RFC 9728, OAuth 2.1) ne peuvent pas utiliser ce framework.

Les utilisateurs doivent actuellement configurer des API keys manuellement dans `.env`, alors qu'ils pourraient bénéficier d'OAuth "à la volée" (Google, GitHub, etc.) si les MCP HTTP supportaient la spec MCP Auth.

**Cas d'usage principal** : Distribution de binaires compilés (ex: `lib/std`). Les utilisateurs finaux ne peuvent pas modifier le code TypeScript, ils ont besoin d'une configuration via variables d'environnement pour activer l'auth OAuth.

### Solution

Ajouter un système d'authentification plug-and-play à `lib/server` avec:

1. **Transport HTTP** - Nouveau `HttpServerTransport` en plus du stdio existant
2. **Interface AuthProvider** - Contrat pour custom validators (plug-and-play)
3. **JwtAuthProvider** - Implémentation JWT built-in optionnelle (vérifie via JWKS)
4. **Scope enforcement** - Config `requiredScopes` par tool (optionnel)
5. **AuthInfo context** - Accessible dans les handlers de tools
6. **RFC 9728 compliance** - 401 + WWW-Authenticate, Protected Resource Metadata endpoint

### Scope

**In Scope:**
- `HttpServerTransport` - Nouveau transport HTTP (Deno.serve)
- Interface `AuthProvider` + type `AuthInfo`
- `JwtAuthProvider` - Implémentation JWT built-in avec JWKS discovery
- Config `requiredScopes` par tool (optionnel)
- `context.authInfo` accessible dans les handlers
- Réponse 401 + header `WWW-Authenticate` automatique
- Endpoint `/.well-known/oauth-protected-resource` (RFC 9728)
- Config `auth` optionnelle dans `ConcurrentServerOptions`

**Out of Scope:**
- Authorization Server (on valide les tokens, on ne les émet pas)
- OAuth flows côté client (c'est pour la gateway/PML, pas lib/server)
- Refresh token handling (responsabilité du client)
- Dynamic Client Registration (RFC 7591)
- Token revocation endpoint

## Context for Development

### Codebase Patterns

- **Interface-first design** - Définir `AuthProvider` comme abstract class (token DI car interfaces TS effacées au runtime)
- **Optional configuration** - `auth?: AuthOptions` dans options, serveur fonctionne sans auth
- **Constructor injection** - Max 5 deps, utiliser composition si plus
- **Fail-fast validation** - Valider config au démarrage, pas au runtime
- **No silent fallbacks** - Log warning ou throw si config invalide
- **Bearer token pattern** - Voir `src/mcp/routing/middleware.ts:30-49` pour extraction header

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `lib/server/src/concurrent-server.ts` | Serveur principal à étendre avec `startHttp()` |
| `lib/server/src/types.ts` | Types existants, ajouter types auth de base |
| `lib/server/src/rate-limiter.ts` | Pattern middleware similaire (sliding window) |
| `lib/server/src/sampling-bridge.ts` | Pattern Promise resolver pour async operations |
| `src/mcp/routing/middleware.ts` | Bearer token extraction existant (lignes 30-49) |
| SDK `streamableHttp.ts` | `WebStandardStreamableHTTPServerTransport` accepte `authInfo` |

### Technical Decisions

1. **Utiliser SDK HTTP transport** - `WebStandardStreamableHTTPServerTransport` du SDK, pas custom
2. **Auth module séparé** - `lib/server/src/auth/` folder avec mod.ts, types, providers
3. **AuthProvider = abstract class** - Pour compatibilité DI (diod tokens)
4. **JWT via jose** - `npm:jose` pour validation JWT/JWKS, standard et léger
5. **Scope check au tool call** - Vérification dans handler tools/call, pas au startup
6. **AuthInfo immutable** - `Object.freeze()` avant passage aux handlers
7. **401 + WWW-Authenticate** - Réponse standard avec `resource_metadata` URL
8. **Protected Resource Metadata** - Endpoint `/.well-known/oauth-protected-resource`

## Implementation Plan

### Tasks

- [ ] **Task 1: Add jose dependency**
  - File: `lib/server/deno.json`
  - Action: Add `"jose": "npm:jose@^6.0.0"` to imports
  - Notes: jose is the standard JWT library, supports JWKS remote fetching

- [ ] **Task 2: Create auth types**
  - File: `lib/server/src/auth/types.ts` (new)
  - Action: Define core auth types:
    ```typescript
    export interface AuthInfo {
      subject: string;           // User ID (sub claim)
      clientId?: string;         // OAuth client ID
      scopes: string[];          // Granted scopes
      claims?: Record<string, unknown>; // Extra JWT claims
      expiresAt?: number;        // Token expiration timestamp
    }

    export interface AuthOptions {
      /** Authorization servers that can issue valid tokens */
      authorizationServers: string[];
      /** Resource identifier for this MCP server (used in WWW-Authenticate) */
      resource: string;
      /** Scopes this server supports */
      scopesSupported?: string[];
      /** Custom auth provider (overrides JWT validation) */
      provider?: AuthProvider;
    }

    export interface ProtectedResourceMetadata {
      resource: string;
      authorization_servers: string[];
      scopes_supported?: string[];
      bearer_methods_supported: string[];
    }
    ```
  - Notes: Types follow RFC 9728 Protected Resource Metadata spec

- [ ] **Task 3: Create AuthProvider abstract class**
  - File: `lib/server/src/auth/provider.ts` (new)
  - Action: Define plug-and-play interface:
    ```typescript
    export abstract class AuthProvider {
      abstract verifyToken(token: string): Promise<AuthInfo | null>;
      abstract getResourceMetadata(): ProtectedResourceMetadata;
    }
    ```
  - Notes: Abstract class (not interface) for DI compatibility with diod

- [ ] **Task 4: Create Bearer token middleware**
  - File: `lib/server/src/auth/middleware.ts` (new)
  - Action: Implement Bearer extraction and validation:
    ```typescript
    export function extractBearerToken(request: Request): string | null;
    export function createUnauthorizedResponse(resourceMetadataUrl: string, scope?: string): Response;
    export function createForbiddenResponse(requiredScopes: string[]): Response;
    ```
  - Notes: Follow pattern from `src/mcp/routing/middleware.ts:30-49`

- [ ] **Task 5: Implement JwtAuthProvider**
  - File: `lib/server/src/auth/jwt-provider.ts` (new)
  - Action: Built-in JWT validation with JWKS:
    ```typescript
    export interface JwtAuthProviderOptions {
      issuer: string;
      audience: string;
      jwksUri?: string;          // If not provided, uses issuer + /.well-known/jwks.json
      resource: string;
      authorizationServers: string[];
      scopesSupported?: string[];
    }

    export class JwtAuthProvider extends AuthProvider {
      constructor(options: JwtAuthProviderOptions);
      async verifyToken(token: string): Promise<AuthInfo | null>;
      getResourceMetadata(): ProtectedResourceMetadata;
    }
    ```
  - Notes: Use jose `jwtVerify` + `createRemoteJWKSet` for JWKS fetching

- [ ] **Task 5b: Add preset factories for common providers**
  - File: `lib/server/src/auth/presets.ts` (new)
  - Action: Factory functions for common OIDC providers:
    ```typescript
    // GitHub OIDC (for GitHub Actions tokens)
    export function createGitHubAuthProvider(options: {
      audience: string;
      resource: string;
    }): JwtAuthProvider;

    // Google OIDC
    export function createGoogleAuthProvider(options: {
      audience: string;
      resource: string;
    }): JwtAuthProvider;

    // Auth0
    export function createAuth0AuthProvider(options: {
      domain: string;  // e.g., "myapp.auth0.com"
      audience: string;
      resource: string;
    }): JwtAuthProvider;

    // Generic OIDC (any provider)
    export function createOIDCAuthProvider(options: JwtAuthProviderOptions): JwtAuthProvider;
    ```
  - Notes: Presets pre-configure issuer/jwksUri for known providers

- [ ] **Task 5c: Add env-based auth configuration loader**
  - File: `lib/server/src/auth/config.ts` (new)
  - Action: Load auth config from environment variables:
    ```typescript
    export interface AuthEnvConfig {
      provider: "github" | "google" | "auth0" | "oidc" | "none";
      audience: string;
      resource: string;
      // Auth0-specific
      domain?: string;
      // Generic OIDC
      issuer?: string;
      jwksUri?: string;
    }

    /**
     * Load auth configuration from environment variables.
     *
     * Environment variables:
     * - MCP_AUTH_PROVIDER: "github" | "google" | "auth0" | "oidc" | "none" (default: "none")
     * - MCP_AUTH_AUDIENCE: Required if provider != "none"
     * - MCP_AUTH_RESOURCE: Required if provider != "none"
     * - MCP_AUTH_DOMAIN: Required for auth0
     * - MCP_AUTH_ISSUER: Required for oidc
     * - MCP_AUTH_JWKS_URI: Optional for oidc (defaults to issuer/.well-known/jwks.json)
     */
    export function loadAuthConfigFromEnv(): AuthEnvConfig | null {
      const provider = Deno.env.get("MCP_AUTH_PROVIDER") || "none";
      if (provider === "none") return null;

      const audience = Deno.env.get("MCP_AUTH_AUDIENCE");
      const resource = Deno.env.get("MCP_AUTH_RESOURCE");

      if (!audience || !resource) {
        throw new Error("MCP_AUTH_AUDIENCE and MCP_AUTH_RESOURCE required when MCP_AUTH_PROVIDER is set");
      }

      return {
        provider,
        audience,
        resource,
        domain: Deno.env.get("MCP_AUTH_DOMAIN"),
        issuer: Deno.env.get("MCP_AUTH_ISSUER"),
        jwksUri: Deno.env.get("MCP_AUTH_JWKS_URI"),
      };
    }

    /**
     * Create AuthProvider from env config
     */
    export function createAuthProviderFromEnv(config: AuthEnvConfig): AuthProvider {
      switch (config.provider) {
        case "github":
          return createGitHubAuthProvider(config);
        case "google":
          return createGoogleAuthProvider(config);
        case "auth0":
          if (!config.domain) throw new Error("MCP_AUTH_DOMAIN required for auth0");
          return createAuth0AuthProvider({ ...config, domain: config.domain });
        case "oidc":
          if (!config.issuer) throw new Error("MCP_AUTH_ISSUER required for oidc");
          return createOIDCAuthProvider({ ...config, issuer: config.issuer });
        default:
          throw new Error(`Unknown auth provider: ${config.provider}`);
      }
    }
    ```
  - Notes: Fail-fast validation at startup, clear error messages

- [ ] **Task 6: Create auth module exports**
  - File: `lib/server/src/auth/mod.ts` (new)
  - Action: Re-export all auth components:
    ```typescript
    export type { AuthInfo, AuthOptions, ProtectedResourceMetadata } from "./types.ts";
    export type { AuthEnvConfig } from "./config.ts";
    export { AuthProvider } from "./provider.ts";
    export { JwtAuthProvider, type JwtAuthProviderOptions } from "./jwt-provider.ts";
    export { extractBearerToken, createUnauthorizedResponse, createForbiddenResponse } from "./middleware.ts";
    export { loadAuthConfigFromEnv, createAuthProviderFromEnv } from "./config.ts";
    export {
      createGitHubAuthProvider,
      createGoogleAuthProvider,
      createAuth0AuthProvider,
      createOIDCAuthProvider
    } from "./presets.ts";
    ```

- [ ] **Task 7: Add auth to ConcurrentServerOptions**
  - File: `lib/server/src/types.ts`
  - Action: Add optional auth config and tool scopes:
    ```typescript
    // In ConcurrentServerOptions:
    auth?: AuthOptions;

    // In MCPTool:
    requiredScopes?: string[];
    ```
  - Notes: Auth is optional - server works without it

- [ ] **Task 8: Extend ToolHandler signature**
  - File: `lib/server/src/types.ts`
  - Action: Add context parameter with authInfo:
    ```typescript
    export interface ToolContext {
      authInfo?: AuthInfo;  // undefined if auth not configured
    }

    export type ToolHandler = (
      args: Record<string, unknown>,
      context?: ToolContext
    ) => Promise<unknown> | unknown;
    ```
  - Notes: Context is optional for backward compatibility

- [ ] **Task 9: Add startHttp() method**
  - File: `lib/server/src/concurrent-server.ts`
  - Action: Add HTTP transport startup with auto-config from env:
    ```typescript
    async startHttp(options: { port: number; hostname?: string }): Promise<void> {
      // 1. Auto-load auth config from env vars if not provided in options
      if (!this.options.auth) {
        const envConfig = loadAuthConfigFromEnv();
        if (envConfig) {
          this.authProvider = createAuthProviderFromEnv(envConfig);
        }
      }
      // 2. Create WebStandardStreamableHTTPServerTransport
      // 3. Setup Deno.serve() with request handler
      // 4. Handle /.well-known/oauth-protected-resource endpoint
      // 5. Extract Bearer token, validate via AuthProvider
      // 6. Pass authInfo to transport.handleRequest()
    }
    ```
  - Notes: Env vars take precedence for binary distribution, code config for library usage

- [ ] **Task 10: Add scope enforcement in tools/call handler**
  - File: `lib/server/src/concurrent-server.ts`
  - Action: Check requiredScopes before executing tool:
    ```typescript
    // In CallToolRequestSchema handler:
    if (tool.requiredScopes?.length && this.options.auth) {
      const authInfo = /* from request context */;
      const hasScopes = tool.requiredScopes.every(s => authInfo?.scopes.includes(s));
      if (!hasScopes) {
        throw new Error(`Forbidden: requires scopes ${tool.requiredScopes.join(", ")}`);
      }
    }
    ```
  - Notes: Only enforce if both tool has requiredScopes AND server has auth configured

- [ ] **Task 11: Pass authInfo to tool handlers**
  - File: `lib/server/src/concurrent-server.ts`
  - Action: Include authInfo in ToolContext when calling handler:
    ```typescript
    const context: ToolContext = {
      authInfo: authInfo ? Object.freeze(authInfo) : undefined
    };
    const result = await tool.handler(args, context);
    ```
  - Notes: Use Object.freeze() for immutability

- [ ] **Task 12: Update mod.ts exports**
  - File: `lib/server/mod.ts`
  - Action: Export auth module:
    ```typescript
    // Auth support
    export { AuthProvider, JwtAuthProvider } from "./src/auth/mod.ts";
    export {
      createGitHubAuthProvider,
      createGoogleAuthProvider,
      createAuth0AuthProvider,
      createOIDCAuthProvider
    } from "./src/auth/presets.ts";
    export { loadAuthConfigFromEnv, createAuthProviderFromEnv } from "./src/auth/config.ts";
    export type { AuthInfo, AuthOptions, ProtectedResourceMetadata, JwtAuthProviderOptions, ToolContext, AuthEnvConfig } from "./src/auth/mod.ts";
    ```

- [ ] **Task 13: Write unit tests for auth**
  - File: `lib/server/src/auth/auth_test.ts` (new)
  - Action: Test AuthProvider mock, Bearer extraction, scope validation
  - Notes: Use Deno.test, @std/assert, mock AuthProvider

- [ ] **Task 14: Write JwtAuthProvider tests**
  - File: `lib/server/src/auth/jwt-provider_test.ts` (new)
  - Action: Test JWT validation with local JWKS (jose createLocalJWKSet)
  - Notes: Test valid token, expired token, invalid signature, missing claims

- [ ] **Task 15: Write integration test for HTTP + auth**
  - File: `lib/server/src/auth/http-auth_test.ts` (new)
  - Action: Test full flow: HTTP request → auth → tool execution
  - Notes: Start server on random port, send requests with/without Bearer

- [ ] **Task 16: Write env config loader tests**
  - File: `lib/server/src/auth/config_test.ts` (new)
  - Action: Test loadAuthConfigFromEnv() and createAuthProviderFromEnv()
  - Notes: Test each provider type, missing required vars, invalid provider

### Acceptance Criteria

- [ ] **AC 1**: Given a server configured with `auth`, when a request arrives without `Authorization` header, then return 401 with `WWW-Authenticate: Bearer resource_metadata="..."` header

- [ ] **AC 2**: Given a server configured with `auth`, when a request has invalid Bearer token, then return 401 with error description

- [ ] **AC 3**: Given a server configured with `auth` and a tool with `requiredScopes: ["admin"]`, when request has valid token but missing "admin" scope, then return 403 Forbidden

- [ ] **AC 4**: Given a server configured with `auth`, when request has valid Bearer token with correct scopes, then tool executes and handler receives `context.authInfo` with subject and scopes

- [ ] **AC 5**: Given a server WITHOUT `auth` config, when any request arrives, then tool executes normally (no auth required)

- [ ] **AC 6**: Given a server with `auth`, when GET `/.well-known/oauth-protected-resource` is called, then return RFC 9728 compliant JSON with `authorization_servers`, `resource`, `scopes_supported`

- [ ] **AC 7**: Given `JwtAuthProvider` with JWKS URI, when valid JWT is presented, then token is verified against remote JWKS and AuthInfo is extracted from claims

- [ ] **AC 8**: Given `JwtAuthProvider`, when JWT is expired or signature invalid, then return null (auth fails)

- [ ] **AC 9**: Given custom `AuthProvider` implementation, when passed to server options, then server uses custom provider instead of default JWT validation

- [ ] **AC 10**: Given a tool handler, when `context.authInfo` is accessed, then object is frozen (immutable)

- [ ] **AC 11**: Given `MCP_AUTH_PROVIDER=github` and `MCP_AUTH_AUDIENCE` + `MCP_AUTH_RESOURCE` env vars, when server starts, then GitHubAuthProvider is auto-configured

- [ ] **AC 12**: Given `MCP_AUTH_PROVIDER=auth0` without `MCP_AUTH_DOMAIN`, when server starts, then throw clear error message

## Additional Context

### Dependencies

**À ajouter dans `lib/server/deno.json`:**
```json
{
  "imports": {
    "jose": "npm:jose@^6.0.0"
  }
}
```

- `jose` - JWT validation, JWKS remote fetching, standard crypto
- `WebStandardStreamableHTTPServerTransport` - Déjà dans `@modelcontextprotocol/sdk`
- Pas de `@std/http` nécessaire - Deno.serve() natif suffit

### Testing Strategy

**Unit Tests:**
- `auth_test.ts` - Mock AuthProvider, Bearer extraction, scope validation
- `jwt-provider_test.ts` - JWT validation with local JWKS (jose `createLocalJWKSet`)
  - Valid token → AuthInfo extracted
  - Expired token → null
  - Invalid signature → null
  - Missing required claims → null
- `config_test.ts` - Env config loader
  - `MCP_AUTH_PROVIDER=github` → GitHubAuthProvider created
  - `MCP_AUTH_PROVIDER=auth0` sans `MCP_AUTH_DOMAIN` → Error thrown
  - `MCP_AUTH_PROVIDER=none` ou absent → null returned

**Integration Tests:**
- `http-auth_test.ts` - Full HTTP flow
  - Start server on random port via `Deno.serve()`
  - Test 401 without token
  - Test 401 with invalid token
  - Test 403 with insufficient scopes
  - Test 200 with valid token and scopes

**Manual Testing:**
```bash
# Configure auth via env vars
export MCP_AUTH_PROVIDER=github
export MCP_AUTH_AUDIENCE=https://my-mcp.example.com
export MCP_AUTH_RESOURCE=https://my-mcp.example.com

# Start server (auth auto-configured from env)
deno run -A server.ts --port 3000

# Test without token (should get 401)
curl http://localhost:3000/mcp -X POST -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Test with valid token
curl http://localhost:3000/mcp -X POST \
  -H "Authorization: Bearer <valid-jwt>" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"my_tool"},"id":1}'

# Test Protected Resource Metadata
curl http://localhost:3000/.well-known/oauth-protected-resource
```

**Binary Distribution Example:**
```bash
# User downloads compiled binary
./mcp-std-linux

# User configures auth via env
export MCP_AUTH_PROVIDER=google
export MCP_AUTH_AUDIENCE=https://my-app.example.com
export MCP_AUTH_RESOURCE=https://my-app.example.com

# Binary reads env vars at startup and enables OAuth
./mcp-std-linux --http --port 3000
```

### Notes

**Spec References:**
- MCP Auth Spec (draft 2025-06-18): https://modelcontextprotocol.io/specification/draft/basic/authorization
- RFC 9728 (OAuth Protected Resource Metadata): https://datatracker.ietf.org/doc/html/rfc9728
- OAuth 2.1 (draft-ietf-oauth-v2-1): Bearer token usage

**Key Concepts:**
- MCP Server = OAuth 2.1 Resource Server (validates tokens, doesn't issue them)
- MCP Client = OAuth 2.1 Client (handles OAuth flow with Authorization Server)
- Protected Resource Metadata tells clients where to get tokens

**Risks:**
- JWKS remote fetching adds latency on first request (mitigate: cache JWKS)
- jose library must handle edge cases (expired, revoked, wrong audience)
- Breaking change if ToolHandler signature changes (mitigate: context is optional)

**Future Considerations (Out of Scope):**
- Token caching to reduce JWKS fetches
- Rate limiting per authenticated user
- Audit logging of auth events
- Support for opaque tokens (introspection endpoint)
