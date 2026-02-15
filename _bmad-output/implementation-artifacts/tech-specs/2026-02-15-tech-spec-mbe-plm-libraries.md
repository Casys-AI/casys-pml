# Tech Spec: lib/syson & lib/plm — MCP Tool Libraries for MBSE & PLM

**Date:** 2026-02-15
**Status:** Draft
**Author:** Casys AI

---

## 1. Context

Casys PML Cloud dispose d'une infrastructure MCP mature :

- **lib/std** — 461+ tools (system, data, agent, etc.)
- **lib/server** — `ConcurrentMCPServer` avec AJV validation, middleware pipeline, auth, rate limiting
- **DAG engine** — exécution parallèle, checkpoints, sandbox
- **Discovery** — GraphRAG + BGE-M3 embeddings, semantic search

L'objectif est d'étendre cet écosystème avec deux nouvelles bibliothèques de tools domaine :

| Library | Scope | Rôle | Phase |
|---------|-------|------|-------|
| **lib/syson** | MBSE (SysON bridge) | Bridge MCP vers l'API REST SysML v2 de SysON | **Phase 1 (MVP)** |
| **lib/plm** | Product Lifecycle Management | BOM, ECR/ECO, qualité, planning | Phase 2 |
| ~~lib/mbe~~ | ~~Model-Based Engineering~~ | ~~Primitives géométriques, GD&T, matériaux, PMI~~ | Future (si besoin CAD) |

**Architecture globale :** SysON (open-source, web-based, Docker) sert de **backend MBSE** avec
son UI intégrée (diagrammes SysML v2, requirements, architecture). `lib/syson` est le bridge
MCP qui permet aux agents et à lib/plm d'interagir avec les modèles SysON via son API REST
standardisée OMG. **Pas d'UI custom à construire** — SysON fournit l'UI et les diagrammes.

`lib/syson` = source de vérité (requirements → architecture → composants → traçabilité).
`lib/plm` = workflows métier (nomenclatures, gestion du changement, qualité).
`lib/mbe` = **reporté** — parsing CAD (STEP/IGES, OCCT) n'est pas nécessaire pour le MVP MBSE/PLM.

---

## 2. Architecture

### 2.1. Positionnement dans l'écosystème

```
┌─────────────────────────────────────────────────────┐
│                    MCP Gateway                       │
│            (src/mcp/gateway-server.ts)               │
├──────────┬───────────┬───────────┬──────────────────┤
│ lib/std  │ lib/syson  │ lib/plm   │ lib/server      │
│ 461 tools│ projects  │ bom       │ ConcurrentMCP   │
│ system   │ elements  │ change    │ AJV validation  │
│ data     │ relations │ quality   │ middleware      │
│ agent    │ queries   │ planning  │ auth + rate     │
└──────────┴─────┬─────┴───────────┴──────────────────┘
                 │ REST API (SysML v2)
           ┌─────▼─────┐
           │   SysON   │
           │  (Docker) │
           │  :8080    │
           └───────────┘
```

### 2.2. Dépendances

```
lib/plm ──depends──> lib/server
                         │
lib/syson ──depends──────┤
                         │
lib/std ──depends────────┘
```

`lib/plm` et `lib/syson` n'ont **aucune dépendance** sur `lib/std` — ils sont
indépendants et ne partagent que `lib/server` pour l'infrastructure MCP.

`lib/syson` communique avec SysON (instance Docker) via REST API — pas d'import direct.
`lib/plm` peut consommer des données du modèle SysON via `lib/syson` (cross-lib calls).

### 2.3. Pattern de tool (identique à lib/std)

Chaque tool suit le pattern `MiniTool` :

```typescript
import type { MiniTool } from "./types.ts";

export const geometryTools: MiniTool[] = [
  {
    name: "mbe_step_parse",
    description: "Parse a STEP AP203/AP214 file and return structured feature tree with topology",
    category: "geometry",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to .stp/.step file" },
        include_topology: { type: "boolean", description: "Include BRep topology (default: true)" },
        coordinate_system: {
          type: "string",
          enum: ["global", "local"],
          description: "Coordinate system reference (default: global)"
        },
      },
      required: ["file_path"],
    },
    handler: async ({ file_path, include_topology, coordinate_system }) => {
      // Implementation
    },
  },
];
```

- **inputSchema** : JSON Schema standard (validé par AJV via `lib/server/SchemaValidator`)
- **handler** : async-first, reçoit les args validés
- **category** : string discriminant pour le filtrage par domaine
- **_meta** : optionnel, pour UI MCP Apps (SEP-1865)

---

## 3. ~~lib/mbe~~ — REPORTÉ (phase future)

> **lib/mbe est reporté.** Le MVP se concentre sur lib/syson (MBSE) + lib/plm (PLM).
> lib/mbe (parsing CAD via OCCT, matériaux, tolerances) sera ajouté si/quand le besoin
> d'importer des données CAD se concrétise. Les sections ci-dessous sont conservées
> comme référence pour l'implémentation future.

### 3.1. Catégories de tools (future)

