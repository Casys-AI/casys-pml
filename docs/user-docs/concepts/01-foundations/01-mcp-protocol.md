# MCP Protocol

> The communication standard between AI agents and external tools

## En bref

**MCP (Model Context Protocol)** est le "langage commun" qui permet aux agents IA de communiquer avec des outils externes. C'est comme un standard USB pour l'intelligence artificielle : un seul protocole qui fonctionne avec tous les outils compatibles.

**Pourquoi c'est important ?** Sans MCP, chaque outil devrait avoir sa propre façon de communiquer avec l'IA. Avec MCP, tout le monde parle la même langue.

## What is MCP?

**MCP (Model Context Protocol)** is an open standard created by Anthropic that allows AI agents to interact with external tools and services in a structured way.

### Analogie : Le Serveur de Restaurant

Imaginez MCP comme un serveur dans un restaurant :
- Le **client** (agent IA) consulte le **menu** (liste des outils disponibles)
- Le **serveur** (protocole MCP) explique chaque plat (description des outils)
- Le client passe **commande** (appel d'outil avec paramètres)
- Le serveur transmet à la **cuisine** (serveur MCP) et rapporte le plat (résultat)

Think of MCP as a universal language that lets an AI agent:
- **Discover** what tools are available (like reading a menu)
- **Understand** how to use each tool (ingredients, parameters)
- **Send requests** and receive responses (order and get results)

![MCP Architecture](excalidraw:src/web/assets/diagrams/mcp-architecture.excalidraw)

## Key Components

### Servers

An **MCP Server** is a program that exposes tools to AI agents. Each server can provide multiple tools.

**Pour les debutants :** Un serveur MCP est comme une boite a outils specialisee. Le serveur "filesystem" est la boite pour les fichiers, "github" pour Git, etc.

Examples of MCP servers:
- **filesystem** - Read/write files, list directories
- **github** - Create issues, manage PRs, search repos
- **postgres** - Query databases
- **fetch** - Make HTTP requests

**Exemple concret :** Quand Claude veut lire un fichier sur votre ordinateur, il ne peut pas le faire directement. Il demande au serveur MCP "filesystem" de le faire pour lui.

### Tools

A **Tool** is a single operation that an MCP server provides. Each tool has:
- A unique **name** (e.g., `filesystem:read_file`)
- A **description** explaining what it does
- An **input schema** defining required parameters
- An **output format** for results

**Analogie :** Si le serveur MCP est une boite a outils, un "tool" est un outil specifique dans cette boite. Le serveur "filesystem" contient plusieurs outils : `read_file`, `write_file`, `list_directory`, etc.

| Server | Tool | Description |
|--------|------|-------------|
| filesystem | `read_file` | Lire un fichier |
| filesystem | `write_file` | Écrire dans un fichier |
| filesystem | `list_directory` | Lister les fichiers |
| filesystem | `delete_file` | Supprimer un fichier |

### Schemas

The **input schema** describes what parameters a tool accepts. It uses JSON Schema format.

**Pour les debutants :** Le schema est comme le mode d'emploi d'un outil. Il indique quelles informations vous devez fournir (obligatoires) et lesquelles sont optionnelles.

Example for a file reading tool:
```
Tool: filesystem:read_file
Parameters:
  - path (string, required): The file path to read
  - encoding (string, optional): File encoding (default: utf-8)
```

**Traduction :** Pour utiliser `read_file`, vous DEVEZ donner le chemin du fichier. L'encodage est facultatif (utf-8 par defaut).

## How PML Uses MCP

PML acts as an intelligent **MCP Gateway** between agents and servers:

![MCP with PML](excalidraw:src/web/assets/diagrams/mcp-with.excalidraw)

Instead of the agent connecting directly to each MCP server, PML:

1. **Aggregates** all tools from multiple servers
2. **Indexes** them for semantic search
3. **Routes** requests to the correct server
4. **Learns** which tools work well together

## Tool Discovery

When PML starts, it connects to all configured MCP servers and:

1. Calls `tools/list` on each server
2. Receives the list of available tools with schemas
3. Generates embeddings for semantic search
4. Stores everything in its database

This happens automatically - the agent sees one unified list of all available tools.

**Exemple de decouverte :**

| Étape | Serveur | Outils récupérés |
|-------|---------|------------------|
| 1 | filesystem | `read_file`, `write_file`, `list_directory`... |
| 2 | github | `create_issue`, `list_repos`, `create_pr`... |
| 3 | postgres | `query`, `list_tables`, `describe_table`... |

→ L'agent voit tous les outils dans une seule liste unifiée !

## Questions Courantes

**Q: MCP est-il specifique a Anthropic/Claude ?**
Non, MCP est un standard ouvert. N'importe quel agent IA ou outil peut implementer MCP. Anthropic l'a cree mais tout le monde peut l'utiliser.

**Q: Dois-je programmer mes propres serveurs MCP ?**
Non, sauf si vous voulez creer des outils personnalises. De nombreux serveurs MCP existent deja pour les cas d'usage courants (fichiers, bases de donnees, APIs web, etc.).

**Q: Comment PML sait-il quel serveur utiliser ?**
Le nom de l'outil inclut le serveur : `filesystem:read_file` signifie "utilise l'outil `read_file` du serveur `filesystem`". PML route automatiquement vers le bon serveur.

**Q: Que se passe-t-il si un serveur MCP plante ?**
PML detecte les pannes et peut relancer automatiquement les serveurs. Les requetes echouees retournent une erreur claire a l'agent.

**Q: JSON-RPC, c'est quoi ?**
JSON-RPC 2.0 est le format de communication sous-jacent de MCP. C'est un standard leger pour faire des appels de fonctions a distance. Vous n'avez pas besoin de le comprendre en detail pour utiliser PML.

## Next

- [Gateway](./02-gateway.md) - How PML routes requests
- [Database](./03-database.md) - How tools are stored and indexed
