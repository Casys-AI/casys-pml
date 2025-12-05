# Code Review – AgentCards (revue complète)

**Date :** 2025-12-05  
**Auteur :** Vex

## Synthèse

- Portée : revue statique large du repo (MCP gateway, exécution contrôlée, spéculation, sandbox, vector/search, CLI, web front). Tests non exécutés.
- Constat général : plusieurs chemins critiques restent simulés (pas d’appel réel MCP), le contrôle des commandes est incomplet, la spéculation ne produit pas de résultats utiles, et la journalisation sandbox est manquante. Peu de TODOs dans src, mais certaines protections sont absentes (authz HTTP, throttling/PII en HTTP). Front : landing page non typée (ts-nocheck) et lourde en animations sans garde performance.

## Problèmes critiques

1. **Exécution DAG simulée (gateway) au lieu d’appeler les outils MCP**

   - `GatewayHandler.executeDAG` utilise `simulateToolExecution` (placeholder), aucun appel MCP réel. @src/mcp/gateway-handler.ts#219-267
   - Impact : résultats fictifs, spéculation et exécution principales non fiables.
   - Action : appliquer ADR-030 – injecter `MCPClient` dans `GatewayHandler` et exécuter réellement (chemin contrôlé recommandé).

2. **Commandes d’arrêt/contrôle non appliquées**

   - `ControlledExecutor` lit `commandQueue` mais ne traite pas `abort` (log seulement). @src/dag/controlled-executor.ts#752-762
   - Impact : impossible d’interrompre ou sécuriser un workflow en cours.
   - Action : implémenter abort/pause/continue (annulation tasks, nettoyage d’état, événements, tests).

3. **Spéculation factice**

   - `SpeculativeExecutor.generateSpeculationCode` renvoie un objet statique “prepared” sans exécution d’outil. @src/speculation/speculative-executor.ts#228-259
   - Impact : cache de spéculation inutilisable, faux positifs.
   - Action : exécuter réellement (ou mock réaliste) via MCP avec timeout/abort et stocker les résultats effectifs.

4. **Journalisation sandbox absente dans la réponse MCP**
   - `execute_code` renvoie toujours `logs: []` (TODO). @src/mcp/gateway-server.ts#1116-1124
   - Impact : pas de visibilité stdout/stderr, difficile à auditer/debugger.
   - Action : capturer console/stdout/stderr dans `DenoSandboxExecutor` et remplir `logs`.

## Problèmes majeurs

1. **HTTP gateway sans contrôle d’accès/PII**

   - Mode HTTP (`gateway.startHttp`) ne mentionne ni authN/authZ ni filtrage PII côté transport. @src/cli/commands/serve.ts#283-289 + @src/mcp/gateway-server.ts (HTTP path)
   - Impact : surface d’exposition non protégée si HTTP activé.
   - Action : ajouter auth (token/mtls), limites IP, et filtrage PII côté HTTP.

2. **Gestion des décisions par polling serré**

   - `waitForDecisionCommand` poll toutes les 100 ms. @src/dag/controlled-executor.ts#665-685
   - Impact : charge inutile sous forte concurrence.
   - Action : backoff/exponential ou notify-based (channel/observer).

3. **Landing page non typée et lourde**
   - `src/web/routes/index.tsx` est en `// @ts-nocheck` avec animations SVG multiples. @src/web/routes/index.tsx#1-200
   - Impact : dette technique (pas de type-check) et risque perf sur devices faibles.
   - Action : enlever `ts-nocheck`, typer les handlers, ajouter garde `prefers-reduced-motion`.

## Problèmes mineurs / opportunités

- Tests d’intégration manquants pour exécution réelle, abort, spéculation (MCP mock) et SSE/HTTP.
- Pas de capture de logs pour métriques P95 sur vector search / embeddings (observabilité).
- Pas d’état d’erreur détaillé pour auto-init (db hash) dans le flux serve (remonte seulement via log).
- Front : pas de lazy-loading ou chunking pour illustrations lourdes, pourrait retarder le LCP.

## Recommandations prioritaires (ordre)

1. Implémenter exécution réelle Gateway (ADR-030) et retirer le simulateur.
2. Implémenter commandes abort/pause/continue dans `ControlledExecutor` + tests.
3. Rendre la spéculation réellement exécutive avec timeouts/abort + cache utile.
4. Capturer et exposer logs sandbox.
5. Sécuriser HTTP gateway (auth, rate-limit, PII guard).
6. Réduire polling de décisions / passer à notify.
7. Retirer `ts-nocheck` du front, ajouter garde performance et lazy-loading.

## Couverture / limites

- Revue statique, tests non exécutés.
- Node_modules non inspecté.
- Front passé en revue rapide (route index, composants non détaillés).
- DB/migrations non relus en détail (supposer conformes aux appels courants).

## Tests

- Non exécutés (revue statique).
