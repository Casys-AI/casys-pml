# Tech Spec: STD Server Concurrency Fix

**Date**: 2025-12-19
**Status**: Draft
**Priority**: Medium

## Problem

Le serveur MCP std (`lib/mcp-tools-server.ts`) est séquentiel (boucle `while(true)`) mais le client MCP envoie les requêtes en parallèle (mode multiplexé par défaut).

Quand le DAG executor appelle plusieurs outils std en parallèle:
1. Client envoie N requêtes simultanément
2. Serveur les traite une par une
3. Les N-1 dernières timeout côté client (30s) avant d'être traitées

## Bug corrigé (buffer)

Le buffer stdin était local à `readMessage()`, causant une perte de messages quand plusieurs arrivaient ensemble. Fix appliqué: buffer persistant au niveau module.

```typescript
// Persistent buffer for stdin parsing
const decoder = new TextDecoder();
let stdinBuffer = "";
```

## Solutions proposées

| Option | Effort | Description |
|--------|--------|-------------|
| **1. useMutex côté client** | Faible | Configurer std avec `useMutex: true` pour sérialiser les appels |
| **2. Réduire over-generation DAG** | Faible | Ajuster scoring pour moins de faux positifs |
| **3. Worker pool serveur** | Moyen | Traiter plusieurs requêtes en parallèle côté serveur |
| **4. Async request batching** | Moyen | Collecter les requêtes et les traiter en batch |

## Recommandation

Option 1 (useMutex) est la plus simple et suffisante pour std car les outils sont rapides (~50ms).

## Files concernés

- `lib/mcp-tools-server.ts` - Serveur std (buffer fix appliqué)
- `src/mcp/client.ts` - Client MCP (option useMutex)
- Config MCP servers - Ajouter option mutex pour std
