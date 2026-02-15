# Panel MCP On-Demand — Rapport de Faisabilite

**Date** : 2026-02-14
**Experts** : infra-expert (DevOps/Cloud), business-expert (Strategie/Pricing), code-verifier (Audit codebase)
**Rapporteur** : Claude Opus 4.6
**Question** : Le deploiement MCP on-demand via relay tunnel + Deno Deploy Sandbox est-il faisable et pertinent MAINTENANT ?

---

## 1. VERDICT

**~~GO TECHNIQUE CONDITIONNEL, REPORTER STRATEGIQUEMENT~~**

**~~VERDICT MIS A JOUR : GO RELAY TUNNEL IMMEDIAT~~**

**VERDICT FINAL : GO ORCHESTRATION DISTRIBUEE INTELLIGENTE** — PML = l'orchestrateur distribue pour capabilities MCP sur N machines. Le relay est le transport. Le tracing est l'observabilite gratuite (effet de bord de l'orchestration, pas le produit). Le sandbox est l'isolation. Le `_meta.device` dans chaque noeud du DAG rend le tracing distribue NATIF. Analogies : Ray (ML sur N GPUs), Temporal (workflows sur N services), Kubernetes (containers sur N machines).

**Positionnement (D9)** : PML = orchestrateur distribue intelligent de capabilities MCP sur N machines via un agent. PAS "Sentry pour agents" (defensif, niche). OUI "Ray/Temporal pour MCP" (offensif, infrastructure).

*Verdict initial du panel :* GO TECHNIQUE CONDITIONNEL, REPORTER STRATEGIQUEMENT. *→ Depasse par les decisions D1-D8 du fondateur et le pivot vers les douleurs futures 6-12 mois.*

---

## 2. CE QUI CHANGE AVEC DENO DEPLOY SANDBOX

### Ce que les panels precedents disaient

| Panel | Date | Verdict | Argument principal |
|-------|------|---------|--------------------|
| Panel Business | 13/02 | "Premature" | 0 utilisateurs payants, ratio tech/adoption catastrophique |
| Panel Standalone | 13/02 | "Reporter" | Binaire 87MB, pas de marche demontre |
| Panel Marketplace | 11/02 | "GO conditionnel" | Prototype Smithery 2-3h, seuil 100 installs/30j |

### Ce que Deno Deploy Sandbox apporte

| Friction precedente | Resolue ? | Comment |
|---------------------|-----------|---------|
| Binaire 87 MB | **OUI** | Endpoint HTTP, rien a installer |
| macOS Gatekeeper / code signing | **OUI** | Pas de binaire a signer |
| mcpDeps Node.js prerequ | **OUI** | Deno runtime inclus |
| Marche demontre (clients payants) | **NON** | Aucun changement |
| handleJsonRpc interne manquant | **NON** | Toujours a implementer |
| Worker sandbox incompatible | **NOUVEAU BLOCKER** | `permissions: "none"` non supporte dans Deploy |

### La decouverte critique du code-verifier

L'infra-expert estimait que seul `Deno.Command.spawn()` (subprocess) etait incompatible avec Deno Deploy. Le code-verifier a revele un probleme **plus profond** :

> Le `SandboxWorker` dans `worker-runner.ts:161` utilise `new Worker()` avec `deno: { permissions: "none" }`. Cette API de permissions custom n'est **PAS supportee** dans Deno Deploy Sandbox. Ce n'est pas seulement les subprocess stdio qui bloquent — c'est **le mecanisme d'isolation sandbox entier** de PML.

**Consequence** : Meme les capabilities "HTTP-only" theoriquement compatibles Deno Deploy necessitent un refactor du SandboxWorker pour fonctionner en cloud. L'estimation de l'infra-expert (12% compatibles Deno Deploy) tombe a **~0% sans refactor**.

**Effort du refactor** : Remplacer le Worker avec permissions custom par une alternative cloud-compatible (WebAssembly sandbox, V8 isolate direct, ou execution sans isolation dans un container Firecracker qui fournit deja l'isolation). Estimation : 2-3 semaines supplementaires.

---

## 3. CONSENSUS

Les 3 experts convergent sur les points suivants :

### 3.1 Le code existant est solide

- **`--expose` flag** : 100% confirme, 37 tests, production-ready (`capability-resolver.ts:148-215`, `exposed-handler.ts:78-194`, `call-http.ts:27-65`)
- **`registerToolLive()` + `unregisterTool()`** : confirmes dans `concurrent-server.ts:405-433`, documentation explicite pour le use case relay
- **ConcurrentMCPServer** : Rate limiting, CORS, maxBodyBytes, session management, MCP Streamable HTTP — tout fonctionne en production
- **SSE server-side** : Implementation complete (`SSEClient` interface, `sendToSession()`, `broadcastNotification()`)

### 3.2 Le spike relay est correct

Les 4 briques manquantes identifiees dans le spike du 13/02 sont **toutes confirmees manquantes** par le code-verifier :

1. **Tunnel SSE descendant** (cloud → owner via EventSource) — aucun code existant
2. **Opt-in publish** — aucun mecanisme `--publish` dans le CLI
3. **ConcurrentMCPServer cloud-side** (proxy relay) — aucune instanciation proxy
4. **`handleJsonRpc` interne** — POST `/mcp` couple HTTP + JSON-RPC, pas de decouplage

### 3.3 Les marges sont excellentes si quelqu'un paie

Les 3 experts confirment que le cout technique est negligeable :
- Relay tunnel : ~$0.0001/execution (bande passante SSE)
- Deno Deploy : ~$0.00017/execution (5s, 2 vCPU)
- **Marge brute : >99%** sur toute fourchette de prix

### 3.4 Le tracing est LE differenciateur

Unanimite : le tracing DAG structure a 7 dimensions est le seul avantage defensible de PML. Aucun concurrent (LangSmith, Arize Phoenix, Composio) ne l'a. Le on-demand MCP ne capitalise PAS sur ce differenciateur — l'execution one-shot ne genere pas de traces structurees multi-workflows comparables.

---

## 4. DESACCORDS

### 4.1 Timing : GO maintenant vs REPORTER

| Expert | Position | Argument |
|--------|----------|----------|
| **infra-expert** | GO Phase 1 (relay, 9-11 sem) | Faisable, code existe a 80%, relay couvre 88% des capabilities |
| **business-expert** | REPORTER | 0 utilisateurs payants, cannibalise les ressources du tracing |

**Analyse du rapporteur** :

L'infra-expert raisonne en **faisabilite technique** (peut-on le faire ?). Le business-expert raisonne en **pertinence strategique** (doit-on le faire maintenant ?). Les deux ont raison dans leur cadre.

**Tranche** : Le business-expert a la priorite. Avec un fondateur solo et une fenetre de tir de 12-18 mois (Panel Business, 13/02), chaque semaine d'ingenierie compte. Les 9-11 semaines du relay sont les memes 9-11 semaines que le dashboard tracing. Le relay genere $0 de revenus a court terme. Le dashboard tracing ouvre la voie a 29 EUR/mois x N utilisateurs.

**MAIS** : l'infra-expert a raison sur un point crucial — le relay tunnel est un **asset strategique unique** (aucun concurrent ne l'a). Reporter indefiniment serait une erreur. La recommandation est donc : **Phase 2, semaines 7-12**, apres le MVP tracing (semaines 1-6).

### 4.2 Deno Deploy : 12% compatible vs ~0%

| Expert | Estimation | Base |
|--------|-----------|------|
| **infra-expert** | 12% compatible (HTTP-only) | Analyse des mcpDeps types |
| **code-verifier** | ~0% sans refactor | Worker `permissions: "none"` incompatible |

**Analyse du rapporteur** :

Le code-verifier a raison factuellement — le SandboxWorker actuel ne tourne pas dans Deno Deploy, point. L'infra-expert a raison conceptuellement — les capabilities HTTP-only POURRAIENT tourner si le sandbox est refactore.

**Tranche** : L'estimation de **~0% en l'etat, ~30-40% apres refactor sandbox (2-3 semaines)** est la position la plus juste. Cela repousse Deno Deploy encore plus loin dans le temps (Phase 3).

### 4.3 Effort total : 9-11 semaines vs 13-16 semaines

L'infra-expert donne 2 estimations :
- Phase 1 (relay only) : 9-11 semaines
- Phase 1+2 (hybrid relay + Deno Deploy) : 13-16 semaines

Le code-verifier ajoute un blocker : `handleJsonRpc` interne manquant. Cela ajoute 1-2 semaines de refactor dans `concurrent-server.ts` pour decoupler le transport HTTP de la logique JSON-RPC.

**Estimation revisee :**
- Phase 1 (relay only) : **10-13 semaines** (incluant handleJsonRpc refactor)
- Phase 1+2 (hybrid) : **16-20 semaines** (incluant sandbox refactor pour Deno Deploy)

---

## 5. FAISABILITE TECHNIQUE

### Briques existantes (verifiees par le code-verifier)

| Brique | Fichier | Lignes | Status |
|--------|---------|--------|--------|
| `--expose` + capability resolver | `capability-resolver.ts` | 148-215 | **PROD** (37 tests) |
| `registerToolLive()` | `concurrent-server.ts` | 405-416 | **PROD** (213 tests) |
| `unregisterTool()` | `concurrent-server.ts` | 427-433 | **PROD** |
| Rate limiting (IP + tool-level) | `concurrent-server.ts` | 180, 242-247, 912-917 | **PROD** |
| CORS + maxBodyBytes | `concurrent-server.ts` | 906-949, 908-910 | **PROD** |
| Session management (10K, TTL, cleanup) | `concurrent-server.ts` | 203-210, 776-803 | **PROD** |
| MCP Streamable HTTP (POST + SSE) | `concurrent-server.ts` | 1082-1500 | **PROD** |
| SSE server-side (sendToSession, broadcast) | `concurrent-server.ts` | 1565-1624 | **PROD** |
| `callHttp()` HTTP deps | `call-http.ts` | 27-65 | **PROD** (11 tests) |
| SandboxWorker (local) | `worker-runner.ts` | 161 | **PROD** (local only) |
| AJV schema validation (cached) | `exposed-handler.ts` | 78-194 | **PROD** |

### Briques manquantes (confirmees par le code-verifier)

| Brique | Effort estime | Priorite | Dependance |
|--------|---------------|----------|-----------|
| **`handleJsonRpc()` interne** — decoupler JSON-RPC pur du transport HTTP dans ConcurrentMCPServer | 1-2 semaines | **P0** (bloquant relay) | Aucune |
| **Tunnel SSE client** (owner-side EventSource + heartbeat + reconnect) | 2-3 semaines | **P0** (core relay) | handleJsonRpc |
| **TunnelStore** (Map ephemere, pickTunnel, pendingCalls, cleanup) | 1 semaine | **P0** | Aucune |
| **Relay proxy server** (ConcurrentMCPServer instancie en mode proxy) | 2-3 semaines | **P0** | registerToolLive, handleJsonRpc |
| **Opt-in `--publish`** (register, code_url update, tunnel auto-connect) | 1-2 semaines | **P0** | Relay proxy |
| **Health checks + circuit breaker** | 1-2 semaines | **P1** | Tunnel SSE |
| **Sandbox refactor** (Worker → alternative cloud-compatible) | 2-3 semaines | **P2** (Deno Deploy only) | Aucune |
| **Auto-routing decision tree** (relay vs sandbox) | 1 semaine | **P2** | Sandbox refactor |

### Risque technique principal

**Latence relay : ~420ms overhead constant** (infra-expert, calcul detaille) :
```
Client → Cloud (50ms) → Push SSE (10ms) → Owner process (50ms)
→ executeLocalCode (variable) → POST result (50ms) → Resolve (10ms) → Response (50ms)
= 420ms + temps d'execution
```

Acceptable pour workflows longs (>5s). Inacceptable pour tools rapides (<1s).

---

## 6. MODELE BUSINESS

### Synthese des recommandations business

Le business-expert a produit une analyse detaillee avec 4 frameworks (Blue Ocean, Hedgehog, Porter, JTBD). Points cles :

1. **Le on-demand ne capitalise PAS sur le differenciateur tracing** — l'execution one-shot ne genere pas les traces structurees multi-workflows qui font la force de PML

2. **Smithery Hosted est GRATUIT** — concurrent imbattable sur le hosting MCP basique. PML ne peut pas concurrencer sur le prix.

3. **Le marche MCP tire les prix vers le bas** — les utilisateurs s'attendent a $0.01-1/execution, incompatible avec du consulting premium

4. **Modele recommande : abonnement tracing, pas PPE on-demand**

| Tier | Prix | Cible |
|------|------|-------|
| Free | 0 EUR | CLI + 1000 traces cloud/mois |
| Pro | 29 EUR/mois | Dashboard + replay + 10K traces |
| Team | 49 EUR/user/mois | RBAC + alertes + 50K traces |

5. **Le relay tunnel = asset Phase 2-3** (Enterprise tier 200+ EUR/mois) — pas un produit Phase 1

### Risque de cannibalisation relay vs cloud

Le business-expert identifie un scenario ou :
1. PML lance on-demand cloud (Deno Deploy)
2. PML lance relay tunnel (execution locale, cout zero pour l'owner)
3. Les utilisateurs migrent vers relay pour economiser
4. PML perd les revenus on-demand SANS gagner de revenus relay

**Mitigation** : Positionner le relay comme **Enterprise tier** (SSO, audit, compliance, 200+ EUR/mois), pas comme alternative gratuite.

---

## 7. ARCHITECTURE RECOMMANDEE

### Vue d'ensemble : 3 phases

```
Phase 1 (Semaines 1-6) : TRACING-FIRST
==========================================
  Dashboard tracing web + Auth GitHub + Stripe billing
  = Produit vendable a 29 EUR/mois
  Pas de relay, pas de on-demand

Phase 2 (Semaines 7-12) : RELAY TUNNEL
==========================================
  handleJsonRpc refactor + TunnelStore + Tunnel SSE client
  + Relay proxy server + --publish CLI
  = Capabilities publiees, appelables par des tiers
  Positionnement Enterprise (self-hosted, compliance)

Phase 3 (Semaines 13-20) : HYBRID CLOUD
==========================================
  Sandbox refactor pour Deno Deploy + Auto-routing
  + Health checks + Circuit breaker
  = Capabilities cloud-native pour HTTP-only
  Optimisation cout/latence
```

### Architecture cible Phase 2

```
┌─────────────────┐         ┌───────────────────────────┐         ┌──────────────────────┐
│  Tiers           │         │  pml.casys.ai             │         │ Owner PML            │
│  (MCP client)    │         │  ConcurrentMCPServer      │         │ ConcurrentMCPServer  │
│                  │         │  (proxy)                  │         │ (local)              │
└────┬─────────────┘         └────────┬──────────────────┘         └──────┬───────────────┘
     │                                │                                   │
     │  POST /mcp (Streamable HTTP)   │                                   │
     │  Authorization: Bearer {jwt}   │                                   │
     │───────────────────────────────>│                                   │
     │                                │                                   │
     │                     Rate limit ✅                                  │
     │                     CORS ✅                                        │
     │                     maxBodyBytes ✅                                │
     │                     registerToolLive ✅ (deja implemente)          │
     │                                │                                   │
     │                                │  Push SSE tunnel                  │
     │                                │  { callId, jsonrpc }              │
     │                                │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─>│
     │                                │                                   │
     │                                │                    handleJsonRpc() ← A CREER
     │                                │                    Auth ✅ (lib/server)
     │                                │                    Schema ✅ (AJV)
     │                                │                    executeLocalCode() ✅
     │                                │                                   │
     │                                │  POST /tunnel/result              │
     │                                │< ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
     │                                │                                   │
     │  MCP JSON-RPC response         │                                   │
     │<───────────────────────────────│                                   │
```

### Briques existantes vs a creer

```
EXISTANT (confirme code-verifier)         A CREER
================================         ========
registerToolLive()     ✅                handleJsonRpc()        ❌
unregisterTool()       ✅                TunnelStore            ❌
Rate limiting          ✅                Tunnel SSE client      ❌
CORS + maxBodyBytes    ✅                Relay proxy server     ❌
Session management     ✅                --publish CLI          ❌
SSE server-side        ✅                Health checks          ❌
callHttp()             ✅                Circuit breaker        ❌
SandboxWorker (local)  ✅
AJV validation         ✅
--expose + resolver    ✅
```

**Ratio : ~60% existant, ~40% a creer** pour Phase 2.

---

## 8. RISQUES

### Classes par severite

| # | Risque | Severite | Source | Mitigation |
|---|--------|----------|--------|-----------|
| 1 | **0 utilisateurs payants** — investir 10-13 semaines dans le relay sans revenus | **CRITIQUE** | business-expert | Phase 2 APRES le dashboard tracing (semaines 7-12) |
| 2 | **Deno Deploy incompatible** — Worker sandbox + subprocess bloquants, ~0% compatible sans refactor | **HAUTE** | code-verifier | Reporter Deno Deploy a Phase 3. Relay tunnel suffit pour MVP |
| 3 | **handleJsonRpc manquant** — bloquant pour le relay, refactor non trivial (1802 lignes dans concurrent-server.ts) | **HAUTE** | code-verifier | P0 du relay, 1-2 semaines. Decoupler transport HTTP de logique JSON-RPC |
| 4 | **Latence relay ~420ms overhead** — inacceptable pour tools rapides (<1s) | **MOYENNE** | infra-expert | Segmenter : tools rapides = local, workflows longs = relay acceptable |
| 5 | **Cannibalisation relay vs cloud** — users migrent vers relay gratuit, PML perd revenus on-demand | **MOYENNE** | business-expert | Positionner relay comme Enterprise tier (200+ EUR/mois), pas gratuit |
| 6 | **TunnelStore en memoire** — perte de tous les tunnels si serveur cloud redemarre | **MOYENNE** | infra-expert | Reconnexion auto (SSE Last-Event-ID), ping 15s, graceful degradation |
| 7 | **Fenetre de tir 12-18 mois** — Anthropic pourrait lancer un tracing MCP natif | **HAUTE** | business-expert | Raison supplementaire de prioriser le tracing AVANT le relay |
| 8 | **Scaling >100 tunnels** — event loop latency, memory (1GB actif) | **BASSE** | infra-expert | Phase 3, multi-serveur avec Deno KV registry |

---

## 9. RECOMMANDATIONS ORDONNEES

### Phase 1 : Tracing-First (Semaines 1-6) — PAS de relay

| # | Action | Effort | Livrable |
|---|--------|--------|----------|
| 1 | Playground MVP (3 stories restantes) | 2 semaines | Playground fonctionnel |
| 2 | Auth GitHub OAuth | 1 semaine | `pml login` |
| 3 | TraceSyncer cloud + dashboard web | 2 semaines | Traces visibles en ligne |
| 4 | Stripe billing (Free/Pro/Team) | 1 semaine | Produit vendable a 29 EUR/mois |

**Cible** : Premier utilisateur payant.

### Phase 2 : Relay Tunnel (Semaines 7-12) — SI Phase 1 validee

**Condition de declenchement** : Au moins 5 utilisateurs Free actifs OU 1 utilisateur Pro payant.

| # | Action | Effort | Prerequ | Fichier cle |
|---|--------|--------|---------|-------------|
| 5 | Refactor `handleJsonRpc()` interne | 1-2 sem | Aucun | `lib/server/src/concurrent-server.ts` |
| 6 | TunnelStore ephemere | 1 sem | Aucun | nouveau `src/mcp/relay/tunnel-store.ts` |
| 7 | Tunnel SSE client (owner-side) | 2-3 sem | #5 | nouveau `packages/pml/src/relay/tunnel-client.ts` |
| 8 | Relay proxy server | 2-3 sem | #5, #6 | nouveau `src/mcp/relay/relay-proxy-server.ts` |
| 9 | `--publish` CLI | 1-2 sem | #7, #8 | `packages/pml/src/cli/` |
| 10 | Health checks + circuit breaker | 1-2 sem | #7 | dans tunnel-store.ts |

**Cible** : 10 capabilities publiees, 3 owners avec tunnels actifs.

### Phase 3 : Hybrid Cloud (Semaines 13-20) — SI relay valide

**Condition de declenchement** : 50+ capabilities publiees, latence relay mesuree, demande pour cloud execution.

| # | Action | Effort | Prerequ |
|---|--------|--------|---------|
| 11 | Refactor SandboxWorker pour Deno Deploy | 2-3 sem | Aucun |
| 12 | Auto-routing decision tree | 1 sem | #11 |
| 13 | Monitoring Prometheus/Grafana | 2 sem | #8 |

**Cible** : Architecture hybride production-ready.

### Quick Win immediat (0 investissement)

Si le fondateur veut tester le on-demand SANS investissement :

| Action | Effort | Cout |
|--------|--------|------|
| 1 capability sur Smithery BYOH (URL PML Cloud) | 1.5h | $0 |
| Seuil GO/NO-GO : 100 installations en 30 jours | 0 | $0 |

C'est la recommandation du Panel Marketplace (11/02) qui reste valide et ne consomme quasi aucune ressource.

---

## 10. DOULEURS FUTURES 6-12 MOIS — PIVOT DU PANEL

**Contexte** : Le fondateur a rejete les douleurs "basiques" (opacite, friction install, etc.) et demande : "Quelles douleurs emergent dans 6-12 mois quand MCP est massivement adopte et que les agents sont autonomes avec 50-100 capabilities ?" Les 3 experts ont pivote leur analyse.

### 10.1 Convergence sur 4 douleurs futures

| # | Douleur | Scenario | Resolu par | Experts |
|---|---------|----------|------------|---------|
| 1 | **Debug 50-tool sessions** | Agent CI appelle 47 tools la nuit, crash tool #34, dev arrive le matin : "FAILED" — impossible reconstituer le DAG d'execution | **TRACING** (DAG 7D, replay par branche, causalite) | 3/3 |
| 2 | **Capability sprawl** | 10 devs, 100 capabilities, 15 versions de `deploy_staging`, breaking changes cassent agents 2-3x/semaine | **RELAY** (registry centralise + ownership + versioning) | 3/3 |
| 3 | **Orchestration cross-machine** | Agent besoin GPU (collegue) + DB (staging, firewall) + kubectl (local) + API Stripe (cloud) dans 1 session | **RELAY** (routing distribue, `registerToolLive` comme service registry) | 3/3 |
| 4 | **Audit/rollback agents autonomes** | Agent modifie prod DB a 3h, state inconsistant, impossible prouver SOC2, pas de replay root cause | **TRACING** (audit trail immutable, replay, rollback script depuis trace) | 2/3 |

### 10.2 Douleur #5 — "Multi-Tenant SaaS" (business-expert, exclusif)

**Scenario** : Sophie, founder SaaS comptabilite, vend des agents a 50 clients. Chaque agent doit acceder aux donnees client (Stripe, QuickBooks). Deux options aujourd'hui : (A) client installe MCP local → 90% churn onboarding, (B) SaaS heberge tout → nightmare credentials 100 clients.

**Ce que le relay resout** : Le client installe 1 commande relay. Ses donnees ne quittent JAMAIS sa machine. Le SaaS orchestre a distance via tunnel. Zero credential management pour le founder. Compliance native.

**WTP** : 500-2000 EUR/mois (refacture aux clients). **TAM** : 200-1K SaaS EU dans 6-12 mois.

### 10.3 Decouverte cle : `_meta.device` = distributed tracing natif

Le spike relay (2026-02-13) prevoit deja `_meta.device` dans chaque JSON-RPC `tools/call`. Chaque noeud du DAG porte le device qui l'a execute :

```
Noeud 1: read_file       → device: "laptop-paris"
Noeud 2: ml.embed         → device: "gpu-server"
Noeud 3: psql_query       → device: "db-staging"
Noeud 4: stripe.refund    → device: "api-cloud"
```

C'est du **distributed tracing a la Jaeger/Zipkin, mais natif MCP**.

**Verification code (code-verifier, audit final) :**

| Question | Status | Detail |
|----------|--------|--------|
| Spike prevoit `_meta.device` ? | **OUI** | spike ligne 231-258, priorite : `_meta.device` > `X-PML-Device` header > round-robin |
| DAG stocke metadata par noeud ? | **PARTIEL** | `TraceTaskResult` (`execution.ts:47-128`) a 10+ metadata (layerIndex, isFused, loopId) mais PAS `device` |
| Pipeline `_meta` existe ? | **OUI pour `_meta.ui`** | `extractUiMeta()` dans `sandbox-executor.ts:206-217`, `buildMcpSuccessResult()` dans `response-builder.ts:36-79` |
| `_meta.device` propage ? | **NON — n'existe pas encore** | A implementer |

**Effort pour l'implementer : ~2-3 heures** (3 fichiers) :
1. Ajouter `device?: string` dans `TraceTaskResult` (`src/capabilities/types/execution.ts`)
2. Creer `extractDeviceMeta()` (meme pattern que `extractUiMeta()` existant)
3. Stocker dans `sandbox-executor.ts` via `toolCallRecords` (JSONB flexible, pas de migration DB)

**Briques reutilisees** : Le pipeline `_meta` existe deja pour `_meta.ui`. Le JSONB `task_results` est flexible. C'est un ajout incremental de ~50 lignes, pas un refactor.

**C'est le lien structurel entre relay et tracing** — ils sont indissociables. Le relay sans tracing = tunnel opaque (ngrok). Le tracing sans relay = observabilite locale (LangSmith). Les deux ensemble = observabilite distribuee unique.

### 10.4 Divergence sur le positionnement

| Position | Expert | Argument |
|----------|--------|----------|
| Relay = PRODUIT standalone (orchestrateur distribue) | infra-expert, business-expert | Marche emergent 6-12 mois, TAM 6.7K-21K, 1.15M-11M EUR/an |
| Relay = FEATURE du produit tracing | code-verifier | Douleurs #1 et #4 sont les plus brulantes et ne necessitent PAS le relay. Relay seul = concurrencer ngrok. |
| Relay + Tracing = PLATEFORME unique | **rapporteur (tranche)** | Les deux sont indissociables (`_meta.device` le prouve). Le produit = "PML Platform", pas "relay" ni "tracing" separes. |

### 10.5 Estimation business (business-expert)

| Douleur | Persona | TAM 6-12 mois | WTP/mois | ARR potentiel |
|---------|---------|---------------|----------|---------------|
| #1 Debug 50-tool | DevOps agents complexes | 3K-10K | 150-400 EUR | 5.4M-48M EUR/an |
| #2 Cap sprawl | Tech lead >50 cap | 1K-3K | 300-800 EUR | 3.6M-28.8M EUR/an |
| #3 Cross-machine | Backend ML/data | 2K-5K | 100-300 EUR | 2.4M-18M EUR/an |
| #4 Audit/rollback | CTO agents prod | 500-2K | 200-500 EUR | 1.2M-12M EUR/an |
| #5 Multi-tenant | SaaS founders | 200-1K | 500-2K EUR | 1.2M-24M EUR/an |

### 10.6 Pricing revise (post-pivot)

| Tier | Prix | Inclus | Cible |
|------|------|--------|-------|
| **Solo** | 49 EUR/mois | Dashboard tracing + 2 relay tunnels | Dev solo, agents en prod |
| **Team** | 199 EUR/mois | + policy engine + versioning + 10 relays | Equipe 5-15 devs, 50+ capabilities |
| **SaaS** | 999 EUR/mois | + multi-tenant + white-label + relays illimites | Founders qui vendent des agents |

---

## CONCLUSION

### L'evolution du panel

Ce panel a traverse 4 phases :

1. **Analyse initiale** — GO technique conditionnel, reporter strategiquement (tracing d'abord)
2. **Decisions fondateur (D1-D7)** — GO relay immediat (tracing deja fait)
3. **Recherche de use cases concrets** — Les 3 experts ont pivote de "GO relay" a "ABANDON relay" (aucun use case killer pour aujourd'hui)
4. **Pivot vers douleurs futures 6-12 mois** — Les 3 experts reconvergent sur GO, mais repositionne : relay + tracing = plateforme unique

### Ce que `_meta.device` change

Le distributed tracing natif via `_meta.device` est la decouverte cle du panel. Le relay n'est pas un tunnel — c'est un **enrichissement structurel de chaque trace**. Chaque noeud du DAG porte le device d'execution, transformant PML en Jaeger/Zipkin natif MCP. Aucun concurrent n'a ca.

### Pourquoi relay seul ne suffit pas

Le business-expert et le code-verifier convergent : les douleurs les plus brulantes (#1 debug, #4 rollback) ne necessitent PAS le relay. Le relay seul concurrence ngrok/Tailscale a $6-20/mois — pas de marge. La valeur est dans la combinaison : relay (transport + registry) + tracing (observabilite + audit) = plateforme d'observabilite distribuee.

### Pourquoi tracing seul ne suffit pas

Le tracing local (sans relay) concurrence LangSmith/Arize Phoenix. Le relay ajoute 3 dimensions uniques : (1) tracing CROSS-MACHINE natif, (2) capability registry avec ownership, (3) canal d'acquisition gratuit (plus de capabilities partagees = plus de traces = flywheel).

### La bonne nouvelle

Le code existant couvre ~60% du besoin :
- `--expose` + resolver (37 tests)
- `registerToolLive()` / `unregisterTool()` (base service registry)
- `execution_trace` (base distributed tracing)
- ConcurrentMCPServer (securite, sessions, SSE)
- Sandbox `permissions: "none"` (isolation code tiers)

### La question fondamentale (revisee)

> ~~"Est-ce que le fondateur accepte de monetiser le TRACING avant de construire le GATEWAY ?"~~
>
> **Nouvelle question** : "Le fondateur accepte-t-il de construire une PLATEFORME (tracing + relay) pour un marche qui n'existe pas encore (6-12 mois) ?"
>
> Si oui → construire maintenant, vendre dans 6-12 mois quand les agents autonomes seront en prod.
> Si non → focus tracing seul, revisiter relay quand le marche emerge.

---

---

## ADDENDUM : WebMCP (W3C, Microsoft + Google) — Impact sur PML

**Date addendum** : 2026-02-14
**Contexte** : WebMCP est une proposition W3C (Microsoft + Google, 958 stars) qui permet aux pages web d'exposer leurs fonctionnalites comme tools MCP cote client (browser) via `navigator.modelContext`. Chrome 146 Canary inclut un DevTrial. La question du fondateur : danger ou complement pour PML ?

### A. QU'EST-CE QUE WEBMCP

**En une phrase** : WebMCP transforme les pages web en serveurs MCP client-side — les agents IA (browser assistants) decouvrent et invoquent des fonctions JavaScript directement dans le navigateur, au lieu de scraper le DOM.

**API** : `navigator.modelContext.registerTool({ name, description, inputSchema, handler })`

**Deux modes** :
- **Declaratif** : HTML attributes sur les `<form>` existants (pas de JS requis)
- **Imperatif** : JavaScript avec `registerTool()` (interactions complexes)

**Exemple concret** :
```javascript
navigator.modelContext.registerTool({
  name: 'add_to_cart',
  description: 'Add a product to the shopping cart',
  inputSchema: {
    type: 'object',
    properties: {
      productId: { type: 'string' },
      quantity: { type: 'number' }
    },
    required: ['productId']
  },
  handler: async ({ productId, quantity = 1 }) => {
    return await cartService.add(productId, quantity);
  }
});
```

**Limitations explicites** :
- Tools disponibles UNIQUEMENT quand l'agent a charge la page (pas de headless)
- Pas de discovery cross-site (chaque page expose ses propres tools)
- HTTPS obligatoire (sauf localhost)
- Max ~50 tools/page recommande
- API susceptible de changer (early DevTrial)

**Sources** :
- [GitHub webmachinelearning/webmcp](https://github.com/webmachinelearning/webmcp)
- [Chrome Blog - WebMCP Early Preview](https://developer.chrome.com/blog/webmcp-epp)
- [Bug0 - WebMCP Chrome 146 Guide](https://bug0.com/blog/webmcp-chrome-146-guide)
- [iO Digital - WebMCP Making the Web AI-Agent Ready](https://techhub.iodigital.com/articles/web-mcp-making-the-web-ai-agent-ready)

### B. COMPARAISON STRUCTURELLE : WebMCP vs PML MCP

| Dimension | WebMCP | PML MCP |
|-----------|--------|---------|
| **Ou s'execute le code** | Browser (JavaScript client-side) | Serveur/local (Deno sandbox) |
| **Qui declare les tools** | Le site web (frontend dev) | Le cloud registry (capability author) |
| **Qui invoque** | Browser agent (Gemini, Copilot) | MCP client (Claude, ChatGPT, Cursor) |
| **Auth** | Session browser heritee (cookies, JWT) | OAuth2/JWT explicite (lib/server) |
| **Isolation** | Aucune (meme contexte JS que la page) | Sandbox `permissions: "none"` (Worker) |
| **Persistence** | State de la page (React/Redux) | DB, filesystem, KV |
| **Network** | Fetch depuis le browser (CORS) | Fetch depuis le serveur (pas de CORS) |
| **Tracing** | Aucun natif | Tracing DAG 7 dimensions |
| **HIL** | Natif (utilisateur voit la page) | Explicite (approval_required) |
| **Discovery** | Par page chargee (pas cross-site) | Par intent semantique (SHGAT/GRU) |
| **Offline** | Non (page doit etre chargee) | Oui (PML CLI local) |
| **Standardisation** | W3C Community Group Draft | Protocole MCP Anthropic |

### C. VERDICT : COMPLEMENTAIRE, PAS DANGEREUX

**WebMCP et PML operent sur des couches DIFFERENTES du stack** :

```
COUCHE                    WEBMCP              PML
================================================================
Browser UI interactions   ✅ CIBLE            ❌ Hors scope
Frontend logic            ✅ CIBLE            ❌ Hors scope
Backend tools/APIs        ❌ Hors scope       ✅ CIBLE
Workflow orchestration    ❌ Hors scope       ✅ CIBLE
Multi-step DAG            ❌ Impossible       ✅ CIBLE
ML-based routing          ❌ Impossible       ✅ CIBLE
Tracing/observabilite     ❌ Aucun            ✅ CIBLE
Self-hosted execution     ❌ Impossible       ✅ CIBLE (relay)
```

**WebMCP = couche presentation (frontend).**
**PML = couche infrastructure (backend orchestration).**

C'est la meme complementarite que React (frontend) et Express (backend). Ils ne sont pas en competition.

### D. CE QUE WEBMCP PERMET QUE PML NE FAIT PAS

1. **Interaction avec l'UI d'un site web** — Un agent peut cliquer sur "Ajouter au panier" via un tool WebMCP structure au lieu de scraper le DOM. PML n'a pas d'acces au browser DOM.

2. **Auth par session browser** — L'utilisateur est deja connecte au site. Pas besoin de configurer OAuth2/JWT. PML necessite une configuration auth explicite.

3. **HIL natif et transparent** — L'utilisateur VOIT ce que l'agent fait dans la page. C'est du "pair programming" visuel. Le HIL de PML est un dialogue textuel (approval_required).

4. **Zero infrastructure** — Un dev frontend ajoute 10 lignes de JS et son site expose des tools MCP. PML necessite un serveur, un registry, une config.

### E. CE QUE PML FAIT QUE WEBMCP NE PEUT PAS

1. **Workflows multi-etapes (DAG)** — PML compile un intent en DAG de 15-40 etapes avec des branches, boucles, et fusions. WebMCP expose des fonctions atomiques (1 tool = 1 action).

2. **Tracing structure** — PML trace chaque execution avec 7 dimensions (position, fusion, boucles, branches, causalite, PER, sanitization). WebMCP n'a aucun tracing.

3. **Routing ML** — PML utilise SHGAT/GRU pour router vers le bon tool sans consommer de tokens LLM. WebMCP depend entierement de l'agent browser pour choisir quel tool appeler.

4. **Execution server-side securisee** — PML execute dans un sandbox isole avec permissions controlees. WebMCP execute dans le contexte JS de la page (meme origin, memes permissions).

5. **Self-hosted / relay tunnel** — PML permet l'execution sur la machine de l'owner via tunnel SSE. WebMCP necessite que la page soit chargee dans un browser.

6. **Discovery semantique** — PML decouvre des tools par intent ("analyser les ventes") parmi 600+ outils. WebMCP ne decouvre que les tools de la page actuellement chargee.

### F. OPPORTUNITE STRATEGIQUE POUR PML

WebMCP cree une **opportunite d'integration**, pas une menace :

**Scenario 1 : PML comme backend d'un tool WebMCP**

Un site web expose un tool WebMCP `analyze_data(query)`. Le handler appelle PML en backend :

```javascript
navigator.modelContext.registerTool({
  name: 'analyze_data',
  description: 'Run a complex data analysis pipeline',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  handler: async ({ query }) => {
    // WebMCP = frontend entry point
    // PML = backend orchestration (DAG, tracing, routing)
    const result = await fetch('https://pml.casys.ai/mcp', {
      method: 'POST',
      body: JSON.stringify({ method: 'tools/call', params: { name: 'pml_execute', arguments: { intent: query } } })
    });
    return result.json();
  }
});
```

**Scenario 2 : PML trace les executions WebMCP**

Un middleware PML capture les invocations WebMCP pour fournir du tracing (quels tools, quand, avec quels args, quel resultat). C'est la proposition de valeur "observabilite for MCP workflows" appliquee au frontend.

**Scenario 3 : MCP Apps Bridge (lib/mcp-apps-bridge)**

Le `@casys/mcp-apps-bridge` (87/87 tests, review approuvee) bridge deja MCP Apps UI vers Telegram/LINE. La meme architecture pourrait bridger PML vers WebMCP : les `_meta.ui` widgets generes par PML seraient rendus comme tools WebMCP.

### G. POSITIONNEMENT RECOMMANDE

**Ne PAS concurrencer WebMCP. L'EMBRASSER.**

| Action | Effort | Timing | Impact |
|--------|--------|--------|--------|
| **Monitorer** la spec W3C (API changes, browser support) | 0 | Continu | Veille strategique |
| **Documenter** la complementarite PML + WebMCP | 1 jour | Quand spec stable | Positionnement marche |
| **Prototype** : 1 tool WebMCP qui appelle PML en backend | 2-3h | Apres Chrome 146 stable | Proof of concept |
| **Integration** : TraceSyncer pour WebMCP invocations | 2-3 sem | Phase 3+ | Differenciateur tracing |
| **MCP Apps Bridge** → WebMCP adapter | 1-2 sem | Phase 3+ | Widgets PML dans le browser |

### H. IMPACT SUR LE RAPPORT PRINCIPAL

WebMCP **renforce** les conclusions du panel :

1. **Le tracing est encore plus important** — Si les sites web deviennent des serveurs MCP (WebMCP), le besoin d'observabilite sur les interactions agent-web EXPLOSE. PML est le seul a proposer du tracing structure pour workflows MCP. Ce marche va grossir, pas retrecir.

2. **Le relay tunnel gagne en pertinence** — WebMCP = frontend (browser). Le relay tunnel = backend (serveur owner). Les deux se completent. Un agent browser pourrait appeler un tool WebMCP qui relay vers PML pour l'execution backend.

3. **Le positionnement "Gateway for the Conversational Web" est valide** — WebMCP rend le web "agentic" cote frontend. PML est le gateway cote backend/infrastructure. La vision landing V2 est alignee avec cette evolution.

4. **Aucun changement de priorite** — WebMCP est un standard naissant (DevTrial, API instable). Pas d'action immediate. La priorite reste : tracing dashboard (sem 1-6), relay tunnel (sem 7-12), integration WebMCP (Phase 3+).

---

---

## DECISIONS DU FONDATEUR (2026-02-14)

Suite aux analyses du panel et aux questions posees, le fondateur a tranche :

### D1. LE TRACING EST DEJA FAIT — Relay tunnel = priorite immediate

Le fondateur considere le tracing comme termine. Le rapport recommendait "tracing d'abord, relay ensuite" (Phase 1 tracing sem 1-6, Phase 2 relay sem 7-12). **Le fondateur avance directement au relay tunnel.**

**Impact** : Le phasage du rapport est modifie :
- ~~Phase 1 : Tracing dashboard (sem 1-6)~~ → FAIT
- **Phase 1 (nouvelle) : Relay tunnel** — commence maintenant
- Phase 2 : Hybrid cloud (Deno Deploy) — inchange
- Phase 3 : WebMCP integration — inchange

### D2. Smithery BYOH = test du relay HTTP

Le fondateur clarifie : le "quick win Smithery" recommande par le panel est en realite un test de la connexion HTTP du relay. Pas un projet separe — c'est une validation du relay tunnel.

### D3. handleJsonRpc = a faire rapidement

Le fondateur confirme que `lib/server` est solide et que le decoupling `handleJsonRpc()` est faisable rapidement. Le panel estimait 1-2 semaines (rapport section 5). Le fondateur est plus optimiste. **A valider avec le code-verifier** (estimation en jours vs semaines).

### D4. WebMCP = enrichissement, PAS pivot

Le fondateur ne change PAS les priorites pour WebMCP. C'est un enrichissement futur, pas un pivot strategique. Monitoring passif pour l'instant.

### D5. WebMCP = adapter dans MCP Apps Bridge (decision architecturale)

**Decision cle** : WebMCP est un **nouveau target/adapter** dans le bridge existant (`lib/mcp-apps-bridge/`, 87/87 tests), au meme titre que Telegram Mini Apps ou LINE LIFF.

```
MCP Tools → _meta.ui → MCP Apps Bridge → Telegram Mini Apps
                                        → LINE LIFF
                                        → WebMCP (futur adapter)
```

Le fondateur precise :
- PML ne fait pas QUE le backend — il genere aussi l'UI (`_meta.ui` iframes composites)
- Mais une page full iframes = mauvais UX pour la navigation
- Donc PML = backend orchestration + UI generation, WebMCP = client qui consomme

**Impact sur le rapport** : Le "Browser Connector" (Playwright) propose par le business-expert (section G, Option C) est ecarte au profit de l'approche adapter bridge, plus legere (1-2 semaines vs 3-4 semaines).

### D6. Direction WebMCP — Bridge (A) ET Connector (B), les deux

Le fondateur tranche : **les deux sont valides et complementaires**.

- **(A) Bridge** : PML EXPOSE ses pages comme tools WebMCP (via adapter bridge). Effort : 1-2 semaines quand la spec WebMCP se stabilise.
- **(B) Connector** : PML CONSOMME les tools WebMCP d'autres sites. Effort : **quasi zero**. Un site qui expose des tools via WebMCP est juste un serveur MCP standard. PML le consomme deja nativement — le protocole est le meme, seul le transport change (browser au lieu de stdio/HTTP).

**Insight cle** : Le "Browser Connector" (3-4 semaines, Playwright) propose par le business-expert est surdimensionne. Cote consommation, il n'y a rien a developper — WebMCP parle MCP, et PML parle deja MCP. Cote exposition, c'est un adapter leger dans le bridge existant.

**Ni l'un ni l'autre n'est urgent.** Priorite = relay tunnel.

### Synthese des decisions

| # | Decision | Impact sur le rapport |
|---|----------|----------------------|
| D1 | Tracing fait, relay = Phase 1 | Phasage modifie, relay commence maintenant |
| D2 | Smithery = test relay HTTP | Quick win = validation relay, pas projet separe |
| D3 | handleJsonRpc rapidement | Estimation a affiner (jours vs semaines) |
| D4 | WebMCP = enrichissement | Pas de pivot, monitoring passif |
| D5 | WebMCP = adapter bridge | Architecture simplifiee vs Browser Connector |
| D6 | Bridge ET Connector | Les deux, mais (B) = quasi zero dev (MCP standard). Aucun n'est urgent |
| D7 | Sandbox `permissions: "none"` = NECESSAIRE | Protege la machine, pas security theater. Encore plus critique avec relay |
| D8 | Relay = PRODUIT, marche requis | Le relay doit resoudre une douleur reelle, pas juste etre une brique technique |
| D9 | PAS "Sentry pour agents" → "Orchestration distribuee intelligente" | Tracing = effet de bord gratuit, pas le produit. Analogies : Ray, Temporal, Kubernetes |

### D7. Sandbox `permissions: "none"` = NECESSAIRE, pas security theater

Le fondateur a tranche apres l'audit du code-verifier :

**Raisonnement** :
- "Tout le monde va ecrire du code" — les capabilities sont du code tiers
- Le sandbox protege la MACHINE qui execute, pas le code lui-meme
- Deux cas proteges : la machine du dev PML (quand il fait `pml serve` avec des capabilities tierces), ET la machine des utilisateurs finaux

**Analogie validee** :
- Comme iOS sandboxe les apps (protege le telephone)
- Comme Docker isole les containers (protege l'hote)
- Le Worker `permissions: "none"` force le code a passer par le bridge RPC (`postMessage`), le processus principal controle les permissions reelles

**Impact sur le relay** :
- Le sandbox est encore PLUS important quand du code arrive via relay d'un owner tiers
- Un utilisateur qui consomme une capability publiee par quelqu'un d'autre DOIT avoir cette protection
- Le relay tunnel + sandbox = double protection (code tiers + execution locale)

**Ce que le sandbox bloque** (confirme par le code-verifier, `worker-runner.ts:166`) :
- `fetch()` direct → BLOQUE (pas d'exfiltration invisible)
- `Deno.readFile()` direct → BLOQUE (pas de lecture hors MCP)
- `Deno.Command()` direct → BLOQUE (pas de subprocess hors MCP)

**Ce que le sandbox FORCE** :
- Toute interaction passe par `mcp.*` → RPC → main process → TRACE dans les logs
- Attaque detectable car auditable (vs exfiltration invisible sans sandbox)

**Verdict mis a jour** : ~~GO TECHNIQUE CONDITIONNEL, REPORTER STRATEGIQUEMENT~~ → **GO RELAY TUNNEL IMMEDIAT**. Le fondateur a leve la condition strategique (tracing fait). Le GO technique est confirme par les 3 experts. Le relay tunnel demarre maintenant.

### D8. Relay = PRODUIT, pas brique technique — marche requis

Le fondateur a pose la question fondamentale : "On ne trouve pas le produit parce qu'on ne trouve pas la douleur qu'on resout." Cette decision a declenche le pivot du panel vers les douleurs futures 6-12 mois.

**Consequence** : Le panel a abandonne les use cases actuels (GPU on-premise, Private API Gateway) — TAM trop petit, alternatives existantes (ngrok, Tailscale, Ray Serve). Le relay ne peut etre lance comme produit que s'il resout une douleur future massive et emergente.

**Resolution** : Les 3 experts convergent sur le positionnement "plateforme tracing + relay" pour equipes d'agents autonomes (6-12 mois). Le `_meta.device` dans chaque noeud du DAG est la preuve technique que relay et tracing sont structurellement lies.

### D9. PAS "Sentry pour agents" → "Orchestration distribuee intelligente"

Le fondateur rejette le positionnement "Sentry pour agents IA" propose par le code-verifier :

- **"Sentry pour agents"** = ultra niche, monitoring defensif, parle pas a tout le monde
- **"Orchestration distribuee intelligente de N machines PML via un agent"** = sexy, infrastructure, offensif

**Le tracing = effet de bord gratuit de l'orchestration, PAS le produit principal.** Quand on orchestre N machines, on trace automatiquement. Le tracing est un sous-produit de l'orchestration, pas l'inverse.

**Analogies du fondateur** :
- **Ray** distribue du ML sur N GPUs → PML distribue des capabilities MCP sur N machines
- **Temporal** orchestre des workflows sur N services → PML orchestre des DAGs MCP sur N devices
- **Kubernetes** orchestre des containers sur N machines → PML orchestre des capabilities sur N owners

**Positionnement final** : PML = l'orchestrateur distribue pour capabilities MCP. Le relay est le transport. Le tracing est l'observabilite gratuite. Le sandbox est l'isolation. Le tout forme une plateforme d'orchestration distribuee — pas un outil de monitoring.

---

*Panel consolide par le rapporteur sur la base de 3 analyses independantes (infra, business, code-verifier), avec croisement des claims techniques contre le code source.*

*Le panel a traverse 4 phases : analyse initiale → decisions fondateur (D1-D7) → recherche use cases concrets → pivot douleurs futures 6-12 mois. Le verdict a evolue de "GO conditionnel" a "GO immediat" a "ABANDON relay standalone" a "GO plateforme tracing + relay distribue".*

*Addendum WebMCP base sur la spec W3C (GitHub, 958 stars), le blog Chrome Developers, bug0.com et iO Digital.*

*References aux panels precedents : Panel Business (13/02), Panel PMF (13/02), Panel Standalone (13/02), Panel Marketplace (11/02), Spike Relay (13/02), Tech Spec --expose (12/02), Exploration Agents-as-Tools (13/02).*