| Category | Prefix | Description | Tools |
|----------|--------|-------------|-------|
| `geometry` | `mbe_` | STEP/IGES parsing, BRep queries, feature extraction | `mbe_step_parse`, `mbe_iges_parse`, `mbe_feature_tree`, `mbe_brep_query`, `mbe_bounding_box`, `mbe_mass_properties` |
| `tolerance` | `mbe_` | GD&T ISO 1101, tolerance stacking, datum refs | `mbe_gdt_parse`, `mbe_tolerance_stack`, `mbe_datum_reference`, `mbe_tolerance_zone` |
| `material` | `mbe_` | Material DB lookups, property queries, equivalents | `mbe_material_lookup`, `mbe_material_properties`, `mbe_material_equivalent`, `mbe_material_compliance` |
| `model` | `mbe_` | PMI extraction, annotation parsing, MBD queries | `mbe_pmi_extract`, `mbe_annotation_parse`, `mbe_mbd_validate`, `mbe_model_compare` |

### 3.2. Structure de fichiers

```
lib/mbe/
├── deno.json              # Package config, imports, tasks
├── mod.ts                 # Public API exports
├── server.ts              # MCP server bootstrap (HTTP + stdio)
├── src/
│   ├── client.ts          # MbeToolsClient (category-aware)
│   └── tools/
│       ├── types.ts       # MbeToolCategory, MbeTool type
│       ├── common.ts      # Shared utilities (file parsing, units)
│       ├── mod.ts         # Tool aggregation + exports
│       ├── geometry.ts    # Geometry tools
│       ├── tolerance.ts   # GD&T tools
│       ├── material.ts    # Material tools
│       └── model.ts       # PMI/MBD tools
└── tests/
    └── tools/
        ├── geometry_test.ts
        ├── tolerance_test.ts
        ├── material_test.ts
        └── model_test.ts
```

### 3.3. Naming convention

Tous les tools MBE sont préfixés `mbe_` pour éviter les collisions avec `lib/std` :

- `mbe_step_parse` (pas `step_parse`)
- `mbe_gdt_parse` (pas `gdt_parse`)
- `mbe_material_lookup` (pas `material_lookup`)

---

## 4. lib/plm — Product Lifecycle Management

### 4.1. Catégories de tools

| Category | Prefix | Description | Tools (Phase 2) |
|----------|--------|-------------|-----------------|
| `bom` | `plm_` | BOM generation, flattening, costing, where-used | `plm_bom_generate`, `plm_bom_flatten`, `plm_bom_cost`, `plm_bom_where_used`, `plm_bom_compare` |
| `change` | `plm_` | ECR/ECO workflows, impact analysis, approval | `plm_ecr_create`, `plm_eco_create`, `plm_change_impact`, `plm_change_approve` |
| `quality` | `plm_` | Inspection plans, FAIR, PPAP, control plans | `plm_inspection_plan`, `plm_fair_generate`, `plm_ppap_checklist`, `plm_control_plan` |
| `planning` | `plm_` | Routing, work instructions, process plans | `plm_routing_create`, `plm_work_instruction`, `plm_process_plan`, `plm_cycle_time` |

### 4.2. Structure de fichiers

```
lib/plm/
├── deno.json              # Package config (depends on lib/mbe)
├── mod.ts                 # Public API exports
├── server.ts              # MCP server bootstrap (HTTP + stdio)
├── src/
│   ├── client.ts          # PlmToolsClient (category-aware)
│   └── tools/
│       ├── types.ts       # PlmToolCategory, PlmTool type
│       ├── common.ts      # Shared utilities (unit systems, standards refs)
│       ├── mod.ts         # Tool aggregation + exports
│       ├── bom.ts         # BOM tools
│       ├── change.ts      # ECR/ECO tools
│       ├── quality.ts     # Quality/inspection tools
│       └── planning.ts    # Planning/routing tools
└── tests/
    └── tools/
        ├── bom_test.ts
        ├── change_test.ts
        ├── quality_test.ts
        └── planning_test.ts
```

### 4.3. Dépendance sur lib/mbe

`lib/plm` peut importer des types et utilities de `lib/mbe` :

```typescript
// lib/plm/src/tools/bom.ts
import type { FeatureTree, MaterialInfo } from "@casys/mcp-mbe";

export const bomTools: MiniTool[] = [
  {
    name: "plm_bom_generate",
    description: "Generate Bill of Materials from STEP assembly with material and tolerance data",
    category: "bom",
    inputSchema: {
      type: "object",
      properties: {
        assembly_path: { type: "string", description: "Path to STEP assembly file" },
        include_materials: { type: "boolean", description: "Include material info per part" },
        costing_model: {
          type: "string",
          enum: ["raw_material", "machining", "additive", "injection"],
          description: "Cost estimation model"
        },
      },
      required: ["assembly_path"],
    },
    handler: async ({ assembly_path, include_materials, costing_model }) => {
      // Uses mbe_step_parse internally for geometry extraction
    },
  },
];
```

---

## 5. lib/syson — Bridge MCP vers SysON (MBSE)

### 5.1. Principe

`lib/syson` est un **bridge MCP** : il expose des tools MCP qui appellent l'API REST
SysML v2 de SysON. Les agents et les autres libs interagissent avec les modèles MBSE
via ces tools, sans connaître les détails de l'API SysON.

**SysON fournit l'UI** (diagrammes, navigation, édition graphique). `lib/syson` fournit
l'accès programmatique.

