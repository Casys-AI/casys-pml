# Loop Abstraction pour SHGAT Learning

## Contexte et Problème

### Problème Initial

Dans les workflows avec boucles, le DAG logique contenait **toutes les itérations** :

```typescript
// Code utilisateur
for (const item of items) {
  await mcp.click(item.selector);
  await mcp.fill(item.selector, item.value);
}
```

**DAG généré (avant) :**
```
task_1: mcp:click
task_2: mcp:fill
task_3: mcp:click  // Itération 2
task_4: mcp:fill
task_5: mcp:click  // Itération 3
task_6: mcp:fill
...
```

**Problèmes :**
- 6 layers avec le même outil (pour 3 itérations)
- SHGAT apprend "click-fill-click-fill-click-fill" au lieu du pattern
- Non généralisable : le pattern dépend du nombre d'éléments

---

## Solution : Loop Abstraction

### Principe

Les boucles sont représentées comme un **nœud abstrait** contenant une seule itération :

```
loop_1 (forOf: item of items)
  ├── task_1: mcp:click (parentScope: loop_1)
  └── task_2: mcp:fill (parentScope: loop_1)
```

**SHGAT apprend :** "pour itérer sur une collection, utiliser click puis fill"

### Différence avec Two-Level DAG

| Aspect | Fusion (Phase 2a/2b) | Loop Abstraction |
|--------|---------------------|------------------|
| **Niveau** | DAG Physique | DAG Logique |
| **But** | Performance (moins de HIL) | Learning (patterns généralisables) |
| **Ce que SHGAT voit** | Toutes les ops logiques | Pattern abstrait |
| **Exécution** | Fusion en 1 task | Code original s'exécute |

---

## Architecture

### Types de Boucles Supportées

```typescript
type LoopType = "for" | "while" | "forOf" | "forIn" | "doWhile";
```

| Type | Exemple | Condition générée |
|------|---------|-------------------|
| `for` | `for (let i=0; i<10; i++)` | `for(let i=0; i<10; i++)` |
| `while` | `while (hasMore)` | `while(hasMore)` |
| `forOf` | `for (item of items)` | `for(item of items)` |
| `forIn` | `for (key in obj)` | `for(key in obj)` |
| `doWhile` | `do {...} while (cond)` | `do...while(cond)` |

### Structure du Nœud Loop

```typescript
interface LoopNode {
  id: string;           // Ex: "l1"
  type: "loop";
  condition: string;    // Ex: "for(item of items)"
  loopType: LoopType;   // Ex: "forOf"
  position: number;
  parentScope?: string;
}
```

### Type d'Edge : loop_body

```typescript
interface StaticStructureEdge {
  from: string;
  to: string;
  type: "sequence" | "provides" | "conditional" | "contains" | "loop_body";
  // ...
}
```

L'edge `loop_body` connecte le nœud loop au premier nœud de son body.

---

## Flux de Traitement

```
Code Source
    ↓
StaticStructureBuilder (SWC parse)
    ↓
AST Handlers (handleForStatement, handleForOfStatement, etc.)
    ↓
Création du nœud "loop" + analyse du body ONCE
    ↓
DAG LOGIQUE avec abstraction loop
    ↓
Edge Generators (generateLoopEdges)
    ↓
Structure finale pour SHGAT
```

### Exemple Complet

**Code :**
```typescript
const users = await mcp.db.query({ sql: "SELECT * FROM users" });
for (const user of users) {
  await mcp.email.send({ to: user.email, subject: "Hello" });
  await mcp.log.info({ message: `Sent to ${user.name}` });
}
```

**DAG Logique généré :**
```
task_n1: db:query
    ↓ (sequence)
loop_l1: for(user of users)
    ↓ (loop_body)
task_n2: email:send (parentScope: l1)
    ↓ (sequence)
task_n3: log:info (parentScope: l1)
```

**executedPath pour SHGAT :**
```json
["db:query", "loop:forOf", "email:send", "log:info"]
```

---

## Exécution Runtime

### Ce qui ne change pas

L'exécution runtime reste identique :
- Le code original s'exécute avec toutes ses itérations
- Les résultats de chaque itération sont collectés
- Les erreurs sont gérées normalement

### Ce qui change

La **trace pour SHGAT** utilise le DAG Logique abstrait :
- Le pattern est représenté une fois
- SHGAT apprend le comportement, pas le nombre d'itérations

---

## Comparaison Avant/Après

### Avant (sans loop abstraction)

