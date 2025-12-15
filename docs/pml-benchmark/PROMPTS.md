# Prompts de test PML

> Liste de requêtes pour tester le système PML
> Séparé en deux modes : **Script** (API directe) vs **Chat** (LLM requis)

---

## Mode d'exécution

### 🤖 Script (API directe)

Peut être automatisé sans LLM. L'input est explicite (code fourni, DAG JSON).

**Outils utilisés** :
- `pml_execute_code({ intent, code })` → code fourni
- `pml_execute_dag({ workflow })` → DAG JSON fourni
- `pml_search_capabilities({ intent })`
- `pml_search_tools({ query })`

**Ce qu'on teste** :
- Eager learning (stockage immédiat)
- Schema inference (AST parsing)
- Tool dependencies (patterns répétés)
- DAG execution (parallélisation, dépendances)
- Capability matching (recherche vectorielle)

### 💬 Chat (LLM requis)

Nécessite Claude pour transformer le langage naturel en code/actions.

**Ce qu'on teste** :
- Génération de code depuis un intent
- Décision de reuse (utiliser une capability matchée ou pas)
- Composition intelligente de capabilities
- Extraction de paramètres depuis le prompt
- Variations sémantiques naturelles

---

# PARTIE 1 : Tests Scriptables (API)

## S1. Eager Learning

Exécuter du code explicite et vérifier la création de capability.

```typescript
// Test S1.1 - Création de capability
pml_execute_code({
  intent: "list source directory files",
  code: `return await mcp.filesystem.list_directory({ path: "/home/ubuntu/CascadeProjects/AgentCards/src" });`
})
// → Vérifier: capability créée, usage_count=1, success_rate=1.0

// Test S1.2 - Vérification du stockage
pml_search_capabilities({ intent: "list source directory files" })
// → Vérifier: capabilities.length >= 1, semantic_score > 0.9
```

## S2. Schema Inference

Exécuter du code avec `args.xxx` et vérifier l'inférence.

```typescript
// Test S2.1 - Paramètres string
pml_execute_code({
  intent: "read file by path",
  code: `return await mcp.filesystem.read_file({ path: args.filePath });`
})
// → Vérifier: parameters_schema.properties.filePath.type = "string"

// Test S2.2 - Paramètres number
pml_execute_code({
  intent: "read file with limit",
  code: `
    const content = await mcp.filesystem.read_file({ path: args.filePath });
    return content.split('\\n').slice(0, args.maxLines).join('\\n');
  `
})
// → Vérifier: parameters_schema contient filePath (string) et maxLines (number)

// Test S2.3 - Paramètres boolean
pml_execute_code({
  intent: "read file with debug option",
  code: `
    const content = await mcp.filesystem.read_file({ path: args.filePath });
    if (args.verbose) console.log("Read", content.length, "chars");
    return content;
  `
})
// → Vérifier: parameters_schema contient verbose (boolean)
```

## S3. DAGs explicites

Exécuter des workflows JSON et vérifier les dépendances.

```typescript
// Test S3.1 - DAG séquentiel
pml_execute_dag({
  workflow: {
    tasks: [
      { id: "list", tool: "filesystem:list_directory", arguments: { path: "/home/ubuntu/CascadeProjects/AgentCards/src/dag" }, dependsOn: [] },
      { id: "read", tool: "filesystem:read_file", arguments: { path: "/home/ubuntu/CascadeProjects/AgentCards/src/dag/mod.ts" }, dependsOn: ["list"] }
    ]
  }
})
// → Vérifier: parallelization_layers = 2, results[0].status = "success"

// Test S3.2 - DAG parallèle
pml_execute_dag({
  workflow: {
    tasks: [
      { id: "p1", tool: "fetch:fetch", arguments: { url: "https://jsonplaceholder.typicode.com/posts/1" }, dependsOn: [] },
      { id: "p2", tool: "fetch:fetch", arguments: { url: "https://jsonplaceholder.typicode.com/posts/2" }, dependsOn: [] },
      { id: "p3", tool: "fetch:fetch", arguments: { url: "https://jsonplaceholder.typicode.com/posts/3" }, dependsOn: [] }
    ]
  }
})
// → Vérifier: parallelization_layers = 1 (tout en parallèle)

// Test S3.3 - DAG diamond (A → B,C → D)
pml_execute_dag({
  workflow: {
    tasks: [
      { id: "A", tool: "filesystem:list_directory", arguments: { path: "/home/ubuntu/CascadeProjects/AgentCards/src" }, dependsOn: [] },
      { id: "B", tool: "filesystem:get_file_info", arguments: { path: "/home/ubuntu/CascadeProjects/AgentCards/src/main.ts" }, dependsOn: ["A"] },
      { id: "C", tool: "filesystem:directory_tree", arguments: { path: "/home/ubuntu/CascadeProjects/AgentCards/src/dag" }, dependsOn: ["A"] },
      { id: "D", tool: "filesystem:read_file", arguments: { path: "/home/ubuntu/CascadeProjects/AgentCards/src/main.ts" }, dependsOn: ["B", "C"] }
    ]
  }
})
// → Vérifier: parallelization_layers = 3, ordre respecté
```

