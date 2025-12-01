# MCP Servers Configuration - Playground

Ce fichier documente la configuration des MCP servers Tier 1 pour le playground pédagogique AgentCards.

## Architecture MCP

### Configuration MCP Client

**Fichier**: `.mcp.json` (racine du projet)

Configure AgentCards gateway comme serveur MCP unique pour Claude Code.

**Mode développement** (actuel):
```json
{
  "mcpServers": {
    "agentcards": {
      "command": "deno",
      "args": ["run", "--allow-all", "src/main.ts", "serve", "--config", ".mcp-servers.json"]
    }
  }
}
```

**Mode production** (avec binary compilé):
```json
{
  "mcpServers": {
    "agentcards": {
      "command": "agentcards",
      "args": ["serve", "--config", "/path/to/mcp-servers.json"]
    }
  }
}
```

### Configuration Serveurs Playground

**Fichier**: `playground/config/mcp-servers.json`

Configure les serveurs MCP que le gateway AgentCards utilisera pour les démos playground. **Ce fichier peut être facilement modifié** pour ajouter/retirer des serveurs selon vos besoins.

**Note**: Le gateway AgentCards peut charger différentes configurations selon le contexte (dev, playground, prod) via le flag `--config`.

---

## Configuration: `mcp-servers.json`

### Serveurs Configurés

#### 1. **Filesystem Server** (`@modelcontextprotocol/server-filesystem`)

**Objectif**: Démontrer la parallélisation de lecture de fichiers

**Commande**: `npx -y @modelcontextprotocol/server-filesystem /workspaces/AgentCards`

**Chemins autorisés**:
- `/workspaces/AgentCards` - Racine du workspace Codespace (lecture/écriture autorisée)

**Capacités principales**:
- `read_multiple_files` - Lecture parallèle de plusieurs fichiers (démontre DAG parallèle)
- `read_text_file` - Lecture de fichier texte avec options head/tail
- `list_directory` - Lister le contenu d'un répertoire
- `write_file` - Écriture de fichiers
- `create_directory` - Création de répertoires

**Pattern GraphRAG démontré**:
```
Workflow: Analyser projet
├─ [Parallèle] read_multiple_files([package.json, tsconfig.json, README.md])
├─ [Parallèle] list_directory(src/)
└─ [Séquentiel] Synthèse des résultats
```

**Documentation officielle**: https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem

---

#### 2. **Memory Server** (`@modelcontextprotocol/server-memory`)

**Objectif**: Démontrer le knowledge graph local pour GraphRAG

**Commande**: `npx -y @modelcontextprotocol/server-memory`

**Configuration**: Aucune configuration de chemin requise (stockage en mémoire)

**Capacités principales**:
- `create_entities` - Créer des entités (organisations, personnes, événements)
- `create_relations` - Créer des relations dirigées entre entités
- `add_observations` - Ajouter des observations à des entités existantes
- `read_graph` - Lire le graphe complet
- `search_nodes` - Recherche sémantique dans les nœuds
- `open_nodes` - Ouvrir des nœuds spécifiques

**Pattern GraphRAG démontré**:
```
Workflow: Construire knowledge graph du projet
├─ [Parallèle] create_entities(projet, développeurs, dépendances)
├─ [Parallèle] create_relations(projet→dépendances)
└─ [Séquentiel] read_graph() pour validation
```

**Structure de données**:
```json
{
  "entities": [
    {"name": "AgentCards", "entityType": "project", "observations": ["TypeScript project", "Uses Deno"]}
  ],
  "relations": [
    {"from": "AgentCards", "to": "Deno", "relationType": "uses"}
  ]
}
```

**Documentation officielle**: https://github.com/modelcontextprotocol/servers/tree/main/src/memory

---

#### 3. **Sequential Thinking Server** (`@modelcontextprotocol/server-sequential-thinking`)

**Objectif**: Démontrer le branchement DAG pour résolution de problèmes

**Commande**: `npx -y @modelcontextprotocol/server-sequential-thinking`

**Configuration**: Aucune configuration requise

**Capacités principales**:
- `sequentialthinking` - Résolution de problèmes structurée avec support de branchement

**Paramètres clés**:
- `thought` (string, required) - Pensée actuelle
- `branchFromThought` (number, optional) - Point de branchement dans le DAG
- `branchId` (string, optional) - Identifiant de branche pour parallélisation
- `nextThoughtNeeded` (boolean) - Continuer la séquence de pensées
- `isRevision` (boolean, optional) - Réviser une pensée existante

**Pattern DAG avec branchement démontré**:
```
Problème: Optimiser performance
├─ Pensée 1: Identifier goulots d'étranglement
├─ Pensée 2: Analyser causes racines
├─┬ Branche A (branchId="database")
│ ├─ Pensée 3a: Optimisation DB
│ └─ Pensée 4a: Tests performance DB
└─┬ Branche B (branchId="frontend")
  ├─ Pensée 3b: Optimisation UI
  └─ Pensée 4b: Tests performance UI
```

**Documentation officielle**: https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking

---

## Utilisation dans le Playground

### Environnement Codespace

Les MCP servers sont configurés pour fonctionner dans l'environnement Codespace:
- **Workspace root**: `/workspaces/AgentCards` (chemin standard Codespace)
- **Développement local**: Si vous développez localement, le chemin sera `/home/ubuntu/CascadeProjects/AgentCards`
- **Node.js**: Disponible via devcontainer pour `npx` commands
- **Python**: Disponible via devcontainer pour `uvx` commands (si besoin futur)

**Note**: Le fichier `mcp-servers.json` utilise le chemin Codespace par défaut (`/workspaces/AgentCards`). Pour le développement local, vous pouvez créer une copie `mcp-servers.local.json` avec les chemins adaptés à votre environnement.

### Tester la Configuration

Pour vérifier que les serveurs sont correctement installés:

```bash
# Test filesystem server
npx -y @modelcontextprotocol/server-filesystem /workspaces/AgentCards --version

# Test memory server
npx -y @modelcontextprotocol/server-memory --version

# Test sequential-thinking server
npx -y @modelcontextprotocol/server-sequential-thinking --version
```

### Intégration avec le Gateway MCP

Cette configuration sera utilisée par le MCP Gateway pour démontrer:
1. **Parallélisation DAG**: Exécution parallèle de tâches indépendantes
2. **GraphRAG patterns**: Apprentissage de patterns récurrents d'utilisation
3. **Spéculation**: Prédiction de tâches futures basée sur l'historique

---

## Référence Complète

Pour une analyse détaillée des capacités de chaque serveur et des patterns GraphRAG associés, consultez:
- [Analyse complète des MCP Servers](../../docs/research/mcp-servers-playground-analysis.md)
- [PRD Playground - FR015](../../docs/PRD-playground.md#functional-requirements)
- [Documentation officielle MCP](https://modelcontextprotocol.io/docs)
