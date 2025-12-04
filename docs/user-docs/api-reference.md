# Référence API AgentCards

## Vue d'ensemble

AgentCards expose ses fonctionnalités via le protocole MCP (Model Context Protocol). Cette référence documente tous les outils (tools) disponibles.

**Version:** 1.0.0

**Transports disponibles:**

| Transport | Commande | Features |
|-----------|----------|----------|
| **stdio** | `agentcards serve --config ...` | MCP protocol, logs console |
| **Streamable HTTP** | `agentcards serve --config ... --port 3001` | MCP sur `/mcp` + Dashboard + Events SSE |

> **Note:** Le mode stdio est recommandé pour Claude Code. Le mode Streamable HTTP (spec MCP 2025-03-26) active le dashboard Fresh et les events temps réel.

---

## Architecture des outils

AgentCards expose deux types d'outils:

| Type | Pattern | Description |
|------|---------|-------------|
| **Meta-tools** | `agentcards:*` | Outils intelligents d'AgentCards (recherche, DAG, sandbox) |
| **Outils proxiés** | `serverId:toolName` | Outils des serveurs MCP sous-jacents (filesystem, github...) |

> **Note:** Par défaut, seuls les meta-tools sont listés pour minimiser l'usage du contexte (ADR-013). Les outils sous-jacents sont découverts via `search_tools` ou utilisés directement si leur nom est connu.

---

## Meta-Tools AgentCards

### agentcards:search_tools

Recherche sémantique et recommandations basées sur le graphe d'usage.

**Paramètres:**

| Nom | Type | Requis | Description |
|-----|------|--------|-------------|
| `query` | string | Oui | Description en langage naturel de ce que vous voulez faire |
| `limit` | number | Non | Nombre max d'outils à retourner (défaut: 5) |
| `include_related` | boolean | Non | Inclure outils connexes du graphe (défaut: false) |
| `context_tools` | string[] | Non | Outils déjà utilisés - booste les outils liés |

**Exemple de requête:**

```typescript
await callTool("agentcards:search_tools", {
  query: "lire et parser des fichiers JSON",
  limit: 5,
  include_related: true
});
```

**Exemple de réponse:**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"tools\":[{\"name\":\"filesystem:read_file\",\"score\":0.92,\"description\":\"Read file contents\"},{\"name\":\"filesystem:read_directory\",\"score\":0.85,\"related\":false},{\"name\":\"memory:search_nodes\",\"score\":0.72,\"related\":true}]}"
  }]
}
```

---

### agentcards:execute_dag

Exécute un workflow DAG (Directed Acyclic Graph) multi-outils.

**Modes d'utilisation:**
- **Intent:** Fournir `intent` → AgentCards suggère et exécute le DAG optimal
- **Explicit:** Fournir `workflow` → Exécute le DAG défini explicitement

> Fournir **soit** `intent` **soit** `workflow`, pas les deux.

**Paramètres:**

| Nom | Type | Requis | Description |
|-----|------|--------|-------------|
| `intent` | string | Non* | Description naturelle de l'objectif (mode suggestion) |
| `workflow` | object | Non* | Structure DAG explicite (mode explicit) |
| `per_layer_validation` | boolean | Non | Pause entre chaque couche pour validation (défaut: false) |

*Au moins un des deux est requis.

**Structure workflow (mode explicit):**

```typescript
{
  workflow: {
    tasks: [
      {
        id: string,           // Identifiant unique de la tâche
        tool: string,         // Nom de l'outil (serverId:toolName)
        arguments: object,    // Arguments de l'outil
        depends_on?: string[] // IDs des tâches dépendantes
      }
    ]
  }
}
```

**Exemple - Mode Intent:**

```typescript
await callTool("agentcards:execute_dag", {
  intent: "Lire config.json et créer une entité mémoire avec son contenu"
});
```

**Exemple - Mode Explicit avec parallélisation:**

```typescript
await callTool("agentcards:execute_dag", {
  workflow: {
    tasks: [
      { id: "t1", tool: "filesystem:read_file",
        arguments: { path: "config.json" } },
      { id: "t2", tool: "filesystem:read_file",
        arguments: { path: "package.json" } },
      { id: "t3", tool: "memory:create_entities",
        arguments: { entities: [{ name: "config", content: "$t1.result" }] },
        depends_on: ["t1"] }
    ]
  }
});
// t1 et t2 s'exécutent en parallèle, t3 attend t1
```

**Exemple de réponse (succès):**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"status\":\"complete\",\"results\":{\"t1\":{\"content\":\"...\"},\"t2\":{\"content\":\"...\"},\"t3\":{\"success\":true}},\"metrics\":{\"total_time_ms\":1823,\"parallel_branches\":2}}"
  }]
}
```