### 5.2. Catégories de tools

| Category | Prefix | Description | Tools |
|----------|--------|-------------|-------|
| `project` | `syson_` | CRUD projets et commits SysON | `syson_project_list`, `syson_project_create`, `syson_project_get`, `syson_commit_list` |
| `element` | `syson_` | CRUD éléments SysML v2 (parts, requirements, etc.) | `syson_element_create`, `syson_element_get`, `syson_element_update`, `syson_element_delete` |
| `query` | `syson_` | Requêtes sur le modèle (traversal, search) | `syson_query_elements`, `syson_query_relationships`, `syson_query_requirements_trace` |
| `import` | `syson_` | Import/export textuel SysML v2 | `syson_import_textual`, `syson_export_textual` |

### 5.3. Structure de fichiers

```
lib/syson/
├── deno.json              # Package config
├── mod.ts                 # Public API exports
├── server.ts              # MCP server bootstrap (HTTP + stdio)
├── src/
│   ├── client.ts          # SysonToolsClient
│   ├── api/
│   │   ├── syson-rest.ts  # Client HTTP vers SysON REST API (SysML v2)
│   │   └── types.ts       # Types SysML v2 API (Project, Commit, Element)
│   └── tools/
│       ├── types.ts       # SysonToolCategory
│       ├── mod.ts         # Tool aggregation
│       ├── project.ts     # Project/commit tools
│       ├── element.ts     # Element CRUD tools
│       ├── query.ts       # Query/traversal tools
│       └── import.ts      # Import/export tools
└── tests/
    └── tools/
        ├── project_test.ts
        ├── element_test.ts
        └── query_test.ts
```

### 5.4. Exemple de tool

```typescript
export const projectTools: MiniTool[] = [
  {
    name: "syson_project_list",
    description: "List all SysML v2 projects in SysON",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Page number (default: 0)" },
        size: { type: "number", description: "Page size (default: 20)" },
      },
    },
    handler: async ({ page, size }) => {
      const api = getSysonApi(); // configured with SYSON_URL env var
      return await api.getProjects({ page: page ?? 0, size: size ?? 20 });
    },
  },
];
```

### 5.5. Configuration

```env
SYSON_URL=http://localhost:8080    # URL de l'instance SysON (Docker)
```

Le client REST est configurable via variable d'environnement. Pas de credentials
pour l'instant (SysON community n'a pas d'auth), mais le bridge est prêt pour
ajouter un header `Authorization` quand SysON le supportera.

### 5.6. Cas d'usage cross-lib

`lib/syson` permet de connecter les données PLM au modèle système :

```
1. syson_element_create → crée parts, requirements, interfaces dans le modèle SysML v2
2. syson_query_requirements_trace → vérifie quels requirements sont couverts
3. plm_bom_generate → génère la BOM depuis le modèle SysON (via syson_query_elements)
4. plm_change_impact → trace l'impact d'un changement à travers le modèle
```

Le modèle SysON devient la **source de vérité** pour la structure produit.
Les tools PLM lisent et écrivent dans ce modèle.

---

## 6. Validation : AJV via lib/server (inchangé)

Les deux bibliothèques utilisent **AJV** (JSON Schema) via `lib/server/SchemaValidator` :

1. Les `inputSchema` sont écrits en JSON Schema standard
2. Au `registerTools()`, le `ConcurrentMCPServer` compile et cache chaque schema via AJV
3. Le middleware `createValidationMiddleware` valide chaque appel avant le handler
4. Configuration AJV : `allErrors: true`, `strict: false`, `useDefaults: true`, `coerceTypes: false`

Aucune dépendance directe sur AJV dans lib/mbe ou lib/plm — la validation est transparente via le server framework.

---

## 6. Server Bootstrap Pattern

Chaque lib expose un `server.ts` pour démarrage autonome :

```typescript
// lib/mbe/server.ts
import { ConcurrentMCPServer } from "@casys/mcp-server";
import { MbeToolsClient } from "./src/client.ts";

async function main() {
  const args = Deno.args;
  const httpFlag = args.includes("--http");
  const portArg = args.find((arg) => arg.startsWith("--port="));
  const httpPort = portArg ? parseInt(portArg.split("=")[1], 10) : 3009;

  const client = new MbeToolsClient();

  const server = new ConcurrentMCPServer({
    name: "mcp-mbe",
    version: "0.1.0",
    maxConcurrent: 10,
    backpressureStrategy: "queue",
    validateSchema: true,  // Enable AJV validation
    logger: (msg) => console.error(`[mcp-mbe] ${msg}`),
  });

  const mcpTools = client.toMCPFormat();
  const handlers = new Map();
  for (const tool of client.listTools()) {
    handlers.set(tool.name, tool.handler);
  }
  server.registerTools(mcpTools, handlers);

  if (httpFlag) {
    await server.startHttp({ port: httpPort, cors: true });
  } else {
    await server.start(); // stdio
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("[mcp-mbe] Fatal error:", error);
    Deno.exit(1);
  });
}
```

**Ports par défaut :**
- `lib/std` : 3008
- `lib/syson` : 3009
- `lib/plm` : 3010
- SysON (externe, Docker) : 8080

