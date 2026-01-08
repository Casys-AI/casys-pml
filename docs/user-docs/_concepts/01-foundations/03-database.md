# Database

> Storage and persistence layer for PML's memory

## En bref

La base de données de PML, c'est comme le **cerveau à trois parties** d'un système intelligent : une
mémoire à long terme (PostgreSQL), une mémoire spatiale pour retrouver des souvenirs similaires
(vecteurs), et une mémoire de travail rapide (cache KV).

**Pourquoi trois types de stockage ?**

Imaginez un bibliothécaire expert :

- **PGlite (PostgreSQL)** = Les fichiers d'archives organisés. Vous pouvez faire des recherches
  complexes : "Tous les livres de 2020 sur la cuisine française" → requêtes SQL structurées
- **Vecteurs (pgvector)** = Le "feeling" du bibliothécaire. Vous demandez "un livre sur bien manger"
  et il trouve des livres sur nutrition, cuisine healthy, diététique... même si ces mots
  n'apparaissent pas dans votre requête
- **Deno KV** = Le bureau du bibliothécaire avec les livres fréquemment demandés. Accès instantané,
  pas besoin d'aller aux archives

**Points clés :**

- Données persistantes (survivent aux redémarrages)
- Recherche sémantique via embeddings 1024 dimensions
- Cache rapide pour les accès fréquents
- Pas de serveur externe nécessaire (tout est embarqué)

**Exemple concret :**

```
Vous cherchez "lire un fichier" :
1. KV Cache: Déjà cherché récemment? → Résultat instantané
2. Sinon: Embedding de "lire un fichier" → vecteur [0.12, -0.34, ...]
3. pgvector: Trouver les outils les plus proches sémantiquement
4. Résultat: read_file, load_data, fetch_file (classés par similarité)
```

## Overview

PML uses a hybrid storage approach combining:

- **PGlite** - Embedded PostgreSQL for structured data
- **Vector storage** - Embeddings for semantic search
- **Deno KV** - Fast key-value cache

![Database Schema](excalidraw:src/web/assets/diagrams/database-schema.excalidraw)

## PGlite

**PGlite** is an embedded PostgreSQL database that runs entirely in-process. No separate database
server needed.

### Why PGlite?

| Feature                   | Benefit                         |
| ------------------------- | ------------------------------- |
| **Embedded**              | No external dependencies        |
| **PostgreSQL compatible** | Full SQL, JSON, extensions      |
| **pgvector**              | Native vector similarity search |
| **Persistent**            | Data survives restarts          |

### Main Tables

| Table                   | Purpose                             |
| ----------------------- | ----------------------------------- |
| `tool_schema`           | MCP tool definitions and schemas    |
| `tool_embedding`        | Vector embeddings for tools         |
| `tool_dependency`       | Learned relationships between tools |
| `workflow_pattern`      | Stored capabilities                 |
| `capability_dependency` | Relationships between capabilities  |
| `workflow_execution`    | Execution history for analytics     |

## Embeddings Storage

PML generates **vector embeddings** for semantic search. Each tool and capability gets an embedding
based on its description.

### How Embeddings Work

1. Tool description → Embedding model → 1024-dimension vector
2. Vector stored in `tool_embedding` table
3. Search query → Same embedding model → Query vector
4. PostgreSQL pgvector finds nearest neighbors

### Example

```
Tool: "Read contents of a file from the filesystem"
        ↓
   Embedding Model
        ↓
Vector: [0.023, -0.156, 0.089, ..., 0.012]  (1024 dims)
```

When you search "get file contents", the query is also embedded and compared to all tool vectors.

## Deno KV

**Deno KV** provides fast key-value storage for:

| Use Case    | Example                             |
| ----------- | ----------------------------------- |
| **Caching** | Recent search results, tool schemas |
| **Session** | Current workflow state              |
| **Config**  | Runtime configuration               |

KV is faster than PGlite for simple lookups but doesn't support complex queries.

## Data Flow

```
1. Tool Discovery
   MCP Server → tool_schema → tool_embedding

2. Learning
   Execution → tool_dependency / capability_dependency

3. Search
   Query → embedding → pgvector similarity → results

4. Caching
   Hot data → Deno KV → Fast access
```

## Persistence

All data is persisted to disk:

- PGlite: `~/.pml/data/pglite/`
- Deno KV: `~/.pml/data/kv/`

Data survives restarts and can be backed up.

## Next

- [Semantic Search](../02-discovery/01-semantic-search.md) - How embeddings enable search
- [GraphRAG](../03-learning/01-graphrag.md) - How the dependency graph works
