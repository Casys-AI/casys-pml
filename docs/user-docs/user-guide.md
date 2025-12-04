# Guide Utilisateur AgentCards

## Vue d'ensemble

AgentCards est un MCP gateway intelligent conçu pour les agents de codage (Claude Code, Cursor, etc.). Il agit comme un point d'entrée unique vers tous vos serveurs MCP, optimisant l'utilisation du contexte LLM et parallélisant l'exécution des workflows.

**Bénéfices principaux:**
- **Contexte optimisé:** Réduction de 30-50% → <5% grâce au chargement on-demand
- **Exécution parallèle:** Workflows 5x plus rapides via DAG
- **Découverte intelligente:** Recherche sémantique + recommandations basées sur le graphe
- **Apprentissage continu:** Le système s'améliore avec l'usage

### Concepts clés

| Terme | Définition |
|-------|------------|
| **MCP (Model Context Protocol)** | Protocole standard d'Anthropic pour connecter LLMs à des outils externes |
| **Gateway** | Point d'entrée unique qui agrège et proxie tous vos serveurs MCP |
| **DAG (Directed Acyclic Graph)** | Structure représentant les dépendances entre tâches pour parallélisation |
| **GraphRAG** | Base de connaissances apprenante qui améliore les suggestions d'outils |
| **Sandbox** | Environnement isolé pour exécuter du code TypeScript en sécurité |
| **AIL (Agent-in-the-Loop)** | Décisions automatiques de l'agent pendant l'exécution |
| **HIL (Human-in-the-Loop)** | Points d'approbation humaine pour opérations critiques |

---

## Fonctionnalités principales

### 1. Recherche sémantique d'outils

Trouvez les outils pertinents par intention naturelle, pas par nom exact.

**Comment l'utiliser:**

1. Décrivez ce que vous voulez accomplir en langage naturel
2. AgentCards utilise les embeddings (BGE-Large-EN-v1.5) pour trouver les outils similaires
3. Le GraphRAG booste les outils fréquemment utilisés ensemble

**Exemple:**

```typescript
// Via l'outil MCP
await callTool("agentcards:search_tools", {
  query: "lire et parser des fichiers de configuration",
  limit: 5,
  include_related: true  // Inclut recommandations du graphe
});

// Résultat
{
  "tools": [
    { "name": "filesystem:read_file", "score": 0.92 },
    { "name": "filesystem:read_directory", "score": 0.85 },
    { "name": "memory:search_nodes", "score": 0.78, "related": true }
  ]
}
```

**Tips:**
- Utilisez `include_related: true` pour découvrir des outils connexes via le graphe
- Plus le graphe apprend, meilleures sont les recommandations

---

### 2. Exécution de workflows DAG

Orchestrez des workflows multi-outils avec parallélisation automatique.

**Comment l'utiliser:**

1. **Mode Intent:** Décrivez votre objectif, AgentCards suggère le DAG optimal
2. **Mode Explicit:** Définissez vous-même la structure du workflow
3. AgentCards détecte les dépendances et parallélise les tâches indépendantes

**Exemple - Mode Intent:**

```typescript
await callTool("agentcards:execute_dag", {
  intent: "Lire les 3 fichiers config.json, package.json, README.md et résumer leur contenu"
});

// AgentCards:
// 1. Identifie les 3 lectures comme indépendantes
// 2. Les exécute en parallèle (Promise.all)
// 3. Agrège les résultats
// Temps: 1.8s au lieu de 5.4s (3x amélioration)
```

**Exemple - Mode Explicit avec dépendances:**

```typescript
await callTool("agentcards:execute_dag", {
  workflow: {
    tasks: [
      { id: "t1", tool: "filesystem:read_file",
        arguments: { path: "config.json" } },
      { id: "t2", tool: "filesystem:read_file",
        arguments: { path: "schema.json" } },
      { id: "t3", tool: "memory:create_entities",
        arguments: { entities: [{ name: "config", content: "$t1.result" }] },
        depends_on: ["t1"] }  // Attend t1, mais t1 et t2 sont parallèles
    ]
  }
});
```

**Tips:**
- Le mode Intent est idéal pour découvrir des patterns
- Le mode Explicit offre un contrôle total sur la structure
- Utilisez `$taskId.result` pour référencer les résultats de tâches précédentes

---

### 3. Exécution de code sandbox

Exécutez du TypeScript dans un environnement isolé avec accès aux outils MCP.

**Comment l'utiliser:**

1. Écrivez du code TypeScript pour traiter des données
2. Optionnel: spécifiez un `intent` pour découvrir automatiquement les outils pertinents
3. Le code s'exécute dans un subprocess Deno isolé

**Exemple - Traitement local de données volumineuses:**

