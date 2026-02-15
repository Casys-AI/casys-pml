# Spike: Relay Publish — Remote Capability Execution via MCP Tunnel

**Date:** 2026-02-13
**Status:** Spike / Architecture exploration
**Prerequisite:** `--expose` flag (implemented, committed)

## Problem

Aujourd'hui, `pml serve --expose weather:forecast` expose une capability comme outil MCP nomme, mais **uniquement en local** (stdio ou HTTP localhost). Un tiers ne peut pas appeler cette capability a distance.

Quand un non-package client appelle une capability avec des tools `routing = 'client'`, le cloud retourne :

```typescript
// execute-direct.use-case.ts:466-479
} else {
  // Non-package client: error - MCP server unreachable
  return {
    success: false,
    error: {
      code: "MCP_SERVER_UNREACHABLE",
      message: `MCP server unreachable for tools: ${clientTools.join(", ")}`,
    },
  };
}
```

C'est une **securite intentionnelle** : le cloud n'a pas acces au runtime local (stdio, .env, API keys). Mais ca bloque aussi tout scenario de distribution.

## Objectif

Permettre a un utilisateur de **publier** une capability exposee pour qu'elle soit appelable par des tiers via une URL stable MCP Streamable HTTP sur `pml.casys.ai`, tout en maintenant l'execution sur la machine du proprietaire (qui a les stdio + les cles).

L'endpoint public **doit** etre un serveur MCP conforme (Streamable HTTP) : un client MCP standard doit pouvoir s'y connecter et appeler `tools/list`, `tools/call`.

## Ce qui existe

### Briques pretes

| Brique | Fichier | Status |
|--------|---------|--------|
| **`@casys/mcp-server` (lib/server)** | `lib/server/` | **v0.8.0, prod-ready** |
| MCP Streamable HTTP (POST + SSE) | `lib/server/src/concurrent-server.ts` | En prod |
| OAuth2/JWT auth (Google, Auth0, GitHub, OIDC) | `lib/server/src/auth/` | En prod |
| Auth config via .env (`MCP_AUTH_PROVIDER`, `MCP_AUTH_AUDIENCE`) | `lib/server/src/auth/config.ts` | En prod |
| RFC 9728 `/.well-known/oauth-protected-resource` | `lib/server/src/concurrent-server.ts` | En prod |
| Rate limiting, schema validation, backpressure | `lib/server/src/middleware/` | En prod |
| CORS, maxBodyBytes, session mgmt, cleanup | `lib/server/src/concurrent-server.ts` | En prod (v0.8.0) |
| Session register + heartbeat | `packages/pml/src/session/client.ts` | En prod |
| `capability_records.routing` (`client` / `server`) | Migration 021 + 039 | En prod, 337 records |
| `capability_records.visibility` (`private`/`project`/`org`/`public`) | Migration 021 | En prod, 51 public |
| `tool_schema.code_url` | Migration 035 | En prod, **toujours NULL** |
| `pml_registry` VIEW (UNION tool_schema + capability_records) | Migration 035 | En prod |
| `--expose` flag + capability resolver | `capability-resolver.ts`, `exposed-handler.ts` | Commite |
| AJV validation des args | `exposed-handler.ts:89-108` | Commite |
| `isPackageClient` check | `execute-direct.use-case.ts:357` | En prod |
| `executeLocalCode()` | `packages/pml/src/cli/shared/local-executor.ts` | En prod |
| FQDN resolution (scope-filtered) | `discover-handler-facade.ts` + `getUserScope()` | En prod |
| Gateway HTTP existant (Hono) | `src/mcp/server/app.ts` | En prod, utilise `RateLimiter` de lib/server |

### Briques manquantes

| Brique | Description |
|--------|-------------|
| **Tunnel SSE descendant** | Cloud -> owner via SSE (aujourd'hui c'est toujours client -> cloud) |
| **Opt-in publish** | Le client declare au cloud quelles caps il publie |
| **ConcurrentMCPServer cloud-side** | Instance lib/server sur le cloud qui sert de proxy MCP |
| **ConcurrentMCPServer owner-side** | Instance lib/server locale qui gere auth + execution |

## Architecture

### Principe : lib/server des deux cotes, SSE tunnel au milieu

