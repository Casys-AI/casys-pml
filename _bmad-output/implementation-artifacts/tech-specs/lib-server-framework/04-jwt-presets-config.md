# Phase 3: JWT Provider + Presets + YAML/Env Config

**Estimation:** ~3-4h | **Prerequis:** Phase 2 (auth core) | **Debloque:** Phase 4

## Objectif

Fournir une implementation concrete de `AuthProvider` : validation JWT via JWKS, presets pour les providers OIDC courants, et configuration par fichier YAML (avec override par env vars) pour les binaires compiles.

## Design

### JwtAuthProvider

```typescript
// lib/server/src/auth/jwt-provider.ts

import { jwtVerify, createRemoteJWKSet } from "jose";
import { AuthProvider } from "./provider.ts";
import type { AuthInfo, ProtectedResourceMetadata } from "./types.ts";

export interface JwtAuthProviderOptions {
  /** JWT issuer attendu (iss claim) */
  issuer: string;
  /** JWT audience attendu (aud claim) */
  audience: string;
  /** JWKS URI pour la validation des signatures.
   *  Si absent, derive de issuer + /.well-known/jwks.json */
  jwksUri?: string;
  /** Resource identifier RFC 9728 */
  resource: string;
  /** Authorization servers pour les metadonnees */
  authorizationServers: string[];
  /** Scopes supportes */
  scopesSupported?: string[];
}

export class JwtAuthProvider extends AuthProvider {
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  private options: JwtAuthProviderOptions;

  constructor(options: JwtAuthProviderOptions) {
    super();
    // Fail-fast : valider les options requises
    if (!options.issuer) throw new Error("[JwtAuthProvider] issuer is required");
    if (!options.audience) throw new Error("[JwtAuthProvider] audience is required");
    if (!options.resource) throw new Error("[JwtAuthProvider] resource is required");
    if (!options.authorizationServers?.length) {
      throw new Error("[JwtAuthProvider] at least one authorizationServer is required");
    }
    this.options = options;
    const jwksUri = options.jwksUri ?? `${options.issuer}/.well-known/jwks.json`;
    this.jwks = createRemoteJWKSet(new URL(jwksUri));
  }

  async verifyToken(token: string): Promise<AuthInfo | null> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.options.issuer,
        audience: this.options.audience,
      });
      return {
        subject: payload.sub ?? "unknown",
        clientId: (payload.azp as string | undefined) ?? (payload.client_id as string | undefined),
        scopes: this.extractScopes(payload),
        claims: payload as Record<string, unknown>,
        expiresAt: payload.exp,
      };
    } catch {
      return null;
    }
  }

  getResourceMetadata(): ProtectedResourceMetadata {
    return {
      resource: this.options.resource,
      authorization_servers: this.options.authorizationServers,
      scopes_supported: this.options.scopesSupported,
      bearer_methods_supported: ["header"],
    };
  }

  private extractScopes(payload: Record<string, unknown>): string[] {
    if (typeof payload.scope === "string") {
      return payload.scope.split(" ").filter(Boolean);
    }
    if (Array.isArray(payload.scp)) {
      return payload.scp.map(String);
    }
    return [];
  }
}
```

### Presets OIDC

```typescript
// lib/server/src/auth/presets.ts

/** GitHub Actions OIDC */
export function createGitHubAuthProvider(options: BasePresetOptions): JwtAuthProvider;

/** Google OIDC */
export function createGoogleAuthProvider(options: BasePresetOptions): JwtAuthProvider;

/** Auth0 */
export function createAuth0AuthProvider(options: BasePresetOptions & { domain: string }): JwtAuthProvider;

/** Generic OIDC */
export function createOIDCAuthProvider(options: JwtAuthProviderOptions): JwtAuthProvider;
```

### Config YAML + Env Override

**Schema YAML (`mcp-server.yaml`):**

```yaml
auth:
  provider: google              # github | google | auth0 | oidc
  audience: https://my-mcp.example.com
  resource: https://my-mcp.example.com
  # Auth0 only:
  domain: tenant.auth0.com
  # OIDC generique only:
  issuer: https://my-idp.example.com
  jwksUri: https://my-idp.example.com/.well-known/jwks.json
  # Optionnel:
  scopesSupported:
    - read
    - write
    - admin
```

**Env overrides (priorite sur YAML):**

```bash
MCP_AUTH_PROVIDER=google        # Override auth.provider
MCP_AUTH_AUDIENCE=...           # Override auth.audience
MCP_AUTH_RESOURCE=...           # Override auth.resource
MCP_AUTH_DOMAIN=...             # Override auth.domain
MCP_AUTH_ISSUER=...             # Override auth.issuer
MCP_AUTH_JWKS_URI=...           # Override auth.jwksUri
MCP_AUTH_SCOPES=read write      # Override auth.scopesSupported (space-separated)
```

**Logique de chargement:**

```typescript
// lib/server/src/auth/config.ts

/**
 * Charge la config auth : YAML -> env override -> validation.
 *
 * @param configPath - Chemin vers le YAML (default: cherche mcp-server.yaml dans cwd)
 * @returns AuthConfig ou null si pas d'auth configuree
 * @throws Error si config invalide (fail-fast)
 */
export async function loadAuthConfig(configPath?: string): Promise<AuthConfig | null>;

/**
 * Cree un AuthProvider a partir de la config.
 */
export function createAuthProviderFromConfig(config: AuthConfig): AuthProvider;
```

