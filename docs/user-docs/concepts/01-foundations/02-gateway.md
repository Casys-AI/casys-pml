# Gateway

> How PML routes requests to MCP servers

## En bref

Le **Gateway** (passerelle) est le chef d'orchestre de PML. Il recoit les demandes des agents IA et
les dirige vers le bon serveur MCP. C'est un point d'entree unique qui cache la complexite de
multiples serveurs.

**Analogie simple :** Le Gateway est comme un standard telephonique. Vous appelez un numero unique
(le Gateway), et il vous transfere automatiquement au bon service (serveur MCP).

## Role of the Gateway

The **Gateway** is the central component of PML. It sits between AI agents and MCP servers, acting
as an intelligent proxy.

![Gateway Architecture](excalidraw:src/web/assets/diagrams/gateway-architecture.excalidraw)

**Without PML**, an agent would need to:

- Connect to each MCP server separately
- Know which server has which tool
- Manage multiple connections

**With PML**, the agent:

- Connects to a single endpoint
- Searches tools by intent (not by name)
- Gets intelligent suggestions

**Comparaison concrete :**

Sans PML:

```
Agent doit savoir:
  "Pour lire un fichier, je dois me connecter au serveur filesystem"
  "Pour creer une issue GitHub, je dois me connecter au serveur github"
  "Pour faire une requete SQL, je dois me connecter au serveur postgres"
```

Avec PML:

```
Agent demande simplement:
  "Je veux lire un fichier" → PML route vers filesystem
  "Je veux creer une issue" → PML route vers github
  "Je veux interroger la DB" → PML route vers postgres
```

## Multiplexing

**Multiplexing** means PML manages multiple MCP server connections through a single interface.

**Pour les debutants :** Le multiplexing, c'est comme avoir plusieurs conversations simultanement
via un seul telephone. PML maintient plusieurs connexions ouvertes et les gere pour vous.

When PML starts:

1. Reads the server configuration
2. Spawns each MCP server as a subprocess
3. Maintains a connection pool
4. Handles reconnection if a server crashes

The agent sees **one unified API** regardless of how many servers are behind it.

**Exemple visuel :**

```
Configuration PML:
├─ filesystem server (process ID: 1234)
├─ github server     (process ID: 1235)
├─ postgres server   (process ID: 1236)
└─ fetch server      (process ID: 1237)

Agent voit: 1 seule API PML
PML gere: 4 connexions independantes
```

## Request Routing

When an agent calls a tool, PML routes the request to the correct server:

```
Agent calls: filesystem:read_file

PML Gateway:
  1. Parse tool name → server: "filesystem", tool: "read_file"
  2. Find the connection to "filesystem" server
  3. Forward the request via JSON-RPC
  4. Wait for response
  5. Return result to agent
```

This routing is transparent - the agent doesn't need to know which server handles which tool.

**Exemple detaille :**

```
┌─────────────────────────────────────────────────────────────┐
│ Agent: "Lis le fichier /home/user/config.json"              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │  PML Gateway   │
            │                │
            │ 1. Parse:      │
            │    filesystem: │
            │    read_file   │
            │                │
            │ 2. Route vers  │
            │    filesystem  │
            └────────┬───────┘
                     │
                     ▼
            ┌────────────────┐
            │ MCP Server     │
            │ "filesystem"   │
            │                │
            │ Execute:       │
            │ read_file()    │
            └────────┬───────┘
                     │
                     ▼
            ┌────────────────┐
            │ Resultat:      │
            │ {"config": ... }│
            └────────────────┘
```

## Gateway Modes

PML can run in different modes:

| Mode       | Description                 | Use Case                   |
| ---------- | --------------------------- | -------------------------- |
| **Local**  | All servers run locally     | Development, single user   |
| **Cloud**  | Shared server, multi-tenant | Production, multiple users |
| **Hybrid** | Mix of local and remote     | Enterprise deployment      |

**Pour les debutants :**

- **Mode Local** : Tout tourne sur votre machine. Simple, rapide, ideal pour debuter.
- **Mode Cloud** : PML tourne sur un serveur distant. Plusieurs utilisateurs peuvent partager les
  memes outils.
- **Mode Hybride** : Certains outils locaux (ex: vos fichiers), d'autres distants (ex: base de
  donnees partagee).

**Exemple de mode Hybride :**

```
Agent
  └─ PML Gateway
      ├─ filesystem (local)    → Vos fichiers personnels
      ├─ github (local)        → Votre configuration Git
      └─ postgres (cloud)      → Base de donnees d'entreprise
```

## Connection Management

PML handles:

- **Startup** - Launch configured MCP servers
- **Health checks** - Monitor server availability
- **Reconnection** - Auto-restart crashed servers
- **Shutdown** - Graceful cleanup of all connections

**En pratique :**

```
Demarrage:
  ✓ filesystem, github servers demarres
  ✗ postgres echec → redemarrage automatique → ✓
Pendant execution:
  ⚠ Server ne repond plus → ↻ Redemarrage auto
Arret:
  → Fermeture propre + sauvegarde + terminaison
```

## Questions Courantes

**Q: Que se passe-t-il si un serveur est lent a repondre ?** Le Gateway attend la reponse avec un
timeout configurable. Si le serveur ne repond pas a temps, une erreur est retournee a l'agent. Cela
evite que tout le systeme se bloque.

**Q: Puis-je ajouter des serveurs MCP en cours d'execution ?** Cela depend de l'implementation.
Certaines versions de PML supportent le rechargement dynamique de configuration ("hot reload"),
d'autres necessitent un redemarrage.

**Q: Le Gateway garde-t-il une trace des requetes ?** Oui, PML enregistre toutes les requetes dans
sa base de donnees. Cela permet l'apprentissage et l'analyse des patterns d'utilisation.

**Q: Combien de serveurs MCP peut gerer le Gateway ?** Il n'y a pas de limite stricte, mais en
pratique, 5-20 serveurs est courant. Au-dela, les performances peuvent etre affectees selon les
ressources systeme.

**Q: Le Gateway peut-il router vers des serveurs distants ?** Oui, en mode Cloud ou Hybride. Le
Gateway peut se connecter a des serveurs MCP qui tournent sur d'autres machines via le reseau.

## Next

- [Database](./03-database.md) - How PML stores tool information
- [Semantic Search](../02-discovery/01-semantic-search.md) - Finding tools by intent
