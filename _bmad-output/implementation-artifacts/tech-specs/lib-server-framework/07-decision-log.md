# Decision Log

Decisions architecturales chronologiques pour l'evolution framework de `@casys/mcp-server`.

## 2026-01-28 - Tech spec initiale OAuth2

**Contexte:** Besoin d'auth pour les MCP HTTP (distribution binaire, hosting).
**Decision:** Implementer OAuth2 Bearer auth avec JWT/JWKS validation.
**Raison:** La spec MCP Auth (draft 2025-11-25) definit les MCP servers comme OAuth Resource Servers. Pas d'Authorization Server - on valide les tokens, on ne les emet pas.

## 2026-02-06 - Sharding de la spec + approche framework-first

**Contexte:** La tech spec originale etait monolithique. Besoin de structurer en phases et d'adopter une approche framework-first.
**Decision:**
1. Sharder en 5 phases avec roadmap
2. Ajouter un middleware pipeline AVANT l'auth (Phase 1)
3. L'auth devient un middleware standard (Phase 2-3)

**Raisons:**
- Le pipeline est duplique entre STDIO et HTTP → middleware runner l'unifie
- L'auth comme middleware est plus composable et testable
- Ouvre la porte a d'autres middlewares (logging, tracing, custom)
- Conforme au pattern framework (Hono, Express, Koa)

## 2026-02-06 - Middleware pipeline: onion model

**Decision:** Utiliser le modele "onion" (Koa/Hono style) pour les middlewares.
**Alternatives envisagees:**
- Linear pipeline (Express): `(req, res, next)` - plus simple mais moins flexible
- Event-based: trop complexe pour le use case

**Raison:** Le modele onion permet a chaque middleware de wraper le handler (before + after), ce qui est necessaire pour le backpressure (acquire/release autour du handler).

## 2026-02-06 - AuthProvider = abstract class (pas interface)

**Decision:** `AuthProvider` est une `abstract class`, pas une `interface`.
**Raison:** Les interfaces TypeScript sont effacees au runtime. Pour la DI avec diod (qui utilise des tokens), on a besoin d'une valeur runtime. L'abstract class sert de token DI.

## 2026-02-06 - Auth skip en STDIO

**Decision:** Le middleware auth skip automatiquement quand `ctx.request` est absent (transport STDIO).
**Raison:** STDIO est un transport local (process spawn). L'auth n'a pas de sens - le process est deja autorise par l'OS.

## 2026-02-06 - Env config auto-load dans startHttp()

**Decision:** `startHttp()` auto-charge la config auth depuis les env vars si aucune config programmatique n'est fournie.
**Raison:** Cas d'usage binaire compile : l'utilisateur ne peut pas modifier le code, il configure via env vars. L'auto-load au demarrage HTTP est le moment naturel.

## 2026-02-06 - Positionnement "Hono for MCP"

