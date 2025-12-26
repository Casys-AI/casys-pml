# Two-Level DAG Architecture : Logique vs Physique

Proposition d'implémentation pour tracker toutes les opérations (learning complet) tout en maintenant la performance (groupement intelligent).

## 🎯 **Objectif**

- ✅ **DAG logique** : Toutes les opérations sont des tasks → SHGAT apprend patterns complets
- ✅ **DAG physique** : Tasks fusionnées en layers → Exécution performante
- ✅ **Traces complètes** : executedPath contient toutes les opérations

---

## 🏗️ **Architecture Two-Level**

```
Code Agent
    ↓
StaticStructureBuilder (parse SWC)
    ↓
DAG LOGIQUE (détaillé)
    ├─ task_1: code:reduce
    ├─ task_2: code:get_length
    ├─ task_3: code:divide
    └─ ... (une task par opération)
    ↓
DAG OPTIMIZER (fusion)
    ↓
DAG PHYSIQUE (groupé)
    └─ layer_1: [task_1, task_2, task_3] fusionnées
    ↓
EXECUTION (ControlledExecutor)
    ↓
TRACE GENERATION
    ↓
executedPath: ["code:reduce", "code:get_length", "code:divide"]
    ↓
SHGAT Learning (pattern complet)
```

---

## 📊 **Exemple Concret**

### **Code Agent**

```typescript
const users = await mcp.db.query({ sql: "SELECT * FROM users" });
const active = users.filter(u => u.active);
const totalAge = active.reduce((s, u) => s + u.age, 0);
const count = active.length;
const avg = totalAge / count;
const rounded = Math.round(avg);
```

### **DAG Logique (6 tasks)**

```typescript
{
  tasks: [
    {
      id: "task_n1",
      type: "mcp_tool",
      tool: "db:query",
      dependsOn: []
    },
    {
      id: "task_c1",
      type: "code_execution",
      tool: "code:filter",
      code: "return deps.task_n1.output.filter(u => u.active);",
      dependsOn: ["task_n1"]
    },
    {
      id: "task_c2",
      type: "code_execution",
      tool: "code:reduce",
      code: "return deps.task_c1.output.reduce((s, u) => s + u.age, 0);",
      dependsOn: ["task_c1"]
    },
    {
      id: "task_c3",
      type: "code_execution",
      tool: "code:get_length",
      code: "return deps.task_c1.output.length;",
      dependsOn: ["task_c1"]
    },
    {
      id: "task_c4",
      type: "code_execution",
      tool: "code:divide",
      code: "return deps.task_c2.output / deps.task_c3.output;",
      dependsOn: ["task_c2", "task_c3"]
    },
    {
      id: "task_c5",
      type: "code_execution",
      tool: "code:Math.round",
      code: "return Math.round(deps.task_c4.output);",
      dependsOn: ["task_c4"]
    }
  ]
}
```

### **Analyse de Dépendances**

```
Layer 0: task_n1 (db:query)
           ↓
Layer 1: task_c1 (filter)
           ↓
         ┌─┴─┐
Layer 2: task_c2 (reduce)  task_c3 (length)  ← PARALLÈLE
         └─┬─┘
           ↓
Layer 3: task_c4 (divide)
           ↓
Layer 4: task_c5 (round)
```

**Problème :** 5 layers séquentielles → 5 rounds de validation HIL → Lent

### **DAG Physique Optimisé (2 layers)**

