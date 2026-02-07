Neo4j Adapters - Architecture

## Overview

Suite complète d'adaptateurs Neo4j implémentant tous les ports de `@casys/application` pour une persistance graph native avec support vectoriel complet.

## Activation

```env
GRAPH_BACKEND=neo4j
NEO4J_URI=neo4j://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
NEO4J_DB=neo4j
```

## Schema & Indexes

`neo4j-schema.ts` crée automatiquement:

### Contraintes uniques

- `Tenant.id`
- `Project.id`
- `SeoBrief.id`
- `EditorialBrief.id`
- `KeywordPlan.id`
- `Topic.id`

### Index vectoriels (1536 dims, cosine)

- `keyword_plan_embedding_index` sur `KeywordPlan.embedding`
- `tag_embedding_index` sur `KeywordTag.embedding`
- `article_embedding_index` sur `Article.embedding`
- `section_embedding_index` sur `Section.embedding`
- `component_embedding_index` sur `Component.embedding`

## Adaptateurs disponibles

### Core

- `neo4j-connection.ts` - Singleton de connexion avec session management
- `neo4j-schema.ts` - Initialisation schema + vector indexes

### Stores de base

- `neo4j-tenant-project-store.adapter.ts` - Tenants/Projects CRUD
- `neo4j-seo-brief-store.adapter.ts` - SEO briefs avec enrichment
- `neo4j-editorial-brief-store.adapter.ts` - Editorial briefs + RAG search

### Keywords & Topics

- `neo4j-keyword-plan-repository.adapter.ts` - Plans avec vector search hybride
- `neo4j-project-seed-keyword-repository.adapter.ts` - Seeds de projet
- `neo4j-tag-repository.adapter.ts` - Tags avec embeddings + RAG
- `neo4j-topic-repository.adapter.ts` - Topics avec embeddings optionnels
- `neo4j-topic-relations.adapter.ts` - Relations Topic↔KeywordPlan, Section↔Topic

### Article Structure (TODO - en cours)

- `neo4j-article-structure.adapter.ts` - Index articles/sections/fragments
- `neo4j-article-structure-search.adapter.ts` - Recherches hybrides + Graph RAG

### Components (TODO - en cours)

- `neo4j-component-store.adapter.ts` - Catalogue composants + embeddings
- `neo4j-component-search.adapter.ts` - Graph RAG avec scoring hybride

## Vector Search Pattern

Tous les adaptateurs avec recherche sémantique utilisent:

```cypher
CALL db.index.vector.queryNodes('index_name', $query_vector, $limit)
YIELD node, score
-- score = similarité cosine directe (0-1)
```

## Graph RAG Pattern

Scoring composite = `alpha * vector_similarity + (1-alpha) * graph_score`

Signaux graph typiques:

- Co-occurrence dans articles/sections
- Relations `HAS_TAG`, `USES_KEYWORD_PLAN`
- Voisinage positionnel (sections adjacentes)

## Performance

- Transactions automatiques via `conn.query(cypher, params, mode)`
- Mode READ vs WRITE pour routing optimal
- Logs structurés par adaptateur

## Migration depuis Kuzu

Tous les ports `@casys/application` sont implémentés à l'identique. Switch transparent via `GRAPH_BACKEND`.
