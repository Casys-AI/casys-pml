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

## 7. Roadmap

### Phase 1 — lib/mbe (Primitives)

1. Scaffold (types, client, server, deno.json)
2. `geometry.ts` — STEP parsing, feature tree, BRep
3. `tolerance.ts` — GD&T parsing, tolerance stacking
4. `material.ts` — Material DB, property lookups
5. `model.ts` — PMI extraction, MBD validation
6. Tests unitaires par catégorie

### Phase 2 — lib/plm (Métier)

1. Scaffold (types, client, server, deno.json)
2. `bom.ts` — BOM generation, flattening, costing
3. `change.ts` — ECR/ECO workflows
4. `quality.ts` — Inspection plans, FAIR, PPAP
5. `planning.ts` — Routing, work instructions
6. Tests + intégration avec lib/mbe

### Phase 3 — Intégration Gateway

1. Enregistrer les tools MBE/PLM dans le discovery engine
2. Embeddings BGE-M3 pour les tools domaine
3. DAG suggestions pour workflows cross-lib (std + mbe + plm)
4. Capabilities auto-capture pour les patterns métier

---

## 8. Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Validation | AJV via lib/server | Cohérent avec lib/std, JSON Schema standard |
| Naming | `mbe_` / `plm_` prefix | Évite collisions, discovery claire |
| Categories | Separate type unions | Extensible indépendamment de lib/std |
| Server ports | 3009 / 3010 | Suite logique après lib/std (3008) |
| Dependency | plm → mbe → server | mbe ne dépend pas de std |