```typescript
{
  physicalLayers: [
    // Layer 0 : MCP (ne peut pas fusionner)
    {
      tasks: [
        { id: "task_n1", tool: "db:query" }
      ]
    },

    // Layer 1 : Tout le reste fusionné
    {
      tasks: [
        {
          id: "task_fused_1",
          type: "code_execution",
          tool: "code:computation",  // Pseudo-tool générique
          code: `
            // Fused: filter + reduce + length + divide + round
            const active = deps.task_n1.output.filter(u => u.active);
            const totalAge = active.reduce((s, u) => s + u.age, 0);
            const count = active.length;
            const avg = totalAge / count;
            const rounded = Math.round(avg);
            return rounded;
          `,
          logicalTasks: ["task_c1", "task_c2", "task_c3", "task_c4", "task_c5"],
          dependsOn: ["task_n1"]
        }
      ]
    }
  ],

  // Mapping logique → physique
  mapping: {
    "task_c1": "task_fused_1",
    "task_c2": "task_fused_1",
    "task_c3": "task_fused_1",
    "task_c4": "task_fused_1",
    "task_c5": "task_fused_1"
  }
}
```

**Résultat :** 2 layers au lieu de 5 → Plus rapide, moins de HIL validations

### **Trace Générée (Complète)**

```typescript
{
  // Pour SHGAT : Vue logique complète
  executedPath: [
    "db:query",
    "code:filter",
    "code:reduce",
    "code:get_length",
    "code:divide",
    "code:Math.round"
  ],

  // Pour métriques : Vue physique
  physicalExecution: {
    layerCount: 2,
    taskCount: 2,
    totalTime: 35ms  // au lieu de 5 × 10ms = 50ms
  },

  // Détails pour chaque opération logique
  taskResults: [
    { taskId: "task_n1", tool: "db:query", output: [...], success: true },
    { taskId: "task_c1", tool: "code:filter", output: [...], success: true },
    { taskId: "task_c2", tool: "code:reduce", output: 2500, success: true },
    { taskId: "task_c3", tool: "code:get_length", output: 100, success: true },
    { taskId: "task_c4", tool: "code:divide", output: 25, success: true },
    { taskId: "task_c5", tool: "code:Math.round", output: 25, success: true }
  ]
}
```

---

## 🔧 **Implémentation : DAG Optimizer**

### **1. Détection des Groupes Fusionnables**

```typescript
interface FusionGroup {
  tasks: Task[];
  canFuse: boolean;
  reason?: string;
}

/**
 * Détermine si un groupe de tasks peut être fusionné
 */
function canFuseTasks(tasks: Task[]): { canFuse: boolean; reason?: string } {
  // Règle 1 : Toutes les tasks doivent être code_execution
  if (!tasks.every(t => t.type === "code_execution")) {
    return { canFuse: false, reason: "Contains non-code tasks" };
  }

  // Règle 2 : Pas de MCP calls dans le code
  for (const task of tasks) {
    if (task.code?.includes("mcp.")) {
      return { canFuse: false, reason: "Contains MCP calls" };
    }
  }

  // Règle 3 : Permissions identiques
  const permSets = tasks.map(t => t.sandboxConfig?.permissionSet ?? "minimal");
  if (new Set(permSets).size > 1) {
    return { canFuse: false, reason: "Different permission sets" };
  }

  // Règle 4 : Dépendances forment une chaîne ou un petit DAG
  if (!formsSimplePattern(tasks)) {
    return { canFuse: false, reason: "Complex dependency graph" };
  }

  return { canFuse: true };
}

/**
 * Vérifie si les dépendances forment un pattern simple
 */
function formsSimplePattern(tasks: Task[]): boolean {
  // Pattern 1 : Chaîne séquentielle (A → B → C)
  // Pattern 2 : Petit fork-join (A → B,C → D)
  // Pattern 3 : Parallèle pur (A,B,C avec même parent)

  const taskIds = new Set(tasks.map(t => t.id));

  // Toutes les dépendances doivent pointer vers des tasks du groupe
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!taskIds.has(dep) && !isExternalDep(dep)) {
        return false; // Dépendance vers l'extérieur
      }
    }
  }

  // Max 3 niveaux de profondeur
  const depth = computeDepth(tasks);
  return depth <= 3;
}
```

### **2. Stratégie de Groupement**