---

## 7. Agent Tools (MCP Sampling)

### 7.1. Principe

En plus des tools déterministes (calcul pur), chaque lib expose des **agent tools**
qui utilisent MCP Sampling pour déléguer du raisonnement à un LLM. Le pattern est
identique à `lib/std/src/tools/agent.ts` (8 tools : `agent_delegate`, `agent_analyze`,
`agent_extract`, etc.).

Les agent tools **composent** les tools déterministes : le LLM raisonne, les tools calculent.

L'infrastructure sampling existe déjà dans `lib/server` (`SamplingBridge`,
`createAgenticSamplingClient`). Les agent tools n'ont besoin que d'un `SamplingClient`
injecté au démarrage du serveur (même pattern que `lib/std/server.ts`).

### 7.2. Agent tools MBE (lib/mbe/src/tools/agent.ts)

| Tool | Description | Pourquoi sampling |
|------|-------------|-------------------|
| `mbe_agent_suggest_tolerances` | Proposer des GD&T en fonction de la fonction pièce (fit/form/function) | Raisonnement sémantique sur fonction + best practices, pas du calcul |
| `mbe_agent_material_recommend` | Recommander un matériau selon constraints multi-critères | Compromis poids/coût/résistance/environnement/usinabilité |
| `mbe_agent_design_review` | DFM/DFA review sur une géométrie parsée | Interprétation de features + règles manufacturing contextuelles |

**Exemple de composition :**

```typescript
// mbe_agent_suggest_tolerances compose mbe_step_parse + mbe_gdt_parse
// 1. Parse le modèle (déterministe) → feature tree
// 2. Envoie le feature tree au LLM via sampling
// 3. LLM raisonne sur fit/form/function et propose des GD&T
// 4. Optionnel : valide les GD&T proposées via mbe_tolerance_stack (déterministe)
```

### 7.3. Agent tools PLM (lib/plm/src/tools/agent.ts)

| Tool | Description | Pourquoi sampling |
|------|-------------|-------------------|
| `plm_agent_change_assess` | Évaluer un ECR, résumer l'impact, recommander approbation/rejet | Raisonnement impact + risque sur données structurées |
| `plm_agent_work_instruction` | Générer des instructions opérateur en langage naturel depuis routing | Génération de texte structuré, adapté au niveau opérateur |
| `plm_agent_cost_optimize` | Suggérer des pistes d'optimisation coût sur une BOM | Analyse multi-facteurs (material substitution, process change, design simplification) |

### 7.4. Structure avec agent.ts

```
lib/mbe/src/tools/
├── geometry.ts     ← déterministe (STEP, BRep, features)
├── tolerance.ts    ← déterministe (GD&T, stacking)
├── material.ts     ← déterministe (DB lookups, properties)
├── model.ts        ← déterministe (PMI, MBD)
└── agent.ts        ← sampling (compose les tools ci-dessus via pml_execute)

lib/plm/src/tools/
├── bom.ts          ← déterministe (BOM, costing)
├── change.ts       ← déterministe (ECR/ECO, impact)
├── quality.ts      ← déterministe (inspection, FAIR)
├── planning.ts     ← déterministe (routing, instructions)
└── agent.ts        ← sampling (compose les tools ci-dessus via pml_execute)
```

### 7.5. Prérequis pour les agent tools

Les agent tools ne seront implémentés **qu'après** que les tools déterministes qu'ils
composent fonctionnent. Raisons :

1. Un agent qui appelle `mbe_step_parse` a besoin que ce tool retourne des données réelles
2. Les prompts des agents dépendent du format de sortie des tools déterministes
3. Tester un agent sans données réelles ne valide rien

---

## 8. Roadmap détaillée

### Phase 0 — Scaffold (DONE ✅)

- [x] Tech spec (ce document)
- [x] `lib/mbe/` — types, client, server, deno.json, 4 fichiers de tools (15 tools stubbed)
- [x] `lib/plm/` — types, client, server, deno.json, 4 fichiers de tools (14 tools stubbed)
- [x] Import maps dans le workspace root (`@casys/mcp-mbe`, `@casys/mcp-plm`)

### Phase 1 — lib/syson : Bridge MCP vers SysON

**Étape 1.0 : Déployer SysON**
- [ ] Docker compose pour SysON (instance locale, port 8080)
- [ ] Vérifier l'accès à l'API REST SysML v2 (Swagger)
- [ ] Créer un projet de test, valider CRUD via curl/HTTP

**Étape 1.1 : Scaffold lib/syson**
- [ ] `lib/syson/` — deno.json, types, client, server
- [ ] `lib/syson/src/api/syson-rest.ts` — client HTTP vers SysON REST API
- [ ] Import map workspace : `@casys/mcp-syson`
- [ ] 4 fichiers de tools : project.ts, element.ts, query.ts, import.ts

**Étape 1.2 : Tools project + element (CRUD de base)**
- [ ] `syson_project_list`, `syson_project_create`, `syson_project_get`
- [ ] `syson_commit_list`
- [ ] `syson_element_create`, `syson_element_get`, `syson_element_update`, `syson_element_delete`
- [ ] Tests : CRUD projet + éléments contre SysON Docker

