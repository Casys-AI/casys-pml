# Code Review – AgentCards

**Date :** 2025-12-05  
**Auteur :** Vex

## Synthèse

- Portée : composants Gateway/MCP, exécution contrôlée, spéculation, observabilité sandbox.
- Résumé : les flux d’exécution restent simulés (GatewayHandler), le contrôle des commandes n’est pas appliqué (ControlledExecutor), et la spéculation ne produit pas de résultats réels. Les journaux sandbox ne sont pas renvoyés. Aligner avec ADR-030 pour exécuter réellement via MCP clients.

## Problèmes critiques

1. **Exécution DAG simulée (gateway) au lieu d’appeler les outils MCP**

   - `GatewayHandler.executeDAG` utilise `simulateToolExecution` (placeholder), aucun appel MCP réel. @src/mcp/gateway-handler.ts#219-267
   - Impact : résultats fictifs, spéculation et exécution principales non fiables.
   - Action : suivre ADR-030 – injecter `MCPClient` dans `GatewayHandler` et remplacer par une exécution réelle (idéalement via le chemin contrôlé/`ControlledExecutor` pour commandes et sécurité).

2. **Commandes d’arrêt/contrôle non appliquées**

   - `ControlledExecutor` lit la `commandQueue` mais ne traite pas `abort` (simple log, aucun effet). @src/dag/controlled-executor.ts#752-762
   - Impact : impossible d’interrompre un workflow en cours, risque opérationnel.
   - Action : implémenter abort/pause/continue (annulation des tâches en cours, nettoyage d’état, émission d’événements, tests).

3. **Spéculation factice**
   - `SpeculativeExecutor.generateSpeculationCode` renvoie un objet statique “prepared” sans exécution d’outil. @src/speculation/speculative-executor.ts#228-259
   - Impact : le cache de spéculation stocke des artefacts inutilisables, aucune valeur lors d’un hit.
   - Action : produire une exécution réelle (ou mock réaliste) des outils MCP avec timeout/abort et stocker le résultat effectif.

## Problèmes majeurs

1. **Journalisation sandbox absente dans la réponse MCP**
   - `execute_code` renvoie `logs: []` (TODO non réalisé). @src/mcp/gateway-server.ts#1116-1124
   - Impact : pas de visibilité sur stdout/stderr, debugging et audit difficiles.
   - Action : capturer stdout/stderr ou hooks console dans `DenoSandboxExecutor` et remplir `logs`.

## Problèmes mineurs / opportunités

- Boucle de polling `waitForDecisionCommand` (100 ms) peut coûter cher sous charge ; prévoir backoff ou notification. @src/dag/controlled-executor.ts#665-685
- Pas de tests d’intégration visibles pour exécution réelle, abort, spéculation (MCP mock) ; les ajouter.

## Recommandations prioritaires (alignées ADR-030)

1. Brancher `GatewayHandler` sur exécution réelle via `MCPClient.callTool` (mode contrôlé recommandé) et retirer le simulateur.
2. Implémenter les commandes (abort/pause/continue) dans `ControlledExecutor` et couvrir par tests.
3. Rendre la spéculation réellement exécutive (résultats cache utilisables) avec timeouts/abort.
4. Remplir `logs` d’exécution sandbox et ajouter des tests d’intégration couvrant les chemins critiques.

## Tests

- Non exécutés (revue statique).
