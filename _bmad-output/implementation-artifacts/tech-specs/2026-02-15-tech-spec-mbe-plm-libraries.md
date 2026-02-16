# Tech Spec: lib/syson & lib/plm — MCP Tool Libraries for MBSE & PLM

**Date:** 2026-02-15
**Status:** Implementation Complete (Phase 2.3-2.5)
**Author:** Casys AI

---

## 1. Context & Vision

### 1.1. L'objectif : générer des produits d'ingénierie, pas des workflows

Casys PML Cloud dispose d'une infrastructure MCP mature :

- **lib/std** — 461+ tools (system, data, agent, etc.)
- **lib/server** — `ConcurrentMCPServer` avec AJV validation, middleware pipeline, auth, rate limiting
- **DAG engine** — exécution parallèle, checkpoints, sandbox
- **Discovery** — GraphRAG + BGE-M3 embeddings, semantic search

L'objectif n'est pas de construire un "wrapper API" autour de SysON. **L'objectif est de
permettre à un ingénieur de décrire ce qu'il veut et de générer un produit d'ingénierie
complet** : modèle SysML v2 + BOM + estimation coût + plan qualité — en 5 minutes au lieu
de 2 semaines.

PML ne crée pas des workflows chiants. **PML génère des produits composites** en orchestrant
intelligemment les outils MBSE et PLM. La différence est fondamentale :

```
Workflow chiant :                              Produit d'ingénierie :
"Étape 1: créer projet"                       "Crée le modèle satellite depuis ce cahier des charges"
"Étape 2: créer package"                              ↓
"Étape 3: créer part"                         PML compile un DAG de 50+ opérations :
"Étape 4: créer requirement"                    ├── syson_project_create
  ... x50 étapes manuelles                     ├── syson_element_create × 30 (en parallèle)
                                                ├── syson_query_aql (vérification traçabilité)
                                                ├── plm_bom_generate (BOM depuis modèle)
                                                ├── plm_bom_cost (estimation coût)
                                                └── plm_inspection_plan (plan qualité)
                                                       ↓
                                                Résultat : produit d'ingénierie complet en 5 min
```

### 1.2. Ce que PML apporte que SysON seul ne fait pas

PML n'est **pas** un outil MBSE (SysON l'est), **pas** un PLM (Odoo l'est), **pas** une UI de diagrammes (SysON l'est).

PML est la **couche d'orchestration intelligente** entre ces outils — le "cerveau" qui sait
comment les combiner, dans quel ordre, avec quelle optimisation, et qui apprend en continu.

**5 valeurs uniques :**

1. **Compilation cross-domaine** — Un intent traverse SysON (architecture) → PLM (BOM, costing) → qualité → rapport. PML compile cette chaîne en DAG déterministe. Aucun autre outil ne fait ça.

2. **Parallélisation automatique** — PML analyse les dépendances et exécute en parallèle (Layer 0: packages, Layer 1: parts, Layer 2: relations). 3-5x plus rapide qu'un script séquentiel.

3. **Mémoire procédurale** — Après 10 exécutions similaires, le workflow est compilé (warm → hot). Zéro LLM, exécution instantanée. L'expertise du senior est capitalisée en artefact réutilisable.

4. **Traçabilité DAG 7D** — Chaque exécution est tracée : tools appelés, timing par noeud, dépendances causales, checkpoints HIL. Audit/compliance (DO-178C, ISO 26262, EN 9100), debug, optimisation.

