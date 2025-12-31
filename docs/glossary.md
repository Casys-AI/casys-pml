# Glossary - Casys PML

_Generated: 2025-12-31_

## A

### ADR (Architecture Decision Record)
Document qui capture une décision architecturale importante, son contexte et ses conséquences.

### Adamic-Adar
Algorithme de prédiction de liens basé sur les voisins communs, utilisé pour mesurer la similarité entre outils.

## B

### BGE-M3
Modèle d'embedding multilingue de BAAI (1024 dimensions) utilisé pour la recherche sémantique.

### BroadcastChannel
API Web native pour la communication entre workers/onglets, utilisée par l'EventBus PML.

## C

### Capability
Workflow appris et réutilisable composé de code, DAG statique, et métriques de succès.

### CapabilityStore
Service de persistance des capabilities avec déduplication par hash de code.

### Checkpoint
Point de sauvegarde pendant l'exécution d'un DAG permettant la reprise.

### ControlledExecutor
Exécuteur de DAG par couches avec parallélisation automatique et checkpointing.

## D

### DAG (Directed Acyclic Graph)
Graphe orienté sans cycles représentant un workflow de tâches avec dépendances.

### DR-DSP (Directed Hypergraph Shortest Path)
Algorithme de pathfinding sur hypergraphes pour trouver les chemins optimaux entre outils.

### Drizzle
ORM TypeScript type-safe utilisé pour les interactions avec PostgreSQL/PGlite.

## E

### Embedding
Représentation vectorielle dense d'un texte ou concept (1024 dimensions dans PML).

### EventBus
Bus d'événements singleton pour la distribution d'événements via BroadcastChannel.

### Execution Trace
Enregistrement complet d'une exécution incluant chemin, résultats, et décisions.

## F

### FQDN (Fully Qualified Domain Name)
Identifiant unique d'une capability: `<org>.<project>.<namespace>.<action>.<hash>`

### Fresh
Framework web Deno avec Islands Architecture pour le dashboard.

### Fusion (Task Fusion)
Optimisation combinant des tâches séquentielles pures en une seule tâche physique.

## G

### GraphRAG
Moteur de recherche hybride combinant recherche vectorielle et parcours de graphe.

### Graphology
Bibliothèque JavaScript pour la manipulation de graphes en mémoire.

## H

### HIL (Human-in-the-Loop)
Mode d'exécution nécessitant une validation humaine entre chaque couche du DAG.

### Hono
Framework HTTP ultra-rapide utilisé pour le serveur MCP.

### Hypergraph
Graphe où les arêtes (hyperedges) peuvent connecter plus de deux nœuds.

## I

### Intent
Description en langage naturel de l'objectif d'un utilisateur ou d'une capability.

### Islands Architecture
Pattern où seuls certains composants (islands) sont hydratés côté client.

## K

### K-head Attention
Mécanisme d'attention multi-têtes dans SHGAT pour scorer les capabilities.

## L

### Layer (DAG Layer)
Ensemble de tâches sans dépendances mutuelles pouvant s'exécuter en parallèle.

### Logical DAG
DAG représentant les opérations conceptuelles avant optimisation.

### Louvain
Algorithme de détection de communautés pour le clustering d'outils.

## M

### MCP (Model Context Protocol)
Protocole standard pour exposer des outils aux agents LLM.

### Meta-tool
Outil de haut niveau qui orchestre d'autres outils (pml_discover, pml_execute).

## O

### OTEL (OpenTelemetry)
Standard ouvert pour la télémétrie distribuée (traces, métriques, logs).

### OTLP
Protocol de transport OpenTelemetry pour l'envoi de données de télémétrie.

## P

### PageRank
Algorithme mesurant l'importance relative des nœuds dans un graphe.

### PER (Prioritized Experience Replay)
Technique d'apprentissage par renforcement pour prioriser les traces importantes.

### PGlite
PostgreSQL embarqué en WASM pour le mode local.

### Physical DAG
DAG optimisé après fusion de tâches, prêt pour l'exécution.

### PII (Personally Identifiable Information)
Données personnelles détectées et filtrées par le sandbox.

### Preact
Alternative légère à React (3KB) utilisée pour les islands du dashboard.

## R

### Reliability Factor
Multiplicateur basé sur le taux de succès affectant le score final.

## S

### Sandbox
Environnement d'exécution isolé avec permissions minimales.

### Semantic Score
Score de similarité vectorielle entre un intent et un outil/capability.

### SHGAT (Spectral Hypergraph Attention Network)
Réseau d'attention sur hypergraphe pour scorer les capabilities (Story 10.7b).

### SSE (Server-Sent Events)
Protocole pour le streaming d'événements du serveur vers le client.

### Static Structure
Représentation AST du code analysée par SWC avant exécution.

### SWC
Compilateur TypeScript/JavaScript ultra-rapide utilisé pour l'analyse statique.

## T

### Thompson Sampling
Algorithme bayésien pour l'exploration/exploitation des seuils adaptatifs.

### Tool
Fonction exposée via MCP qu'un agent peut appeler.

### Trace
Enregistrement d'une opération avec timing, résultat, et métadonnées.

### Transitive Reliability
Fiabilité propagée à travers les dépendances d'une capability.

## U

### Unified Score
Score final combinant sémantique et fiabilité: `score = semantic × reliability`

### Use Case
Classe d'application implémentant une logique métier spécifique.

## V

### Vector Search
Recherche par similarité cosinus dans l'espace des embeddings.

## W

### Workflow
Séquence de tâches avec dépendances, représentée comme un DAG.

### WorkerBridge
Interface RPC entre le thread principal et le sandbox worker.

### workflow_pattern
Table stockant le code, DAG, et embeddings des capabilities apprises.

---

## Acronymes

| Acronyme | Signification |
|----------|---------------|
| ADR | Architecture Decision Record |
| API | Application Programming Interface |
| AST | Abstract Syntax Tree |
| DAG | Directed Acyclic Graph |
| DI | Dependency Injection |
| DR-DSP | Directed Hypergraph Shortest Path |
| FQDN | Fully Qualified Domain Name |
| HIL | Human-in-the-Loop |
| JSON-RPC | JSON Remote Procedure Call |
| MCP | Model Context Protocol |
| MRR | Mean Reciprocal Rank |
| OTEL | OpenTelemetry |
| OTLP | OpenTelemetry Protocol |
| PER | Prioritized Experience Replay |
| PII | Personally Identifiable Information |
| PML | Procedural Memory Layer |
| RPC | Remote Procedure Call |
| SHGAT | Spectral Hypergraph Attention Network |
| SSE | Server-Sent Events |
| SSR | Server-Side Rendering |
| SWC | Speedy Web Compiler |
| WASM | WebAssembly |
