# Phase 5: Documentation + Package Polish

**Estimation:** ~2-3h | **Prerequis:** Phase 4 | **Debloque:** publication

## Objectif

Finaliser le package pour publication : exports, README, exemples d'utilisation, et planifier la page de documentation publique.

## 1. Update mod.ts exports

```typescript
// lib/server/mod.ts - ajouts

// Middleware pipeline
export type { Middleware, MiddlewareContext, NextFunction, MiddlewareResult } from "./src/middleware/mod.ts";
export { createMiddlewareRunner } from "./src/middleware/mod.ts";

// Auth
export { AuthProvider } from "./src/auth/mod.ts";
export { JwtAuthProvider } from "./src/auth/mod.ts";
export type { AuthInfo, AuthOptions, ProtectedResourceMetadata, JwtAuthProviderOptions, AuthEnvConfig } from "./src/auth/mod.ts";
export { AuthError } from "./src/auth/mod.ts";
export {
  createAuthMiddleware,
  extractBearerToken,
  createUnauthorizedResponse,
  createForbiddenResponse,
} from "./src/auth/mod.ts";
export {
  createGitHubAuthProvider,
  createGoogleAuthProvider,
  createAuth0AuthProvider,
  createOIDCAuthProvider,
} from "./src/auth/mod.ts";
export { loadAuthConfigFromEnv, createAuthProviderFromEnv } from "./src/auth/mod.ts";
```

## 2. README update

Le README doit presenter le framework avec des exemples concis pour chaque feature.

### Structure README

```markdown
# @casys/mcp-server

Production-grade MCP server framework for Deno.

## Features

- **Dual Transport** - STDIO + Streamable HTTP
- **Concurrency Control** - RequestQueue with 3 backpressure strategies
- **Rate Limiting** - Sliding window, per-client
- **Schema Validation** - JSON Schema (ajv), compiled at registration
- **OAuth2 Auth** - JWT/Bearer, RFC 9728, OIDC presets
- **Middleware Pipeline** - Composable, framework-style
- **MCP Apps** - Resources with ui:// scheme (SEP-1865)
- **Bidirectional Sampling** - Delegate to client's LLM (SEP-1577)

## Quick Start

### Basic Server (STDIO)
[example: 10 lines]

### HTTP Server with Auth
[example: 15 lines]

### Binary Distribution (env config)
[example: bash env vars + start command]

### Custom Middleware
[example: logging middleware]

## API Reference

### ConcurrentMCPServer
- constructor(options)
- registerTool(tool, handler)
- registerTools(tools, handlers)
- registerResource(resource, handler)
- use(middleware)
- start() - STDIO
- startHttp(options) - HTTP

### Auth Presets
- createGitHubAuthProvider(options)
- createGoogleAuthProvider(options)
- createAuth0AuthProvider(options)
- createOIDCAuthProvider(options)

### Env Config
- loadAuthConfigFromEnv()
- createAuthProviderFromEnv(config)

## License
```

## 3. Version bump

```json
// lib/server/deno.json
{
  "version": "0.6.0"  // 0.5.0 → 0.6.0 (middleware + auth = minor)
}
```

## 4. Page documentation publique (planification)

### Options

| Option | Effort | Resultat |
|--------|--------|----------|
| **JSR page enrichie** | Faible | README riche sur jsr.io/@casys/mcp-server |
| **GitHub Pages** | Moyen | Site statique, custom domain possible |
| **Page sur casys.ai** | Faible | Section dediee sur le site existant |

### Recommandation : JSR + section casys.ai

1. **JSR** : Le README enrichi est automatiquement la page du package sur jsr.io. C'est ou les developpeurs Deno cherchent.
2. **casys.ai** : Ajouter une section `/framework` ou `/mcp-server` sur le site existant, avec le positionnement et des exemples.
3. **GitHub Pages** : Reporter a plus tard, quand il y aura assez de contenu pour justifier un site dedie.

### Contenu page casys.ai

- Hero: "@casys/mcp-server - The production-grade MCP framework"
- Features grid (les 8 features)
- Code example (quick start)
- Comparison table vs FastMCP, official SDK
- Link vers JSR pour install + API docs

## Acceptance Criteria

- [x] **AC1:** Given the updated `mod.ts`, when `deno check lib/server/mod.ts` is run, then it passes with no type errors and all new auth/middleware types are exported
- [x] **AC2:** Given the updated README, when a developer reads it, then they find usage examples for: basic STDIO, HTTP with auth, env config, and custom middleware
- [x] **AC3:** Given `deno.json`, when the version is checked, then it reads `0.6.0` (minor bump for new features)
- [x] **AC4:** Given the documentation plan, when reviewed, then it includes a concrete plan for JSR page enrichment and casys.ai section

## Implementation Status

**Phase 5 implementee le 2026-02-06.** README reecrit avec couverture complete des features (dual transport, middleware, OAuth2, presets OIDC, YAML config, MCP Apps, sampling). Version bump 0.5.0 → 0.6.0. Exports deja complets dans mod.ts depuis Phase 4.