```typescript
/**
 * Optimise le DAG logique en DAG physique
 */
function optimizeDAG(logicalDAG: DAG): OptimizedDAG {
  const layers = computeLayers(logicalDAG);
  const physicalLayers: PhysicalLayer[] = [];

  for (const layer of layers) {
    // Séparer MCP tools vs code tasks
    const mcpTasks = layer.filter(t => t.type === "mcp_tool");
    const codeTasks = layer.filter(t => t.type === "code_execution");

    // MCP tasks : Ne jamais fusionner (side effects)
    for (const mcpTask of mcpTasks) {
      physicalLayers.push({
        tasks: [mcpTask],
        fusionApplied: false
      });
    }

    // Code tasks : Fusionner si possible
    if (codeTasks.length > 1) {
      const groups = findFusionGroups(codeTasks);

      for (const group of groups) {
        if (group.canFuse && group.tasks.length > 1) {
          // Fusionner le groupe
          const fusedTask = fuseTasks(group.tasks);
          physicalLayers.push({
            tasks: [fusedTask],
            fusionApplied: true,
            logicalTasks: group.tasks.map(t => t.id)
          });
        } else {
          // Garder séparées
          physicalLayers.push({
            tasks: group.tasks,
            fusionApplied: false
          });
        }
      }
    } else {
      // Layer avec une seule task
      physicalLayers.push({
        tasks: codeTasks,
        fusionApplied: false
      });
    }
  }

  return {
    physicalLayers,
    logicalDAG,
    mapping: buildMapping(logicalDAG, physicalLayers)
  };
}
```

### **3. Fusion de Tasks**

```typescript
/**
 * Fusionne plusieurs tasks en une seule
 */
function fuseTasks(tasks: Task[]): Task {
  // Trier par ordre de dépendances
  const sorted = topologicalSort(tasks);

  // Générer le code fusionné
  const fusedCode = generateFusedCode(sorted);

  // Collecter toutes les dépendances externes
  const externalDeps = new Set<string>();
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!tasks.find(t => t.id === dep)) {
        externalDeps.add(dep);
      }
    }
  }

  return {
    id: `fused_${tasks[0].id}`,
    type: "code_execution",
    tool: "code:computation",  // Pseudo-tool générique
    code: fusedCode,
    arguments: {},
    dependsOn: Array.from(externalDeps),
    sandboxConfig: tasks[0].sandboxConfig,
    metadata: {
      fusedFrom: tasks.map(t => t.id),
      logicalTools: tasks.map(t => t.tool)
    }
  };
}

/**
 * Génère le code TypeScript pour une task fusionnée
 */
function generateFusedCode(tasks: Task[]): string {
  const codeLines: string[] = [];
  const varMap = new Map<string, string>(); // taskId → variable name

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const varName = `result_${i}`;
    varMap.set(task.id, varName);

    // Extraire l'opération du code
    const operation = extractOperation(task.code);

    // Remplacer les références deps.task_X par les variables
    let code = operation;
    for (const [taskId, varName] of varMap) {
      code = code.replace(`deps.${taskId}.output`, varName);
    }

    codeLines.push(`const ${varName} = ${code};`);
  }

  // Retourner le dernier résultat
  const lastVar = `result_${tasks.length - 1}`;
  codeLines.push(`return ${lastVar};`);

  return codeLines.join('\n');
}

// Exemple de code généré :
// const result_0 = deps.task_c1.output.reduce((s, u) => s + u.age, 0);
// const result_1 = deps.task_c1.output.length;
// const result_2 = result_0 / result_1;
// const result_3 = Math.round(result_2);
// return result_3;
```

---

## 🎭 **Gestion des Layers dans ControlledExecutor**

### **Avant Optimisation**

```typescript
// DAG logique : 5 layers
Layer 0: [task_n1: db:query]
Layer 1: [task_c1: filter]
Layer 2: [task_c2: reduce, task_c3: length]  // Parallèle
Layer 3: [task_c4: divide]
Layer 4: [task_c5: round]

// ControlledExecutor :
for (let i = 0; i < 5; i++) {
  await executeLayer(i);  // 5 rounds
  if (requiresValidation(i)) {
    await waitForHILApproval();  // Potentiellement 5 validations
  }
}
```