L'architecture est **symetrique** : `ConcurrentMCPServer` (lib/server) sur les deux cotes, relies par un tunnel SSE.

**Cote cloud (pml.casys.ai)** — `ConcurrentMCPServer` avec :
- Rate limiting (IP + session) — protection contre les abus
- CORS whitelist — securite cross-origin
- maxBodyBytes — protection contre les payloads oversized
- Session management — suivi des callers
- MCP Streamable HTTP compliance — `tools/list`, `tools/call`, SSE notifications
- Tool handlers = **relay vers le tunnel** (pas d'execution locale)

**Cote owner (local)** — `ConcurrentMCPServer` avec :
- OAuth2/JWT auth — configure via `.env` (Google, Auth0, OIDC custom)
- Schema validation — via `inputSchema` des tools exposes
- Rate limiting — protection propre au owner
- Execution — `executeLocalCode()` avec acces stdio + .env + API keys

```
┌─────────────────┐         ┌───────────────────────────┐         ┌──────────────────────┐
│  Tiers           │         │  pml.casys.ai             │         │ Owner PML            │
│  (MCP client)    │         │  ConcurrentMCPServer      │         │ ConcurrentMCPServer  │
│                  │         │  (proxy)                  │         │ (local)              │
└────┬─────────────┘         └────────┬──────────────────┘         └──────┬───────────────┘
     │                                │                                   │
     │  POST /mcp (Streamable HTTP)   │                                   │
     │  Authorization: Bearer {jwt}   │                                   │
     │  { tools/call: weather_forecast│                                   │
     │    args: { city: "Paris" } }   │                                   │
     │───────────────────────────────>│                                   │
     │                                │                                   │
     │                     ConcurrentMCPServer                            │
     │                     ├─ rate limit (IP)                             │
     │                     ├─ CORS check                                  │
     │                     ├─ maxBodyBytes                                │
     │                     ├─ session mgmt                                │
     │                     └─ tool handler: relay()                       │
     │                                │                                   │
     │                                │  push via SSE tunnel              │
     │                                │  { callId, jsonrpc, headers }     │
     │                                │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ >│
     │                                │                                   │
     │                                │                    ConcurrentMCPServer
     │                                │                    ├─ auth (JWT verify via .env)
     │                                │                    ├─ rate limit (owner-defined)
     │                                │                    ├─ schema validation
     │                                │                    ├─ executeLocalCode()
     │                                │                    │  (stdio + .env + API keys)
     │                                │                    └─ result
     │                                │                                   │
     │                                │  POST /pml/tunnel/result          │
     │                                │< ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
     │                                │                                   │
     │  MCP JSON-RPC response         │                                   │
     │<───────────────────────────────│                                   │
     │                                │                                   │
```

### Transport du tunnel : SSE

Le owner ouvre une connexion SSE sortante vers le cloud. Le cloud push les requetes MCP en temps reel.

```
Owner PML ──[GET /pml/tunnel/stream (SSE, keep-alive)]──> pml.casys.ai
  Cloud pushes:  event: mcp_request\ndata: { callId, jsonrpc, callerHeaders }
  Owner returns: POST /pml/tunnel/result { callId, jsonrpc_response }
```

- **Latence :** ~200ms (push immediat)
- **Reconnect :** `Last-Event-ID` header standard pour reprendre apres deconnexion
- **Heartbeat :** le tunnel SSE remplace le heartbeat HTTP existant (connexion permanente = preuve de vie)
- **Notifications MCP :** le owner peut streamer des notifications vers le caller via le meme tunnel (bidirectionnel via SSE + POST)

## Modele de securite

### Double couche : cloud + owner

| Responsabilite | Cloud (ConcurrentMCPServer) | Owner (ConcurrentMCPServer) |
|----------------|-----------------------------|-----------------------------|
| **Rate limiting** | Par IP + par session (anti-DDoS) | Par caller (business rules) |
| **CORS** | Whitelist origins | N/A (pas de browser direct) |
| **Body size** | maxBodyBytes (1MB default) | maxBodyBytes configurable |
| **Auth du caller** | — | OAuth2/JWT via `.env` |
| **Schema validation** | — | inputSchema middleware |
| **Session mgmt** | Suivi callers MCP | — |
| **Execution** | — | `executeLocalCode()` + stdio + .env |
| **Auth du owner** | Session token (tunnel auth) | — |
| **Device routing** | `X-PML-Device` header → target, sinon round-robin | — |
| **Device discovery** | `GET /devices` endpoint | — |
| **Routing** | FQDN -> owner session(s) lookup | — |
| **Disponibilite** | 503 si owner offline | — |

### Auth du caller (cote owner, via .env)

Le owner configure son auth — zero code :

```bash
# .env du owner
MCP_AUTH_PROVIDER=google          # ou auth0, github, oidc
MCP_AUTH_AUDIENCE=https://my-weather-api.example.com
MCP_AUTH_ISSUER=https://accounts.google.com  # pour oidc custom
```

`lib/server` lit cette config au demarrage (`auth/config.ts`) et valide automatiquement les JWT Bearer tokens. RFC 9728 expose les metadata d'auth.

Le caller decouvre l'auth requise via :
```
GET pml.casys.ai/mcp/{owner}/{cap}/.well-known/oauth-protected-resource
→ relaye vers le owner → { authorization_servers: ["https://accounts.google.com"], scopes_supported: [...] }
```

### Ce que le owner controle

- **Quelles caps sont publiees** — opt-in explicite (`--publish`)
- **Qui peut appeler** — OAuth2 provider + audience + scopes via `.env`
- **Le code execute** — fige dans `workflow_pattern.code_snippet`
- **Les args acceptes** — valides par `inputSchema` (lib/server middleware)
- **Offline = indisponible** — tunnel ferme, cloud retourne 503

### Ce que le cloud controle

- **Infrastructure** — rate limiting IP, CORS, body size, session cleanup
- **Routing** — seules les FQDN publiees sont accessibles
- **Disponibilite** — si le owner est offline, retourne `503 Service Unavailable`

## Semantique CLI : publish vs expose vs device

### Comportement des flags

```bash
# Premier usage : --publish cree le FQDN public dans le registre cloud
pml serve --expose weather:forecast --publish --device "gpu-server"

# Re-publish : detecte que le FQDN existe, demande confirmation
# → "weather:forecast is already published (v1.2). Replace or bump version?"
pml serve --expose weather:forecast --publish --device "gpu-server"

# Machines suivantes : --expose suffit si le FQDN est deja publie
# Le tunnel s'ouvre automatiquement (detecte au register)
pml serve --expose weather:forecast --device "laptop-paris"
pml serve --expose weather:forecast --device "raspberry-pi"

# Sans --device : nom auto = hostname de la machine
pml serve --expose weather:forecast
# → device = "ubuntu-desktop-a1b2c3"
```

### Resume

| Flag | Effet |
|------|-------|
| `--expose {cap}` | Resout la capability, l'enregistre comme tool MCP local |
| `--publish` | One-shot : cree le FQDN public dans le registre cloud + `code_url` |
| `--device "nom"` | Nomme cette instance pour le routing cible (default: hostname) |
| `--expose` seul (FQDN deja publie) | Ouvre automatiquement le tunnel SSE vers le cloud |

### Device routing (cote caller)

Deux mecanismes pour cibler un device, selon le type de client :

**1. `_meta.device` dans le JSON-RPC (pour les agents MCP : Claude, GPT, etc.)**

Les agents ne controlent que le body JSON-RPC, pas les headers HTTP. `_meta` est le champ prevu par le spec MCP pour les metadata protocolaires :

```json
{
  "method": "tools/call",
  "params": {
    "name": "weather_forecast",
    "arguments": { "city": "Paris" },
    "_meta": { "device": "gpu-server" }
  }
}
```

**2. `X-PML-Device` header HTTP (pour les clients HTTP directs : curl, SDK)**

```
POST /mcp/relay/{owner}/{cap}
X-PML-Device: gpu-server
Authorization: Bearer {jwt}
```

**Priorite :** `_meta.device` > `X-PML-Device` header > round-robin (default).

```typescript
const deviceHint = context.meta?.device ?? context.headers?.["x-pml-device"];
```

Decouverte des devices via un endpoint REST standard :

```
GET /mcp/relay/{owner}/{cap}/devices
→ [
    { "name": "gpu-server", "status": "online", "since": "2026-02-13T10:00:00Z" },
    { "name": "laptop-paris", "status": "online", "since": "2026-02-13T09:30:00Z" },
    { "name": "raspberry-pi", "status": "offline", "lastSeen": "2026-02-13T08:00:00Z" }
  ]
```

## Changements requis

### 1. Cloud — ConcurrentMCPServer proxy

**Fichier :** nouveau `src/mcp/relay/relay-proxy-server.ts`

Une instance `ConcurrentMCPServer` dediee au relay, sur un port separe :

```typescript
import { ConcurrentMCPServer } from "@casys/mcp-server";

export function createRelayProxy(tunnelStore: TunnelStore): ConcurrentMCPServer {
  const proxy = new ConcurrentMCPServer({
    name: "pml-relay-proxy",
    version: "1.0.0",
    maxConcurrent: 50,
    backpressureStrategy: "queue",
    rateLimit: { maxRequests: 100, windowMs: 60_000 },
    // PAS d'auth ici — c'est le owner qui valide le JWT
  });

  // Les tools sont enregistres dynamiquement (registerToolLive)
  // quand un owner publie/se connecte
  return proxy;
}

// Quand un owner connecte un tunnel pour une capability :
function registerRelayTool(proxy: ConcurrentMCPServer, cap: PublishedCapability, tunnelStore: TunnelStore) {
  proxy.registerToolLive(
    {
      name: cap.toolName,
      description: cap.description,
      inputSchema: cap.inputSchema,
    },
    async (args, context) => {
      // 1. Device routing : _meta.device (agents MCP) > header (HTTP clients)
      const deviceHint = context.meta?.device ?? context.headers?.["x-pml-device"];

      // 2. Trouver le tunnel (cible ou round-robin)
      const tunnel = tunnelStore.pickTunnel(cap.fqdn, deviceHint);
      if (!tunnel) throw new Error("Owner offline");

      // 3. Relayer le JSON-RPC + headers d'auth du caller
      const callId = crypto.randomUUID();
      const result = await tunnel.relay(callId, {
        method: "tools/call",
        params: { name: cap.toolName, arguments: args },
      }, context.headers);

      return result;
    },
  );
}
```

**Securite fournie par lib/server :**
- Rate limiting IP (anti-DDoS)
- maxBodyBytes (1MB, anti payload bomb)
- CORS whitelist
- Session management (tracking callers)
- Backpressure (queue overflow protection)

### 2. Owner — ConcurrentMCPServer local

**Fichier :** nouveau `packages/pml/src/relay/publish-server.ts`

Quand `--publish` est passe, PML demarre un `ConcurrentMCPServer` local :

```typescript
import { ConcurrentMCPServer } from "@casys/mcp-server";

const server = new ConcurrentMCPServer({
  name: `pml-published-${owner}`,
  version: "1.0.0",
  // Auth configuree automatiquement via .env
  // (MCP_AUTH_PROVIDER, MCP_AUTH_AUDIENCE, etc.)
  validateSchema: true,
});

// Enregistrer chaque capability exposee comme tool MCP
for (const cap of exposedCapabilities) {
  server.registerTool(
    { name: cap.toolName, description: cap.description, inputSchema: cap.inputSchema },
    async (args) => executeLocalCode(cap.codeSnippet, loader, args),
  );
}
```

Ce serveur ne bind PAS de port — il recoit les requetes via le tunnel SSE.

### 3. Owner — tunnel SSE vers le cloud

**Fichier :** nouveau `packages/pml/src/relay/tunnel-client.ts`

```typescript
// Ouvre une connexion SSE sortante vers le cloud
const eventSource = new EventSource(`${cloudUrl}/pml/tunnel/stream`, {
  headers: { "Authorization": `Bearer ${sessionToken}` },
});

eventSource.addEventListener("mcp_request", async (event) => {
  const { callId, jsonrpc, callerHeaders } = JSON.parse(event.data);

  // Passer la requete au ConcurrentMCPServer local
  // (qui valide auth, schema, execute)
  const response = await server.handleJsonRpc(jsonrpc, { headers: callerHeaders });

  // Retourner le resultat au cloud
  await fetch(`${cloudUrl}/pml/tunnel/result`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${sessionToken}` },
    body: JSON.stringify({ callId, jsonrpc_response: response }),
  });
});
```

### 4. Owner — register avec published capabilities

**Fichier :** `packages/pml/src/session/client.ts`

Ajouter `publishedCapabilities` au payload register :

```typescript
body: JSON.stringify({
  clientId,
  version: this.version,
  capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
  workspace: this.workspace,
  publishedCapabilities: exposedCaps.map(c => ({
    fqdn: c.fqdn,
    name: c.name,
    inputSchema: c.inputSchema,
    authMetadata: c.authMetadata, // RFC 9728 metadata du owner
  })),
})
```

### 5. Cloud — tunnel SSE endpoints

**Fichier :** nouveau `src/mcp/relay/tunnel-endpoints.ts`

```typescript
// GET  /pml/tunnel/stream    — SSE stream vers l'owner (auth: session token)
//   Push: event: mcp_request + data: { callId, jsonrpc, callerHeaders }
//   Push: event: heartbeat + data: {} (keep-alive toutes les 15s)
//
// POST /pml/tunnel/result    — Owner retourne le resultat (auth: session token)
//   Body: { callId, jsonrpc_response }
//   Debloque le caller en attente via Promise resolve
```

### 6. Cloud — tunnel store ephemere

**Fichier :** nouveau `src/mcp/relay/tunnel-store.ts`

```typescript
// En memoire (Map) — pas besoin de Deno KV car tout est dans le meme process
interface TunnelConnection {
  sessionId: string;
  ownerUserId: string;
  deviceName: string;            // --device flag ou hostname
  publishedFqdns: string[];
  sseController: ReadableStreamDefaultController;
  pendingCalls: Map<string, { resolve: (r: unknown) => void; reject: (e: Error) => void }>;
  connectedAt: number;
}