```
Code: for (x of [1,2,3]) { click(x); fill(x); }

DAG:
task_1 → task_2 → task_3 → task_4 → task_5 → task_6
(click)   (fill)   (click)  (fill)   (click)  (fill)

SHGAT voit: 6 opérations en séquence
Problème: Pattern non généralisable
```

### Après (avec loop abstraction)

```
DAG:
loop_1 (forOf)
  ├── task_1 (click)
  └── task_2 (fill)

SHGAT voit: loop → click → fill
Avantage: Pattern généralisable à N éléments
```

---

## Implémentation

### Fichiers Modifiés

| Fichier | Changement |
|---------|------------|
| `src/capabilities/static-structure/types.ts` | Ajout `LoopType`, extension `InternalNode` |
| `src/capabilities/static-structure/ast-handlers.ts` | Handlers pour ForStatement, WhileStatement, etc. |
| `src/capabilities/static-structure-builder.ts` | Compteur `loop`, préfixe "l" |
| `src/capabilities/static-structure/edge-generators.ts` | `generateLoopEdges()` |
| `src/capabilities/types/static-analysis.ts` | Extension `StaticStructureNode`, `StaticStructureEdge` |

### Handlers AST

```typescript
// Enregistrement dans createStaticStructureVisitor()
.register("ForStatement", handleForStatement)
.register("WhileStatement", handleWhileStatement)
.register("DoWhileStatement", handleDoWhileStatement)
.register("ForOfStatement", handleForOfStatement)
.register("ForInStatement", handleForInStatement)
```

### Génération d'Edges

```typescript
function generateLoopEdges(nodes, edges) {
  const loopNodes = nodes.filter(n => n.type === "loop");

  for (const loop of loopNodes) {
    const bodyNodes = nodes.filter(n => n.parentScope === loop.id);
    if (bodyNodes.length > 0) {
      const firstNode = bodyNodes.sort((a, b) => a.position - b.position)[0];
      edges.push({
        from: loop.id,
        to: firstNode.id,
        type: "loop_body",
      });
    }
  }
}
```

---

## Relation avec Two-Level DAG

### Complémentarité

| Optimisation | Niveau | But |
|--------------|--------|-----|
| **Loop Abstraction** | DAG Logique | SHGAT learning |
| **Sequential Fusion** (Phase 2a) | DAG Physique | Performance execution |
| **Fork-Join Fusion** (Phase 2b) | DAG Physique | Performance parallèle |

### Flux Combiné

```
Code Source
    ↓
StaticStructureBuilder + Loop Abstraction
    ↓
DAG LOGIQUE (patterns abstraits pour SHGAT)
    ↓
DAG Optimizer (fusion séquentielle/fork-join)
    ↓
DAG PHYSIQUE (optimisé pour execution)
    ↓
Executor (runtime)
    ↓
Traces (basées sur DAG Logique)
```

---

## Bénéfices

| Aspect | Sans Abstraction | Avec Abstraction |
|--------|------------------|------------------|
| **Layers SHGAT** | N × body_size | 1 + body_size |
| **Généralisation** | Pattern spécifique à N | Pattern universel |
| **Noise ratio** | Élevé (répétitions) | Bas (signal pur) |
| **Complexité trace** | O(N × ops) | O(ops) |

---

## Limitations et Considérations

### Ce qui n'est pas capturé

- Le nombre d'itérations (intentionnel : on veut le pattern, pas le count)
- Les variations entre itérations (si condition dans la boucle)
- Les break/continue (traités comme fin normale de l'itération analysée)

### Boucles Imbriquées

Les boucles imbriquées créent une hiérarchie de scopes :

```typescript
for (const row of rows) {
  for (const cell of row.cells) {
    await process(cell);
  }
}
```

```
loop_l1: for(row of rows)
  └── loop_l2: for(cell of row.cells) (parentScope: l1)
        └── task_n1: process (parentScope: l2)
```

---

## Tests

### Cas de Test Principaux

1. **Boucle simple for-of** : Vérifie création nœud loop + body
2. **Boucle while** : Vérifie condition while
3. **Boucles imbriquées** : Vérifie hiérarchie de scopes
4. **Boucle vide** : Vérifie nœud loop sans body
5. **Boucle avec break/continue** : Vérifie analyse body partiel

---

## Conclusion

L'abstraction des boucles au niveau du DAG Logique permet à SHGAT d'apprendre des **patterns généralisables** plutôt que des séquences d'opérations répétées. Cette approche est complémentaire à l'optimisation Two-Level DAG qui opère au niveau physique pour la performance d'exécution.