## S4. Tool Dependencies

Répéter des patterns et vérifier les `related_tools`.

```typescript
// Test S4.1 - Créer le pattern list → read (3x)
for (const path of ["src/dag", "src/mcp", "src/capabilities"]) {
  pml_execute_dag({
    workflow: {
      tasks: [
        { id: "list", tool: "filesystem:list_directory", arguments: { path: `/home/ubuntu/CascadeProjects/AgentCards/${path}` }, dependsOn: [] },
        { id: "read", tool: "filesystem:read_file", arguments: { path: `/home/ubuntu/CascadeProjects/AgentCards/${path}/mod.ts` }, dependsOn: ["list"] }
      ]
    }
  })
}

// Test S4.2 - Vérifier les relations apprises
pml_search_tools({ query: "list directory", include_related: true })
// → Vérifier: related_tools contient filesystem:read_file avec relation "often_after"
```

## S5. Capability Matching (précision)

Tester le matching vectoriel avec différents intents.

```typescript
// Pré-requis: capability "list source directory files" existe (S1)

// Test S5.1 - Match exact
pml_search_capabilities({ intent: "list source directory files" })
// → semantic_score > 0.95

// Test S5.2 - Match similaire
pml_search_capabilities({ intent: "show files in src folder" })
// → semantic_score > 0.75

// Test S5.3 - Match différent (négatif)
pml_search_capabilities({ intent: "deploy to kubernetes" })
// → semantic_score < 0.50 ou capabilities.length = 0
```

---

# PARTIE 2 : Tests Chat (LLM requis)

Ces tests nécessitent de donner le prompt à Claude et observer le comportement.

## C1. Génération de code

Le LLM doit transformer un intent en code exécutable.

```
Prompt: "Liste les fichiers dans src/dag"
→ Attendu: Claude génère du code avec mcp.filesystem.list_directory
→ Vérifier: capability créée avec le bon code
```

```
Prompt: "Récupère le post 1 de jsonplaceholder"
→ Attendu: Claude génère du code avec mcp.fetch.fetch
→ Vérifier: capability créée
```

## C2. Décision de reuse

Le LLM doit utiliser une capability existante quand pertinent.

```
Pré-requis: Exécuter C1 d'abord

Prompt: "Montre-moi le contenu du dossier src/dag"
→ Attendu: matched_capabilities affiché, Claude réutilise ou adapte
→ Vérifier: même capability utilisée (usage_count incrémenté)
```

```
Prompt: "Affiche les fichiers de src/dag"
→ Attendu: matched_capabilities avec score > 0.7
→ Vérifier: pas de nouvelle capability créée (reuse)
```

## C3. Composition intelligente

Le LLM doit combiner plusieurs outils pour des tâches complexes.

```
Prompt: "Liste src/mcp puis lis le fichier mod.ts qui s'y trouve"
→ Attendu: DAG créé avec list_directory → read_file
→ Vérifier: 2 tool invocations dans le résultat
```

```
Prompt: "Lis deno.json et dis-moi le nom du projet"
→ Attendu: Code composite (read + JSON.parse + extraction)
→ Vérifier: capability avec toolsUsed contenant filesystem:read_file
```

## C4. Extraction de paramètres

Le LLM doit extraire les valeurs du prompt pour `args`.

```
Prompt: "Lis le fichier src/main.ts et donne-moi les 20 premières lignes"
→ Attendu: args.filePath = "src/main.ts", args.maxLines = 20
→ Vérifier: valeurs correctement extraites et utilisées
```

## C5. Variations sémantiques naturelles

Tester avec des formulations variées.

| Prompt | Doit matcher |
|--------|--------------|
| "Liste les fichiers dans src" | capability list_directory |
| "Montre le contenu du dossier src" | capability list_directory |
| "Qu'y a-t-il dans src ?" | capability list_directory |
| "C'est quoi les fichiers de src" | capability list_directory |
| "Affiche src/" | capability list_directory |

---

# PARTIE 3 : Vérifications

Après chaque phase de tests, exécuter :

```typescript
// Lister toutes les capabilities
pml_search_capabilities({ intent: "any operation", include_suggestions: true })

// Vérifier les tool dependencies
pml_search_tools({ query: "filesystem", include_related: true })

// Compter les capabilities avec schema
// → Regarder parameters_schema non vide dans les résultats
```

---

# Résultats attendus

## Tests Script (S1-S5)

| Test | Métrique | Target |
|------|----------|--------|
| S1 | capability créée | 1 |
| S2 | schema inféré | 3 props |
| S3 | DAGs exécutés | 3 |
| S4 | related_tools | >= 1 |
| S5 | semantic_score accuracy | > 0.75 |

## Tests Chat (C1-C5)

| Test | Métrique | Target |
|------|----------|--------|
| C1 | code généré correct | 100% |
| C2 | reuse rate | > 50% |
| C3 | compositions créées | >= 2 |
| C4 | params extraits | 100% |
| C5 | match variations | > 80% |