// Device routing
function pickTunnel(fqdn: string, deviceHint?: string): TunnelConnection | null {
  const tunnels = tunnelsByFqdn.get(fqdn);
  if (!tunnels?.length) return null;
  if (deviceHint) {
    return tunnels.find(t => t.deviceName === deviceHint) ?? null;
  }
  return tunnels[(counter++) % tunnels.length]; // round-robin
}

// Lookup rapide — N tunnels par FQDN pour load balancing multi-session
// tunnelsByFqdn: Map<string, TunnelConnection[]>    // round-robin dispatch
// tunnelBySession: Map<string, TunnelConnection>     // cleanup par session
```

Quand le SSE se deconnecte, nettoyer les entrees + rejeter les pending calls.

### 7. Cloud — RFC 9728 proxy

**Fichier :** dans `src/mcp/relay/relay-proxy-server.ts`

```typescript
// GET /mcp/relay/{owner}/{cap}/.well-known/oauth-protected-resource
// Stocker les authMetadata du owner au register
// Retourner directement (pas besoin de relayer en temps reel)
```

### 8. code_url — URL publique stable

Quand une cap est published :

```sql
UPDATE capability_records
SET code_url = 'https://pml.casys.ai/mcp/relay/' || owner_namespace || '/' || action
WHERE id = $1;
```

Quand le owner se deconnecte :

```sql
UPDATE capability_records SET code_url = NULL WHERE id = $1;
```

## Estimation d'effort

| Composant | Effort | Fichiers |
|-----------|--------|----------|
| Cloud relay proxy (ConcurrentMCPServer) | M | nouveau `relay-proxy-server.ts` |
| Cloud tunnel SSE endpoints | M | nouveau `tunnel-endpoints.ts` |
| Cloud tunnel store | S | nouveau `tunnel-store.ts` |
| Owner publish server (ConcurrentMCPServer) | M | nouveau `publish-server.ts` |
| Owner tunnel SSE client | M | nouveau `tunnel-client.ts` |
| Register + published caps + authMetadata | S | `session/client.ts`, handler register cloud |
| Cloud Hono integration (mount relay sous-route) | S | `src/mcp/server/app.ts` |
| Heartbeat expire -> tunnel cleanup | S | handler heartbeat cloud |
| code_url update on publish | S | register handler cloud |
| RFC 9728 proxy | S | dans `relay-proxy-server.ts` |
| `handleJsonRpc` interne dans lib/server | M | `lib/server/src/concurrent-server.ts` |
| Tests | M | 5-6 fichiers test |
| **Total** | **~6-8 jours** | **~12-14 fichiers** |

## Flow complet E2E

```
SETUP (owner)
1. Owner configure .env :
   MCP_AUTH_PROVIDER=google
   MCP_AUTH_AUDIENCE=https://my-weather-api.example.com
