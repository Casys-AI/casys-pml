# PML Manual Test Specification

> Document de validation pour le papier "Emergent Capabilities"
> Ces tests valident les claims techniques du papier.

---

## Test 1: Eager Learning (Stockage immédiat)

**Claim**: Une capability est stockée dès la 1ère exécution réussie.

### Étapes

```
1. Vider/noter l'état initial des capabilities
   → pml_search_capabilities({ intent: "test eager learning" })
   → Résultat attendu: 0 capabilities

2. Exécuter un nouveau code
   → pml_execute_code({
       intent: "read a specific test file",
       code: `const f = await mcp.filesystem.read_file({ path: "/home/ubuntu/CascadeProjects/AgentCards/README.md" }); return f.substring(0, 100);`
     })

3. Vérifier que la capability a été créée
   → pml_search_capabilities({ intent: "read a specific test file" })
   → Résultat attendu: 1 capability avec semantic_score > 0.9
```

### Critères de validation

- [ ] `capabilities.length >= 1` après 1ère exécution
- [ ] `usage_count = 1`
- [ ] `success_rate = 1.0`

---

## Test 2: Capability Reuse (Réutilisation sémantique)

**Claim**: Une capability existante est matchée pour des intents sémantiquement similaires.

### Étapes

```
1. S'assurer qu'une capability existe (Test 1)

2. Exécuter avec un intent SIMILAIRE (pas identique)
   → pml_execute_code({
       intent: "load the readme file content",  // Variation sémantique
       code: `const f = await mcp.filesystem.read_file({ path: "/home/ubuntu/CascadeProjects/AgentCards/README.md" }); return f.substring(0, 100);`
     })

3. Vérifier le matching dans la réponse
   → Chercher `matched_capabilities` dans le résultat
```

### Critères de validation

- [ ] `matched_capabilities.length >= 1`
- [ ] `matched_capabilities[0].semantic_score > 0.70`
- [ ] `matched_capabilities[0].usage_count` incrémenté

### Variations à tester

| Intent original | Variation | Score attendu |
|-----------------|-----------|---------------|
| "read a specific test file" | "load the readme file content" | > 0.75 |
| "read a specific test file" | "get file contents" | > 0.70 |
| "read a specific test file" | "fetch text from file" | > 0.65 |
| "read a specific test file" | "deploy to kubernetes" | < 0.40 |

---

## Test 3: Schema Inference (Inférence AST)

**Claim**: Les paramètres sont automatiquement inférés via parsing AST du code.

### Étapes

```
1. Exécuter du code qui utilise `args.xxx`
   → pml_execute_code({
       intent: "process file with options",
       code: `
         const content = await mcp.filesystem.read_file({ path: args.filePath });
         const lines = content.split('\\n');
         if (args.maxLines) {
           return lines.slice(0, args.maxLines).join('\\n');
         }
         return { lineCount: lines.length, preview: lines[0] };
       `
     })

2. Rechercher la capability créée
   → pml_search_capabilities({ intent: "process file with options" })

3. Vérifier le schema inféré dans `parameters_schema`
```

### Critères de validation

- [ ] `parameters_schema.properties.filePath` existe
- [ ] `parameters_schema.properties.filePath.type = "string"`
- [ ] `parameters_schema.properties.maxLines` existe
- [ ] `parameters_schema.properties.maxLines.type = "number"`

### Cas de test supplémentaires

| Code pattern | Type inféré attendu |
|--------------|---------------------|
| `args.name` passé à string function | string |
| `args.count > 0` | number |
| `args.items.length` | array |
| `args.enabled ? x : y` | boolean |
| `args.config.nested` | object |

---

## Test 4: Tool Dependencies (Relations entre outils)

**Claim**: Le système apprend les séquences d'outils fréquentes.

### Étapes

```
1. Exécuter plusieurs fois une séquence d'outils
   → pml_execute_dag({
       workflow: {
         tasks: [
           { id: "list", tool: "filesystem:list_directory", arguments: { path: "..." }, dependsOn: [] },
           { id: "read", tool: "filesystem:read_file", arguments: { path: "..." }, dependsOn: ["list"] }
         ]
       }
     })
   → Répéter 3x avec des paths différents

2. Vérifier les relations apprises
   → pml_search_tools({ query: "list directory", include_related: true })
```

### Critères de validation

- [ ] `related_tools` non vide pour `filesystem:list_directory`
- [ ] Contient `filesystem:read_file` avec `relation: "often_after"`
- [ ] `score >= 0.5` pour la relation

---

## Test 5: Capability Dependencies (Composition)

**Claim**: Les capabilities composées sont détectées automatiquement.

### Étapes

```
1. Créer une capability "atomique" A
   → pml_execute_code({
       intent: "list source files",
       code: `return await mcp.filesystem.list_directory({ path: "/home/ubuntu/CascadeProjects/AgentCards/src" });`
     })

2. Créer une capability "atomique" B
   → pml_execute_code({
       intent: "read module exports",
       code: `return await mcp.filesystem.read_file({ path: "/home/ubuntu/CascadeProjects/AgentCards/src/mod.ts" });`
     })

3. Créer une capability composite qui utilise A puis B
   → pml_execute_code({
       intent: "analyze module structure",
       code: `
         const dir = await mcp.filesystem.list_directory({ path: "/home/ubuntu/CascadeProjects/AgentCards/src" });
         const mod = await mcp.filesystem.read_file({ path: "/home/ubuntu/CascadeProjects/AgentCards/src/main.ts" });
         return { files: dir.split('\\n').length, modSize: mod.length };
       `
     })

4. Vérifier les edges de dépendance
   → Requête directe en DB ou via API /api/capabilities/graph
```