```typescript
await callTool("agentcards:execute_code", {
  intent: "Analyser les commits GitHub",
  code: `
    // 'github' injecté automatiquement grâce à l'intent
    const commits = await github.listCommits({ repo: "anthropics/claude", limit: 1000 });

    // Filtrage local (pas de coût contexte)
    const lastWeek = commits.filter(c =>
      new Date(c.date) > Date.now() - 7 * 24 * 3600 * 1000
    );

    // Agrégation locale
    const byAuthor = lastWeek.reduce((acc, c) => {
      acc[c.author] = (acc[c.author] || 0) + 1;
      return acc;
    }, {});

    // Retourne résumé compact
    return Object.entries(byAuthor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  `
});

// Résultat: [["alice", 42], ["bob", 28], ...] (500 bytes)
// Au lieu de 1000 commits bruts (1.2MB)
// Économie contexte: 99.96%
```

**Style REPL:**
- Expressions simples: auto-return (`2 + 2` → `4`)
- Multi-statements: `return` explicite requis

**Tips:**
- Idéal pour filtrer/agréger de gros datasets avant injection dans le contexte LLM
- Le cache évite de ré-exécuter du code identique
- La protection PII tokenise automatiquement les données sensibles

---

### 4. Contrôle de workflow (AIL/HIL)

Gérez l'exécution avec des points de décision agent et humain.

**Agent-in-the-Loop (AIL):**
- Décisions automatiques basées sur la confiance
- Re-planification dynamique si découverte de nouveaux besoins

**Human-in-the-Loop (HIL):**
- Checkpoints d'approbation pour opérations critiques
- Possibilité de modifier le plan avant continuation

**Exemple - Workflow avec validation:**

```typescript
// Exécution avec validation par couche
const result = await callTool("agentcards:execute_dag", {
  intent: "Déployer la nouvelle version",
  per_layer_validation: true  // Pause entre chaque couche
});

// Si le workflow pause pour approbation:
await callTool("agentcards:approval_response", {
  workflow_id: result.workflow_id,
  checkpoint_id: result.checkpoint_id,
  approved: true,
  feedback: "Continuer avec le déploiement"
});
```

**Commandes de contrôle:**

| Outil | Usage |
|-------|-------|
| `agentcards:continue` | Reprendre un workflow pausé |
| `agentcards:abort` | Arrêter un workflow en cours |
| `agentcards:replan` | Modifier le DAG avec de nouvelles exigences |
| `agentcards:approval_response` | Répondre à un checkpoint HIL |

---

## Configuration

### Options de ligne de commande

| Option | Type | Défaut | Description |
|--------|------|--------|-------------|
| `--config <path>` | string | (requis) | Chemin vers le fichier de config MCP |
| `--port <number>` | number | stdio | Port HTTP pour transport SSE (optionnel) |
| `--no-speculative` | flag | false | Désactiver l'exécution spéculative |
| `--no-pii-protection` | flag | false | Désactiver la protection des données sensibles |
| `--no-cache` | flag | false | Désactiver le cache d'exécution de code |

### Variables d'environnement

| Variable | Description |
|----------|-------------|
| `AGENTCARDS_DB_PATH` | Chemin personnalisé pour la base de données PGlite |
| `AGENTCARDS_WORKFLOW_PATH` | Chemin vers les templates de workflow |
| `AGENTCARDS_NO_PII_PROTECTION` | `1` pour désactiver la protection PII |
| `AGENTCARDS_NO_CACHE` | `1` pour désactiver le cache |
| `SENTRY_DSN` | DSN Sentry pour le tracking d'erreurs (optionnel) |
| `LOG_LEVEL` | Niveau de log: `debug`, `info`, `warn`, `error` |

### Exemple de configuration MCP

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/home/user/projects"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-memory"]
    }
  }
}
```

---

## Workflows courants

### Workflow 1: Analyse de codebase

**Objectif:** Analyser la structure d'un projet et créer une documentation

1. **Découvrir les fichiers**

   Utilisez la recherche sémantique pour trouver les outils pertinents:

   ```typescript
   await callTool("agentcards:search_tools", {
     query: "lister et lire les fichiers source"
   });
   ```

2. **Exécuter le workflow**

   Créez un DAG pour paralléliser la lecture:

   ```typescript
   await callTool("agentcards:execute_dag", {
     intent: "Lire tous les fichiers TypeScript dans src/ et générer un résumé"
   });
   ```

3. **Traiter localement**

   Utilisez le sandbox pour agréger les résultats:

   ```typescript
   await callTool("agentcards:execute_code", {
     code: `
       const files = context.files;
       return {
         total: files.length,
         byType: groupBy(files, f => f.extension),
         linesOfCode: sum(files.map(f => f.lines))
       };
     `,
     context: { files: previousResults }
   });
   ```

**Résultat:** Documentation générée avec statistiques, le tout en quelques secondes grâce à la parallélisation.

---

### Workflow 2: Migration de données

**Objectif:** Transformer et migrer des données entre formats

1. Lire les données sources (parallèle si multiples fichiers)
2. Transformer via code sandbox (filtrage, mapping)
3. Écrire vers la destination

```typescript
await callTool("agentcards:execute_dag", {
  workflow: {
    tasks: [
      // Lecture parallèle
      { id: "read1", tool: "filesystem:read_file", arguments: { path: "data1.json" } },
      { id: "read2", tool: "filesystem:read_file", arguments: { path: "data2.json" } },
      // Transformation (attend les lectures)
      { id: "transform", type: "code_execution",
        code: `return [...deps.read1, ...deps.read2].filter(x => x.active)`,
        depends_on: ["read1", "read2"] },
      // Écriture
      { id: "write", tool: "filesystem:write_file",
        arguments: { path: "output.json", content: "$transform.result" },
        depends_on: ["transform"] }
    ]
  }
});
```

---

## Bonnes pratiques

### Performance

- **Utilisez le mode Intent** pour les nouveaux workflows - le GraphRAG apprend des patterns optimaux
- **Parallélisez les lectures** - les opérations de lecture sont généralement indépendantes
- **Traitez localement** - le sandbox évite d'injecter des données volumineuses dans le contexte
- **Activez le cache** - évite de ré-exécuter du code identique

### Sécurité

- **Gardez la protection PII activée** sauf en environnement de confiance
- **Utilisez des chemins absolus** dans les configurations
- **Limitez les permissions** des serveurs MCP (répertoires autorisés, tokens scoped)
- **Reviewez les workflows** avant d'approuver les checkpoints HIL

### Organisation

- **Un fichier de config par environnement** (dev, staging, prod)
- **Nommez vos serveurs MCP clairement** (`github-prod`, `filesystem-local`)
- **Documentez vos workflows** explicites pour réutilisation

---

## Observabilité

AgentCards offre plusieurs options de monitoring:

| Outil | stdio | Streamable HTTP | Description |
|-------|:-----:|:---------------:|-------------|
| **Grafana/Loki** | ✅ | ✅ | Logs via Promtail (lit les fichiers) |
| **Sentry** | ✅ | ✅ | Error tracking (connexion HTTP propre) |
| **Dashboard Fresh** | ❌ | ✅ | UI temps réel sur port 8080 |
| **Console (stderr)** | ✅ | ✅ | Logs console via stderr |

### Stack Grafana/Loki/Promtail

Le monitoring fonctionne **indépendamment du mode de transport** car Promtail lit les fichiers de log:

```bash
# Démarrer le stack monitoring
cd monitoring && docker-compose up -d