2. Owner: pml serve --expose weather:forecast --publish
3. PML resolve la capability depuis le cloud (capability-resolver.ts)
4. PML demarre un ConcurrentMCPServer local avec weather_forecast comme tool
   + auth OAuth2 configuree via .env
5. PML → POST /pml/register {
     publishedCapabilities: [{ fqdn, name, schema, authMetadata }]
   }
6. Cloud → tunnel store: register FQDN -> owner session
7. Cloud → relay proxy: registerTool(weather_forecast, relay_handler)
8. Cloud → UPDATE capability_records SET code_url = 'https://pml.casys.ai/mcp/relay/{owner}/{cap}'
9. PML ouvre SSE → GET /pml/tunnel/stream (auth: session token)
   Le tunnel SSE remplace le heartbeat (connexion permanente = preuve de vie)

APPEL (tiers)
10. Tiers decouvre l'auth :
    GET pml.casys.ai/mcp/relay/{owner}/{cap}/.well-known/oauth-protected-resource
    → { authorization_servers: ["https://accounts.google.com"], scopes_supported: [...] }
11. Tiers obtient un JWT depuis Google (ou autre provider configure par le owner)
12. Tiers → POST pml.casys.ai/mcp/relay/{owner}/{cap}
    Authorization: Bearer {jwt}
    { jsonrpc: "2.0", method: "tools/call",
      params: { name: "weather_forecast", arguments: { city: "Paris" } }, id: 1 }