### Critères de validation

- [ ] Edge `sequence` entre les tools dans la capability
- [ ] `toolInvocations` contient les timestamps
- [ ] Ordre préservé dans `toolsUsed`

---

## Test 6: Transitive Reliability (Fiabilité transitive)

**Claim**: La fiabilité d'une chaîne = maillon le plus faible.

### Prérequis

Ce test nécessite de manipuler les success_rate en DB.

### Étapes

```
1. Créer capability A avec success_rate = 0.95
2. Créer capability B avec success_rate = 0.60
3. Créer edge A → B (type: "dependency")
4. Matcher A et vérifier le score final

Le score effectif de A devrait être pénalisé par B:
  effective_score = semantic_score * min(0.95, 0.60) = semantic_score * 0.60
```

### Critères de validation

- [ ] `computeTransitiveReliability(A)` retourne 0.60
- [ ] Le score final dans `findMatch()` est réduit
- [ ] Logs montrent `transitiveReliability: 0.60`

---

## Test 7: Adaptive Thresholds (Seuils adaptatifs)

**Claim**: Les seuils s'adaptent au contexte d'utilisation.

### Algorithme (référence `adaptive-threshold.ts`)

```typescript
// Config par défaut
initialSuggestionThreshold: 0.70
learningRate: 0.05
windowSize: 50  // sliding window
minThreshold: 0.40
maxThreshold: 0.90

// Trigger: ajustement tous les 10 exécutions (si >= 20 dans l'historique)
// Logique:
if (falsePositiveRate > 0.2) {
  threshold += learningRate * FP_rate  // Trop d'échecs spéculatifs → Augmente
} else if (falseNegativeRate > 0.3) {
  threshold -= learningRate * FN_rate  // Trop de confirmations manuelles → Diminue
}
```

### Test 7.1: Ajustement sur False Positives (échecs spéculatifs)

**Scénario**: Simuler des exécutions spéculatives qui échouent

```
1. Reset: Vérifier threshold initial = 0.70
   → GET /api/speculation/config ou logs

2. Simuler 20 exécutions avec mode="speculative"
   → 5 succès (success=true)
   → 15 échecs (success=false)
   → FP rate = 15/20 = 75% > 20%

3. Vérifier ajustement
   → threshold devrait augmenter de ~0.05 * 0.75 = +0.0375
   → Nouveau threshold ≈ 0.7375
```

### Test 7.2: Ajustement sur False Negatives (confirmations manuelles)

**Scénario**: Simuler des suggestions que l'utilisateur accepte toujours

```
1. Reset: threshold = 0.70

2. Simuler 20 exécutions avec mode="suggestion"
   → Toutes avec userAccepted=true et confidence >= 0.60
   → FN rate = 100% > 30%

3. Vérifier ajustement
   → threshold devrait diminuer de ~0.05 * 1.0 = -0.05
   → Nouveau threshold ≈ 0.65
```

### Test 7.3: Bornes min/max respectées

```
1. Simuler beaucoup d'échecs pour pousser threshold vers le max
   → Vérifier que threshold ne dépasse pas 0.90

2. Simuler beaucoup de succès manuels pour pousser vers le min
   → Vérifier que threshold ne descend pas sous 0.40
```

### Test 7.4: Persistence en DB

```sql
-- Vérifier que les thresholds sont persistés
SELECT context_hash, suggestion_threshold, explicit_threshold,
       success_rate, sample_count, updated_at
FROM adaptive_thresholds;

-- Après restart du serveur, les thresholds doivent être rechargés
```

### Test 7.5: Context-based thresholds

```
1. Exécuter avec context { workflowType: "dag", domain: "github" }
   → Créer un threshold spécifique

2. Exécuter avec context { workflowType: "code", domain: "filesystem" }
   → Créer un autre threshold

3. Vérifier que les deux contextes ont des thresholds indépendants
   → context_hash différent en DB
```

### Critères de validation

- [ ] `suggestionThreshold` augmente quand FP rate > 20%
- [ ] `suggestionThreshold` diminue quand FN rate > 30%
- [ ] Le seuil reste dans [0.40, 0.90]
- [ ] Thresholds persistés dans `adaptive_thresholds` table
- [ ] Thresholds rechargés après restart
- [ ] Contextes différents = thresholds indépendants
- [ ] Logs montrent "Adaptive threshold adjustment: ..."

---

## Métriques globales à collecter

À la fin de tous les tests, collecter :

| Métrique | Formule | Target |
|----------|---------|--------|
| **Reuse Rate** | capabilities_matched / total_executions | > 40% |
| **Semantic Accuracy** | avg(semantic_score) quand match correct | > 0.75 |
| **Schema Inference Rate** | capabilities_with_schema / total_capabilities | > 80% |
| **Dependency Detection** | edges_created / expected_edges | > 70% |

---

## Exécution

### Option A: Dans le chat Claude

Exécuter chaque test manuellement en utilisant les outils PML :
- `pml_execute_code`
- `pml_execute_dag`
- `pml_search_capabilities`
- `pml_search_tools`

### Option B: Script automatisé

```bash
deno task test:pml:benchmark
```

(Script à créer basé sur ces spécifications)

---

## Notes

- Réinitialiser la DB entre les runs pour reproductibilité
- Logger tous les résultats pour le papier
- Les semantic_scores peuvent varier selon le modèle d'embedding
