# Tech Spec: lib/mbe & lib/plm — MCP Tool Libraries for Model-Based Engineering & PLM

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

| Library | Scope | Rôle |
|---------|-------|------|
| **lib/mbe** | Model-Based Engineering | Primitives géométriques, GD&T, matériaux, PMI |
| **lib/plm** | Product Lifecycle Management | BOM, ECR/ECO, qualité, planning |

`lib/mbe` fournit les briques de base (données CAD, tolerances, matériaux).
`lib/plm` consomme `lib/mbe` pour les workflows métier (nomenclatures, gestion du changement, inspection).

---

## 2. Architecture

### 2.1. Positionnement dans l'écosystème

```
┌─────────────────────────────────────────────────┐
│                  MCP Gateway                     │
│          (src/mcp/gateway-server.ts)             │
├──────────┬──────────┬───────────┬───────────────┤
│ lib/std  │ lib/mbe  │ lib/plm   │ lib/server    │
│ 461 tools│ geometry │ bom       │ ConcurrentMCP │
│ system   │ tolerance│ change    │ AJV validation│
│ data     │ material │ quality   │ middleware    │
│ agent    │ model    │ planning  │ auth + rate   │
└──────────┴──────────┴───────────┴───────────────┘
```

### 2.2. Dépendances

```
lib/plm ──depends──> lib/mbe ──depends──> lib/server
                                              │
lib/std ──depends──────────────────────────────┘
```

`lib/mbe` et `lib/plm` n'ont **aucune dépendance** sur `lib/std` — ils sont indépendants et ne partagent que `lib/server` pour l'infrastructure MCP.

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

## 3. lib/mbe — Model-Based Engineering

### 3.1. Catégories de tools

| Category | Prefix | Description | Tools (Phase 1) |
|----------|--------|-------------|-----------------|
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

## 5. Validation : AJV via lib/server

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
- `lib/mbe` : 3009
- `lib/plm` : 3010

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

### Phase 1 — lib/mbe : Tools déterministes

**Étape 1.1 : `mbe_step_parse` (brique zéro)**
- [ ] Intégrer opencascade.js (WASM) dans Deno — import + instantiation du module WASM
- [ ] Créer `lib/mbe/src/occt/wasm-bridge.ts` — bridge TypeScript pour opencascade.js
- [ ] Implémenter le handler : load STEP → extract feature tree → return JSON
- [ ] Test : parser un fichier STEP simple (boîte, cylindre) et valider le feature tree
- [ ] Test : parser un assemblage multi-pièces et valider la hiérarchie
- [ ] Benchmark perf WASM sur fichiers de taille croissante (1 MB → 50 MB)

**Étape 1.2 : `mbe_material_lookup` (standalone, pas de dépendance géométrique)**
- [ ] Choisir source de données : base embarquée (JSON/SQLite) ou API externe (MatWeb)
- [ ] Implémenter lookup par désignation (AL6061-T6, 316L, Ti-6Al-4V, etc.)
- [ ] Couvrir les propriétés : densité, yield, UTS, élongation, dureté, conductivité thermique
- [ ] Implémenter cross-reference standards (AMS ↔ DIN ↔ EN ↔ JIS)
- [ ] Tests : lookup de 10 matériaux courants aéro/auto

**Étape 1.3 : `mbe_tolerance_stack` (pur calcul, testable isolément)**
- [ ] Implémenter worst-case (arithmétique)
- [ ] Implémenter RSS (Root Sum of Squares) avec niveau de confiance
- [ ] Implémenter Monte Carlo (distribution normale)
- [ ] Tests : valider contre des cas connus (textbook tolerance stacks)

**Étape 1.4 : Remaining geometry + model tools**
- [ ] `mbe_iges_parse`, `mbe_feature_tree`, `mbe_bounding_box`, `mbe_mass_properties`
- [ ] `mbe_pmi_extract`, `mbe_mbd_validate`, `mbe_model_compare`
- [ ] `mbe_gdt_parse`, `mbe_datum_reference`

### Phase 2 — lib/plm : Tools métier

**Étape 2.1 : `plm_bom_generate` (compose mbe_step_parse)**
- [ ] Extraire hiérarchie assemblage depuis STEP (dépend de 1.1)
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

**Prérequis :** Étapes 1.1 à 1.3 complétées et testées.