13. Cloud ConcurrentMCPServer :
    ├─ rate limit IP ✓
    ├─ CORS check ✓
    ├─ maxBodyBytes ✓
    └─ tool handler: relay()
14. Cloud → push via SSE tunnel:
    event: mcp_request
    data: { callId, jsonrpc, callerHeaders: { Authorization: "Bearer {jwt}" } }
15. Owner PML recoit la requete via EventSource
16. Owner → ConcurrentMCPServer.handleJsonRpc()
    ├─ auth middleware: verifie JWT (JWKS from Google) ✓
    ├─ rate limit middleware ✓
    ├─ validation middleware: check args vs inputSchema ✓
    └─ handler: executeLocalCode(code_snippet, loader, args) avec stdio + .env
17. Owner PML → POST /pml/tunnel/result { callId, jsonrpc_response }
18. Cloud debloque le caller (resolve Promise), retourne la reponse JSON-RPC
19. Tiers ← { jsonrpc: "2.0", id: 1,
      result: { content: [{ type: "text", text: "sunny, 22C" }] } }
```

## Decisions

1. **Timeout relay** — Default 30s, configurable par le owner au `--publish` (ex: `--timeout 60`). Le cloud impose un plafond max (ex: 120s) non depassable.
2. **Rate limiting tunnel** — Le owner configure ses limites (ex: 100 req/min). Le cloud impose un plafond max par plan/tier que seul l'admin peut relever. Double couche : owner decide dans la limite du plafond cloud.
3. **Billing** — Par defaut gratuit. A terme, les owners pourront monetiser leurs capabilities (marketplace payante). Le billing est hors scope MVP mais l'architecture ne doit pas l'empecher (metering des relay calls des le debut).
4. **Multi-session / load balancing** — Supporte nativement. Le tunnel store stocke N tunnels par FQDN (`Map<string, TunnelConnection[]>`). Le relay handler fait un round-robin par defaut. Le caller peut cibler un device specifique via le header HTTP `X-PML-Device: {name}` (pattern REST standard, comme les headers de routing des API gateways). Decouverte des devices via `GET /mcp/relay/{owner}/{cap}/devices`.
5. **Capability staleness** — Tant que le owner ne re-publie pas (`--publish`), c'est la version en DB qui est utilisee. Le versioning des capabilities est prevu mais pas encore implemente. Le re-register met a jour le code_snippet et l'inputSchema.
6. **Port dedie** — Le relay proxy tourne sur un port separe (pas dans le Hono existant port 3003). C'est un `ConcurrentMCPServer` lib/server standalone, meilleure isolation.

## A verifier avant implementation

1. **`handleJsonRpc` / `processJsonRpc` interne** — `ConcurrentMCPServer` n'expose probablement pas encore de methode pour traiter un JSON-RPC sans passer par HTTP bind. A verifier dans lib/server et ajouter si absent.

## Verifie : register dynamique apres start

**Resultat : faisable, changement mineur dans lib/server.**

`registerTool()` et `registerTools()` ont un guard `if (this.started) throw` (lignes 341, 374). Mais c'est une protection conservatrice, pas une limitation technique :

- `this.tools` est un `Map<string, ToolEntry>` lu dynamiquement a chaque requete
- `tools/list` fait `Array.from(this.tools.values())` a chaque appel (pas de cache)
- `tools/call` fait `this.tools.get(toolName)` a chaque appel
- `SchemaValidator` est aussi un simple `Map`

**Solution : ajouter 2 methodes dans `ConcurrentMCPServer` :**

```typescript
// Ajout dynamique (apres start) — pour le relay proxy cloud
registerToolLive(tool: MCPTool, handler: ToolHandler): void {
  this.tools.set(tool.name, { ...tool, handler });
  if (this.schemaValidator) {
    this.schemaValidator.addSchema(tool.name, tool.inputSchema);
  }
  this.log(`Live-registered tool: ${tool.name}`);
}

