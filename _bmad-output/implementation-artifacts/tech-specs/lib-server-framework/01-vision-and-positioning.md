# Vision & Positionnement

## Le paysage MCP server (fevrier 2026)

### SDKs officiels
6 SDKs sous `modelcontextprotocol/`: TypeScript, Python, Go (Google), Java (Spring), C# (Microsoft), Kotlin.
Le SDK TypeScript publie des adaptateurs thin pour Express, Hono, Node.js HTTP - pas des frameworks.

### Frameworks communautaires

| Framework | Forces | Faiblesses |
|-----------|--------|------------|
| **FastMCP (TS)** | OAuth proxy, Zod validation, edge, custom routes | Pas de concurrency, pas d'observability |
| **FastMCP (Python)** | Pythonic, ~70% des MCP servers | Python only |
| **MCP-Framework** | Convention-over-config, auto-discovery | Basique, pas de features production |
| **@hono/mcp** | Adaptateur leger | Juste du wiring |
| **EasyMCP** | Decorators, minimal | Experimental |
| **Quarkus MCP** | CDI, native compile | Java only |

### Ce que personne ne fait

1. **Concurrency control intégré** (RequestQueue, strategies backpressure)
2. **Rate limiting per-client** (sliding window)
3. **Schema validation compilée** (ajv, cache at registration)
4. **Bidirectional sampling** (SEP-1577)
5. **MCP Apps** (resources ui://, SEP-1865)
6. **Observability intégrée** (pain point #1 en production)
7. **Pipeline middleware composable** pour MCP

## Positionnement : @casys/mcp-server

**"The production-grade MCP server framework for Deno/TypeScript"**

```
@casys/mcp-server
├── Transport    : STDIO + Streamable HTTP           (existe v0.5.0)
├── Concurrency  : RequestQueue (3 strategies)        (existe v0.5.0)
├── Rate Limiting: Sliding window per-client          (existe v0.5.0)
├── Validation   : JSON Schema (ajv)                  (existe v0.5.0)
├── Sampling     : Bidirectionnel (SEP-1577)          (existe v0.5.0)
├── MCP Apps     : Resources ui:// (SEP-1865)         (existe v0.5.0)
├── Middleware    : Pipeline composable                (Phase 1)
├── Auth         : OAuth2/JWT/RFC 9728                 (Phase 2-3)
├── Observability: Tracing, metrics, structured logs   (Future)
└── Stateless    : Mode stateless (spec juin 2026)     (Future)
```

## Public cible

1. **Developpeurs MCP** - Qui veulent un framework pas juste un SDK
2. **Equipes production** - Qui ont besoin de rate limiting, auth, observability out-of-the-box
3. **Distributeurs de binaires** - Config via env vars, zero code (cas PML)
4. **Providers MCP** - Qui hostent des MCP servers pour d'autres (cas Casys)

## Donnees marche

- **8.5% des MCP servers** utilisent OAuth (Astrix Security, 2025)
- **53%** utilisent encore des API keys/PAT statiques
- La spec MCP Auth a ete revisee 4 fois en 8 mois (mars → novembre 2025)
- Cloudflare et Vercel ont le support MCP first-class
- **Stateless protocol** prevu pour spec juin 2026 (changement majeur)

## Avantage competitif

On est le seul framework qui combine :
1. Features production existantes (concurrency, rate limiting, validation)
2. Cible Deno (runtime moderne, permissions, edge-ready)
3. Architecture framework-first (pas un wrapper thin)
4. Self-hostable (pas locked a un cloud provider)
