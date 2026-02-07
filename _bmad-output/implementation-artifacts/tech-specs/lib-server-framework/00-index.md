---
title: '@casys/mcp-server - Framework Evolution'
slug: lib-server-framework
created: '2026-01-28'
updated: '2026-02-06'
status: done
origin: '2026-01-28-tech-spec-lib-server-oauth2-bearer-auth.md'
tech_stack:
  - 'Deno 2.x'
  - '@modelcontextprotocol/sdk ^1.15.1'
  - 'jose (npm:jose - JWT/JWKS validation)'
  - 'Hono 4.x (HTTP framework)'
related:
  - 'lib/server/src/concurrent-server.ts'
  - 'lib/server/mod.ts'
  - 'MCP Auth Spec (draft 2025-11-25)'
  - 'RFC 9728 (OAuth Protected Resource Metadata)'
---

# @casys/mcp-server - Framework Evolution

## Overview

Evolution de `@casys/mcp-server` (v0.5.0) d'un wrapper SDK vers un **framework MCP production-grade**.
Positionnement : le **"Hono for MCP"** - framework pour construire des serveurs MCP fiables, observables et sécurisés.

**Ce qui existe (v0.5.0):** STDIO + HTTP, concurrency, rate limiting, schema validation, sampling bridge, MCP Apps.
**Ce qu'on ajoute:** Middleware pipeline composable, OAuth2/Bearer auth (RFC 9728), presets OIDC, config env.

## Roadmap

| Phase | Titre | Fichier | Estimation | Statut |
|-------|-------|---------|------------|--------|
| 1 | Middleware Pipeline Foundation | [02-middleware-pipeline.md](./02-middleware-pipeline.md) | ~3-4h | done |
| 2 | Auth Core + Bearer + RFC 9728 | [03-auth-core.md](./03-auth-core.md) | ~3-4h | done |
| 3 | JWT Provider + Presets + YAML/Env Config | [04-jwt-presets-config.md](./04-jwt-presets-config.md) | ~3-4h | done |
| 4 | Tests + Integration | [05-tests.md](./05-tests.md) | ~3-4h | done |
| 5 | Documentation + Package Polish | [06-documentation.md](./06-documentation.md) | ~2-3h | done |

**Rythme:** 2-3 phases/jour avec AI. Total estimé : ~2 jours.

## Table of Contents

### Vision
- [Vision & Positionnement](./01-vision-and-positioning.md) - Paysage MCP, positionnement framework, public cible

### Specification (Phases)
- [Phase 1: Middleware Pipeline](./02-middleware-pipeline.md) - Refactor vers pipeline composable
- [Phase 2: Auth Core](./03-auth-core.md) - AuthProvider, Bearer, RFC 9728
- [Phase 3: JWT + Presets](./04-jwt-presets-config.md) - JwtAuthProvider, presets OIDC, config env
- [Phase 4: Tests](./05-tests.md) - Unit, integration, manual testing
- [Phase 5: Documentation](./06-documentation.md) - README, exports, exemples, page package

### Suivi
- [Decision Log](./07-decision-log.md) - Decisions architecturales chronologiques
- [Future Roadmap](./08-future-roadmap.md) - Au-dela des 5 phases (stateless, observability, async tasks)