**Contexte:** Recherche sur le paysage MCP server frameworks.
**Decision:** Positionner `@casys/mcp-server` comme le framework MCP production-grade pour Deno/TS.
**Raison:**
- Aucun framework existant ne combine concurrency, rate limiting, validation, sampling, MCP Apps
- FastMCP (TS) est le plus proche mais manque de features production
- L'ecosysteme Deno n'a pas de framework MCP dedie
- Le marche est encore jeune (8.5% d'adoption OAuth, spec qui evolue vite)

## 2026-02-06 - Code Review Phase 1+2 : 8 action items identifies

**Contexte:** Code review apres implementation de Phase 1 (middleware pipeline) et Phase 2 (auth core). 95 tests passent.
**Findings:**
- 3 Critical : double-call guard runner (C-1), auth bypass endpoints non-tools/call (C-2), scope middleware silent fallback (C-3)
- 5 Major : header injection WWW-Authenticate (M-1), shallow freeze authInfo (M-2), initialize non auth-gated (M-3), rate limiter coupling (M-4), CORS missing Authorization (M-5)
- 6 Minor + 3 Nits

**Decision:** Corriger C-1, C-2, C-3, M-1, M-2, M-5 immediatement (avant Phase 3). M-3 → option B (rate-limit initialize). M-4 → backlog.

**Raisons:**
- C-2 est un vrai bypass de securite
- C-3 viole la regle no-silent-fallbacks du projet
- M-5 casse les clients browser (preflight CORS rejette Authorization header)

## 2026-02-06 - Phase 3 : YAML + env au lieu de env-only

**Contexte:** La spec originale prevoyait une config auth purement par env vars. Discussion sur l'approche.
**Decision:** Config YAML (`mcp-server.yaml`) avec override par env vars, au lieu de env-only.
**Raisons:**
- L'auth est simple (5-7 champs), mais le framework aura d'autres configs (concurrency, rate-limit, CORS, etc.)
- YAML est plus lisible pour la config structuree, versionnable
- Les env vars restent pour les overrides de deploiement et les secrets
- Pattern standard (Docker Compose, Kubernetes, Vite)
- Pas de backward compat a gerer (env-only n'avait pas encore ete impl)
- `@std/yaml` est dans la stdlib Deno, pas de dep externe

**Priorite de merge:** `programmatic (options.auth) > env vars > YAML > pas d'auth`

## 2026-02-06 - Code Review Phase 3+4 : 5 action items

**Contexte:** Code review apres implementation Phase 3 (JWT + presets + config) et Phase 4 (137 tests).
**Findings:**
- 2 Major : jose import manquant dans root deno.json (CR3-1), double token verification tools/call (CR3-2)
- 1 Major : session memory leak sans TTL/cleanup (CR3-3)
- 2 Minor : YAML unsafe cast (CR3-4), scope-middleware empty resourceMetadataUrl (CR3-5)

**Decision:** Corriger les 5 items immediatement.

**Actions:**
- CR3-1 : jose ajoute au root deno.json
- CR3-2 : tools/call deplace AVANT verifyHttpAuth dans handleMcpPost → pipeline gere auth seul
- CR3-3 : Session cleanup timer (30min TTL, 5min sweep, max 10k sessions, Deno.unrefTimer)
- CR3-4 : loadYamlAuth valide les types apres parseYaml (typeof checks)
- CR3-5 : auth middleware propage `ctx.resourceMetadataUrl`, scope middleware l'utilise

## 2026-02-06 - tools/call avant verifyHttpAuth (restructuration handleMcpPost)

**Contexte:** `verifyHttpAuth()` + auth middleware dans pipeline = double verification du token pour tools/call.
**Decision:** tools/call est traite AVANT le `verifyHttpAuth()` gate. Le pipeline middleware gere l'auth pour tools/call. Les autres endpoints (tools/list, resources/list, resources/read) utilisent `verifyHttpAuth()`.
**Raison:** Elimine la double verification et garde la separation claire : pipeline = tools/call, verifyHttpAuth = metadata endpoints.

## 2026-02-06 - Code Review 3 : 10 action items (3C + 4M + 3m)

**Contexte:** 3e code review apres toutes les corrections des reviews 1+2. Focus securite, edge cases, no-silent-fallbacks.

**Critiques (3):**
- C-1: Race condition TOCTOU dans RequestQueue.acquire() (queue strategy)
- C-2: SSE GET endpoint sans auth gate
- C-3: Session ID jamais valide sur POST (Mcp-Session-Id ignore)

**Majeurs (4):**
- M-2: waitForSlot sans timeout max
- M-3: URL metadata double slash (concat sans strip trailing /)
- M-4: 202 silencieux pour requete sans method (NSF violation)
- M-5: Catch global perd request id (viole JSON-RPC 2.0)
- M-6: registerTool apres start() sans guard (requiredScopes ignores)

**Mineurs (3):**
- m-2: extractScopes coerce non-string via map(String)
- m-3: lastActivity jamais mise a jour (sessions actives expirees)
- m-4: parseInt(lastEventId) → NaN

**Decision:** Tout corriger immediatement.

**Actions realisees:**
- C-1: RequestQueue.release() transfere le slot directement au waiter (pas de decrement/recheck)
- C-2: verifyHttpAuth ajoute dans handleMcpGet
- C-3: Validation Mcp-Session-Id sur POST + update lastActivity
- M-2: waitForSlot timeout = windowMs
- M-3: Helper buildMetadataUrl (strip trailing /) dans concurrent-server + auth middleware
- M-4: 202 seulement si method present et id absent, sinon -32600
- M-5: requestId capture avant try, utilise dans catch
- M-6: throw si registerTool/registerTools apres started
- m-2: filter typeof string au lieu de map(String)
- m-3: session.lastActivity = Date.now() sur POST valide
- m-4: Number.isNaN check

## 2026-02-06 - RequestQueue slot transfer pattern

**Contexte:** Race condition dans queue strategy (C-1 review 3).
**Decision:** Le pattern "slot transfer" : `release()` ne decremente pas `inFlight` quand un waiter attend. Au lieu de ca, il wake le waiter directement, le slot reste "occupe" et est transfere. Le waiter n'a pas besoin de re-checker ou incrementer.
**Raison:** Elimine le gap TOCTOU entre "check inFlight" et "inFlight++" puisque le slot n'est jamais libere. Pattern classique en Go (channel-based) et Java (Semaphore.release → acquire handoff).
