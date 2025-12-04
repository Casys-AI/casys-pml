# Démarrage Rapide avec AgentCards

> **Temps estimé:** ~10 minutes

## Qu'est-ce qu'AgentCards?

AgentCards est un MCP gateway intelligent qui consolide tous vos serveurs MCP en un point d'entrée unique avec recherche sémantique, orchestration de workflows DAG, et découverte d'outils auto-apprenante.

**Problèmes résolus:**
- **Saturation du contexte** - Les schemas d'outils consomment 30-50% de la fenêtre LLM → réduit à <5%
- **Latence séquentielle** - Les workflows multi-outils s'exécutent en série → parallélisés via DAG

## Prérequis

Avant de commencer, assurez-vous d'avoir:

- [ ] **Deno 2.x ou supérieur** - [Installation Deno](https://deno.land/)
- [ ] **Git** - Pour cloner le repository
- [ ] **Un agent de codage** - Claude Code, Cursor, ou autre client MCP

### Vérifier Deno

```bash
deno --version
```

Vous devriez voir:
```
deno 2.x.x (...)
```

## Installation

### Étape 1: Cloner le repository

```bash
git clone https://github.com/Casys-AI/mcp-gateway.git
cd AgentCards
```

### Étape 2: Builder le CLI

```bash
deno task build
```

Vous devriez voir:
```
Compile file:///.../src/main.ts to agentcards
```

### Étape 3: Vérifier l'installation

```bash
./agentcards --help
```

Sortie attendue:
```
Usage: agentcards [options] [command]

Commands:
  init    Initialize AgentCards from MCP config
  serve   Start AgentCards MCP gateway server
  status  Show gateway status and health
```

## Tutoriel: Votre premier workflow avec Claude Code

Configurons AgentCards comme gateway MCP pour Claude Code en quelques étapes.

### 1. Préparer votre configuration MCP

Créez un fichier de configuration pour vos serveurs MCP:

```bash
mkdir -p config
cat > config/mcp-servers.json << 'EOF'
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/path/to/allowed/dir"]
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-memory"]
    }
  }
}
EOF
```

> **Tip:** Vous pouvez aussi migrer votre config Claude Desktop existante avec `./agentcards init --config ~/.config/Claude/claude_desktop_config.json`

### 2. Initialiser AgentCards

```bash
./agentcards init --config config/mcp-servers.json
```

Cette commande:
- Découvre tous vos serveurs MCP configurés
- Extrait les schemas d'outils via le protocole MCP
- Génère les embeddings pour la recherche sémantique
- Stocke tout dans une base PGlite locale (`~/.agentcards/db`)

Sortie attendue:
```
🚀 Initializing AgentCards...
✓ Found 2 MCP server(s)
✓ Extracted 15 tool schemas
✓ Generated embeddings (BGE-Large-EN-v1.5)
✓ Stored in ~/.agentcards/db

AgentCards is ready!
```

### 3. Configurer Claude Code

Ajoutez AgentCards à votre configuration Claude Code MCP:

**Linux/macOS:** `~/.config/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agentcards": {
      "command": "/chemin/absolu/vers/agentcards",
      "args": ["serve", "--config", "/chemin/absolu/vers/config/mcp-servers.json"]
    }
  }
}
```

> **Important:** Utilisez des chemins **absolus** pour `command` et `--config`.

### 4. Lancer et tester

Redémarrez Claude Code. Le gateway démarre automatiquement.

Pour tester manuellement:

**Mode stdio (défaut - recommandé pour Claude Code):**
```bash
./agentcards serve --config config/mcp-servers.json
```

**Mode HTTP (avec dashboard Fresh):**
```bash
./agentcards serve --config config/mcp-servers.json --port 3001
```

> **Note:** Le dashboard Fresh (`deno task dev:fresh`) nécessite le mode HTTP (`--port`). En mode stdio, seule l'interface MCP est disponible.

Vous devriez voir:
```
🚀 Starting AgentCards MCP Gateway...

Step 1/6: Loading configuration...
✓ Found MCP config: config/mcp-servers.json
Step 2/6: Initializing database...
Step 3/6: Connecting to MCP servers...
  ✓ Connected: filesystem
  ✓ Connected: memory
Step 4/6: Loading AI models...
Step 5/6: Starting MCP gateway...
Step 6/6: Listening for MCP requests...

AgentCards gateway running on port 3001
```

**Félicitations!** Vous avez configuré AgentCards comme gateway MCP intelligent.

## Premiers pas avec les meta-tools

Une fois connecté, testez ces outils dans Claude Code:

### Recherche sémantique d'outils

```
Utilise agentcards:search_tools pour trouver des outils liés à "lire des fichiers JSON"
```

### Exécution de workflow DAG

```
Utilise agentcards:execute_dag avec l'intent "Lire config.json et créer une entité mémoire"
```

### Exécution de code sandbox

```
Utilise agentcards:execute_code pour filtrer et agréger des données localement
```

## Monitoring (optionnel)

AgentCards inclut un stack Grafana/Loki/Promtail pour le monitoring des logs:

```bash
# Démarrer le stack monitoring
cd monitoring && docker-compose up -d

# Accéder à Grafana (admin/admin)
open http://localhost:3000
```

> **Note:** Le monitoring fonctionne en mode stdio ET Streamable HTTP car Promtail lit les fichiers de log (`~/.agentcards/logs/`).

---

## Prochaines étapes

Maintenant que vous êtes opérationnel:

- **[Guide Utilisateur](./user-guide.md)** - Découvrir toutes les fonctionnalités
- **[Référence API](./api-reference.md)** - Documentation technique des MCP tools

## Besoin d'aide?

- **GitHub Issues:** [Casys-AI/mcp-gateway/issues](https://github.com/Casys-AI/mcp-gateway/issues)
- **Documentation:** [docs/](https://github.com/Casys-AI/mcp-gateway/tree/main/docs)

---

*Généré le 2025-12-03 par le workflow user-docs BMAD*