// Suppression dynamique — quand le owner se deconnecte
unregisterTool(toolName: string): boolean {
  const deleted = this.tools.delete(toolName);
  if (deleted) this.log(`Unregistered tool: ${toolName}`);
  return deleted;
}
```

Pas de notification MCP necessaire : les callers font `tools/list` a chaque session.

**IMPLEMENTE** : `registerToolLive()` et `unregisterTool()` ajoutes dans `concurrent-server.ts` (213 tests PASS).

## Verifie : `_meta` request vs `_meta` tool (deux flux differents)

**Attention a ne pas confondre :**

- **`tool._meta`** (statique, en sortie) — defini au `registerTool()`, renvoye dans chaque reponse. C'est celui qui porte `_meta.ui` pour les MCP Apps. **Fonctionne deja.**
- **`request.params._meta`** (par requete, en entree) — envoye par le caller dans `tools/call`. **Pas encore passe aux handlers.**

Lignes 288-289 et 1316-1317 extraient uniquement `name` et `arguments`, ignorent `_meta`.

**Fix trivial** — `MiddlewareContext` a deja `[key: string]: unknown` (ligne 28), donc :

```typescript
// Dans les deux handlers tools/call (stdio + HTTP) :
const meta = request.params._meta;  // ou params._meta pour le HTTP path

