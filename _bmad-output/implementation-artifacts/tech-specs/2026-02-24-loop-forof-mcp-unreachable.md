# Tech Spec: Loop forOf — MCP servers unreachable inside loop nodes

**Date** : 2026-02-24
**Status** : FIXED
**Priorité** : P0 (bloque le test des fixes trace data quality)

---

## 1. Symptôme

Un `for...of` avec des appels MCP à l'intérieur échoue systématiquement avec `MCP server "std" unreachable`. Le même code sans boucle (appels séquentiels ou `Promise.all + map`) fonctionne.

```typescript
// ÉCHOUAIT — "MCP server std unreachable"
for (const t of tables) {
  await mcp.std.psql_query({ query: `SELECT count(*) FROM ${t}` });
}

// MARCHAIT — même logique sans for...of
const results = await Promise.all(tables.map(async t => {
  await mcp.std.psql_query({ query: `SELECT count(*) FROM ${t}` });
}));
```

## 2. Root Cause (confirmée)

Le routing hybride (Story 14) dans `execute-direct.use-case.ts:325-328` extrait les tools des tasks DAG pour décider client vs server execution. Le code filtrait `loop:forOf` comme `isInternalOperation()` (correct), mais ne remontait **pas les bodyTools** du metadata de la loop task.

Résultat : `toolsUsed = []` → routing check sautée → exécution **server-side** → le serveur API a `mcpClients = {}` (config `mcpServers: {}`) → `MCP server "std" unreachable`.

Les appels simples marchaient car l'AST les crée comme des tasks MCP normales (`std:psql_query`) → routing les détecte → `execute_locally: true` → PML CLI exécute avec ses MCP clients.

## 3. Ce qui marchait vs ce qui ne marchait pas

| Pattern | Résultat | Raison |
|---------|----------|--------|
| `await mcp.std.X()` (simple) | OK | Task MCP normal → routing "client" → execute_locally |
| 3x `await mcp.std.X()` séquentiels | OK | 3 tasks MCP normaux → routing "client" |
| `Promise.all(arr.map(...))` | OK | Pas détecté comme loop → code_execution task → routing voit le tool |
| `for (const x of arr) { await mcp.std.X() }` | ÉCHOUAIT | loop:forOf (interne, filtré) + bodyTools non extraits → routing sautée → server-side → mcpClients vide |

## 4. Fix

**Fichier** : `src/application/use-cases/execute/execute-direct.use-case.ts`

**Changement** : `.map()` → `.flatMap()` pour aussi extraire `task.metadata.bodyTools` des loop tasks.

```typescript
// AVANT: seul task.tool était extrait (loop:forOf filtré → toolsUsed vide)
const toolsUsed = optimizedDAG.tasks
  .map((t) => (t as { tool?: string }).tool)
  .filter((t): t is string => !!t && !isInternalOperation(t))
  .map(normalizeToolId);

// APRÈS: bodyTools extraits des loop metadata
const toolsUsed = optimizedDAG.tasks
  .flatMap((t) => {
    const task = t as TaskWithMeta;
    const tools: string[] = [];
    if (task.tool && !isInternalOperation(task.tool)) {
      tools.push(task.tool);
    }
    if (task.metadata?.bodyTools) {
      for (const bt of task.metadata.bodyTools) {
        if (!isInternalOperation(bt)) tools.push(bt);
      }
    }
    return tools;
  })
  .map(normalizeToolId);
```

**Bonus** : `src/sandbox/rpc-router.ts` — ajout log warn avec `availableServers` et `mcpClientsSize` quand `mcpClients.get()` échoue (diagnostic futur).

## 5. Vérification

- `for...of` + `mcp.std.psql_query` → `executed_locally: true`, résultats corrects
- Appels séquentiels : toujours OK
- `Promise.all(map(...))` : toujours OK