**Exemple de réponse (validation par couche):**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"status\":\"layer_complete\",\"workflow_id\":\"wf_abc123\",\"current_layer\":1,\"total_layers\":3,\"layer_results\":[...],\"next_action\":\"Use agentcards:continue to proceed\"}"
  }]
}
```

---

### agentcards:execute_code

Exécute du code TypeScript/JavaScript dans un sandbox Deno isolé.

**Paramètres:**

| Nom | Type | Requis | Description |
|-----|------|--------|-------------|
| `code` | string | Oui | Code TypeScript à exécuter |
| `intent` | string | Non | Description pour découverte automatique d'outils |
| `context` | object | Non | Données/contexte à injecter dans le sandbox |
| `sandbox_config` | object | Non | Configuration du sandbox |

**Options sandbox_config:**

| Option | Type | Défaut | Description |
|--------|------|--------|-------------|
| `timeout` | number | 30000 | Timeout en millisecondes |
| `memoryLimit` | number | 512 | Limite mémoire heap en MB |
| `allowedReadPaths` | string[] | [] | Chemins de lecture additionnels autorisés |

**Comportement REPL:**
- Expressions simples → auto-return (`2 + 2` retourne `4`)
- Multi-statements → `return` explicite requis

**Exemple - Traitement de données:**

```typescript
await callTool("agentcards:execute_code", {
  code: `
    const items = context.data;
    const filtered = items.filter(x => x.active);
    return {
      total: filtered.length,
      summary: filtered.slice(0, 5)
    };
  `,
  context: { data: largeDataset }
});
```

**Exemple - Avec découverte d'outils:**

```typescript
await callTool("agentcards:execute_code", {
  intent: "Analyser les commits GitHub",
  code: `
    // 'github' injecté automatiquement grâce à l'intent
    const commits = await github.listCommits({ limit: 100 });
    return commits.filter(c => c.author === "alice").length;
  `
});
```

**Exemple de réponse:**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"result\":42,\"logs\":[],\"metrics\":{\"execution_time_ms\":127,\"memory_used_mb\":45}}"
  }]
}
```

---

### agentcards:continue

Continue l'exécution d'un workflow pausé (après validation par couche).

**Paramètres:**

| Nom | Type | Requis | Description |
|-----|------|--------|-------------|
| `workflow_id` | string | Oui | ID du workflow (retourné par execute_dag) |
| `reason` | string | Non | Raison de la continuation |

**Exemple:**

```typescript
await callTool("agentcards:continue", {
  workflow_id: "wf_abc123",
  reason: "Couche 1 validée, continuer"
});
```

---

### agentcards:abort

Arrête un workflow en cours d'exécution.

**Paramètres:**

| Nom | Type | Requis | Description |
|-----|------|--------|-------------|
| `workflow_id` | string | Oui | ID du workflow à arrêter |
| `reason` | string | Oui | Raison de l'arrêt |

**Exemple:**

```typescript
await callTool("agentcards:abort", {
  workflow_id: "wf_abc123",
  reason: "Erreur détectée dans les résultats de la couche 1"
});
```

---

### agentcards:replan