// Dans executeToolCall, ajouter au context :
const ctx: MiddlewareContext = { toolName, args, request, sessionId, meta };

// Le relay handler peut alors lire :
const deviceHint = context.meta?.device ?? context.headers?.["x-pml-device"];
```

Pas de changement de type necessaire. ~6 lignes a modifier.

## Agent Allowlist (ajout 2026-02-14, panel on-demand)

### Problème

L'auth OAuth2/JWT actuelle authentifie le **caller humain** (qui possède le token). Mais dans un modèle opérateur → client (MSP, SaaS multi-tenant), c'est un **agent IA** qui appelle les capabilities, pas un humain. L'owner veut contrôler **quels agents** ont le droit d'utiliser ses capabilities publiées.

### Use case : Opérateur distant

```
Opérateur SaaS (agents autorisés)
    ↓ agent Claude/GPT avec signature
PML Gateway (chez le client)
    ↓ capabilities autorisées seulement
Infra client (DB, filesystem, APIs)
    ↓
Tracing complet + audit trail
```

Le client installe PML, expose des capabilities (`--expose`), et seuls les agents contractualisés de l'opérateur peuvent y accéder. Les données sont accessibles à l'agent (qui les envoie au LLM cloud), mais l'accès est scopé, tracé et auditable.

### Mécanisme : signature agent dans `_meta`

L'agent inclut une signature dans `_meta.agent` de chaque requête JSON-RPC :

```json
{
  "method": "tools/call",
  "params": {
    "name": "query_clients_db",
    "arguments": { "query": "SELECT * FROM clients LIMIT 10" },
    "_meta": {
      "device": "gpu-server",
      "agent": {
        "id": "operator-saas-prod",
        "signature": "eyJhbGciOiJFUzI1NiJ9..."
      }
    }
  }
}
```

### Configuration owner (`.env` ou CLI)

```bash
# .env du client
PML_AGENT_ALLOWLIST=operator-saas-prod,operator-saas-staging
PML_AGENT_VERIFY_KEY=https://operator.example.com/.well-known/agent-keys.json

