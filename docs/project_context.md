---
project_name: 'Casys PML'
user_name: 'Erwan'
date: '2025-12-10'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'critical_rules']
status: complete
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Runtime & Language
- **Deno 2.x** — Runtime principal (pas Node.js)
- **TypeScript** — Strict mode obligatoire

### Frontend
- **Fresh ^2.0.0** — Framework web Deno (SSR)
- **Preact ^10.27.0** — Bibliothèque UI (pas React)
- **@preact/signals ^2.5.1** — State management réactif
- **TailwindCSS ^4.1.10** — Styling (v4 syntax)
- **Vite ^7.1.3** — Build tool

### Backend & Data
- **PGlite 0.3.14** — PostgreSQL WASM (local-first)
- **Deno KV** — Key-value store pour sessions, cache, OAuth tokens
- **Drizzle ORM ^0.39.1** — TypeScript ORM
- **@huggingface/transformers 3.7.6** — Embeddings BGE-M3 locaux
- **Architecture Open Core** — Version cloud en préparation (multi-tenant ready)

### MCP & Graphes
- **@modelcontextprotocol/sdk ^1.0.4** — Protocole MCP
- **Graphology ^0.25.4** — Structure de graphe
- **graphology-metrics, shortest-path, louvain** — Algorithmes de graphe

### CLI & Utils
- **@cliffy/command 1.0.0-rc.8** — CLI framework
- **@std/assert, @std/dotenv, @std/fs, @std/yaml** — Deno std lib

### Version Constraints
- **Preact, pas React** — JSX doit utiliser `jsxImportSource: "preact"`
- **TailwindCSS v4** — Syntaxe différente de v3
- **PGlite 0.3.14** — Version spécifique pour compatibilité vector extension

---

## Critical Implementation Rules

### Language-Specific Rules (TypeScript/Deno)

#### Configuration TypeScript
- **Strict mode obligatoire** — `strict: true`, `noImplicitAny: true`
- **Pas de variables inutilisées** — `noUnusedLocals: true`, `noUnusedParameters: true`
- **JSX Preact** — `jsx: "react-jsx"`, `jsxImportSource: "preact"`

#### Imports & Modules
- **Imports JSR** — `@std/*` pour la bibliothèque standard Deno (ex: `@std/assert`)
- **Imports NPM** — Préfixe `npm:` pour packages npm (ex: `npm:graphology`)
- **Extensions obligatoires** — Toujours `.ts` dans les imports (ex: `./utils.ts`)
- **Pas de CommonJS** — Utiliser ESM uniquement (`import/export`)

#### Databases (Dual-Mode)
- **PGlite** — PostgreSQL WASM pour données persistantes (GraphRAG, capabilities, workflows)
- **Deno KV** — Key-value store pour sessions, cache, OAuth tokens
- **Architecture Open Core** — Version cloud en préparation, garder le code compatible multi-tenant

#### Async/Await Patterns
- **Toujours async/await** — Pas de `.then()/.catch()` chaînés
- **Top-level await supporté** — Deno supporte nativement
- **Gestion d'erreurs** — `try/catch` avec types d'erreur explicites

#### Naming Conventions
- **camelCase** pour variables, fonctions, propriétés d'objets
- **PascalCase** pour types, interfaces, classes
- **SCREAMING_SNAKE_CASE** pour constantes globales
- **kebab-case** pour noms de fichiers (ex: `health-checker.ts`)

#### Error Handling
- **Classes d'erreur custom** dans `src/errors/` — Utiliser `CAIError`, `ValidationError`, etc.
- **Pas de `any` dans les catch** — Typer les erreurs explicitement
- **Logging structuré** — Utiliser `src/telemetry/logger.ts`

### Framework-Specific Rules

#### Fresh 2.0 (SSR Framework)
- **Routes dans `src/web/routes/`** — Convention de fichiers pour routing
- **Middleware** — `_middleware.ts` pour auth et guards
- **Islands architecture** — Composants interactifs isolés pour hydratation partielle
- **API routes** — `routes/api/` pour endpoints REST

#### Preact (UI Library)
- **Pas de React** — Utiliser `preact` et `preact/hooks`, jamais `react`
- **Signals pour state** — `@preact/signals` au lieu de useState pour state global
- **JSX runtime** — Configuré via `jsxImportSource: "preact"` dans deno.json
- **Hooks identiques** — `useState`, `useEffect`, etc. fonctionnent comme React

#### MCP Gateway (Meta-Tools Pattern)
- **Meta-tools uniquement** — Exposer `pml:search_tools`, `pml:execute_dag`, etc.
- **Pas de proxy direct** — Ne jamais exposer les outils MCP sous-jacents directement
- **DAG workflows** — Orchestration parallèle avec résolution de dépendances
- **Intent-based execution** — Support des workflows par intention naturelle

#### GraphRAG Engine
- **Graphology** — Structure de graphe en mémoire
- **Adamic-Adar** — Algorithme pour recommandations d'outils
- **Louvain communities** — Clustering pour suggestions proactives
- **PageRank** — Sizing des nœuds dans la visualisation

#### Sandbox Execution
- **Worker isolé** — Code exécuté dans subprocess Deno
- **Permissions limitées** — Pas de réseau, pas de subprocess
- **PII detection** — Tokenisation automatique des données sensibles
- **MCP tool injection** — Outils injectés via intent discovery

### Testing Rules

#### Test Framework
- **Deno.test natif** — Pas Jest, pas Vitest
- **@std/assert** — `assertEquals`, `assertThrows`, `assertRejects`, etc.
- **Async tests** — Support natif des tests async/await

#### Test Organization
- **Tests unitaires** — `tests/unit/` miroir de `src/`
- **Tests d'intégration** — `tests/integration/`
- **Nommage** — `*_test.ts` (underscore, pas hyphen)
- **Structure** — `Deno.test("description", async () => { ... })`

