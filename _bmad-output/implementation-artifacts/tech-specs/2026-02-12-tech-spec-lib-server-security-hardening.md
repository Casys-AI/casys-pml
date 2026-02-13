---
title: 'Hardening sécurité MCP server (CVE-2026-0755, OWASP MCP Top 10)'
slug: 'lib-server-security-hardening'
created: '2026-02-12'
status: 'ready-for-dev'
tech_stack:
  - 'Deno 2.x'
  - '@modelcontextprotocol/sdk ^1.15.1'
  - 'Hono (HTTP transport)'
  - 'ajv (JSON Schema validation)'
  - 'jose (JWT/JWKS validation)'
files_to_modify:
  - 'lib/server/src/types.ts (HttpServerOptions additions)'
  - 'lib/server/src/concurrent-server.ts (startHttp hardening, sessionId propagation, warnings)'
  - 'lib/server/src/middleware/rate-limit.ts (optional IP-based key extractor)'
  - 'lib/server/src/runtime.node.ts (body size limits)'
  - 'lib/server/src/runtime.ts (body size limits)'
  - 'lib/server/README.md (security guidance + secure-by-default recommendations)'
code_patterns:
  - 'Middleware pipeline order: rate-limit → auth → custom → scope-check → validation → backpressure → handler'
  - 'Optional config in ConcurrentServerOptions, fail-fast with warnings'
  - 'No silent fallbacks for insecure defaults'
test_patterns:
  - 'Deno.test with @std/assert'
  - 'Manual: curl oversized payload → 413'
  - 'Manual: rate-limit by IP → 429'
  - 'Manual: startHttp without auth emits warning / fails when requireAuth'
  - 'Manual: CORS allowlist returns only configured origins'
---

# Tech-Spec: Hardening sécurité MCP server (lib/server)

**Created:** 2026-02-12

## Overview

### Problem Statement

L’audit sécurité de `lib/server` confirme une base solide (auth OAuth2/JWT, pipeline middleware, validation JSON Schema, CSP pour MCP Apps, HMAC pour PostMessage), mais plusieurs **surfaces HTTP restent permissives** par défaut. Dans le contexte de CVE-2026-0755 (command injection via tool args) et des risques OWASP MCP Top 10 / CoSAI, ces failles de configuration par défaut peuvent permettre **abuse, DoS, tool poisoning** ou mauvaise isolation entre clients.

Le protocole MCP transporte du JSON texte. L’intégrité (HMAC) et l’auth (JWT) ne suffisent pas à elles seules : le serveur doit **imposer des garde-fous** côté transport et **encadrer l’exécution des tools**.

### Solution

Renforcer le serveur avec une couche **secure-by-default** pour l’HTTP : limites de payload, CORS allowlist, warning/requirement d’auth, rate limiting par IP, propagation systématique du sessionId dans le contexte middleware. Compléter par une **guideline officielle** pour l’implémentation sécurisée des ToolHandlers.

### Scope

**In Scope**
- Hardening du transport HTTP (`startHttp()`)
- Contrôles de configuration (warnings/strict mode)
- Rate limiting IP-based
- Propagation `sessionId` au pipeline middleware
- Documentation de sécurité ToolHandler (anti-command injection)

**Out of Scope**
- Réécriture des tool handlers existants
- Chiffrement TLS / mTLS (pilotage infra)
- Analyse statique ou sandboxing OS
- Scan automatique d’outils tiers (mcp-scan)

---

## Context for Development

### Existing Security Controls (2026-02-12)

- **Pipeline middleware** : rate-limit → auth → custom → scope-check → validation → backpressure → handler
- **Schema validation** via Ajv (no coercion, defaults, all errors)
- **OAuth2/JWT** (RFC 9728), scopes par tool
- **CSP** pour UI (MCP Apps)
- **Message signing** HMAC pour PostMessage
- **Session management** + anti-session exhaustion

### Findings & Gaps (Audit)

**A. Risques Command Injection (CVE-2026-0755)**
- Le framework n’exécute pas de shell lui-même, mais **les ToolHandlers reçoivent des args non filtrés**. Sans schéma strict, l’attaque se déporte dans l’implémentation du tool.

**B. Transport HTTP permissif**
- CORS `origin: "*"` par défaut
- Pas de **limite de taille** pour `c.req.json()` (risque DoS)
- Pas d’alerte quand `startHttp()` est lancé sans auth

**C. Rate limiting insuffisant**
- `initialize` est protégé par un rate-limit IP, mais les autres endpoints HTTP ne le sont pas.

**D. Contexte middleware incomplet**
- `executeToolCall()` est appelé sans `sessionId` côté HTTP → pas d’audit, pas d’ABAC, pas de logs corrélés.