**Étape 1.3 : Tools query + import**
- [ ] `syson_query_elements` — recherche d'éléments par type/nom
- [ ] `syson_query_relationships` — traversal des relations (allocations, dependencies)
- [ ] `syson_query_requirements_trace` — traçabilité requirement → composant
- [ ] `syson_import_textual`, `syson_export_textual` — SysML v2 textual notation
- [ ] Tests : queries sur un modèle de test

### Phase 2 — lib/plm : Tools métier

**Étape 2.1 : `plm_bom_generate` (compose lib/syson)**
- [ ] Extraire hiérarchie assemblage depuis le modèle SysON (via syson_query_elements)
- [ ] Extraire quantités, part numbers, niveaux
- [ ] Format de sortie : hierarchical, flat, indented
- [ ] Tests : BOM d'un assemblage simple (5-10 pièces)

**Étape 2.2 : `plm_bom_cost` + `plm_bom_flatten`**
- [ ] Modèles de costing : raw_material (volume × prix/kg), machining (feature-based)
- [ ] Flatten : aggrégation des quantités sur tous les niveaux

**Étape 2.3 : Change management + Quality**
- [ ] `plm_ecr_create`, `plm_eco_create`, `plm_change_impact`
- [ ] `plm_inspection_plan`, `plm_fair_generate`, `plm_control_plan`

**Étape 2.4 : Planning**
- [ ] `plm_routing_create`, `plm_work_instruction`, `plm_cycle_time`

### Phase 3 — Agent tools (MCP Sampling)

**Prérequis :** Phases 1 et 2 complétées et testées.

- [ ] `lib/syson/src/tools/agent.ts` — `syson_agent_architecture_suggest`, `syson_agent_requirements_analyze`
- [ ] `lib/plm/src/tools/agent.ts` — `plm_agent_change_assess`, `plm_agent_work_instruction`, `plm_agent_cost_optimize`
- [ ] Injection du `SamplingClient` dans les servers SysON/PLM (pattern identique à lib/std)
- [ ] Tests avec mocks de sampling (pas de LLM réel dans les tests unitaires)

### Phase 4 — Intégration Gateway + Discovery

- [ ] Enregistrer les tools PLM/SysON dans le discovery engine (GraphRAG)
- [ ] Générer embeddings BGE-M3 pour les 25+ tools domaine
- [ ] DAG suggestions pour workflows cross-lib (std + plm + syson)
- [ ] Capabilities auto-capture pour les patterns métier récurrents

### Phase future — Extensions