#### Test Patterns
- **Isolation** — Chaque test doit être indépendant
- **Mocks dans `tests/mocks/`** — Filesystem, database, API mocks disponibles
- **Cleanup** — Toujours nettoyer les ressources (DB, fichiers temp)
- **Assertions explicites** — Pas de tests sans assertions

#### Running Tests
- `deno task test` — Tous les tests
- `deno task test:unit` — Tests unitaires seulement
- `deno task test:integration` — Tests d'intégration
- **Flags requis** — `--allow-all --unstable-worker-options --unstable-broadcast-channel --unstable-kv`

#### Coverage Target
- **>80% coverage** — Objectif de couverture
- **Tests critiques obligatoires** — DAG executor, sandbox, MCP gateway

### Code Quality & Style Rules

#### Formatting (deno fmt)
- **Largeur ligne** — 100 caractères max
- **Indentation** — 2 espaces (pas de tabs)
- **Point-virgule** — Obligatoire
- **Commande** — `deno task fmt`

#### Linting (deno lint)
- **Rules** — Tag `recommended` activé
- **Exclusions** — `tests/integration/`, `tests/e2e/`, `tests/load/`, `tests/memory/`
- **Commande** — `deno task lint`

#### File Organization
- **src/** — Code source principal
- **src/dag/** — DAG executor et workflows
- **src/graphrag/** — GraphRAG engine
- **src/sandbox/** — Exécution sécurisée
- **src/mcp/** — Gateway MCP
- **src/web/** — Dashboard Fresh/Preact
- **src/db/** — Migrations et schémas Drizzle
- **src/telemetry/** — Logging et métriques

#### Documentation
- **JSDoc minimal** — Seulement pour exports publics complexes
- **Pas de commentaires évidents** — Le code doit être auto-explicatif
- **ADRs** — Décisions architecturales dans `docs/adrs/`
- **Stories** — Artifacts de sprint dans `docs/sprint-artifacts/`

#### Code Patterns
- **Single responsibility** — Une fonction = une tâche
- **Explicit returns** — Typage explicite des retours de fonctions
- **No magic strings** — Utiliser des constantes ou enums
- **Immutability preferred** — `const` par défaut, éviter mutations

### Development Workflow Rules

#### Git Conventions
- **Branch main** — Branche principale de production
- **Commits atomiques** — Un commit = une unité logique de changement
- **Messages descriptifs** — Préfixe type: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`

#### Development Commands
- `deno task dev` — Serveur API (port 3003)
- `deno task dev:fresh` — Dashboard Vite (port 8081)
- `deno task check` — Type checking
- `deno task fmt && deno task lint` — Avant commit

#### Production Deployment
- **Systemd services** — `casys-dashboard`, `casys-api`
- `deno task prod:start` — Démarrer les services
- `deno task deploy:all` — Pull, build, restart

#### CLI Usage
- `deno task cli init` — Initialisation (discover MCPs, embeddings)
- `deno task cli status` — Vérification santé
- `deno task cli workflows` — Gestion des workflows

#### ADR Process
- **Nouvelle décision** — Créer `docs/adrs/ADR-XXX-description.md`
- **Numérotation séquentielle** — Incrémenter depuis le dernier ADR
- **Format** — Context, Decision, Consequences

#### Sprint Artifacts
- **Stories** — `docs/sprint-artifacts/story-X.Y.md`
- **Tech specs** — `docs/sprint-artifacts/tech-spec-*.md`
- **Rétrospectives** — `docs/retrospectives/`

### Critical Don't-Miss Rules

#### ⚠️ Anti-Patterns à Éviter
- **JAMAIS React** — Utiliser Preact uniquement, imports `preact` pas `react`
- **JAMAIS CommonJS** — Pas de `require()`, ESM uniquement
- **JAMAIS node_modules direct** — Préfixe `npm:` obligatoire
- **JAMAIS snake_case** — camelCase pour propriétés (refactoring récent)
- **JAMAIS proxy MCP direct** — Exposer meta-tools, pas les outils sous-jacents

#### 🔒 Sécurité
- **Sandbox isolation** — Code utilisateur dans worker isolé
- **PII detection** — Activer tokenisation par défaut
- **Pas de secrets en code** — Utiliser `.env` et `@std/dotenv`
- **Permissions Deno explicites** — `--allow-read`, `--allow-net`, etc.

#### 🎯 Patterns Critiques
- **camelCase everywhere** — Events, state, API responses (refactoring récent appliqué)
- **Async/await obligatoire** — Pas de callbacks ou .then() chains
- **Extensions .ts dans imports** — Deno requiert extensions explicites
- **Type safety** — `strict: true`, pas de `any` sauf cas documenté

#### 🗄️ Base de Données
- **PGlite pour persistance** — GraphRAG, capabilities, workflows
- **Deno KV pour sessions** — OAuth, cache, tokens
- **Migrations Drizzle** — `src/db/migrations/` numérotées séquentiellement
- **Multi-tenant ready** — Préparer pour version cloud

#### 📊 Observabilité
- **Sentry pour erreurs** — Si `SENTRY_DSN` configuré
- **Logger structuré** — `src/telemetry/logger.ts`
- **SSE events** — Real-time updates via `src/server/events-stream.ts`
- **Métriques** — Success rate, latency, graph density trackés

#### 🔄 DAG Execution
- **AIL (Agent-in-the-Loop)** — Décisions automatiques avec validation par layer
- **HIL (Human-in-the-Loop)** — Checkpoints d'approbation pour opérations critiques
- **Checkpoint/Resume** — Workflows interruptibles avec persistence d'état
- **$OUTPUT resolution** — Référencer outputs des tasks précédentes
