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
- [ ] Évaluer OpenCASCADE via Deno FFI (`.so`/`.dylib` natif)
- [ ] Compiler OpenCASCADE C++ comme shared library avec bindings C (extern "C")
- [ ] Créer `lib/mbe/src/ffi/occt.ts` — bindings Deno.dlopen() pour OCCT
- [ ] Implémenter le handler : load STEP → extract feature tree → return JSON
- [ ] Test : parser un fichier STEP simple (boîte, cylindre) et valider le feature tree
- [ ] Test : parser un assemblage multi-pièces et valider la hiérarchie

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
| 6 | STEP parsing | Deno FFI + OpenCASCADE C++ | Deno supporte FFI nativement, OCCT est le standard industriel open-source. Pas de WASM (perf + accès fichiers natif) | 2026-02-15 |
| 7 | Agent tools | Dans chaque lib (agent.ts) | Même pattern que lib/std, les agents composent les tools de leur domaine | 2026-02-15 |
| 8 | Agent timing | Après tools déterministes | Les agents composent les tools — il faut que ceux-ci marchent d'abord | 2026-02-15 |

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenCASCADE C++ compilation complexe pour Deno FFI | Bloque étape 1.1 | Préparer un fallback WASM (opencascade.js) si FFI trop complexe |
| Pas de base matériaux open-source complète | Limite étape 1.2 | Commencer avec une DB embarquée (~50 matériaux courants), étendre après |
| Sampling non disponible en mode standalone | Limite Phase 3 | Les agent tools dégradent gracieusement (throw si pas de SamplingClient) — fail-fast policy |
| Performance FFI sur gros fichiers STEP (>100 MB) | Perf étape 1.1 | Implémenter streaming + timeout configurable |