**lib/mbe (si besoin d'import CAD) :**
- [ ] STEP/IGES parsing via opencascade.js (WASM) dans Deno
- [ ] GD&T, tolerance stacking, material database
- [ ] Import de données CAD dans le modèle SysON

**Odoo/LibrePLM (si besoin de production) :**
- [ ] Déployer Odoo (Docker) avec modules Manufacturing + PLM + Quality
- [ ] Bridge `lib/plm` → API Odoo pour les données de production
- [ ] Sync SysON → Odoo : pousser les structures produit validées en production

---

## 9. Decisions

| # | Decision | Choice | Rationale | Date |
|---|----------|--------|-----------|------|
| 1 | Validation | AJV via lib/server | Cohérent avec lib/std, JSON Schema standard | 2026-02-15 |
| 2 | Naming | `mbe_` / `plm_` prefix | Évite collisions, discovery claire | 2026-02-15 |
| 3 | Categories | Separate type unions | Extensible indépendamment de lib/std | 2026-02-15 |
| 4 | Server ports | 3009 / 3010 | Suite logique après lib/std (3008) | 2026-02-15 |
| 5 | Dependency | plm → server, syson → server | Pas de dépendance sur std. plm consomme syson via cross-lib | 2026-02-15 |
| 6 | lib/mbe | Reporté à phase future | Pas nécessaire pour le MVP MBSE/PLM. SysON couvre la modélisation, pas besoin de parsing CAD | 2026-02-15 |
| 7 | Agent tools | Dans chaque lib (agent.ts) | Même pattern que lib/std, les agents composent les tools de leur domaine | 2026-02-15 |
| 8 | Agent timing | Après tools déterministes | Les agents composent les tools — il faut que ceux-ci marchent d'abord | 2026-02-15 |
| 9 | Protocol features | Exploiter elicitation + prompts + resources | Pas seulement tools+sampling — le protocole MCP offre d'autres primitives pertinentes | 2026-02-15 |
| 10 | MBSE backend | SysON (Docker, SysML v2, REST API) | Web-based, pas d'UI à construire, API standardisée OMG, interop Capella | 2026-02-15 |
| 11 | PLM backend (future) | Odoo/LibrePLM (quand production nécessaire) | Open-source, API complète, modules PLM/Manufacturing/Quality existants | 2026-02-15 |
| 12 | Client strategy | SysON = UI MBSE, pas d'UI custom | On ne reconstruit pas d'UI — SysON fournit les diagrammes, PML Desktop pour le graph MCP | 2026-02-15 |

---

## 10. MCP Protocol Features — Matrice de compatibilité

### 10.1. Features du protocole MCP (spec 2025-11-25)

Le protocole MCP ne se limite pas à tools + sampling. Voici l'inventaire complet des
features et leur pertinence pour MBE/PLM :

| Feature | Direction | Spec | Status lib/server | Claude Code | Pertinence MBE/PLM |
|---------|-----------|------|-------------------|-------------|---------------------|
| **Tools** | Server → Client | Stable | ✅ Implémenté | ✅ Supporté | Core — tous les tools MBE/PLM |
| **Resources** | Server → Client | Stable (SEP-1865) | ✅ Implémenté | ✅ Supporté | Material DB, STEP metadata, BOM trees |
| **Prompts** | Server → Client | Stable | ⚠️ Types importés, handler absent | ✅ Supporté | Workflows pré-définis (Design Review, ECR) |
| **Sampling** | Client ← Server | Stable (SEP-1577) | ✅ Implémenté | ✅ Natif | Agent tools (raisonnement LLM) |
| **Elicitation (form)** | Client ← Server | Stable (2025-06-18) | ❌ À implémenter | ⚠️ Non garanti | Collecte de paramètres interactifs |
| **Elicitation (URL)** | Client ← Server | Stable (2025-11-25) | ❌ À implémenter | ⚠️ Non garanti — MCP Apps UI en alternative | OAuth / interactions sensibles |
| **Roots** | Client ← Server | Stable | ❌ Pas implémenté | ✅ Supporté | Limiter le scope filesystem des tools |
| **Completions** | Server → Client | Stable | ❌ Pas implémenté | ❌ Inconnu | Auto-complétion de paramètres tools |
| **Logging** | Server → Client | Stable | ⚠️ Partiel (console) | ✅ Supporté | Debug et traçabilité des tools |
| **Tasks** | Server → Client | Expérimental (2025-11-25) | ❌ Pas implémenté | ❌ Probablement pas | Long-running ops (gros STEP, Monte Carlo) |
| **Notifications** | Bidirectionnel | Stable | ✅ Implémenté | ✅ Supporté | Progress updates, changements d'état |

### 10.2. Elicitation — Cas d'usage MBE/PLM

L'elicitation (form mode) permet au **serveur** de demander des informations à
l'**utilisateur** pendant l'exécution d'un tool. C'est un `elicitation/create` avec un
`requestedSchema` en JSON Schema (types primitifs uniquement : string, number, boolean, enum).

**Cas concrets dans lib/mbe :**

| Quand | Elicitation | Schema |
|-------|-------------|--------|
| `mbe_agent_suggest_tolerances` | "Quelle est la fonction de cette pièce ?" | `{ function: enum["fit", "clearance", "press_fit", "sealing"], criticality: enum["safety", "functional", "cosmetic"] }` |
| `mbe_agent_material_recommend` | "Quelles sont vos contraintes ?" | `{ max_weight_kg: number, max_cost_eur_kg: number, environment: enum["indoor", "marine", "aerospace", "automotive"], weldable: boolean }` |
| `mbe_mass_properties` | "Quel matériau pour le calcul de masse ?" | `{ material: string, density_override: number }` |

**Cas concrets dans lib/plm :**

| Quand | Elicitation | Schema |
|-------|-------------|--------|
| `plm_ecr_create` | "Détails de la demande de changement" | `{ reason: enum["defect", "cost_reduction", ...], priority: enum["critical", "high", "medium", "low"] }` |
| `plm_bom_cost` | "Paramètres de costing" | `{ costing_model: enum["raw_material", "machining", ...], quantity: number, currency: enum["EUR", "USD"] }` |
| `plm_change_impact` | "Confirmer le périmètre d'analyse" | `{ include_cost: boolean, include_schedule: boolean, include_suppliers: boolean }` |

**Contraintes importantes :**
- Schema limité aux types primitifs (pas d'objets imbriqués)
- L'utilisateur peut **decline** ou **cancel** → le tool doit gérer ces cas (fail-fast)
- Claude Code : compatibilité non garantie — **on implémente quand même** dans lib/server
  et on construit notre propre client si nécessaire. On ne sacrifie pas la fonctionnalité.

**Alternative à l'URL mode : MCP Apps (UI Resources)**

Pour les cas où l'URL mode elicitation serait overkill ou non supporté par le client,
les **MCP Apps** (SEP-1865, déjà implémenté dans lib/server) offrent une alternative :

- On expose une resource `ui://mcp-mbe/material-selector` avec une UI interactive HTML
- Le tool associe `_meta.ui.resourceUri` à cette resource
- Le client affiche l'UI et l'utilisateur interagit directement
- Plus riche que l'elicitation form (pas limité aux types primitifs)
- Déjà supporté dans lib/server via `registerResource()` + CSP injection

Exemples de resources UI pour MBE/PLM :

| Resource URI | UI | Usage |
|-------------|-----|-------|
| `ui://mcp-mbe/material-selector` | Filtrable material picker | `mbe_material_lookup` |
| `ui://mcp-mbe/tolerance-viewer` | GD&T frame visualizer | `mbe_gdt_parse` |
| `ui://mcp-plm/bom-tree` | Expandable BOM hierarchy | `plm_bom_generate` |
| `ui://mcp-plm/change-workflow` | ECR/ECO status tracker | `plm_ecr_create` |

**Stratégie : elicitation form pour les inputs simples, MCP Apps UI pour les interactions riches.**

### 10.3. Prompts — Workflows pré-définis

Les prompts MCP permettent au serveur d'exposer des **templates de workflows** que le
client peut lister et proposer à l'utilisateur (comme des slash commands).

**Exemples pour MBE/PLM :**

```
prompts/list → [
  { name: "mbe_design_review",   description: "Full DFM/DFA review of a CAD model" },
  { name: "plm_new_part",        description: "Create new part with material, tolerances, BOM entry" },
  { name: "plm_change_request",  description: "Initiate ECR → ECO workflow" },
  { name: "plm_inspection_setup", description: "Generate FAIR + inspection plan from model" },
]
```

Chaque prompt retourne un template de messages pré-remplis que le LLM peut exécuter.
C'est un raccourci pour des workflows multi-tools complexes.

**Status lib/server :** Les types sont importés (`GetPromptRequest`) mais le handler
n'est pas câblé dans `ConcurrentMCPServer`. À implémenter dans lib/server d'abord.

### 10.4. Resources — Données navigables

Les resources MCP permettent d'exposer des **données structurées** que le client peut
lister et lire (comme un filesystem virtuel).

**Exemples pour MBE/PLM :**

| Resource URI | Description |
|-------------|-------------|
| `mbe://materials/AL6061-T6` | Fiche matériau complète |
| `mbe://materials?category=aluminum` | Liste des aluminiums disponibles |
| `mbe://step/{file_hash}/features` | Feature tree d'un fichier STEP parsé |
| `plm://bom/{assembly_id}` | BOM navigable d'un assemblage |
| `plm://changes/pending` | ECR/ECO en attente d'approbation |

Les resources sont déjà supportées dans lib/server (`registerResource()`). Le pattern
MCP Apps (SEP-1865) permet aussi d'associer des UI interactives aux resources.

### 10.5. Tasks — Opérations long-running (expérimental)

Le feature "Tasks" (2025-11-25, expérimental) permettrait de gérer des opérations qui
prennent plus de quelques secondes :

- Parsing d'un gros fichier STEP (>100 MB)
- Simulation Monte Carlo (10000+ itérations)
- BOM costing avec appels API externes

**Status :** Expérimental, probablement pas supporté par Claude Code. À surveiller pour
une adoption future. En attendant, on utilise les `notifications` pour le progress tracking.

### 10.6. Plan d'implémentation des features protocole

| Priorité | Feature | Où | Pré-requis | Phase |
|----------|---------|----|----|-------|
| **P0** | Tools | lib/mbe, lib/plm, lib/syson | — | Phase 0 (DONE mbe/plm), Phase 1 (syson) |
| **P0** | SysON bridge | lib/syson | SysON Docker déployé | Phase 1 |
| **P1** | Sampling (agent tools) | lib/mbe, lib/plm | Tools déterministes | Phase 4 |
| **P2** | Resources (material DB, BOM, SysML models) | lib/mbe, lib/plm, lib/syson | Tools implémentés | Phase 5 |
| **P3** | Elicitation (form mode) | lib/server d'abord | Handler `elicitation/create` dans ConcurrentMCPServer | Phase 4-5 |
| **P3** | Prompts (workflow templates) | lib/server d'abord | Handler `prompts/list` + `prompts/get` | Phase 5 |
| **P4** | Odoo bridge | lib/plm | Odoo Docker déployé | Phase 6 (future) |
| **P5** | Tasks | lib/server | Spec stabilisée | Future |

**Note importante :** L'implémentation de l'elicitation et des prompts nécessite d'abord
un travail dans `lib/server/src/concurrent-server.ts` pour câbler les handlers MCP
correspondants. Ce n'est pas spécifique à MBE/PLM — c'est un enrichissement du framework
serveur qui bénéficie à toutes les libs (std, mbe, plm).

**Position sur la compatibilité client :** SysON fournit l'UI MBSE (diagrammes SysML v2,
navigation modèle). Pour l'interaction MCP, on utilise Claude Code, PML Desktop, ou le
dashboard web existant. Pas d'UI custom à construire.

---

## 11. Backend MBSE : SysON

### 11.1. Pourquoi SysON

On ne reconstruit pas d'UI MBSE/PLM. **SysON** est un outil MBSE open-source web-based
qui fournit l'UI intégrée (diagrammes SysML v2, navigation, édition).

- **Web-based** — tourne dans le browser, pas d'install client
- **Docker** — `docker compose up`, DB incluse, prêt en 5 min
- **SysML v2** — standard OMG, notation textuelle machine-readable
- **API REST standardisée** — CRUD projets, commits, éléments, Swagger inclus
- **Diagrammes inclus** — General View, Interconnection View, etc.
- **Interop Capella** — migration possible vers Capella si besoin enterprise
- **Open-source** (Eclipse Public License)

### 11.2. Architecture SysON ↔ MCP

```
┌───────────────────────────────────────────────────┐
│              Utilisateur                           │
│  ┌─────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ SysON UI    │  │ Claude Code│  │ PML Desktop│ │
│  │ (browser)   │  │ (terminal) │  │ (Tauri)    │ │
│  │ diagrammes  │  │ MCP client │  │ MCP client │ │
│  └──────┬──────┘  └─────┬──────┘  └─────┬──────┘ │
└─────────┼───────────────┼────────────────┼────────┘
          │               │                │
          │ direct    ┌───▼────────────────▼──────┐
          │           │       MCP Gateway          │
          │           ├───────┬───────┬──────┤
          │           │lib/std│lib/  │lib/  │
          │           │       │plm   │syson │
          │           └───────┴──────┴──┬───┘
          │                                   │
          │          REST API (SysML v2)       │
          └──────────────►┌───────────┐◄──────┘
                          │   SysON   │
                          │  (Docker) │
                          │  :8080    │
                          └───────────┘
```

**Deux chemins vers SysON :**
1. **Direct** — l'utilisateur navigue dans SysON UI pour voir/éditer les diagrammes
2. **Via MCP** — les agents et tools lisent/écrivent dans SysON via `lib/syson`

### 11.3. PLM backend futur : Odoo (Phase 2)

Quand le besoin de production/fabrication se concrétise, on ajoute **Odoo/LibrePLM**
comme backend PLM. `lib/plm` bridge alors vers l'API Odoo :

- BOM réelles → module Manufacturing Odoo
- ECR/ECO → module PLM Odoo
- Qualité → module Quality Odoo
- Achats, stock → modules Odoo natifs

Le modèle SysON reste la source de vérité pour la conception (requirements, architecture).
Odoo gère la production. Les MCP tools font le pont.

### 11.4. Ce que ça change

**Pas d'UI custom à construire.** SysON = UI MBSE. Odoo (futur) = UI PLM.
Les MCP tools = couche d'intelligence et d'automatisation par-dessus.

---

## 12. OpenCASCADE (OCCT) — Explications

### 12.1. C'est quoi ?

**OpenCASCADE Technology (OCCT)** est une bibliothèque C++ open-source pour la modélisation
3D CAD. C'est le **standard industriel open-source** pour manipuler des géométries CAD :

- **STEP parser** — lit les fichiers `.stp`/`.step` (formats ISO 10303 AP203/AP214/AP242)
- **IGES parser** — lit les fichiers `.igs`/`.iges` (ancien format, encore très utilisé)
- **BRep kernel** — Boundary Representation : surfaces, courbes, topologie solide
- **Feature extraction** — faces, edges, vertices, volumes, centres de masse
- **Boolean operations** — union, soustraction, intersection de solides
- **Tolerance data** — accès aux GD&T et PMI intégrés dans les fichiers STEP AP242

C'est la brique qui permet à `mbe_step_parse` de lire un fichier STEP et d'en extraire
la géométrie structurée (feature tree, topologie, matériaux, tolerances).

### 12.2. Qui l'utilise ?

- **FreeCAD** — son noyau CAD est OCCT
- **KiCAD** — utilise OCCT pour le 3D des PCBs
- **Open Cascade SAS** — l'entreprise française qui maintient le projet (basée à Guyancourt)
- **Dassault Systèmes** — historiquement lié à OCCT (ancêtre de CAS.CADE)
- Des centaines de logiciels CAD industriels (aéro, auto, naval)

### 12.3. Alternatives à OCCT pour le STEP parsing

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| **OCCT via Deno FFI** | Standard industriel, lecture complète STEP/IGES, BRep natif | C++ lourd à compiler, bindings FFI à écrire |
| **opencascade.js (WASM)** | Plus simple à intégrer, tourne dans Deno directement | Moins performant (WASM overhead), limité en accès fichier |
| **STEP parser custom (TypeScript)** | Zero dépendance native, tout en Deno | Énorme effort, STEP est un format très complexe (ISO 10303) |
| **pythonocc + subprocess** | OCCT en Python, plus accessible | Dépendance Python, overhead subprocess |

### 12.4. Décision

**OCCT côté serveur (Deno).** Le parsing STEP est une responsabilité serveur pour rester
**client-agnostique**. Les données extraites alimentent le modèle SysON via `lib/syson`.

Approche retenue :

1. **Phase 1 : opencascade.js (WASM) dans Deno** — plus simple à intégrer que FFI natif.
   Pas de compilation C++, pas de `.so` à gérer. Import WASM directement dans Deno.
   Suffisant pour les cas courants (pièces simples, assemblages modestes).

2. **Phase future (si besoin) : OCCT natif via Deno FFI** — si les perfs WASM ne suffisent
   pas pour les gros fichiers (>50 MB), on migre vers les bindings natifs.

Le parsing côté client est exclu — le client (SysON, Claude Code, PML Desktop) consomme
les résultats, il ne parse pas.

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SysON "not yet intended for production use" | Instabilité, breaking changes API | Utiliser pour prototypage, suivre les releases (cycle 8 semaines), migrer vers Capella si besoin enterprise |
| SysON API change entre versions | Casse lib/syson | Abstraire l'API dans `syson-rest.ts`, adapter au même endroit si breaking change |
| Sampling non disponible en mode standalone | Limite Phase 3 | Les agent tools dégradent gracieusement (throw si pas de SamplingClient) — fail-fast policy |
| Deux backends (SysON + Odoo futur) = complexité sync | Données dupliquées ou incohérentes | SysON = source de vérité conception, Odoo = production. Bridge unidirectionnel SysON → Odoo |