# Ou via CLI
pml serve --expose query:clients --publish --allow-agents operator-saas-prod
```

### Implémentation dans lib/server

**Fichier :** `lib/server/src/middleware/agent-allowlist.ts` (nouveau)

```typescript
interface AgentAllowlistConfig {
  allowedAgentIds: string[];       // liste blanche d'agent IDs
  verifyKeyUrl?: string;           // URL JWKS pour vérifier les signatures agent
  rejectUnidentified?: boolean;    // rejeter les requêtes sans _meta.agent (default: false)
}

// Middleware pour ConcurrentMCPServer
function agentAllowlistMiddleware(config: AgentAllowlistConfig): Middleware {
  return async (context, next) => {
    const agentMeta = context.meta?.agent;

    if (!agentMeta && config.rejectUnidentified) {
      throw new Error("Agent identification required (_meta.agent missing)");
    }

    if (agentMeta) {
      // 1. Vérifier que l'agent ID est dans la allowlist
      if (!config.allowedAgentIds.includes(agentMeta.id)) {
        throw new Error(`Agent '${agentMeta.id}' not in allowlist`);
      }

      // 2. Optionnel : vérifier la signature (anti-spoofing)
      if (config.verifyKeyUrl && agentMeta.signature) {
        await verifyAgentSignature(agentMeta, config.verifyKeyUrl);
      }
    }

    return next();
  };
}
```

**Intégration dans `packages/pml` :** Le CLI lit `PML_AGENT_ALLOWLIST` depuis `.env` et l'injecte dans la config du `ConcurrentMCPServer` local (côté owner).

### Sécurité : ce que ça protège

| Menace | Protection |
|--------|-----------|
| Agent non autorisé tente d'appeler une capability | Rejeté par allowlist middleware |
| Agent spoofé (faux agent ID) | Signature vérifiée via JWKS |
| Agent autorisé mais action non prévue | Capability ACL (`--expose` scope) + HIL |
| Exfiltration de données par un agent autorisé | Tracing DAG complet (audit trail légal) |

### Effort estimé

| Composant | Effort | Fichier |
|-----------|--------|---------|
| Agent allowlist middleware | S | nouveau `lib/server/src/middleware/agent-allowlist.ts` |
| Config `.env` parsing | S | `lib/server/src/auth/config.ts` |
| CLI `--allow-agents` flag | S | `packages/pml/src/cli/` |
| Signature verification (JWKS) | M | dans le middleware |
| Tests | S | `lib/server/tests/agent-allowlist.test.ts` |
| **Total** | **~2-3 jours** | **~4-5 fichiers** |

### Note

L'agent allowlist est **indépendante** de l'auth caller (OAuth2/JWT). Les trois couches coexistent :
- OAuth2/JWT = **qui est le caller** (humain ou service)
- Agent allowlist = **quel agent IA** est autorisé à utiliser cette session (nouveau)
- Capability ACL = **quelles capabilities** sont accessibles — **DÉJÀ IMPLÉMENTÉ** via `--expose` + `capability-resolver.ts` + `exposed-handler.ts` (72/72 tests). Seules les capabilities explicitement exposées sont enregistrées comme tools MCP dans le relay.
- Tracing = **quelles actions** ont été effectuées

C'est du zero-trust appliqué aux agents IA : identité vérifiée + accès scopé + audit trail.

## Hors scope (futur)

- **Execution cache** — apres premier appel, cacher le resultat pour les args identiques
- **Marketplace UI** — page sur casys.ai pour browser les capabilities publiees
- **Usage metering** — compteur de relay calls par capability pour facturation
- **Multi-owner federation** — un FQDN servi par plusieurs owners differents (pas seulement multi-session du meme owner)
- **Streaming responses** — SSE bidirectionnel pour les tools qui streament leurs resultats