5. **Orchestration distribuée** (vision long terme) — Un seul `pml_execute` traverse les frontières organisationnelles (SysON chez l'équipe système, Odoo chez la production, plans qualité chez le sous-traitant).

**Analogie :** SysON est le compilateur C. Odoo est le linker. PML est le build system (Make/CMake) qui orchestre, gère les dépendances, parallélise, cache les artefacts, et apprend les patterns récurrents.

### 1.3. Stratégie : showcase d'abord, vertical ensuite

**Phase Showcase (maintenant → +3 mois) :**
- lib/syson + lib/plm = démo technique impressionnante
- **Le wow moment** : "Donne-moi un cahier des charges satellite, PML construit le modèle SysML v2, génère la BOM, estime le coût, et crée le plan qualité. 5 minutes."
- Objectif : **crédibilité technique**, pas revenue
- Public cible : conférences (INCOSE, Eclipse Con), blog technique, vidéo LinkedIn, repo open-source lib/syson
- Visuellement puissant : on voit le modèle se construire dans SysON UI en temps réel

**Phase Vertical (si traction → +6-12 mois) :**
- Packaging : PML for MBSE/PLM
- Pricing tiered : PME 29-99€/mois, ETI 500-2000€/mois, consulting OEM 200-500€/consultant
- Features : prompts pré-configurés (`syson_new_system`, `plm_change_request`), onboarding assisté
- Go-to-market : partenariats avec cabinets consulting MBSE (Sopra Steria, Capgemini Engineering)
- Signal de pivot : si 0 intérêt après 3 mois → lib/syson/plm reste dans le portfolio démo, focus horizontal

### 1.4. Stratégie open-source : lib/syson ouvert, PML engine propriétaire

```
Open source (lib/syson) :                    Propriétaire (PML) :
├── Client GraphQL SysON                     ├── DAG compilation
├── MCP tools (syson_*)                      ├── SHGAT+GRU routing
├── Types SysML v2                           ├── 7D tracing
├── Tests                                    ├── Mémoire procédurale
└── Documentation                            ├── Sandbox executor
                                             ├── Gateway
                                             └── Cloud dashboard
```

**Repo séparé :** `Casys-AI/mcp-syson` — Licence MIT ou Apache 2.0.

**Pourquoi :** Le bridge GraphQL est trivial (~30 LOC). N'importe qui peut le réécrire. La valeur est dans ce que PML fait AVEC ces tools. Open-source le bridge = adoption communauté SysON (on devient le "Prisma pour SysON") + funnel open-core (dev essaie lib/syson → découvre PML → adopte PML). Les industriels (aéro, défense) veulent pouvoir auditer ce qui parle à leur SysON.

### 1.5. Le flywheel

```
Plus de workflows exécutés
  → Plus de traces (mémoire procédurale)
    → Meilleur routing ML (SHGAT apprend les patterns MBSE)
      → Plus de workflows compilés (warm/hot = 0 LLM)
        → Coût réduit, vitesse augmentée
          → Plus d'utilisateurs
            → Plus de workflows exécutés (boucle)
```

Les données d'entraînement MBSE/PLM sont rares et précieuses. Qui les a = moat.

### 1.6. Scope technique

| Library | Scope | Rôle | Phase |
|---------|-------|------|-------|
| **lib/syson** | MBSE (SysON bridge) | Bridge MCP vers l'API GraphQL de SysON (Sirius Web) | **Phase 1 (MVP)** |
| **lib/plm** | Product Lifecycle Management | BOM, ECR/ECO, qualité, planning | Phase 2 |
| ~~lib/mbe~~ | ~~Model-Based Engineering~~ | ~~Primitives géométriques, GD&T, matériaux, PMI~~ | Future (si besoin CAD) |

**Architecture globale :** SysON (open-source, web-based, Docker) sert de **backend MBSE** avec
son UI intégrée (diagrammes SysML v2, requirements, architecture). `lib/syson` est le bridge
MCP qui permet aux agents et à lib/plm d'interagir avec les modèles SysON via son **API GraphQL**
(Sirius Web). **Pas d'UI custom à construire** — SysON fournit l'UI et les diagrammes.

**Décision clé : client GraphQL custom, zéro dépendance externe.** Le schéma GraphQL de
Sirius Web est entièrement documenté dans les fichiers `.graphqls` du repo. On code le client
nous-mêmes en TypeScript/Deno — c'est du simple `fetch()` + JSON. Pas de SDK tiers, pas de
générateur de code, pas de dépendance fragile. On maîtrise tout.

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
                 │ GraphQL API (/api/graphql)
                 │ + REST API (/api/rest/) fallback
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

`lib/syson` communique avec SysON (instance Docker) via **GraphQL API** — pas d'import direct.
Le client GraphQL est **codé from scratch** en TypeScript (simple `fetch` + JSON, zéro deps).
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

## 5. lib/syson — Bridge MCP vers SysON (MBSE) via GraphQL

### 5.1. Principe

`lib/syson` est un **bridge MCP** : il expose des tools MCP qui appellent l'**API GraphQL**
de SysON (Sirius Web). Les agents et les autres libs interagissent avec les modèles MBSE
via ces tools, sans connaître les détails de l'API SysON.

**SysON fournit l'UI** (diagrammes, navigation, édition graphique). `lib/syson` fournit
l'accès programmatique.

**Pourquoi GraphQL et pas REST :**
- L'API REST SysML v2 (`/api/rest/`) est un sous-ensemble limité (CRUD basique, read-only sur éléments)
- L'API GraphQL (`/api/graphql`) est l'API **complète** utilisée par le frontend SysON lui-même
- GraphQL offre `evaluateExpression` (mutation AQL dynamique) — le killer feature. Note : `queryBasedObjects` / `queryBasedString` (queries AQL read-only) **retournent null** dans la version actuelle de SysON (cf. §13.3)
- GraphQL offre les mutations CRUD complètes (create, rename via AQL, delete), le search, l'insertion de SysML v2 textuel
- Zéro dépendance : c'est du `fetch()` + JSON, on code le client nous-mêmes

### 5.2. Architecture du client GraphQL

```
lib/syson/src/api/
├── graphql-client.ts     # Client HTTP GraphQL (fetch, retry, error handling)
├── queries.ts            # Toutes les queries GraphQL (strings)
├── mutations.ts          # Toutes les mutations GraphQL (strings)
└── types.ts              # Types TS pour les réponses GraphQL
```

**Le client est trivial :**

```typescript
// lib/syson/src/api/graphql-client.ts
export class SysonGraphQLClient {
  constructor(
    private baseUrl: string = Deno.env.get("SYSON_URL") || "http://localhost:8080",
  ) {}

  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(`[lib/syson] GraphQL HTTP error: ${response.status} ${await response.text()}`);
    }
    const result = await response.json();
    if (result.errors?.length) {
      throw new Error(`[lib/syson] GraphQL error: ${result.errors.map((e: any) => e.message).join(", ")}`);
    }
    return result.data as T;
  }

  async mutate<T>(mutation: string, variables?: Record<string, unknown>): Promise<T> {
    return this.query<T>(mutation, variables);
  }
}
```

**Zéro deps externes.** Le client est ~30 lignes de code. Les queries/mutations sont des
strings template, typées en sortie par les interfaces dans `types.ts`.

### 5.3. API GraphQL de référence (Sirius Web)

SysON est construit sur Sirius Web. Le schéma GraphQL est distribué dans les fichiers
`.graphqls` du repo `eclipse-sirius/sirius-web`. Voici les opérations qu'on utilise.

#### 5.3.1. Concepts clés

- **`editingContextId`** : identifiant du contexte d'édition = **project ID** (obtenu via `project.currentEditingContext.id`)
- **`id` dans chaque mutation** : UUID client-generated pour corréler request/response. On génère avec `crypto.randomUUID()`
- **Workflow de création** : `createProject` → `createDocument` (avec stereotype) → `createRootObject` → `createChild` (récursif)
- **`evaluateExpression`** (mutation) : exécute des expressions AQL (Acceleo Query Language) sur n'importe quel objet — c'est comme un REPL. **Remplace** `queryBasedObjects` qui retourne null (cf. §13.3)

#### 5.3.2. Queries

**Lister les projets :**
```graphql
query ListProjects($after: String, $first: Int, $filter: ProjectFilter) {
  viewer {
    projects(after: $after, first: $first, filter: $filter) {
      edges { node { id name natures { name } } cursor }
      pageInfo { count hasNextPage endCursor }
    }
  }
}
# filter: { name: { contains: "..." } }
```

**Obtenir un projet + editing context :**
```graphql
query GetProject($projectId: ID!) {
  viewer {
    project(projectId: $projectId) {
      id name
      natures { name }
      currentEditingContext { id }
    }
  }
}
```

**Lire un objet :**
```graphql
query GetObject($editingContextId: ID!, $objectId: ID!) {
  viewer {
    editingContext(editingContextId: $editingContextId) {
      object(objectId: $objectId) { id kind label iconURLs }
    }
  }
}
```

**Requête AQL dynamique (le killer feature) :**
```graphql
query QueryAQL($editingContextId: ID!, $objectId: ID!, $query: String!) {
  viewer {
    editingContext(editingContextId: $editingContextId) {
      object(objectId: $objectId) {
        id label
        queryBasedString(query: $query)     # pour les attributs string
        queryBasedObjects(query: $query) {  # pour les collections d'objets
          id kind label iconURLs
        }
      }
    }
  }
}
# Exemples AQL :
# "aql:self.ownedElement"          → enfants directs
# "aql:self.eAllContents()"        → tous les descendants
# "aql:self.name"                  → nom de l'élément
# "aql:self.oclIsKindOf(sysml::PartUsage)" → filtrage par type
```

**Recherche full-text :**
```graphql
query SearchElements($editingContextId: ID!, $query: SearchQuery!) {
  viewer {
    editingContext(editingContextId: $editingContextId) {
      search(query: $query) {
        ... on SearchSuccessPayload {
          result { matches { id kind label iconURLs } }
        }
      }
    }
  }
}
# SearchQuery: { text, matchCase, matchWholeWord, useRegularExpression, searchInAttributes, searchInLibraries }
```

**Lister les descriptions de création enfants (pour savoir quels types on peut créer) :**
```graphql
query GetChildCreationDescriptions($editingContextId: ID!, $containerId: ID!) {
  viewer {
    editingContext(editingContextId: $editingContextId) {
      childCreationDescriptions(containerId: $containerId) {
        id label iconURL
      }
    }
  }
}
# Retourne : "New PartUsage", "New RequirementUsage", "New Package", etc.
```

**Lister les stéréotypes (pour créer un document/modèle) :**
```graphql
query GetStereotypes($editingContextId: ID!) {
  viewer {
    editingContext(editingContextId: $editingContextId) {
      stereotypes { edges { node { id label } } }
    }
  }
}
```

#### 5.3.3. Mutations

**Créer un projet :**
```graphql
mutation CreateProject($input: CreateProjectInput!) {
  createProject(input: $input) {
    ... on CreateProjectSuccessPayload { id project { id name } }
    ... on ErrorPayload { id message }
  }
}
# input: { id: UUID, name: String!, templateId: ID!, libraryIds: [String!]! }
```

**Créer un document (modèle SysML) :**
```graphql
mutation CreateDocument($input: CreateDocumentInput!) {
  createDocument(input: $input) {
    ... on CreateDocumentSuccessPayload { id document { id name kind } }
    ... on ErrorPayload { id message }
  }
}
# input: { id: UUID, editingContextId: ID!, stereotypeId: ID!, name: String! }
```

**Créer un root object (Package racine) :**
```graphql
mutation CreateRootObject($input: CreateRootObjectInput!) {
  createRootObject(input: $input) {
    ... on CreateRootObjectSuccessPayload { id object { id kind label } }
    ... on ErrorPayload { id message }
  }
}
# input: { id: UUID, editingContextId, documentId, domainId: "sysml", rootObjectCreationDescriptionId }
```

**Créer un enfant (PartUsage, RequirementUsage, etc.) :**
```graphql
mutation CreateChild($input: CreateChildInput!) {
  createChild(input: $input) {
    ... on CreateChildSuccessPayload { id object { id kind label } messages { body level } }
    ... on ErrorPayload { id message }
  }
}
# input: { id: UUID, editingContextId, objectId: parentId, childCreationDescriptionId }
```

**Renommer un élément :**
```graphql
mutation RenameTreeItem($input: RenameTreeItemInput!) {
  renameTreeItem(input: $input) {
    ... on SuccessPayload { id }
    ... on ErrorPayload { id message }
  }
}
# input: { id: UUID, editingContextId, representationId, treeItemId, newLabel }
```

**Supprimer un élément :**
```graphql
mutation DeleteTreeItem($input: DeleteTreeItemInput!) {
  deleteTreeItem(input: $input) {
    ... on SuccessPayload { id }
    ... on ErrorPayload { id message }
  }
}
# input: { id: UUID, editingContextId, representationId, treeItemId }
```

**Éditer une propriété texte (via form/property sheet) :**
```graphql
mutation EditTextfield($input: EditTextfieldInput!) {
  editTextfield(input: $input) {
    ... on SuccessPayload { id }
    ... on ErrorPayload { id message }
  }
}
# input: { id: UUID, editingContextId, representationId, textfieldId, newValue }
```

**Évaluer une expression AQL (mutation) :**
```graphql
mutation EvaluateExpression($input: EvaluateExpressionInput!) {
  evaluateExpression(input: $input) {
    ... on EvaluateExpressionSuccessPayload {
      result {
        ... on ObjectExpressionResult { value { id kind label } }
        ... on ObjectsExpressionResult { value { id kind label } }
        ... on StringExpressionResult { value }
        ... on BooleanExpressionResult { value }
        ... on IntExpressionResult { value }
      }
    }
  }
}
# input: { id: UUID, editingContextId, expression: "aql:...", selectedObjectIds: [ID!]! }
```

**Supprimer un projet :**
```graphql
mutation DeleteProject($input: DeleteProjectInput!) {
  deleteProject(input: $input) {
    ... on SuccessPayload { id }
    ... on ErrorPayload { id message }
  }
}
# input: { id: UUID, projectId }
```

**Créer une représentation (diagramme, table) :**
```graphql
mutation CreateRepresentation($input: CreateRepresentationInput!) {
  createRepresentation(input: $input) {
    ... on CreateRepresentationSuccessPayload { id representation { id label kind } }
    ... on ErrorPayload { id message }
  }
}
# input: { id: UUID, editingContextId, objectId, representationDescriptionId, representationName }
```

#### 5.3.4. Workflow typique de création d'un modèle SysML

```
1. createProject(name: "Satellite-v2", templateId, libraryIds: [])
   → project.id = editingContextId

2. getStereotypes(editingContextId) → trouver le stereotype "SysML v2"
   createDocument(editingContextId, stereotypeId, name: "Model")
   → document.id

3. getDomains(editingContextId) → domainId = "sysml"
   getRootObjectCreationDescriptions(editingContextId, domainId)
   → trouver "Package"
   createRootObject(editingContextId, documentId, domainId, descriptionId)
   → rootPackage.id

4. getChildCreationDescriptions(editingContextId, rootPackage.id)
   → "New PartUsage", "New RequirementUsage", "New Package", etc.
   createChild(editingContextId, parentId, childCreationDescriptionId)
   → element.id

5. renameTreeItem(editingContextId, representationId, element.id, "Propulsion Module")
   editTextfield(...) pour les autres propriétés

6. Répéter 4-5 pour construire l'arbre SysML complet
```

### 5.4. Catégories de tools MCP

| Category | Prefix | Description | Tools |
|----------|--------|-------------|-------|
| `project` | `syson_` | CRUD projets SysON | `syson_project_list`, `syson_project_create`, `syson_project_get`, `syson_project_delete` |
| `element` | `syson_` | CRUD éléments SysML v2 (parts, reqs, packages) | `syson_element_create`, `syson_element_get`, `syson_element_children`, `syson_element_rename`, `syson_element_delete` |
| `query` | `syson_` | Requêtes AQL, search, traversal | `syson_query_aql`, `syson_search`, `syson_query_requirements_trace` |
| `model` | `syson_` | Gestion modèle/document SysML | `syson_model_create`, `syson_model_stereotypes`, `syson_model_child_types` |
| `agent` | `syson_` | Agent tools (sampling) | `syson_agent_architecture_suggest`, `syson_agent_requirements_analyze`, `syson_agent_impact_assess` |

### 5.5. Structure de fichiers

```
lib/syson/
├── deno.json              # Package config
├── mod.ts                 # Public API exports
├── server.ts              # MCP server bootstrap (HTTP + stdio)
├── src/
│   ├── client.ts          # SysonToolsClient (category-aware)
│   ├── api/
│   │   ├── graphql-client.ts  # Client HTTP GraphQL custom (fetch, retry, errors)
│   │   ├── queries.ts         # Queries GraphQL (template strings)
│   │   ├── mutations.ts       # Mutations GraphQL (template strings)
│   │   └── types.ts           # Types TS (Project, Element, SearchResult, etc.)
│   └── tools/
│       ├── types.ts       # SysonToolCategory type
│       ├── mod.ts         # Tool aggregation
│       ├── project.ts     # Project CRUD tools
│       ├── element.ts     # Element CRUD tools
│       ├── query.ts       # AQL query + search tools
│       ├── model.ts       # Model/document management tools
│       └── agent.ts       # Agent tools (sampling, Phase 3)
└── tests/
    ├── api/
    │   └── graphql-client_test.ts   # Tests client GraphQL (mock fetch)
    └── tools/
        ├── project_test.ts
        ├── element_test.ts
        ├── query_test.ts
        └── model_test.ts
```

### 5.6. Exemple de tool (GraphQL)

```typescript
// lib/syson/src/tools/project.ts
import type { MiniTool } from "./types.ts";
import { getSysonClient } from "../api/graphql-client.ts";
import { LIST_PROJECTS } from "../api/queries.ts";
import type { ListProjectsResult } from "../api/types.ts";

export const projectTools: MiniTool[] = [
  {
    name: "syson_project_list",
    description: "List all SysML v2 projects in SysON with optional name filter",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Filter projects by name (contains)" },
        first: { type: "number", description: "Number of results (default: 20)" },
      },
    },
    handler: async ({ filter, first }) => {
      const client = getSysonClient();
      const data = await client.query<ListProjectsResult>(LIST_PROJECTS, {
        first: first ?? 20,
        filter: filter ? { name: { contains: filter } } : undefined,
      });
      return data.viewer.projects.edges.map(e => ({
        id: e.node.id,
        name: e.node.name,
        natures: e.node.natures?.map(n => n.name) ?? [],
      }));
    },
  },
  {
    name: "syson_project_create",
    description: "Create a new SysML v2 project in SysON with a SysML model document",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
      },
      required: ["name"],
    },
    handler: async ({ name }) => {
      const client = getSysonClient();
      // 1. Create project
      // 2. Create SysML document (auto-detect stereotype)
      // 3. Create root package
      // Returns { projectId, editingContextId, documentId, rootPackageId }
    },
  },
];
```

### 5.7. Configuration

```env
SYSON_URL=http://localhost:8080    # URL de l'instance SysON (Docker)
```

Le client GraphQL est configurable via variable d'environnement. Pas de credentials
pour l'instant (SysON community n'a pas d'auth), mais le client est prêt pour
ajouter un header `Authorization: Bearer <token>` quand SysON le supportera.

### 5.8. Cas d'usage cross-lib

`lib/syson` permet de connecter les données PLM au modèle système :

```
1. syson_project_create → crée un projet avec modèle SysML v2
2. syson_element_create → crée parts, requirements, interfaces dans le modèle
3. syson_query_aql → requêtes AQL dynamiques (traversal, filtrage par type)
4. syson_search → recherche full-text dans le modèle
5. syson_query_requirements_trace → vérifie quels requirements sont couverts
6. plm_bom_generate → génère la BOM depuis le modèle SysON (via syson_element_children)
7. plm_change_impact → trace l'impact d'un changement à travers le modèle
```

Le modèle SysON devient la **source de vérité** pour la structure produit.
Les tools PLM lisent et écrivent dans ce modèle.

### 5.9. Sampling + Elicitation pour lib/syson

#### 5.9.1. Agent tools (Sampling)

Les agent tools utilisent MCP Sampling pour déléguer du raisonnement au LLM.
Ils **composent** les tools déterministes de lib/syson.

| Tool | Description | Compose | Pourquoi sampling |
|------|-------------|---------|-------------------|
| `syson_agent_architecture_suggest` | Proposer une décomposition SysML (packages, parts, interfaces) à partir d'un cahier des charges texte | `syson_element_create`, `syson_model_child_types` | Interprétation de texte → structure SysML v2 |
| `syson_agent_requirements_analyze` | Analyser un set de requirements, détecter conflits/redondances/manques | `syson_query_aql`, `syson_search` | Raisonnement sémantique sur contraintes, pas du calcul |
| `syson_agent_impact_assess` | Évaluer l'impact d'un changement d'élément sur le reste du modèle | `syson_query_aql`, `syson_element_children` | Raisonnement causal (si je change X, quel effet sur Y, Z) |

**Pattern d'implémentation (identique à `lib/std/src/tools/agent.ts`) :**

```typescript
// lib/syson/src/tools/agent.ts
export const agentTools: MiniTool[] = [
  {
    name: "syson_agent_architecture_suggest",
    description: "Suggest a SysML v2 architecture decomposition from a text specification",
    category: "agent",
    handler: async ({ specification, projectId }) => {
      const sampling = getSamplingClient(); // fail-fast si pas dispo
      // 1. Query le modèle existant (déterministe)
      const existingModel = await sysonQueryAql(projectId, "aql:self.eAllContents()");
      // 2. Envoie au LLM via sampling
      const result = await sampling.createMessage({
        messages: [{ role: "user", content: `Given this specification:\n${specification}\n\nAnd existing model:\n${JSON.stringify(existingModel)}\n\nSuggest SysML v2 decomposition...` }],
        tools: [/* syson tools for the LLM to create elements */],
        toolChoice: "auto",
      });
      return result;
    },
  },
];
```

#### 5.9.2. Elicitation pour lib/syson

L'elicitation permet au tool de **demander des informations à l'utilisateur** en cours
d'exécution. Cas d'usage concrets :

| Tool | Quand | Elicitation (form) | Schema |
|------|-------|---------------------|--------|
| `syson_element_create` | Type d'élément ambigu | "Quel type d'élément ?" | `{ type: enum["PartUsage", "RequirementUsage", "Package", "InterfaceUsage", "ConstraintUsage"] }` |
| `syson_agent_architecture_suggest` | Choix de décomposition | "Quelle approche préférez-vous ?" | `{ approach: enum["functional", "physical", "hybrid"], depth: number }` |
| `syson_agent_requirements_analyze` | Priorisation des findings | "Quels aspects prioriser ?" | `{ focus: enum["conflicts", "gaps", "redundancies", "all"], criticality_threshold: enum["safety", "functional", "all"] }` |

**Note :** L'elicitation nécessite d'abord l'implémentation du handler `elicitation/create`
dans `lib/server/src/concurrent-server.ts`. C'est un enrichissement framework-level,
pas spécifique à lib/syson.

#### 5.9.3. Prompts (workflow templates) pour lib/syson

```
prompts/list → [
  { name: "syson_new_system",        description: "Create a complete SysML v2 system model from a text spec" },
  { name: "syson_requirements_audit", description: "Audit requirements coverage and traceability" },
  { name: "syson_architecture_review", description: "Review architecture decomposition for completeness" },
]
```

#### 5.9.4. Resources pour lib/syson

```
resources/list → [
  { uri: "syson://projects",                    name: "List of SysON projects" },
  { uri: "syson://projects/{id}/model",         name: "Full SysML model tree" },
  { uri: "syson://projects/{id}/requirements",  name: "Requirements list" },
  { uri: "syson://projects/{id}/traceability",  name: "Traceability matrix" },
]
```

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

### Phase 1 — lib/syson : Bridge MCP vers SysON (GraphQL) ✅ (2026-02-16)

**Étape 1.0 : Déployer SysON (Docker)** ✅
- [x] Écrire `docker-compose.syson.yml` (SysON + PostgreSQL, port 8180)
- [x] `docker compose up` et vérifier l'accès `http://localhost:8180`
- [x] Vérifier l'endpoint GraphQL `POST /api/graphql` via curl
- [x] Créer un projet de test manuellement dans l'UI SysON
- [x] Valider le CRUD via curl GraphQL (query ListProjects, mutation CreateProject)
- [x] Documenter les templates disponibles (getProjectTemplates)

**Étape 1.1 : Client GraphQL custom (zéro deps)** ✅
- [x] `lib/syson/deno.json` — package config, import map entry `@casys/mcp-syson`
- [x] `lib/syson/src/api/graphql-client.ts` — classe `SysonGraphQLClient` (fetch, retry, error handling)
- [x] `lib/syson/src/api/types.ts` — interfaces TS pour les types GraphQL (Project, EditingContext, Object, etc.)
- [x] `lib/syson/src/api/queries.ts` — toutes les query strings GraphQL
- [x] `lib/syson/src/api/mutations.ts` — toutes les mutation strings GraphQL (fixes: evaluateExpression, AQL eSet pour rename)
- [x] `lib/syson/tests/api/graphql-client_test.ts` — tests unitaires avec mock fetch
- [x] Vérifier que le client fonctionne contre SysON Docker (test d'intégration)

**Étape 1.2 : Scaffold MCP server lib/syson** ✅
- [x] `lib/syson/src/tools/types.ts` — `SysonToolCategory` type
- [x] `lib/syson/src/client.ts` — `SysonToolsClient`
- [x] `lib/syson/src/tools/mod.ts` — agrégation de tous les tools
- [x] `lib/syson/mod.ts` — exports publics
- [x] `lib/syson/server.ts` — bootstrap MCP (ConcurrentMCPServer, port 3009)
- [x] Ajouter `@casys/mcp-syson` dans l'import map du workspace root

**Étape 1.3 : Tools project (CRUD projets)** ✅
- [x] `syson_project_list` — lister projets avec filtre par nom
- [x] `syson_project_create` — créer projet + document SysML + root package
- [x] `syson_project_get` — obtenir un projet par ID avec editing context
- [x] `syson_project_delete` — supprimer un projet
- [x] Tests unitaires + intégration

**Étape 1.4 : Tools model (gestion modèle SysML)** ✅
- [x] `syson_model_stereotypes` — lister les stéréotypes disponibles
- [x] `syson_model_child_types` — lister les types d'enfants créables
- [x] `syson_model_create` — créer un document SysML dans un projet
- [x] Tests unitaires

**Étape 1.5 : Tools element (CRUD éléments SysML)** ✅
- [x] `syson_element_create` — créer un élément SysML enfant
- [x] `syson_element_get` — lire un élément par ID
- [x] `syson_element_children` — lire les enfants d'un élément (AQL `self.ownedElement`)
- [x] `syson_element_rename` — renommer un élément (AQL eSet, pas renameTreeItem)
- [x] `syson_element_delete` — supprimer un élément
- [x] `syson_element_insert_sysml` — insérer du SysML v2 textuel (insertTextualSysMLv2)
- [x] Tests unitaires + intégration

**Étape 1.6 : Tools query (AQL, search, traversal)** ✅
- [x] `syson_query_aql` — exécuter une requête AQL (via evaluateExpression, pas queryBasedObjects)
- [x] `syson_search` — recherche full-text dans le modèle
- [x] `syson_query_requirements_trace` — traçabilité requirement → composant
- [x] Tests unitaires + intégration

**Étape 1.7 : Validation end-to-end** ✅
- [x] Scénario complet testé : create → model → Package → PartUsage + RequirementUsage → query → delete
- [x] Cohérence lib/syson ↔ UI SysON vérifiée
- [x] Gotchas documentés dans §13 tech spec (queryBasedObjects=null, renameTreeItem needs representationId)

### Phase 2 — lib/plm : Tools métier

**Étape 2.1 : `plm_bom_generate` (compose lib/syson)** ✅ (2026-02-16)
- [x] Extraire hiérarchie assemblage depuis le modèle SysON (via AQL evaluateExpression)
- [x] Extraire quantités, part numbers, niveaux
- [x] Format de sortie : hierarchical JSON (BomTree)
- [x] Tests : 21 tests BOM (bom_test.ts)
- [x] `_meta.ui` → `ui://mcp-plm/tree-viewer`
- [x] `plm_bom_compare` — diff entre 2 BOM flats (ajouté, supprimé, modifié)
- [x] `_meta.ui` → `ui://mcp-plm/diff-viewer`

**Étape 2.2 : `plm_bom_cost` + `plm_bom_flatten`** ✅ (2026-02-16)
- [x] Modèles de costing : raw_material, should_cost, parametric (3 modèles)
- [x] Flatten : agrégation des quantités sur tous les niveaux, usedIn tracking
- [x] Tests unitaires (inclus dans les 21 tests bom_test.ts)
- [x] `_meta.ui` → `ui://mcp-plm/table-viewer` (flatten) + `ui://mcp-plm/chart-viewer` (cost)

**Étape 2.3 : Change management** ✅ (2026-02-16)
- [x] `plm_ecr_create` — créer une Engineering Change Request
- [x] `plm_eco_create` — créer une Engineering Change Order
- [x] `plm_change_impact` — analyser l'impact via SysON AQL (lazy import)
- [x] `plm_change_approve` — workflow d'approbation (statut)
- [x] Tests unitaires (13 tests)
- [x] `_meta.ui` pour `plm_change_impact` → `ui://mcp-plm/impact-viewer`

**Étape 2.4 : Quality** ✅ (2026-02-16)
- [x] `plm_inspection_plan` — générer un plan d'inspection
- [x] `plm_fair_generate` — générer un First Article Inspection Report
- [x] `plm_control_plan` — générer un plan de contrôle
- [x] Tests unitaires (16 tests)
- [x] `_meta.ui` pour les 3 tools (inspection-viewer, fair-viewer, control-plan-viewer)

**Étape 2.5 : Planning** ✅ (2026-02-16)
- [x] `plm_routing_create` — créer une gamme de fabrication
- [x] `plm_work_instruction` — générer des instructions opérateur
- [x] `plm_cycle_time` — estimer le temps de cycle
- [x] Tests unitaires (19 tests)
- [x] `_meta.ui` pour les 3 tools (routing-viewer, work-instruction-viewer, cycle-time-viewer)

### Adversarial Review — Action Items (2026-02-16)

**Corrigés :**
- [x] **F1** [Critical] `WorkInstructionStep` manquait `notes` — ajouté au type, `as` cast supprimé
- [x] **F3** [Critical] `estimateBaseTime()` heuristique cachée — exposé `base_time_override_min` comme paramètre optionnel (routing + cycle_time)
- [x] **F4** [Critical] Seuils CTQ hardcodés — exposé `ctq_cost_threshold` (default 500) et `ctq_machining_threshold` (default 2.5) comme paramètres
- [x] **F6** [High] `editingContextId: ecId ?? ""` silent fallback — type rendu optionnel, pas de fallback
- [x] **F7** [High] `plm_eco_create` sans validation ECR status — throw si ECR pas `approved`
- [x] **F8** [High] Pas de state machine approbation — `VALID_TRANSITIONS` map implémentée
- [x] **F9** [High] Batch size divise setup ET run — corrigé: seul setup amorti (`setup/N + run`)

**Backlog (pas de valeur démo, vrai produit) :**
- [ ] **F2** `PlmToolCategory` ne contient pas `"agent"` — à corriger quand agent tools implémentés (Phase 3)
- [ ] **F5** Process template basé seulement sur `material.category` — ajouter `form_factor` param (tôle/barre/moulé)
- [ ] **F10** `plm_change_impact` 0 tests unitaires — nécessite mock SysON GraphQL
- [ ] **F11** IDs `Date.now().toString(36)` — collision possible en multi-user. Passer à UUIDv7 en prod
- [ ] **F12** `estimateBaseTime(0)` retourne 2 min — masse inconnue devrait être `undefined`
- [ ] **F13** Inspection plan génère "Dimensional conformity" pour tout — varier par type de pièce
- [ ] **F14** `determineMeasurementMethod` seuil CMM hardcodé 3.0 — paramétrer comme F4
- [ ] **Persistence ECR/ECO** — actuellement stateless (objet en contexte LLM). Pour multi-session/audit trail: table PGlite `ecr_approvals` + `eco_actions`. Nécessaire pour EN 9100 / ISO 9001 en prod.

#### ECR Approval State Machine (spec F8)

```
                ┌──────────┐
                │  draft   │
                └────┬─────┘
                     │ comment → under_review
                     │ approve / reject
                     ▼
          ┌──────────────────────┐
          │    under_review      │
          └──┬────────┬────────┬─┘
             │        │        │
          approve   reject   defer
             ▼        ▼        ▼
        ┌────────┐ ┌────────┐ ┌────────┐
        │approved│ │rejected│ │deferred│
        └────────┘ └────────┘ └───┬────┘
           (terminal)  (terminal)  │ approve / reject
                                   ▼
                              (approved / rejected)
```

**Transitions valides :**

| État actuel    | Actions autorisées                   |
|----------------|--------------------------------------|
| `draft`        | `comment`, `approve`, `reject`       |
| `submitted`    | `comment`, `approve`, `reject`, `defer` |
| `under_review` | `comment`, `approve`, `reject`, `defer` |
| `approved`     | `comment` uniquement (terminal)      |
| `rejected`     | `comment` uniquement (terminal)      |
| `deferred`     | `comment`, `approve`, `reject`       |

**Règles :**
- `comment` sur `draft`/`submitted` → `under_review`
- `comment` sur état terminal → pas de changement de statut
- `approve`/`reject` sur état terminal → **erreur**
- `defer` non disponible depuis `draft` (rien à déférer)

### Phase 3 — Agent tools (MCP Sampling + Elicitation)

**Prérequis :** Phases 1 et 2 complétées et testées.

**Étape 3.1 : Agent tools lib/syson (Sampling)**
- [ ] `syson_agent_architecture_suggest` — proposer une décomposition SysML à partir d'un texte
- [ ] `syson_agent_requirements_analyze` — analyser requirements, détecter conflits/manques
- [ ] `syson_agent_impact_assess` — évaluer l'impact d'un changement sur le modèle
- [ ] Injection du `SamplingClient` dans `lib/syson/server.ts` (pattern `lib/std/server.ts`)
- [ ] Tests avec mocks de sampling (pas de LLM réel dans les tests unitaires)

**Étape 3.2 : Agent tools lib/plm (Sampling)**
- [ ] `plm_agent_change_assess` — évaluer un ECR, résumer l'impact, recommander
- [ ] `plm_agent_work_instruction` — générer des instructions opérateur en langage naturel
- [ ] `plm_agent_cost_optimize` — suggérer des pistes d'optimisation coût sur une BOM
- [ ] Tests avec mocks de sampling

**Étape 3.3 : Elicitation (form mode) — lib/server d'abord**
- [ ] Implémenter `elicitation/create` handler dans `lib/server/src/concurrent-server.ts`
- [ ] Ajouter `ElicitationClient` interface (symétrique à `SamplingClient`)
- [ ] Wiring dans le serveur MCP (callback client → serveur → client)
- [ ] Tests unitaires du handler elicitation
- [ ] Intégrer dans `syson_element_create` : demander le type si ambigu
- [ ] Intégrer dans `plm_ecr_create` : demander raison + priorité
- [ ] Intégrer dans `plm_bom_cost` : demander modèle de costing + quantité

**Étape 3.4 : Prompts (workflow templates)**
- [ ] Implémenter `prompts/list` + `prompts/get` handlers dans lib/server
- [ ] `syson_new_system` — prompt workflow : texte → modèle SysML complet
- [ ] `syson_requirements_audit` — prompt workflow : audit couverture requirements
- [ ] `plm_new_part` — prompt workflow : création pièce complète (model + BOM + inspection)
- [ ] `plm_change_request` — prompt workflow : ECR → ECO → approbation

**Étape 3.5 : Resources**
- [ ] Exposer `syson://projects` — liste navigable des projets
- [ ] Exposer `syson://projects/{id}/model` — arbre modèle SysML navigable
- [ ] Exposer `syson://projects/{id}/requirements` — liste requirements
- [ ] Exposer `plm://bom/{assembly_id}` — BOM navigable
- [ ] Exposer `plm://changes/pending` — ECR/ECO en attente

### Phase 4 — Intégration Gateway + Discovery

- [ ] Enregistrer les tools SysON/PLM dans le discovery engine (GraphRAG)
- [ ] Générer embeddings BGE-M3 pour les 30+ tools domaine
- [ ] DAG suggestions pour workflows cross-lib (std + plm + syson)
- [ ] Capabilities auto-capture pour les patterns métier récurrents
- [ ] Tests e2e : un scénario DAG qui traverse std + syson + plm

### Phase future — Écosystème MCP autour de SysON

**Architecture cible : SysON = ground truth, MCP servers = domaines de calcul**

```
                              SysON (SysML v2)
                              ┌─────────────┐
                              │  Structure   │
                              │  Attributs   │
                              │  Contraintes │
                              │  Requirements│
                              └──────┬───────┘
                                     │ GraphQL (lib/syson)
                 ┌───────────────────┼───────────────────┐
                 │                   │                   │
           lib/plm (DONE)      lib/sim (P1)        lib/qa (P1)
                 │                   │                   │
          ┌──────┤            ┌──────┤            ┌──────┤
          │      │            │      │            │      │
        BOM    Coût        Therm   Méca        FMEA   Inspect°
        Flat   Compare     Élec    Vibra              Plan
                                                      Trace
                 ┌───────────────────┼───────────────────┐
                 │                   │                   │
           lib/mbe (P2)       lib/erp (P2)        lib/ifc (P2)
                 │                   │                   │
          ┌──────┤            ┌──────┤            ┌──────┤
          │      │            │      │            │      │
        STEP   GD&T        SAP    Odoo         IFC.js  Clash
        IGES   Tol.        OData  Sync                 Detect
```

Chaque lib est un MCP server indépendant (stdio ou HTTP), zéro couplage entre eux.
Le seul point commun : SysON (via lib/syson) comme source de vérité.
PML orchestre le tout — "combien coûte le système et est-ce qu'il tient thermiquement ?"
→ DAG de 3+ tools en parallèle, résultats agrégés.

**Principe fondamental : le modèle parle, le code écoute.**
Si une donnée n'est pas dans SysON, elle n'existe pas. Pas de valeurs inventées,
pas de heuristics cachées (cf. `.claude/rules/no-hidden-heuristics.md`).

---

#### lib/plm — Product Lifecycle Management (DONE ✅)

Lit structure + matériaux depuis SysON → BOM, coûts, comparaison de révisions.
- `plm_bom_generate` — BOM hiérarchique depuis le modèle
- `plm_bom_flatten` — Agrégation parts list avec totaux masse/coût
- `plm_bom_cost` — Analyse coût (raw_material / should_cost / parametric), 61 matériaux réels
- `plm_bom_compare` — Diff entre deux révisions (ajouts/suppressions/impacts coût)
- SSE Live Feed sur :3011 — résultats broadcastés en temps réel dans une page passive

---

#### lib/sim — Simulation multi-physique via Modelica (Priority 1)

Lit contraintes + paramètres physiques depuis SysON → exécution Modelica → pass/fail avec marges.

**Backend : OpenModelica Compiler (OMC) en Docker**
- SysON supporte nativement le bridge SysML v2 ↔ Modelica (via `AnalysisCaseUsage`)
- OMC = open-source, compilateur + solveur, API via OMShell ou ZeroMQ

**Tools prévus :**
- [ ] `sim_thermal_check` — dissipation thermique, limites de température, résistance thermique
- [ ] `sim_structural_check` — masse, vibrations, facteur de sécurité, modes propres
- [ ] `sim_power_budget` — bilan de puissance électrique, marges, duty cycles
- [ ] `sim_validate_constraints` — évaluation batch de tous les `ConstraintUsage` du modèle

**Pipeline conversationnel :**
"Est-ce que le système thermique tient ?" → extraction contraintes SysML → exécution Modelica → résultat pass/fail avec marges

**Prérequis :** les `ConstraintUsage` et paramètres physiques doivent être définis dans le modèle SysON.
Si un paramètre manque, le tool retourne "missing: [paramètre]", pas une valeur par défaut.

---

#### lib/qa — Qualité & Traçabilité (Priority 1)

Lit requirements + structure depuis SysON → FMEA, plans d'inspection, traçabilité.

**Tools prévus :**
- [ ] `qa_fmea_generate` — analyse des modes de défaillance depuis les `ConstraintUsage` et `RequirementUsage`. Severity/Occurrence/Detection scoring basé sur les contraintes du modèle
- [ ] `qa_inspection_plan` — plan d'inspection depuis BOM + tolerances. Quelles pièces contrôler, quelles dimensions, quel niveau d'inspection (100%, statistique, skip)
- [ ] `qa_trace_matrix` — matrice de traçabilité requirements ↔ parts ↔ tests. Vérifie la couverture : chaque requirement a-t-il au moins un test ? Chaque part est-elle tracée ?
- [ ] `qa_compliance_check` — vérification de conformité : toutes les contraintes satisfaites ? Quels gaps ?

**Source de vérité :** les `RequirementUsage`, `ConstraintUsage`, et `satisfy`/`verify` relations dans SysON.

---

#### lib/mbe — Import CAD (Priority 2)

Import de géométrie 3D existante dans le pipeline PML.

- [ ] STEP/IGES parsing via opencascade.js (WASM) dans Deno
- [ ] GD&T extraction, tolerance stacking
- [ ] Import de données CAD dans le modèle SysON via lib/syson
- [ ] Utile quand un client a déjà des modèles Solidworks/CATIA à intégrer
- [ ] Non nécessaire si le modèle est créé from scratch dans SysON

---

#### lib/erp — Bridge ERP/Production (Priority 2)

Pousse les données validées vers les systèmes de production.

- [ ] **SAP OData** — sync BOM → ordres de fabrication, prix réels vs estimés
- [ ] **Odoo/LibrePLM** — alternative open-source (Docker, modules Manufacturing + PLM + Quality)
- [ ] Sync bidirectionnelle : SysON → ERP (structure validée) et ERP → SysON (coûts réels, délais)
- [ ] Delta tracking : comparer BOM estimée (lib/plm) vs coûts réels (ERP)

---

#### lib/ifc — BIM / Construction (Priority 2)

Interopérabilité avec le monde du bâtiment.

- [ ] IFC.js pour parsing/génération de modèles IFC
- [ ] Clash detection entre systèmes (structure vs MEP vs électrique)
- [ ] Bridge SysML ↔ IFC pour les projets d'ingénierie système appliqués au bâtiment

---

#### MCP Tasks (long-running operations)
- [ ] Implémenter Tasks handler dans lib/server (quand spec MCP stabilisée)
- [ ] Utiliser pour les opérations longues (simulations, gros modèles, imports massifs)

---

## 9. Decisions

| # | Decision | Choice | Rationale | Date |
|---|----------|--------|-----------|------|
| 1 | Validation | AJV via lib/server | Cohérent avec lib/std, JSON Schema standard | 2026-02-15 |
| 2 | Naming | `mbe_` / `plm_` / `syson_` prefix | Évite collisions, discovery claire | 2026-02-15 |
| 3 | Categories | Separate type unions | Extensible indépendamment de lib/std | 2026-02-15 |
| 4 | Server ports | 3009 / 3010 | Suite logique après lib/std (3008) | 2026-02-15 |
| 5 | Dependency | plm → server, syson → server | Pas de dépendance sur std. plm consomme syson via cross-lib | 2026-02-15 |
| 6 | lib/mbe | Reporté à phase future | Pas nécessaire pour le MVP MBSE/PLM. SysON couvre la modélisation, pas besoin de parsing CAD | 2026-02-15 |
| 7 | Agent tools | Dans chaque lib (agent.ts) | Même pattern que lib/std, les agents composent les tools de leur domaine | 2026-02-15 |
| 8 | Agent timing | Après tools déterministes | Les agents composent les tools — il faut que ceux-ci marchent d'abord | 2026-02-15 |
| 9 | Protocol features | Exploiter elicitation + prompts + resources | Pas seulement tools+sampling — le protocole MCP offre d'autres primitives pertinentes | 2026-02-15 |
| 10 | MBSE backend | SysON (Docker, SysML v2, GraphQL API) | Web-based, pas d'UI à construire, GraphQL = API complète utilisée par le frontend SysON | 2026-02-15 |
| 11 | PLM backend (future) | Odoo/LibrePLM (quand production nécessaire) | Open-source, API complète, modules PLM/Manufacturing/Quality existants | 2026-02-15 |
| 12 | Client strategy | SysON = UI MBSE, pas d'UI custom | On ne reconstruit pas d'UI — SysON fournit les diagrammes, PML Desktop pour le graph MCP | 2026-02-15 |
| **13** | **API SysON** | **GraphQL custom client, zéro deps** | **REST API = sous-ensemble limité. GraphQL = API complète (CRUD, AQL, search, expressions). Client trivial (~30 LOC), pas de SDK tiers fragile** | **2026-02-15** |
| **14** | **Elicitation** | **Form mode pour inputs simples, MCP Apps UI pour interactions riches** | **Elicitation form = schema primitif (string/number/bool/enum), suffisant pour les choix basiques. MCP Apps = HTML interactif pour les interactions complexes** | **2026-02-15** |
| **15** | **Sampling strategy** | **Agent tools composent tools déterministes** | **Le LLM raisonne (sampling), les tools calculent (déterministe). Pas de LLM pour du CRUD.** | **2026-02-15** |
| **16** | **Go-to-market** | **Showcase d'abord, vertical ensuite** | **Phase showcase (3 mois) : démo technique cross-domain (cahier des charges → modèle SysML + BOM + costing + qualité en 5 min). Crédibilité technique, pas revenue. Si traction → phase vertical (6-12 mois) : packaging PML for MBSE, pricing tiered, partenariats consulting MBSE. Si 0 intérêt → portfolio démo, focus horizontal.** | **2026-02-15** |
| **17** | **Open-source strategy** | **lib/syson open-source, PML engine propriétaire** | **Bridge GraphQL trivial (~30 LOC), aucun moat à le garder fermé. Open-source = adoption communauté SysON (devenir le "Prisma pour SysON"), funnel open-core (lib/syson → PML), signal de confiance industriels. Repo séparé `Casys-AI/mcp-syson`, licence MIT/Apache 2.0. PML engine (DAG compilation, SHGAT routing, mémoire procédurale, tracing 7D) = propriétaire.** | **2026-02-15** |
| **18** | **Framing produit** | **Génération de produits d'ingénierie, pas de workflows** | **PML ne crée pas des workflows séquentiels chiants. PML génère des produits composites (modèle + BOM + costing + qualité) à partir d'un intent. La différence : l'utilisateur décrit ce qu'il veut, pas comment le faire.** | **2026-02-15** |
| **19** | **Simulation backend** | **Modelica via SysON bridge (OMC Docker)** | **SysON supporte nativement SysML v2 ↔ Modelica. OpenModelica = open-source, Docker-deployable. Ferme la boucle design→cost→sim en une conversation. Contraintes physiques dans le modèle SysML (ConstraintUsage), pas inventées par le code.** | **2026-02-16** |
| **20** | **Écosystème architecture** | **SysON = ground truth, MCP servers = domaines de calcul** | **6 libs indépendantes (plm, sim, qa, mbe, erp, ifc) lisent/écrivent via lib/syson. Zéro couplage entre libs. PML orchestre les DAGs cross-domaine. Le modèle SysML est l'unique source de vérité — chaque lib calcule son domaine sans inventer de données.** | **2026-02-16** |
| **21** | **Qualité (lib/qa)** | **FMEA + inspection + traçabilité depuis SysON** | **Lit RequirementUsage, ConstraintUsage, satisfy/verify relations. Pas de heuristics — si un requirement n'a pas de test tracé, le gap est explicite.** | **2026-02-16** |
| **22** | **ERP bridge (lib/erp)** | **SAP OData + Odoo, sync bidirectionnelle** | **Push BOM validée → production. Pull coûts réels → comparaison avec estimés. Delta tracking intégré.** | **2026-02-16** |

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
| **P0** | Tools déterministes | lib/syson, lib/plm | SysON Docker | Phase 1 (syson), Phase 2 (plm) |
| **P0** | Client GraphQL custom | lib/syson/src/api/ | Zéro deps, juste fetch | Phase 1.1 |
| **P1** | Sampling (agent tools) | lib/syson, lib/plm | Tools déterministes opérationnels | Phase 3.1-3.2 |
| **P1** | Elicitation (form mode) | lib/server d'abord, puis lib/syson + lib/plm | Handler `elicitation/create` dans ConcurrentMCPServer | Phase 3.3 |
| **P2** | Prompts (workflow templates) | lib/server d'abord, puis lib/syson + lib/plm | Handler `prompts/list` + `prompts/get` | Phase 3.4 |
| **P2** | Resources | lib/syson, lib/plm | Tools implémentés | Phase 3.5 |
| **P3** | Gateway + Discovery | src/mcp/ | Phases 1-2 complètes | Phase 4 |
| **P4** | Odoo bridge | lib/plm | Odoo Docker déployé | Future |
| **P5** | Tasks (long-running) | lib/server | Spec MCP stabilisée | Future |

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
- **Deux APIs** — REST (SysML v2 standard, basique) + **GraphQL** (API complète : CRUD, AQL, search, expressions)
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
          │     GraphQL API (/api/graphql)     │
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

## 13. Integration Testing Findings (2026-02-16)

### 13.1. SysON Docker Deployment

SysON déployé avec succès via `docker-compose.syson.yml` sur le port **8180** (8080 déjà occupé).
Image : `eclipsesyson/syson:latest` + PostgreSQL 15. GraphQL endpoint vérifié fonctionnel.

### 13.2. Schema Mismatches Fixés

| Élément | Code initial | Schéma réel | Fix |
|---------|-------------|-------------|-----|
| `projectTemplates` | `viewer.projectTemplates.edges` | `viewer.allProjectTemplates[]` (flat) | queries.ts + types.ts |
| `domains` | pas de paramètre `rootDomainsOnly` | `$rootDomainsOnly: Boolean!` **obligatoire** | queries.ts |
| `rootObjectCreationDescriptions` | pas de paramètre `suggested` | `$suggested: Boolean!` **obligatoire** | queries.ts |
| `CreateProjectInput.templateId` | optionnel | **obligatoire** | project.ts |
| Domain ID | `"sysml"` | `"http://www.eclipse.org/syson/sysml"` (URI complète) | model.ts |
| `SearchQuery.searchInLibraries` | présent | **n'existe pas** dans le schéma | query.ts |

### 13.3. CRITIQUE — `queryBasedObjects` retourne null

**Symptôme** : Toutes les expressions AQL via `queryBasedObjects` / `queryBasedString` sur le type `Object`
retournent systématiquement `null`, quelle que soit l'expression (`self.ownedElement`, `self.name`, `self.eContents()`, littéraux).

**Impact** : Casse `syson_element_children`, `syson_query_aql`, `syson_query_requirements_trace`.

**Root cause** : `queryBasedObjects` est un champ query (read-only) sur le type `Object` qui nécessite
probablement une initialisation du moteur AQL côté serveur. Dans la version actuelle de SysON (basée sur
Sirius Web 2025.x), ce mécanisme semble ne pas fonctionner via l'API GraphQL HTTP directe sans session web.

**Solution appliquée** : Utiliser la mutation `evaluateExpression` à la place. Cette mutation :
- Accepte une expression AQL (`aql:self.ownedElement`, `aql:self.name`, etc.)
- Retourne un résultat typé (`ObjectsExpressionResult`, `StringExpressionResult`, etc.)
- **Fonctionne parfaitement** — vérifié avec `self.ownedElement`, `self.name`, `self.eSet()`
- Nécessite des aliases GraphQL (`objValue`, `objsValue`, `strValue`) pour éviter le conflit
  "fields have different list shapes" entre `ObjectExpressionResult.value` (Object) et `ObjectsExpressionResult.value` ([Object])

**Fichiers modifiés** : `query.ts`, `element.ts`, `mutations.ts`, `types.ts`

### 13.4. CRITIQUE — `renameTreeItem` exige un `representationId`

**Symptôme** : `renameTreeItem` et `editLabel` échouent silencieusement car ils exigent un `representationId`
qui est l'ID d'une représentation de type "tree explorer" (arborescence Sirius Web), pas l'`editingContextId`.

**Impact** : Les éléments créés gardent leurs noms par défaut (`part1`, `requirement1`).

**Root cause** : Sirius Web gère les arbres de modèles via des "représentations". `renameTreeItem` opère
dans le contexte d'une représentation spécifique. Sans UI web active, il n'y a pas de représentation tree
existante, et l'API ne fournit pas de moyen simple d'en obtenir une programmatiquement.

**Solution appliquée** : Utiliser AQL `eSet(declaredName)` via `evaluateExpression` :
```
aql:self.eSet(self.eClass().getEStructuralFeature('declaredName'), 'NewName')
```

- **Fonctionne parfaitement** — vérifié : `part1` → `Heater` ✓
- Pas besoin de `representationId`
- Fonction `renameViaAql()` factorisée dans `element.ts`

### 13.5. `insertTextualSysMLv2` — Nouvelle mutation découverte

**Découverte** : La mutation `insertTextualSysMLv2` permet d'insérer du contenu SysML v2 textuel
directement dans un élément, sans passer par `createChild` + rename.

**Input** : `editingContextId`, `objectId` (parent), `textualContent` (syntaxe SysML v2)
**Exemples** :
```
part Heater;
requirement ThermalReq { doc /* Must maintain 20-25C */ }
```

**Avantage** : Crée des éléments nommés en une seule opération. Plus naturel pour les agents LLM
qui peuvent générer du SysML v2 textuel directement.

**Nouveau tool** : `syson_element_insert_sysml` ajouté (24 tools total, +1).

### 13.6. Full Flow Validé via PML

Séquence testée avec succès via `mcp__pml__execute` → `mcp.syson.*` :

1. `syson_project_create("Satellite Thermal Control")` → ✓
2. `syson_model_create(editing_context_id, "Thermal Model")` → ✓ (document + root Package)
3. `syson_element_create(parent=rootPkg, "New PartUsage", "Heater")` → ✓
4. `syson_element_create(parent=rootPkg, "New PartUsage", "Radiator")` → ✓
5. `syson_element_create(parent=rootPkg, "New RequirementUsage", "Temperature Range")` → ✓
6. `syson_element_children(rootPkg)` → ✓ (retourne 3 enfants avec noms corrects)
7. `syson_element_insert_sysml(rootPkg, "part HeaterTest;")` → ✓

### 13.7. Points restants

| Point | Statut | Note |
|-------|--------|------|
| `syson_element_delete` | Non testé | Utilise `deleteTreeItem` → même problème potentiel de `representationId` |
| `syson_search` | Non testé | Champ `searchInLibraries` retiré (n'existe pas dans le schéma) |
| `syson_query_requirements_trace` | Recodé | Utilise `evaluateExpression` au lieu de `queryBasedObjects` |
| Agent tools (Phase 3) | Non commencé | Nécessite MCP Sampling support |
| `syson_diagram_*` (Phase 2) | Non commencé | Nécessite GraphQL Subscriptions (WebSocket) |

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SysON "not yet intended for production use" | Instabilité, breaking changes API | Utiliser pour prototypage, suivre les releases (cycle 8 semaines), migrer vers Capella si besoin enterprise |
| SysON GraphQL schema change entre versions | Casse lib/syson | Toutes les queries/mutations sont dans `queries.ts` et `mutations.ts` — un seul endroit à adapter. Le client GraphQL est custom, pas de code généré à re-générer |
| GraphQL schema non documenté officiellement | Risque de dépendre d'API interne | Le schema est stable (utilisé par le frontend SysON lui-même). Les fichiers `.graphqls` dans le repo Sirius Web font référence |
| Sampling non disponible en mode standalone | Limite Phase 3 | Les agent tools fail-fast (throw si pas de SamplingClient) — policy no-silent-fallbacks |
| Elicitation non supportée par Claude Code | Limite Phase 3.3 | On implémente quand même dans lib/server. MCP Apps UI en alternative. PML Desktop = client custom qui supporte tout |
| Deux backends (SysON + Odoo futur) = complexité sync | Données dupliquées ou incohérentes | SysON = source de vérité conception, Odoo = production. Bridge unidirectionnel SysON → Odoo |