# Accéder à Grafana
open http://localhost:3000  # admin/admin
```

**Logs agrégés:**
- `~/.agentcards/logs/agentcards.log` (JSON structuré)
- Requêtes LogQL: `{job="agentcards"}`, `{job="agentcards", level="ERROR"}`

### Sentry (Error Tracking)

Sentry utilise sa propre connexion HTTP, fonctionne en stdio et HTTP:

```bash
# .env
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ENVIRONMENT=production
```

---

## Modes de transport

AgentCards supporte deux modes de transport MCP:

| Mode | Commande | Dashboard | Cas d'usage |
|------|----------|-----------|-------------|
| **stdio** | `agentcards serve --config ...` | Non | Claude Code, intégration directe |
| **Streamable HTTP** | `agentcards serve --config ... --port 3001` | Oui | Développement, debugging, dashboard |

**stdio (défaut):**
- Communication via stdin/stdout
- Optimal pour intégration Claude Code
- Pas de dashboard Fresh disponible
- Pas d'API HTTP

**Streamable HTTP:**
- Transport MCP sur `/mcp` (spec MCP 2025-03-26)
- Dashboard Fresh accessible (`deno task dev:fresh` sur port 8080)
- Events graph temps réel via SSE sur `/events/stream`
- APIs REST pour snapshots et métriques
- Idéal pour développement et monitoring

> **Recommandation:** Utilisez stdio pour la production avec Claude Code, Streamable HTTP pour le développement et debugging.

---

## Limites connues

- **Pas de support multi-tenant** - Conçu pour usage développeur individuel
- **Embeddings locaux uniquement** - Pas d'option cloud pour les embeddings (par design, pour la vie privée)
- **Sandbox read-only par défaut** - Écriture fichier nécessite permissions explicites
- **Dashboard Fresh** - Nécessite le mode Streamable HTTP (`--port`), indisponible en stdio

---

## Voir aussi

- [Démarrage rapide](./getting-started.md) - Installation et premier workflow
- [Référence API](./api-reference.md) - Documentation technique des outils MCP
- [FAQ](./faq.md) - Questions fréquentes
- [Dépannage](./troubleshooting.md) - Résolution de problèmes

---

*Généré le 2025-12-03 par le workflow user-docs BMAD*