### **Après Optimisation**

```typescript
// DAG physique : 2 layers
Layer 0: [task_n1: db:query]
Layer 1: [task_fused_1: computation (c1+c2+c3+c4+c5)]

// ControlledExecutor :
for (let i = 0; i < 2; i++) {
  await executeLayer(i);  // 2 rounds seulement
  if (requiresValidation(i)) {
    await waitForHILApproval();  // Max 2 validations
  }
}
```

**Gain :** 60% moins de rounds, moins de validations HIL.

---

## 📈 **Stratégies de Fusion Avancées**

### **Stratégie 1 : Fusion Séquentielle**

```typescript
// Chaîne A → B → C
// Fusionner si :
// - Toutes code_execution
// - Pas de branches
// - Même permission set

task_fused = { code: "A; B; C;" }
```

### **Stratégie 2 : Fusion Fork-Join**

```typescript
// Fork-join simple :
//     A
//    / \
//   B   C
//    \ /
//     D

// Fusionner en :
task_fused = {
  code: `
    const a = ...;
    const [b, c] = await Promise.all([
      Promise.resolve(B(a)),
      Promise.resolve(C(a))
    ]);
    const d = D(b, c);
    return d;
  `
}
```

### **Stratégie 3 : Fusion Partielle**

```typescript
// Si trop de tasks, fusionner par blocs :
// A → B → C → D → E → F → G → H

// Fusionner en 3 blocs :
task_1 = { code: "A; B; C;" }  // Bloc 1
task_2 = { code: "D; E; F;" }  // Bloc 2
task_3 = { code: "G; H;" }     // Bloc 3

// Limite : Max 5 opérations par bloc
```

### **Stratégie 4 : Pas de Fusion sur MCP ou Side Effects**

```typescript
// Jamais fusionner :
// - MCP tool calls
// - Tasks avec permissionSet != "minimal"
// - Tasks avec intent (learning requis)

if (task.type === "mcp_tool" ||
    task.sandboxConfig?.permissionSet !== "minimal" ||
    task.intent) {
  // Garder séparée
  return { canFuse: false };
}
```

---

## 🔍 **Trace Generation Post-Exécution**

```typescript
/**
 * Génère la trace logique complète depuis le DAG physique
 */
function generateLogicalTrace(
  optimizedDAG: OptimizedDAG,
  physicalResults: ExecutionResults
): Trace {
  const executedPath: string[] = [];
  const taskResults: TaskResult[] = [];

  for (const physicalLayer of optimizedDAG.physicalLayers) {
    for (const physicalTask of physicalLayer.tasks) {
      const result = physicalResults.get(physicalTask.id);

      if (physicalTask.metadata?.fusedFrom) {
        // Task fusionnée : Décomposer en tasks logiques
        const logicalTaskIds = physicalTask.metadata.fusedFrom;
        const logicalTools = physicalTask.metadata.logicalTools;

        for (let i = 0; i < logicalTaskIds.length; i++) {
          executedPath.push(logicalTools[i]);

          taskResults.push({
            taskId: logicalTaskIds[i],
            tool: logicalTools[i],
            output: extractIntermediateResult(result, i),
            success: result.success,
            durationMs: result.durationMs / logicalTaskIds.length
          });
        }
      } else {
        // Task normale
        executedPath.push(physicalTask.tool);

        taskResults.push({
          taskId: physicalTask.id,
          tool: physicalTask.tool,
          output: result.output,
          success: result.success,
          durationMs: result.durationMs
        });
      }
    }
  }

  return {
    executedPath,
    taskResults,
    toolsUsed: Array.from(new Set(executedPath)),
    success: taskResults.every(r => r.success),
    totalDurationMs: physicalResults.totalTime
  };
}
```

---

## ✅ **Bénéfices de cette Architecture**