**Merge priority:** `programmatic (options.auth) > env vars > YAML > defaults`

Si `options.auth.provider` est fourni en programmatique, YAML et env sont ignores (l'utilisateur a choisi son provider en code).

### Integration dans startHttp()

```typescript
// Auto-load auth config (YAML + env) if not programmatic
if (!this.options.auth?.provider) {
  const config = await loadAuthConfig();
  if (config) {
    this.authProvider = createAuthProviderFromConfig(config);
    this.log(`Auth configured from config: provider=${config.provider}`);
  }
} else {
  this.authProvider = this.options.auth.provider;
}
```

## Fichiers a creer/modifier

| Fichier | Action |
|---------|--------|
| `lib/server/src/auth/jwt-provider.ts` | **Nouveau** - JwtAuthProvider |
| `lib/server/src/auth/presets.ts` | **Nouveau** - GitHub, Google, Auth0, OIDC factories |
| `lib/server/src/auth/config.ts` | **Nouveau** - YAML + env config loader |
| `lib/server/src/auth/mod.ts` | **Modifier** - Exporter jwt-provider, presets, config |
| `lib/server/mod.ts` | **Modifier** - Exporter depuis auth |
| `lib/server/deno.json` | **Modifier** - Ajouter `jose`, `@std/yaml` |
| `lib/server/src/concurrent-server.ts` | **Modifier** - Auto-config dans startHttp() |

## Usage Examples

### Programmatic (library)
```typescript
import { ConcurrentMCPServer, createGoogleAuthProvider } from "@casys/mcp-server";

const server = new ConcurrentMCPServer({
  name: "my-server",
  version: "1.0.0",
  auth: {
    provider: createGoogleAuthProvider({
      audience: "https://my-mcp.example.com",
      resource: "https://my-mcp.example.com",
    }),
    authorizationServers: ["https://accounts.google.com"],
    resource: "https://my-mcp.example.com",
  },
});
```

### YAML config (binary)
```yaml
# mcp-server.yaml
auth:
  provider: google
  audience: https://my-mcp.example.com
  resource: https://my-mcp.example.com
```

```bash
./my-mcp-server --http --port 3000
# Auto-detects mcp-server.yaml in cwd
```

### Env override (CI/CD)
```bash
MCP_AUTH_PROVIDER=google
MCP_AUTH_AUDIENCE=https://prod.example.com
MCP_AUTH_RESOURCE=https://prod.example.com
./my-mcp-server --http --port 3000
# Env vars override YAML values
```

## Acceptance Criteria

- [x] AC1: `JwtAuthProvider` valide un JWT signe avec JWKS distant
- [x] AC2: JWT expire → `verifyToken()` retourne null
- [x] AC3: JWT mauvaise signature → `verifyToken()` retourne null
- [x] AC4: Claims `sub`, `scope`/`scp`, `exp` extraits correctement
- [x] AC5: `createGitHubAuthProvider()` pre-configure issuer GitHub Actions
- [x] AC6: `createAuth0AuthProvider({ domain: "x.auth0.com" })` pre-configure correctement
- [x] AC7: `loadAuthConfig()` charge YAML et merge les env vars
- [x] AC8: Env var override YAML (ex: `MCP_AUTH_AUDIENCE` ecrase `auth.audience` du YAML)
- [x] AC9: YAML absent + pas d'env vars → `loadAuthConfig()` retourne null
- [x] AC10: Provider invalide dans YAML → throw Error claire (fail-fast)
- [x] AC11: Auth0 sans `domain` → throw Error claire (fail-fast)
- [x] AC12: `startHttp()` auto-configure auth depuis YAML si pas de config programmatique

## Implementation Status

**Phase 3 implementee le 2026-02-06.** 38 tests (21 jwt-provider + 17 config).

## Code Review Action Items (2026-02-06)

| ID | Severite | Issue | Fix |
|----|----------|-------|-----|
| CR3-1 | Major | jose import pas dans root deno.json → fail quand resolu depuis root | Ajoute `"jose": "npm:jose@^6.0.0"` au root deno.json imports |
| CR3-2 | Major | Double token verification: `verifyHttpAuth()` + pipeline auth middleware pour tools/call | Restructure: tools/call avant verifyHttpAuth dans handleMcpPost, pipeline gere auth |
| CR3-3 | Major | Session memory leak: sessions ajoutees sans TTL ni max | Ajoute cleanup timer (30min TTL, 5min interval) + MAX_SESSIONS (10k) + Deno.unrefTimer |
| CR3-4 | Minor | YAML config unsafe cast `as ConfigFile` | Ajoute validation des types apres parseYaml (typeof checks, array filtering) |
| CR3-5 | Minor | AuthError empty resourceMetadataUrl dans scope-middleware | Propage resourceMetadataUrl depuis auth middleware via ctx |

**Tous les items fixes le 2026-02-06.** 137 tests passent.

## Code Review Action Items - Review 3 (2026-02-06)

| ID | Severite | Issue | Fix |
|----|----------|-------|-----|
| CR3-m2 | Minor | `extractScopes` coerce `scp` non-string via `map(String)` → `"undefined"`, `"null"` | Fix: `.filter((s) => typeof s === "string")` au lieu de `.map(String)` |

**Fixe le 2026-02-06.** 137 tests passent.