- [ ] `lib/mbe/src/tools/agent.ts` — `mbe_agent_suggest_tolerances`, `mbe_agent_material_recommend`, `mbe_agent_design_review`
- [ ] `lib/plm/src/tools/agent.ts` — `plm_agent_change_assess`, `plm_agent_work_instruction`, `plm_agent_cost_optimize`
- [ ] Injection du `SamplingClient` dans les servers MBE/PLM (pattern identique à lib/std)
- [ ] Tests avec mocks de sampling (pas de LLM réel dans les tests unitaires)

### Phase 4 — Intégration Gateway + Discovery

- [ ] Enregistrer les tools MBE/PLM dans le discovery engine (GraphRAG)
- [ ] Générer embeddings BGE-M3 pour les 29+ tools domaine
- [ ] DAG suggestions pour workflows cross-lib (std + mbe + plm)
- [ ] Capabilities auto-capture pour les patterns métier récurrents

---

## 9. Decisions

| # | Decision | Choice | Rationale | Date |
|---|----------|--------|-----------|------|
| 1 | Validation | AJV via lib/server | Cohérent avec lib/std, JSON Schema standard | 2026-02-15 |
| 2 | Naming | `mbe_` / `plm_` prefix | Évite collisions, discovery claire | 2026-02-15 |
| 3 | Categories | Separate type unions | Extensible indépendamment de lib/std | 2026-02-15 |
| 4 | Server ports | 3009 / 3010 | Suite logique après lib/std (3008) | 2026-02-15 |
| 5 | Dependency | plm → mbe → server | mbe ne dépend pas de std | 2026-02-15 |
| 6 | STEP parsing | opencascade.js (WASM) dans Deno, FFI natif en fallback | WASM plus simple à intégrer (pas de compilation C++). Migrer vers FFI si perf insuffisante. Toujours côté serveur (client-agnostique) | 2026-02-15 |
| 7 | Agent tools | Dans chaque lib (agent.ts) | Même pattern que lib/std, les agents composent les tools de leur domaine | 2026-02-15 |
| 8 | Agent timing | Après tools déterministes | Les agents composent les tools — il faut que ceux-ci marchent d'abord | 2026-02-15 |
| 9 | Protocol features | Exploiter elicitation + prompts + resources | Pas seulement tools+sampling — le protocole MCP offre d'autres primitives pertinentes | 2026-02-15 |
| 10 | Client independence | Implémenter toutes les features, pas seulement celles de Claude Code | On construit notre propre client si nécessaire (Minetest/Lua). MCP Apps UI comme alternative à l'URL mode elicitation | 2026-02-15 |

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
| **P0** | Tools | lib/mbe, lib/plm | — | Phase 0 (DONE) |
| **P1** | Sampling (agent tools) | lib/mbe, lib/plm | Tools déterministes | Phase 3 |
| **P2** | Resources (material DB, BOM) | lib/mbe, lib/plm | Tools implémentés | Phase 4 |
| **P2** | MCP Apps UI (rich interactions) | lib/mbe, lib/plm | Resources implémentées | Phase 4 |
| **P3** | Elicitation (form mode) | lib/server d'abord | Handler `elicitation/create` dans ConcurrentMCPServer | Phase 3-4 |
| **P3** | Prompts (workflow templates) | lib/server d'abord | Handler `prompts/list` + `prompts/get` | Phase 4 |
| **P4** | Elicitation (URL mode) | lib/server | OAuth flows vers ERP — ou MCP Apps UI en alternative | Future |
| **P5** | Tasks | lib/server | Spec stabilisée | Future |

**Note importante :** L'implémentation de l'elicitation et des prompts nécessite d'abord
un travail dans `lib/server/src/concurrent-server.ts` pour câbler les handlers MCP
correspondants. Ce n'est pas spécifique à MBE/PLM — c'est un enrichissement du framework
serveur qui bénéficie à toutes les libs (std, mbe, plm).

**Position sur la compatibilité client :** On implémente **toutes** les features utiles
dans lib/server, indépendamment du support Claude Code. Si Claude Code ne supporte pas
l'elicitation, on construit notre propre client MCP dans **Minetest/Lua** (client 3D
interactif avec UI native). Le client Minetest communique avec les serveurs MCP via
HTTP + SSE et supporte toutes les features du protocole (elicitation, prompts, resources,
sampling). On ne sacrifie pas de fonctionnalité pour une limitation client.

---

## 11. Client MCP : Minetest/Lua

### 11.1. Pourquoi Minetest

Le client MCP principal n'est **pas** Claude Code ni un dashboard web classique.
C'est **Minetest** — un moteur 3D voxel open-source (C++/Lua) — qui sert de front-end
interactif pour piloter les tools MBE/PLM.