Re-planifie un DAG avec de nouvelles exigences (découvertes pendant l'exécution).

**Paramètres:**

| Nom | Type | Requis | Description |
|-----|------|--------|-------------|
| `workflow_id` | string | Oui | ID du workflow à replanifier |
| `new_requirement` | string | Oui | Description de ce qui doit être ajouté |
| `available_context` | object | Non | Contexte pour la replanification |

**Exemple:**

```typescript
// Après avoir découvert des fichiers XML inattendus
await callTool("agentcards:replan", {
  workflow_id: "wf_abc123",
  new_requirement: "Parser les fichiers XML découverts",
  available_context: {
    discovered_files: ["config.xml", "data.xml"]
  }
});
```

---

### agentcards:approval_response

Répond à un checkpoint d'approbation Human-in-the-Loop (HIL).

**Paramètres:**

| Nom | Type | Requis | Description |
|-----|------|--------|-------------|
| `workflow_id` | string | Oui | ID du workflow |
| `checkpoint_id` | string | Oui | ID du checkpoint (retourné par le workflow) |
| `approved` | boolean | Oui | `true` pour approuver, `false` pour rejeter |
| `feedback` | string | Non | Commentaire ou raison de la décision |

**Exemple:**

```typescript
await callTool("agentcards:approval_response", {
  workflow_id: "wf_abc123",
  checkpoint_id: "cp_xyz789",
  approved: true,
  feedback: "Opération validée, procéder au déploiement"
});
```

---

## Outils proxiés

Les outils des serveurs MCP sous-jacents sont accessibles via le pattern `serverId:toolName`.

**Exemples:**

```typescript
// Lecture de fichier via serveur filesystem
await callTool("filesystem:read_file", { path: "/path/to/file.txt" });

// Création d'issue GitHub
await callTool("github:create_issue", {
  repo: "owner/repo",
  title: "Bug report",
  body: "Description..."
});

// Recherche dans la mémoire
await callTool("memory:search_nodes", { query: "configuration" });
```

> **Découverte:** Utilisez `agentcards:search_tools` pour trouver les outils disponibles par intention.

---

## Types de données

### DAGStructure

Structure d'un workflow DAG.

```typescript
interface DAGStructure {
  tasks: DAGTask[];
}

interface DAGTask {
  id: string;                    // Identifiant unique
  tool: string;                  // "serverId:toolName"
  type?: "mcp_tool" | "code_execution";
  arguments: Record<string, unknown>;
  depends_on?: string[];         // IDs des dépendances
  code?: string;                 // Pour type: "code_execution"
}
```

### TaskResult

Résultat d'exécution d'une tâche.

```typescript
interface TaskResult {
  taskId: string;
  status: "success" | "error" | "skipped";
  result?: unknown;
  error?: string;
  duration_ms: number;
}
```

### WorkflowStatus

Statut d'un workflow.

```typescript
type WorkflowStatus =
  | "running"      // En cours d'exécution
  | "paused"       // En attente de validation/approbation
  | "complete"     // Terminé avec succès
  | "aborted"      // Arrêté par l'utilisateur
  | "error";       // Échec
```

---

## Codes d'erreur

| Code | Nom | Description | Résolution |
|------|-----|-------------|------------|
| -32700 | PARSE_ERROR | JSON invalide | Vérifier le format de la requête |
| -32600 | INVALID_REQUEST | Requête malformée | Vérifier la structure MCP |
| -32601 | METHOD_NOT_FOUND | Méthode inconnue | Utiliser tools/list, tools/call, ou prompts/get |
| -32602 | INVALID_PARAMS | Paramètres invalides | Vérifier les paramètres requis |
| -32603 | INTERNAL_ERROR | Erreur interne | Consulter les logs, réessayer |

**Erreurs spécifiques AgentCards:**

| Erreur | Description | Résolution |
|--------|-------------|------------|
| `WORKFLOW_NOT_FOUND` | Workflow ID inexistant | Vérifier l'ID, le workflow a peut-être expiré |
| `TOOL_NOT_FOUND` | Outil inconnu | Utiliser search_tools pour découvrir les outils |
| `SANDBOX_TIMEOUT` | Code execution timeout | Réduire la complexité ou augmenter timeout |
| `SANDBOX_MEMORY` | Dépassement mémoire sandbox | Réduire les données ou augmenter memoryLimit |
| `MCP_SERVER_ERROR` | Erreur serveur MCP sous-jacent | Vérifier la connexion au serveur MCP |

---

## Limites

| Ressource | Limite | Configurable |
|-----------|--------|--------------|
| Timeout par outil | 30s | Oui (`sandbox_config.timeout`) |
| Mémoire sandbox | 512MB | Oui (`sandbox_config.memoryLimit`) |
| Taille code | 100KB | Non |
| Workflows actifs | 100 | Non |
| TTL workflow pausé | 1 heure | Non |
| Cache entries | 100 | Oui (`--no-cache` pour désactiver) |

---

## Exemples complets

### Workflow d'analyse de projet

```typescript
// 1. Découvrir les outils pertinents
const tools = await callTool("agentcards:search_tools", {
  query: "lire fichiers et analyser structure projet",
  include_related: true
});

// 2. Exécuter un workflow DAG
const result = await callTool("agentcards:execute_dag", {
  intent: "Lire tous les fichiers TypeScript dans src/ et compter les lignes"
});

// 3. Post-traiter avec le sandbox
const analysis = await callTool("agentcards:execute_code", {
  code: `
    const files = context.files;
    return {
      totalFiles: files.length,
      totalLines: files.reduce((sum, f) => sum + f.lines, 0),
      avgLinesPerFile: Math.round(files.reduce((sum, f) => sum + f.lines, 0) / files.length)
    };
  `,
  context: { files: result.results }
});
```

### Workflow avec validation humaine

```typescript
// 1. Démarrer avec validation par couche
const workflow = await callTool("agentcards:execute_dag", {
  intent: "Déployer la nouvelle version en production",
  per_layer_validation: true
});

// 2. Examiner les résultats de la couche
console.log(workflow.layer_results);

// 3. Approuver et continuer
await callTool("agentcards:continue", {
  workflow_id: workflow.workflow_id,
  reason: "Tests passés, approuvé pour déploiement"
});
```

---

## Voir aussi

- [Démarrage rapide](./getting-started.md) - Installation et configuration
- [Guide utilisateur](./user-guide.md) - Utilisation détaillée
- [FAQ](./faq.md) - Questions fréquentes

---

*Généré le 2025-12-03 par le workflow user-docs BMAD*