| Aspect | Avant | Après |
|--------|-------|-------|
| **Learning SHGAT** | ❌ Incomplet (manque opérateurs) | ✅ Complet (toutes opérations) |
| **Chemins suggérés** | ❌ Partiels | ✅ Complets et réutilisables |
| **Layers** | ⚠️ N layers (N = nb opérations) | ✅ ~2-3 layers (fusionnées) |
| **HIL validations** | ⚠️ Potentiellement N validations | ✅ ~2-3 validations |
| **Overhead** | ✅ Minimal mais incomplet | ✅ Optimisé et complet |
| **Parallélisation** | ⚠️ Limitée | ✅ Automatique (fork-join) |

---

## 🎯 **Plan d'Implémentation**

### **Phase 1 : DAG Logique Complet (3 jours)**

1. Étendre `StaticStructureBuilder` pour détecter TOUS les opérateurs
2. Créer pseudo-tools pour chaque opération
3. Générer DAG logique détaillé

### **Phase 2 : DAG Optimizer (2 jours)**

1. Implémenter `canFuseTasks()`
2. Implémenter `fuseTasks()`
3. Générer DAG physique optimisé

### **Phase 3 : Trace Generation (1 jour)**

1. Implémenter `generateLogicalTrace()`
2. Mapper résultats physiques → logiques
3. Extraire résultats intermédiaires

### **Phase 4 : Tests & Validation (2 jours)**

1. Tests E2E : Code → DAG logique → DAG physique → Trace
2. Vérifier SHGAT learning
3. Benchmarks performance

---

## 🔧 **Configuration Utilisateur**

```typescript
// Configuration dans le DAG :
{
  optimization: {
    enabled: true,
    strategy: "aggressive" | "conservative" | "none",

    // Aggressive : Fusionner au maximum
    // Conservative : Fusionner seulement séquences simples
    // None : Pas de fusion (debug)

    maxFusionSize: 5,  // Max opérations par fusion
    enableParallelization: true
  },

  tracing: {
    logicalView: true,   // Traces détaillées pour SHGAT
    physicalView: true,  // Métriques d'exécution
    debugMode: false     // Logs de fusion
  }
}
```

---

## 📝 **Exemple Complet**

```typescript
// Code agent :
const users = await mcp.db.query({ sql: "SELECT * FROM users" });
const active = users.filter(u => u.age > 18 && u.verified);
const avgAge = active.reduce((s, u) => s + u.age, 0) / active.length;
const avgSalary = active.reduce((s, u) => s + u.salary, 0) / active.length;
const stats = { avgAge: Math.round(avgAge), avgSalary: Math.round(avgSalary) };

// DAG Logique (11 opérations) :
// task_n1: db:query
// task_c1: filter
// task_c2: reduce (age)
// task_c3: length
// task_c4: divide (avgAge)
// task_c5: round (avgAge)
// task_c6: reduce (salary)
// task_c7: length (duplicate)
// task_c8: divide (avgSalary)
// task_c9: round (avgSalary)
// task_c10: object literal

// DAG Physique (2 layers, 2 tasks) :
// Layer 0: task_n1 (db:query)
// Layer 1: task_fused_1 (filter + calculs fusionnés)

// Trace (vue logique) :
executedPath: [
  "db:query",
  "code:filter",
  "code:reduce",
  "code:get_length",
  "code:divide",
  "code:Math.round",
  "code:reduce",
  "code:get_length",
  "code:divide",
  "code:Math.round",
  "code:object_literal"
]

// SHGAT apprend le pattern COMPLET
// → Réutilisable pour "calculate average age and salary of active users"
```

---

## ✅ **Conclusion**

**Two-level architecture** = Solution optimale :

- ✅ DAG logique détaillé → SHGAT apprend tout
- ✅ DAG physique optimisé → Performance maintenue
- ✅ Traces complètes → Chemins réutilisables
- ✅ Fusion intelligente → Moins de layers/HIL
- ✅ Parallélisation auto → Gain de perf

**Prêt pour implémentation !**
