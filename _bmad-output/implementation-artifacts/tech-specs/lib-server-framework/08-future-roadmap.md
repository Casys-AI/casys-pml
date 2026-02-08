# Future Roadmap (au-dela des 5 phases)

Elements identifies pour les futures versions de `@casys/mcp-server`, bases sur l'analyse du paysage MCP et les tendances de la spec.

## Priorite haute

### Stateless Protocol Mode (spec juin 2026)

La spec MCP va vers un **mode stateless** qui elimine le handshake `initialize` et envoie les capabilities avec chaque requete. C'est le changement le plus important a venir.

**Impact sur lib/server:**
- Le session management actuel (`this.sessions`) devient optionnel
- Les capabilities doivent etre envoyees avec chaque reponse
- Compatible avec load balancing / horizontal scaling sans sticky sessions
- JWT Bearer est deja stateless par nature → notre auth est bien alignee

**Estimation:** Phase medium - va dependre de la spec finale

### Observability intégree

C'est le **pain point #1 en production** (InformationWeek). Aucun framework MCP n'offre ca.

**Ce qu'on veut:**
- Structured logging avec context MCP (tool name, session ID, duration)
- Metrics exportables (Prometheus format ou OpenTelemetry)
- Trace IDs propagees a travers le pipeline middleware
- Dashboard-ready (s'integre avec notre dashboard existant)

**Implementation:** Middleware `createObservabilityMiddleware()` qui log chaque tool call avec timing.

### Token Caching

Le `JwtAuthProvider` fetch les JWKS distants a chaque verification. En production avec beaucoup de requetes, c'est un bottleneck.

**Solution:** Cache JWKS en memoire avec TTL configurable. `jose` a un cache built-in via `createRemoteJWKSet` mais verifier son comportement.

## Priorite moyenne

### Async Tasks (spec 2025-11-25)

La spec de novembre 2025 ajoute les **taches asynchrones** : fire-and-forget + poll-for-result. La plupart des frameworks n'ont pas encore implemente ca.

**Impact:** Nouveau pattern de handler qui retourne un task ID immediatement, puis le client poll pour le resultat.

### Server Cards / Discovery

SEP-1649 propose `/.well-known/mcp.json` pour la decouverte de serveurs MCP.

**Impact:** Endpoint simple a ajouter, mais attend la finalisation du SEP.

### DPoP (Demonstrating Proof-of-Possession)

Prevu pour la spec juin 2026. Empeche le vol de tokens (le token est lie au client qui l'a obtenu).

**Impact:** Evolution du auth middleware pour verifier la preuve de possession.

## Priorite basse

### OpenAPI → MCP Tool Generation

Generer automatiquement des tools MCP a partir d'un schema OpenAPI. Speakeasy fait ca en externe, mais l'avoir dans le framework serait un differenciateur.

### Multi-transport zero-config

```typescript
// STDIO en dev
await server.start(); // Auto-detect: STDIO si stdin est un pipe

// HTTP en prod
await server.startHttp({ port: 3000 }); // Auto si --http flag
```

### Plugin system

Au-dela des middlewares : plugins qui ajoutent des tools, des resources, et des middlewares en un seul package.

```typescript
import { metricsPlugin } from "@casys/mcp-server-metrics";
server.use(metricsPlugin());
```

### Rate limiting per authenticated user

Actuellement le rate limiting est par "key" (configurable). Avec l'auth, on peut automatiquement rate limiter par `authInfo.subject`.

```typescript
server.use(createRateLimitMiddleware(limiter, {
  keyExtractor: (ctx) => ctx.authInfo?.subject ?? "anonymous",
}));
```

## Timeline estimee

| Version | Contenu | Timeline estimee |
|---------|---------|-----------------|
| **0.6.0** | Middleware + Auth (Phases 1-5) | Fevrier 2026 |
| **0.7.0** | Observability + Token caching | Mars 2026 |
| **0.8.0** | Async Tasks + Server Cards | Avril 2026 |
| **1.0.0** | Stateless mode + stabilisation API | Juin-Juillet 2026 (post spec) |

## Veille technologique

- [ ] Suivre le blog MCP pour les SEPs : https://blog.modelcontextprotocol.io
- [ ] Suivre TypeScript SDK v2 (Q1 2026)
- [ ] Surveiller FastMCP (TS) pour les features qu'ils ajoutent
- [ ] Tester la compatibilite avec Cloudflare Workers (edge runtime Deno)
