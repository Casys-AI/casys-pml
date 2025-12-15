# PML Benchmark Test Plan

> Objectif: Valider les métriques du papier "Emergent Capabilities"
> Basé sur: docs/PROCEDURAL-MEMORY-PAPER-PLAN.md

## Métriques cibles

| Métrique | Description | Target | Mesure |
|----------|-------------|--------|--------|
| **Reuse Rate** | % d'exécutions réutilisant une capability | > 40% | `matched_capabilities.length > 0` |
| **Latency Reduction** | Temps gagné vs vanilla | > 50% | `metrics.executionTimeMs` |
| **Success Rate** | % d'exécutions réussies | > 85% | `success_rate` dans capabilities |
| **Context Savings** | Code réutilisé vs régénéré | > 30% | Taille code snippet vs génération |

---

## Phase 1: Seeding (Création des capabilities de base)

### 1.1 File Operations (5 tâches)

```typescript
// T1: List directory
{ intent: "list project files", code: "await mcp.filesystem.list_directory({path: '/project'})" }

// T2: Read file
{ intent: "read configuration file", code: "await mcp.filesystem.read_file({path: '/project/config.json'})" }

// T3: Get file info
{ intent: "get file metadata", code: "await mcp.filesystem.get_file_info({path: '/project/main.ts'})" }

// T4: Directory tree
{ intent: "analyze directory structure", code: "await mcp.filesystem.directory_tree({path: '/project/src'})" }

// T5: Read multiple files
{ intent: "read multiple config files", code: "await mcp.filesystem.read_multiple_files({paths: [...]})" }
```

### 1.2 API/Fetch Operations (5 tâches)

```typescript
// T6: Simple fetch
{ intent: "fetch API data", code: "await mcp.fetch.fetch({url: 'https://api.example.com/data'})" }

// T7: Fetch JSON
{ intent: "get user data from API", code: "await mcp.fetch.fetch({url: '...users/1'})" }

// T8: Fetch list
{ intent: "fetch list of items", code: "await mcp.fetch.fetch({url: '...posts'})" }

// T9: Fetch with query
{ intent: "search API with query", code: "await mcp.fetch.fetch({url: '...?q=search'})" }

// T10: Fetch and parse
{ intent: "fetch and process JSON response", code: "const r = await mcp.fetch.fetch(...); JSON.parse(r)" }
```

### 1.3 Composite/DAG Operations (5 tâches)

```typescript
// T11: List then read (sequential)
DAG: list_dir → read_file

// T12: Parallel fetch
DAG: fetch_a || fetch_b || fetch_c

// T13: Tree then analyze
DAG: directory_tree → read_multiple_files

// T14: Config cascade
DAG: read_config → list_based_on_config → read_files

// T15: Full analysis
DAG: list_dir → (get_info || read_file) → combine_results
```

---

## Phase 2: Reuse Testing (Vérification de la réutilisation)

### 2.1 Exact Intent Match

Exécuter les mêmes intents que Phase 1 et vérifier:
- `matched_capabilities` non vide
- `semantic_score > 0.8`
- `executionTimeMs` plus faible

### 2.2 Similar Intent Match

Variations sémantiques des intents:
```
Original: "list project files"
Variations:
  - "show directory contents"
  - "get files in folder"
  - "enumerate files"
```

### 2.3 Parameter Variation

Même intent, paramètres différents:
```
Intent: "read configuration file"
Params: config.json, settings.yaml, env.json
→ Même capability doit matcher
```

---

## Phase 3: Dependency Learning

### 3.1 Tool Dependencies (related_tools)

Vérifier après exécutions séquentielles:
```
list_directory → read_file (répété 3x)
→ related_tools doit montrer: often_before/often_after
```

### 3.2 Capability Dependencies

Exécuter capabilities composées:
```
"setup environment" = parse_config + create_dirs + write_files
→ capability_dependency doit être créée
```

### 3.3 Transitive Reliability

Si capability B a 80% success, et A dépend de B:
→ A.reliability doit être <= 80%

---

## Phase 4: Ablation Study

### 4.1 Sans Eager Learning
- Désactiver stockage immédiat
- Attendre 3+ patterns avant stockage
- Comparer reuse rate

### 4.2 Sans Schema Inference
- Désactiver AST parsing
- Schema = {} (vide)
- Comparer matching accuracy

### 4.3 Sans Adaptive Thresholds
- Threshold fixe = 0.7
- Comparer precision/recall

---

## Exécution du Benchmark

### Script de test automatisé

```bash
# 1. Reset database (fresh start)
deno task db:reset

# 2. Phase 1: Seeding
deno task test:pml:seed

# 3. Phase 2: Reuse
deno task test:pml:reuse

# 4. Phase 3: Dependencies
deno task test:pml:deps

# 5. Collect metrics
deno task test:pml:report
```

### Métriques collectées

```json
{
  "phase1_seeding": {
    "tasks_executed": 15,
    "capabilities_created": 15,
    "avg_execution_time_ms": 150,
    "success_rate": 1.0
  },
  "phase2_reuse": {
    "tasks_executed": 45,
    "capabilities_matched": 38,
    "reuse_rate": 0.84,
    "avg_semantic_score": 0.87,
    "latency_reduction": 0.62
  },
  "phase3_dependencies": {
    "tool_edges_created": 12,
    "capability_edges_created": 5,
    "transitive_reliability_validated": true
  }
}
```

---

## Résultats attendus vs Papier

| Métrique | Target Papier | Acceptance |
|----------|---------------|------------|
| Reuse Rate | > 40% | > 35% |
| Latency Reduction | > 50% | > 40% |
| Success Rate | > 85% | > 80% |
| Context Savings | > 30% | > 25% |

---

## Notes d'implémentation

1. Utiliser `pml_execute_code` pour les tâches simples
2. Utiliser `pml_execute_dag` pour les tâches composées
3. Utiliser `pml_search_capabilities` pour vérifier le matching
4. Utiliser `pml_search_tools` pour vérifier les related_tools
5. Logger tous les `metrics.executionTimeMs` pour comparaison
