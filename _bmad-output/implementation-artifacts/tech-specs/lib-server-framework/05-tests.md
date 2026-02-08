# Phase 4: Tests + Integration

**Estimation:** ~3-4h | **Prerequis:** Phase 2 et 3 | **Debloque:** Phase 5

## Objectif

Couvrir le middleware pipeline, l'auth core, le JWT provider, les presets et la config YAML/env avec des tests unitaires et d'integration. Garantir la couverture de tous les chemins critiques (auth bypass, fail-fast, scope enforcement, JWT expiration, etc.).

## Couverture de tests finale

| Fichier test | Tests | Cible |
|-------------|-------|-------|
| `middleware/runner_test.ts` | 10 | Pipeline: composition, onion order, short-circuit, context enrichment, error propagation, double-call guard |
| `auth/auth_test.ts` | 26 | Bearer extraction (5), responses 401/403 (3), auth middleware (4), scope middleware (5), HTTP integration (9) |
| `auth/jwt-provider_test.ts` | 21 | Construction fail-fast (4), metadata (2), garbage/invalid tokens (2), presets (5), **real JWT verification (8)** |
| `auth/config_test.ts` | 17 | No config (1), env-only (2), YAML (2), env override YAML (2), validation fail-fast (4), factory (5), edge cases (1) |
| `http-server_test.ts` | 8 | HTTP server: initialize, tools/list, tools/call, resources, health, GET 405 |
| `rate-limiter_test.ts` | 14 | Rate limiting: limits, sliding window, wait, clear |
| `request-queue_test.ts` | 15 | Concurrency: acquire/release, strategies, FIFO order |
| `resource-registration_test.ts` | 11 | Resources: register, duplicates, atomic, URI validation |
| `schema-validator_test.ts` | 11 | Validation: types, enum, required, nested, arrays |
| `tools-meta_test.ts` | 4 | Tool metadata: _meta, visibility |
| **Total** | **137** | |

## Tests JWT avec JWKS local

Les tests JWT les plus importants utilisent un **vrai JWKS local** :

1. `startLocalJwksServer()` - genere une keypair RSA, demarre un serveur HTTP local qui sert le JWKS
2. `jwks.sign(claims)` - signe un vrai JWT avec la cle privee
3. `provider.verifyToken(token)` - verifie via le JWKS distant (localhost)

Cas couverts :
- JWT valide → AuthInfo avec subject, scopes, expiresAt
- Mauvaise audience → null
- JWT expire → null
- Scopes depuis `scope` claim (string "read write admin") → `["read", "write", "admin"]`
- Scopes depuis `scp` claim (array) → array
- Pas de scope/scp → `[]`
- `azp` claim → `clientId`
- Pas de `sub` claim → subject = "unknown"

## Tests HTTP Integration Auth

Cas couverts dans `auth_test.ts` :
- 401 sans token (tools/call)
- 200 avec token valide (tools/call)
- 401 avec token invalide (tools/call)
- **401 sur tools/list sans token** (pas de bypass)
- **200 sur tools/list avec token valide**
- **initialize sans token → 200** (pas auth-gated)
- RFC 9728 endpoint → JSON metadata
- RFC 9728 endpoint 404 quand pas d'auth
- Sans auth config → tout fonctionne sans token
- Scope enforcement → 403

## Execution des tests

```bash
# Depuis lib/server/ (import map local pour jose, @std/yaml)
cd lib/server && deno test --allow-net --allow-read --allow-env --allow-write
```

Note: les tests doivent etre lances depuis `lib/server/` car le deno.json local contient les imports `jose` et `@std/yaml` qui ne sont pas dans le deno.json racine.

## Implementation Status

**Phase 4 implementee le 2026-02-06.** 137 tests, 0 failures.

## Acceptance Criteria

- [x] **AC1:** `deno test` depuis `lib/server/` → 137 tests passent, 0 failures
- [x] **AC2:** Middleware runner teste : onion order, short-circuit, context enrichment, error propagation, double-call guard
- [x] **AC3:** Auth middleware teste : STDIO skip, missing token → AuthError, invalid token → AuthError, valid token → frozen authInfo
- [x] **AC4:** JWT provider teste avec JWKS local : JWT valide → AuthInfo correct, expire → null, wrong audience → null, scope/scp extraction
- [x] **AC5:** Config teste : YAML, env override, validation fail-fast (auth0 sans domain, oidc sans issuer, provider inconnu)
- [x] **AC6:** HTTP integration teste : 401 sans token, 200 avec token, tools/list auth-gated, initialize non auth-gated, scope 403