Avantages :
- **Visualisation 3D native** — idéal pour afficher géométries, assemblages, BOM trees
- **API Lua complète** — scripting facile pour l'UI, les formulaires, les workflows
- **Mod system extensible** — chaque domaine (MBE, PLM) peut être un mod Lua
- **Open-source** (LGPL 2.1) — pas de dépendance propriétaire
- **Léger** — tourne sur des configs modestes, pas besoin de GPU gaming

### 11.2. Architecture client Minetest ↔ MCP

```
┌──────────────────────────────────┐
│         Minetest Client          │
│  ┌─────────┐  ┌──────────────┐  │
│  │ Mod MBE │  │  Mod PLM     │  │
│  │ (Lua)   │  │  (Lua)       │  │
│  └────┬────┘  └──────┬───────┘  │
│       │              │          │
│  ┌────▼──────────────▼───────┐  │
│  │  MCP Client Lua           │  │
│  │  (HTTP + SSE + JSON-RPC)  │  │
│  └────────────┬──────────────┘  │
└───────────────┼──────────────────┘
                │ HTTP/SSE
    ┌───────────▼───────────┐
    │    MCP Gateway         │
    ├───────┬───────┬───────┤
    │lib/std│lib/mbe│lib/plm│
    └───────┴───────┴───────┘
```

### 11.3. Implémentation côté Lua

Le client MCP en Lua doit supporter :

| Feature MCP | Implémentation Lua |
|-------------|-------------------|
| tools/call | `minetest.request_http(url, callback)` → JSON-RPC |
| sampling | Afficher le prompt dans un formspec, envoyer la réponse |
| elicitation (form) | Formspec natif Minetest (champs texte, dropdown, checkbox) |
| elicitation (URL) | Ouvrir un browser ou afficher une iframe dans un HUD |
| resources | Lire et afficher dans des panels Minetest (inventaires, etc.) |
| prompts | Menu de sélection (slash commands) dans le chat Minetest |
| notifications | Afficher dans le HUD ou le chat |

Les **formspecs** Minetest sont parfaits pour l'elicitation — c'est déjà un système
de formulaires dynamiques avec fields, dropdowns, checkboxes, boutons.

### 11.4. Ce que ça change pour lib/mbe et lib/plm

Rien côté serveur. Les libs MCP restent identiques — le protocole MCP est agnostique au
client. Que ce soit Claude Code, un dashboard web ou Minetest/Lua, les serveurs MCP
exposent la même interface JSON-RPC.

La seule implication est qu'on doit s'assurer que les **formats de réponse** des tools
sont exploitables côté Lua (JSON standard, pas de types exotiques).

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

**OCCT côté serveur (Deno), pas côté client (Minetest).** Le parsing STEP est une
responsabilité serveur pour rester **client-agnostique**. Que le client soit Minetest,
Claude Code ou un dashboard web, le parsing fonctionne pareil.

Approche retenue :

1. **Phase 1 : opencascade.js (WASM) dans Deno** — plus simple à intégrer que FFI natif.
   Pas de compilation C++, pas de `.so` à gérer. Import WASM directement dans Deno.
   Suffisant pour les cas courants (pièces simples, assemblages modestes).

2. **Phase future (si besoin) : OCCT natif via Deno FFI** — si les perfs WASM ne suffisent
   pas pour les gros fichiers (>50 MB), on migre vers les bindings natifs.

**Retiré :** l'option "parsing côté Minetest via luaocc" est écartée — ça mélangerait les
responsabilités et rendrait le système dépendant du client.

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| opencascade.js WASM trop lent sur gros fichiers | Dégrade étape 1.1 | Benchmark tôt, migrer vers FFI natif si >5s sur fichiers courants |
| Pas de base matériaux open-source complète | Limite étape 1.2 | Commencer avec une DB embarquée (~50 matériaux courants), étendre après |
| Sampling non disponible en mode standalone | Limite Phase 3 | Les agent tools dégradent gracieusement (throw si pas de SamplingClient) — fail-fast policy |
| Performance FFI sur gros fichiers STEP (>100 MB) | Perf étape 1.1 | Implémenter streaming + timeout configurable |
| Client Lua HTTP dans Minetest limité (pas de SSE natif) | Limite features temps-réel | Utiliser polling ou mod Lua HTTP avancé (luasocket, curl FFI) |
| Tentation de parser côté client (Minetest) | Architecture floue, perd l'agnosticisme client | OCCT toujours côté serveur Deno — Minetest = pure UI/client |