### Mapping risques (OWASP MCP Top 10 / CoSAI)

| Risque | Impact | État actuel | Hardening proposé |
| --- | --- | --- | --- |
| MCP05 Command Injection | Critique | Dépend des ToolHandlers | Schema strict + guidance tool | 
| MCP03 Tool Poisoning | Critique | Auth + CSP/HMAC partiels | Auth required + allowlists | 
| MCP01 AuthZ/AuthN | Élevé | Auth optionnel | Warning/requireAuth | 
| MCP02 Input Validation | Élevé | Ajv optionnel | Enforce schema + strict mode | 
| MCP06 DoS/Abuse | Élevé | init rate-limit seul | IP rate-limit global + payload limit |

---

## Implementation Plan

### Task 1 — Limite de taille payload (`maxBodyBytes`)

**But:** éviter DoS par payload JSON massif.

**Implementation**
- Ajouter `HttpServerOptions.maxBodyBytes?: number` (default ex: 1MB)
- Intercepter le body et refuser `> maxBodyBytes` avec HTTP 413
- Appliquer aux routes `POST /mcp` (et `OPTIONS` si nécessaire)

**Acceptance Criteria**
- [ ] Une requête JSON > `maxBodyBytes` retourne **413 Payload Too Large**
- [ ] La taille par défaut est documentée
- [ ] `maxBodyBytes` est configurable et désactivable (ex: `undefined`)

---

### Task 2 — CORS allowlist (origine contrôlée)

**But:** réduire l’exposition cross-origin par défaut.

**Implementation**
- Étendre `HttpServerOptions` avec `corsOrigins?: string[] | "*"`
- Si défini, utiliser `origin: corsOrigins` au lieu de `"*"`
- Logger un warning si `cors: true` et `origin: "*"` + auth activée

**Acceptance Criteria**
- [ ] `corsOrigins` restreint les origins autorisées
- [ ] Par défaut, comportement identique mais warning si insecure
- [ ] CORS désactivable via `cors: false`

---

### Task 3 — Auth required / warning explicite

**But:** éviter le démarrage HTTP en mode « ouvert » par accident.

**Implementation**
- Ajouter `HttpServerOptions.requireAuth?: boolean` (ou `ConcurrentServerOptions.requireHttpAuth`)
- Si `requireAuth` true et `auth` non configuré → throw
- Si `requireAuth` false et `auth` absent → warning explicite (log)

**Acceptance Criteria**
- [ ] `requireAuth: true` empêche le serveur de démarrer sans auth
- [ ] Sans auth + requireAuth false → warning visible dans logs
- [ ] Avec auth configuré → aucun warning

---

### Task 4 — Rate limiting IP-based (HTTP)

**But:** limiter abuse et bruteforce.

**Implementation**
- Ajouter `HttpServerOptions.ipRateLimit?: RateLimitOptions`
- Appliquer middleware HTTP global basé sur IP (`x-forwarded-for`, `x-real-ip`)
- Retourner `429` en cas de dépassement

**Acceptance Criteria**
- [ ] Un client qui dépasse les limites obtient 429
- [ ] Les limites sont configurables par server
- [ ] N’affecte pas STDIO

---

### Task 5 — Propager `sessionId` dans executeToolCall

**But:** enrichir le contexte middleware et l’observabilité.

**Implementation**
- Passer `reqSessionId` à `executeToolCall()` dans `startHttp()`
- Exposer `ctx.sessionId` dans middlewares (log, auth, ABAC)

**Acceptance Criteria**
- [ ] `ctx.sessionId` est défini pour les appels HTTP avec session
- [ ] Les métriques/logs peuvent inclure le sessionId

---

### Task 6 — Documentation “Secure ToolHandler”

**But:** prévenir CVE-2026-0755-like patterns

**Implementation**
- Ajouter une section README :
  - **No shell** (`Deno.Command`, `child_process.exec`) avec args non validés
  - Exiger `inputSchema` strict (`additionalProperties: false`)
  - Préférer allowlists (paths, commands, domains)
  - Loguer les actions sensibles

**Acceptance Criteria**
- [ ] README inclut la checklist sécurité ToolHandler
- [ ] Exemple de schéma strict fourni

---

## Risks & Mitigations

- **Backward compatibility:** nouveaux champs optionnels pour ne pas casser l’API
- **False positives (rate limit):** defaults conservateurs + configurables
- **Complexité config:** warnings explicites + doc

---

## Success Metrics

- ↓ incidents d’abus HTTP (payload/DoS)
- ↑ adoption des schémas stricts
- Pipeline middleware enrichi (session + IP)
- Mise en conformité OWASP MCP Top 10 (MCP01, MCP02, MCP05, MCP06)
