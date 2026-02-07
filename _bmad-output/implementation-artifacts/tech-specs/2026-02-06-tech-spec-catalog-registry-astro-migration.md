---
title: 'Catalog Registry - Migration Fresh → Astro (Preact Island)'
slug: 'catalog-registry-astro-migration'
created: '2026-02-06'
status: 'ready-for-dev'
stepsCompleted: []
tech_stack:
  - 'Astro 5.x (lib/casys-hub-vitrine)'
  - '@astrojs/preact (island hydration)'
  - 'Preact 10.x (hooks, JSX)'
  - '@modelcontextprotocol/ext-apps/app-bridge (UI preview bridge)'
  - 'Vercel adapter (SSR + rewrites)'
files_to_modify:
  - 'lib/casys-hub-vitrine/package.json (add @astrojs/preact, preact deps)'
  - 'lib/casys-hub-vitrine/astro.config.mjs (add preact() integration + fix Vite proxy → 3003)'
  - 'lib/casys-hub-vitrine/vercel.json (add /api proxy rewrites for pml.casys.ai)'
  - 'lib/casys-hub-vitrine/src/pages/pml/catalog.astro (new - catalog route)'
  - 'lib/casys-hub-vitrine/src/pages/fr/pml/catalog.astro (new - FR route)'
  - 'lib/casys-hub-vitrine/src/pages/zh/pml/catalog.astro (new - ZH route)'
  - 'lib/casys-hub-vitrine/src/islands/catalog/ (new - entire island directory)'
  - 'lib/casys-hub-vitrine/src/layouts/PmlLayout.astro (add catalog nav link)'
  - 'src/api/catalog.ts (new - catalog API handlers migrated from Fresh)'
  - 'src/api/mod.ts (register handleCatalogRoutes)'
  - 'lib/server/src/concurrent-server.ts (add catalog route handler)'
code_patterns:
  - 'Preact island with client:load for full interactivity'
  - 'Catalog APIs migrated to src/api/catalog.ts (core API, port 3003)'
  - 'SSR data fetching in Astro frontmatter via fetch() to core API'
  - 'Shared Preact components copied with minimal import path changes'
  - 'Tailwind utility classes preserved (island is self-contained)'
test_patterns:
  - 'Manual: browse catalog at localhost:4321/pml/catalog'
  - 'Manual: search, filter, select tools, view detail panels'
  - 'Manual: UI component bento preview loads in iframes'
  - 'Build: npx astro build passes without errors'
---

# Tech-Spec: Catalog Registry - Migration Fresh → Astro (Preact Island)

**Created:** 2026-02-06

## Overview

### Problem Statement

La page catalog du registry PML (`/catalog`) est actuellement servie par Fresh/Deno (`src/web/routes/catalog.tsx`). Suite à la migration de la landing PML vers le site Astro (`lib/casys-hub-vitrine`), la page catalog doit aussi migrer pour que `pml.casys.ai/catalog` soit servie par le même site Astro.

La page catalog est une SPA interactive complexe (~4,700 LOC) : sidebar de catégories, search, bento grid avec live iframe previews (MCP Apps), chips de tools/capabilities avec detail panels dynamiques. Elle est entièrement construite en Preact (island hydraté).

### Solution

**Option A : Porter le CatalogPageIsland tel quel comme island Preact dans Astro.**

- Installer `@astrojs/preact` dans le site Astro
- Copier le `CatalogPageIsland` + ses dépendances Preact dans `src/islands/catalog/`
- Les 3 endpoints catalog API sont migrés directement de Fresh (`src/web/routes/api/`) vers le core API (`src/api/catalog.ts`, port 3003)
- `/api/ui/resource` existe **déjà** dans le core API (`src/api/ui-resources.ts`) — pas besoin de migrer
- Les données initiales (`entries`) sont chargées SSR côté Astro via `fetch()` vers le core API
- En prod : Vercel rewrites proxifient `pml.casys.ai/api/*` → core API prod
- En dev : Vite proxy proxifie `/api/*` → `localhost:3003`

Cette approche :
- Préserve 100% de l'interactivité existante (search, filters, previews, AppBridge)
- Élimine la dépendance au serveur Fresh pour le catalog public
- Fresh reste uniquement pour le dashboard authentifié (post-login)

### Scope

**In Scope:**
- Installation de `@astrojs/preact` dans le projet Astro
- Copie du `CatalogPageIsland` + composants partagés comme island Preact
- Routes Astro `/pml/catalog` (en/fr/zh)
- Migration des 3 endpoints catalog API de Fresh vers `src/api/catalog.ts` (core API, port 3003)
- Vercel rewrites pour proxifier `pml.casys.ai/api/*` vers le core API prod
- Mise à jour du Vite proxy dev vers `localhost:3003`
- Adaptation des imports (chemins relatifs → paths locaux)
- Remplacement du `VitrineHeader` Fresh par le `PmlLayout` Astro
- Ajout du lien "Catalog" dans la nav PML

**Out of Scope:**
- Réécriture de l'island en vanilla JS/Astro natif
- Migration des pages detail individuelles (`/catalog/[serverId]`, `/catalog/ns/[namespace]`) — tout est déjà dans la page principale
- i18n du contenu catalog (actuellement FR hardcoded dans l'island)
- Dark/light mode toggle (le catalog est dark-only)

## Context for Development

### Architecture Actuelle (Fresh)

```
src/web/routes/catalog.tsx          → SSR: query pml_registry, passe entries à l'island
  └── CatalogPageIsland.tsx (864L)  → Preact island (sidebar + grid + details)
        ├── VitrineHeader            → Header Fresh (à remplacer par PmlLayout)
        ├── BentoPreview             → Lazy-loaded iframe + AppBridge
        │     └── AppBridge + PostMessageTransport + getMockData()
        ├── DetailPanel              → Fetches /api/catalog/tool/ ou /capability/
        │     ├── ToolDetailPanel (637L)   → Schema + live UI preview
        │     │     ├── SchemaViewer (310L)
        │     │     ├── AppBridge (preview)
        │     │     └── getMockData()
        │     └── CapabilityDetailPanel (438L) → Code + tools used
        │           ├── CodeBlock (80L)
        │           ├── InputSchema (68L)
        │           ├── ToolBadge (61L)
        │           └── parseToolId() (68L)
        └── ui-component-categories.ts (386L) + ui-mock-data.ts (977L)
```

### APIs à Migrer (Fresh → Core API)

Les 3 endpoints suivants doivent migrer de `src/web/routes/api/` vers `src/api/catalog.ts` :

| Endpoint | Source Fresh | Destination Core | DB Tables |
|----------|-------------|-----------------|-----------|
| `GET /api/catalog/entries` | Inline dans `catalog.tsx:28-74` | `src/api/catalog.ts` | `pml_registry` + `tool_schema` |
| `GET /api/catalog/tool/:toolId` | `src/web/routes/api/catalog/tool/[toolId].ts` (106L) | `src/api/catalog.ts` | `tool_schema` |
| `GET /api/catalog/capability/:capId` | `src/web/routes/api/catalog/capability/[capabilityId].ts` (112L) | `src/api/catalog.ts` | `pml_registry` + `workflow_pattern` |

**Note :** `/api/ui/resource` existe **déjà** dans le core API (`src/api/ui-resources.ts`, 182L) — pas besoin de migrer.

### Pattern Core API (à suivre)

Les handlers dans `src/api/` suivent ce pattern :
```typescript
import type { RouteContext } from "../mcp/routing/types.ts";
import { jsonResponse } from "../mcp/routing/types.ts";

export async function handleCatalogRoutes(
  req: Request, url: URL, ctx: RouteContext, corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (url.pathname === "/api/catalog/entries" && req.method === "GET") {
    return handleCatalogEntries(req, url, ctx, corsHeaders);
  }
  // ...
  return null;
}
```

Routes enregistrées dans `src/api/mod.ts` (export) puis raccordées dans le serveur concurrent.

### Données Initiales (entries)

La query SQL inline du route handler Fresh (`catalog.tsx:28-74`) sera migrée dans `handleCatalogEntries` :
```sql
SELECT r.record_type, r.id, r.name, r.description, r.routing,
       r.server_id, r.namespace, r.action,
       COALESCE(ts.ui_meta IS NOT NULL, false) as has_ui
FROM pml_registry r
LEFT JOIN tool_schema ts ON r.record_type = 'mcp-tool' AND r.id = ts.tool_id
WHERE r.visibility = 'public'
ORDER BY r.record_type, r.name
LIMIT 500
```

L'Astro route fera un `fetch()` SSR vers `${API_URL}/api/catalog/entries`.

### Fichiers à Copier (Dependency Tree Complet)

| Source (Fresh) | Destination (Astro) | Lines |
|---|---|---|
| `src/web/islands/CatalogPageIsland.tsx` | `src/islands/catalog/CatalogPageIsland.tsx` | 864 |
| `src/web/components/shared/ToolDetailPanel.tsx` | `src/islands/catalog/shared/ToolDetailPanel.tsx` | 637 |
| `src/web/components/shared/CapabilityDetailPanel.tsx` | `src/islands/catalog/shared/CapabilityDetailPanel.tsx` | 438 |
| `src/web/components/shared/SchemaViewer.tsx` | `src/islands/catalog/shared/SchemaViewer.tsx` | 310 |
| `src/web/components/ui/atoms/CodeBlock.tsx` | `src/islands/catalog/atoms/CodeBlock.tsx` | 80 |
| `src/web/components/ui/atoms/InputSchema.tsx` | `src/islands/catalog/atoms/InputSchema.tsx` | 68 |
| `src/web/components/ui/atoms/ToolBadge.tsx` | `src/islands/catalog/atoms/ToolBadge.tsx` | 61 |
| `src/web/data/ui-component-categories.ts` | `src/islands/catalog/data/ui-component-categories.ts` | 386 |
| `src/web/data/ui-mock-data.ts` | `src/islands/catalog/data/ui-mock-data.ts` | 977 |
| `src/capabilities/tool-id-utils.ts` | `src/islands/catalog/utils/tool-id-utils.ts` | 68 |
| `src/cloud/ui/catalog/types.ts` | `src/islands/catalog/types.ts` | 70 |

**Total : ~3,960 LOC à copier + adapter les imports**

### Dépendances NPM à Ajouter

```json
{
  "@astrojs/preact": "^4.x",
  "preact": "^10.x",
  "@modelcontextprotocol/ext-apps": "^x.x.x"
}
```

Note : `@modelcontextprotocol/ext-apps` est nécessaire pour `AppBridge` et `PostMessageTransport` (live UI previews). Vérifier la version exacte dans le `deno.json` de Fresh.

### Technical Decisions

1. **Preact (pas React)** — Le code existant est en Preact, le porter en React ajouterait du risque inutile. `@astrojs/preact` est léger.
2. **Island self-contained** — Tout dans `src/islands/catalog/` avec imports internes. Pas de partage avec les composants Astro natifs.
3. **APIs migrées vers core API (port 3003)** — Les 3 endpoints catalog (`entries`, `tool/:id`, `capability/:id`) migrent dans `src/api/catalog.ts`. `/api/ui/resource` existe déjà dans `src/api/ui-resources.ts`. Fresh reste uniquement pour le dashboard authentifié.
4. **Dark-only** — Le catalog utilise une palette dark hardcodée (Tailwind classes). Pas de light mode pour l'instant.
5. **VitrineHeader remplacé** — L'island n'inclut plus le header Fresh. Le `PmlLayout.astro` fournit le header. L'island commence directement au `<div class="flex flex-1 ...">`.
6. **SSR data loading** — L'Astro route fait un `fetch()` côté serveur vers `${API_URL}/api/catalog/entries`. Fallback : données statiques mock si API indisponible.
7. **Tailwind dans l'island** — Les classes Tailwind sont utilisées directement dans le JSX. Decision : utiliser le CDN Tailwind dans la page catalog uniquement (pas d'impact sur le reste du site qui utilise CSS scopé + M3 variables).
8. **Vite proxy dev** — `astro.config.mjs` proxy `/api/*` → `localhost:3003` (core API). En prod, Vercel rewrites assurent le routage.

## Implementation Plan

### Tasks

- [ ] **Task 1: Install Preact integration**
  - Files: `lib/casys-hub-vitrine/package.json`, `lib/casys-hub-vitrine/astro.config.mjs`
  - Action: `pnpm add @astrojs/preact preact` et ajouter `preact()` dans integrations
  - Notes: Vérifier compat avec les intégrations existantes (mdx, icon, vercel)

- [ ] **Task 2: Handle Tailwind CSS for the island**
  - Files: `lib/casys-hub-vitrine/astro.config.mjs`, potentiellement `tailwind.config.js`
  - Action: Le `CatalogPageIsland` utilise massivement Tailwind (classes inline). Options :
    - **Option A** : Installer `@astrojs/tailwind` dans le projet Astro (impacte tout le site)
    - **Option B** : Utiliser le CDN Tailwind `<script src="https://cdn.tailwindcss.com">` uniquement dans la page catalog
    - **Option C** : Extraire les styles Tailwind utilisés dans un CSS scopé
  - Decision: Option B recommandée (CDN, scopé à la page catalog, pas d'impact sur le reste du site qui utilise CSS scopé + M3 variables)
  - Notes: Ajouter les custom colors PML (`pml-accent`, `pml-bg`, `pml-text`, `pml-text-dim`) dans le config Tailwind CDN

- [ ] **Task 3: Copy CatalogPageIsland + dependencies**
  - Files: Créer `src/islands/catalog/` avec la structure complète (voir tableau ci-dessus)
  - Action:
    1. Copier les 11 fichiers source
    2. Adapter tous les chemins d'import relatifs
    3. Retirer l'import de `VitrineHeader` de `CatalogPageIsland.tsx`
    4. Retirer le `<VitrineHeader>` et le `<footer>` du JSX (fournis par PmlLayout)
    5. Ajuster le `pt-[60px]` pour matcher la hauteur du header PML
  - Notes: Le `CatalogEntry` type dans `types.ts` est simple (pas de deps externes)

- [ ] **Task 4: Install @modelcontextprotocol/ext-apps**
  - File: `lib/casys-hub-vitrine/package.json`
  - Action: `pnpm add @modelcontextprotocol/ext-apps`
  - Notes: Nécessaire pour `AppBridge` + `PostMessageTransport` dans les previews live. Vérifier la version dans `deno.json` root :
    ```
    grep "ext-apps" /home/ubuntu/CascadeProjects/AgentCards/deno.json
    ```

- [ ] **Task 5: Create catalog API handlers in core API**
  - File: `src/api/catalog.ts` (new)
  - Action: Créer 3 handlers en suivant le pattern `RouteContext` + `jsonResponse` :
    1. `handleCatalogEntries(req, url, ctx, cors)` — query `pml_registry` + `tool_schema` (500 entrées publiques)
    2. `handleCatalogToolDetail(req, url, ctx, cors)` — query `tool_schema` par `tool_id` (input_schema + ui_meta JSON)
    3. `handleCatalogCapabilityDetail(req, url, ctx, cors)` — query `pml_registry` + `workflow_pattern` par id
  - Routing: `handleCatalogRoutes()` dispatche par pathname (`/api/catalog/entries`, `/api/catalog/tool/:id`, `/api/catalog/capability/:id`)
  - Notes:
    - Utiliser `ctx.db!` comme les autres handlers (pas `getRawDb()` comme Fresh)
    - Le handler tool doit gérer le double-encoding JSON de `ui_meta` (voir `[toolId].ts:47-68` dans Fresh)
    - Ajouter CORS headers pour les appels cross-origin depuis `pml.casys.ai`

- [ ] **Task 5b: Register catalog routes in core API**
  - Files: `src/api/mod.ts`, `lib/server/src/concurrent-server.ts`
  - Action:
    1. Ajouter `export { handleCatalogRoutes } from "./catalog.ts";` dans `mod.ts`
    2. Ajouter `handleCatalogRoutes` dans la chaîne de routing du serveur concurrent
  - Notes: Suivre le pattern des autres routes (`handleToolsRoutes`, `handleMcpRegistryRoutes`, etc.)

- [ ] **Task 6: Configure Vercel rewrites + Vite proxy pour API**
  - Files: `lib/casys-hub-vitrine/vercel.json`, `lib/casys-hub-vitrine/astro.config.mjs`
  - Action:
    1. **Vercel rewrites** (prod) : proxifier `pml.casys.ai/api/*` → core API prod :
       ```json
       {
         "source": "/api/catalog/:path*",
         "has": [{ "type": "host", "value": "pml.casys.ai" }],
         "destination": "https://api.casys.ai/api/catalog/:path*"
       },
       {
         "source": "/api/ui/:path*",
         "has": [{ "type": "host", "value": "pml.casys.ai" }],
         "destination": "https://api.casys.ai/api/ui/:path*"
       }
       ```
    2. **Vite proxy** (dev) : mettre à jour le proxy dans `astro.config.mjs` de `localhost:3001` → `localhost:3003`
  - Notes: 3 endpoints à proxifier : `/api/catalog/entries`, `/api/catalog/tool/*`, `/api/catalog/capability/*`, `/api/ui/resource`

- [ ] **Task 7: Create catalog Astro routes (en/fr/zh)**
  - Files: `src/pages/pml/catalog.astro`, `src/pages/fr/pml/catalog.astro`, `src/pages/zh/pml/catalog.astro`
  - Action: Créer les 3 routes qui :
    1. Utilisent `PmlLayout`
    2. Fetch les entries SSR via `fetch('API_URL/api/catalog/entries')`
    3. Rendent `<CatalogPageIsland client:load entries={entries} />`
    4. Incluent le Tailwind CDN script (pour le catalog uniquement)
  - Template :
    ```astro
    ---
    import PmlLayout from '../../layouts/PmlLayout.astro';
    import CatalogPageIsland from '../../islands/catalog/CatalogPageIsland.tsx';

    const apiUrl = import.meta.env.CASYS_API_URL ?? 'http://localhost:3003';
    let entries = [];
    try {
      const res = await fetch(`${apiUrl}/api/catalog/entries`);
      if (res.ok) entries = await res.json();
    } catch { /* fallback empty */ }
    ---
    <PmlLayout title="Registry Catalog - Casys PML">
      <script is:inline src="https://cdn.tailwindcss.com"></script>
      <script is:inline>
        tailwind.config = {
          theme: {
            extend: {
              colors: {
                'pml-accent': '#FFB86F',
                'pml-bg': '#0a0908',
                'pml-text': '#f5f0ea',
                'pml-text-dim': '#78716c',
              }
            }
          }
        }
      </script>
      <CatalogPageIsland client:load entries={entries} />
    </PmlLayout>
    ```
  - Notes: `client:load` car la page entière est interactive dès le chargement

- [ ] **Task 8: Update PmlLayout nav with catalog link**
  - File: `lib/casys-hub-vitrine/src/layouts/PmlLayout.astro`
  - Action: Ajouter un lien "Catalog" dans la nav du header PML (desktop + mobile)
  - Notes: Le lien pointe vers `/pml/catalog` (ou `/{locale}/pml/catalog`)

- [ ] **Task 9: Update env var + verify proxy chain**
  - Files: `lib/casys-hub-vitrine/astro.config.mjs`, env Vercel
  - Action:
    1. S'assurer que `CASYS_API_URL` pointe vers `http://localhost:3003` en dev
    2. En prod (Vercel env), configurer `CASYS_API_URL=https://api.casys.ai` (ou utiliser les rewrites)
    3. Vérifier que le proxy Vite dev fonctionne pour les 3 endpoints catalog + `/api/ui/resource`
  - Notes: Fresh reste pour le dashboard authentifié — les routes Fresh catalog deviennent obsolètes mais ne sont pas supprimées (backward compat)

- [ ] **Task 10: Verify and test**
  - Action:
    1. `npx astro build` dans `lib/casys-hub-vitrine/` → pas d'erreur
    2. `npx astro dev` → naviguer vers `localhost:4321/pml/catalog`
    3. Vérifier : sidebar catégories visible, search fonctionne
    4. Vérifier : cliquer un tool → detail panel s'ouvre (nécessite core API running sur port 3003)
    5. Vérifier : UI components bento grid avec live previews (nécessite core API + ui cache service)
    6. Vérifier : responsive (mobile sidebar collapse)
    7. Vérifier : les 3 langues (`/pml/catalog`, `/fr/pml/catalog`, `/zh/pml/catalog`)

### Acceptance Criteria

- [ ] **AC 1**: `pml.casys.ai/catalog` (Astro) affiche le même catalog que l'ancien `/catalog` (Fresh)
- [ ] **AC 2**: La sidebar catégories (UI Components / MCP Tools / Workflows) fonctionne avec filtrage
- [ ] **AC 3**: La recherche filtre les items par nom et description
- [ ] **AC 4**: Cliquer un tool chip ouvre le ToolDetailPanel avec schema + UI preview
- [ ] **AC 5**: Cliquer une capability chip ouvre le CapabilityDetailPanel avec code + tools used
- [ ] **AC 6**: Les bento previews UI Components chargent les iframes avec AppBridge
- [ ] **AC 7**: Le header PML (logo Casys + nav) est visible et cohérent avec la landing
- [ ] **AC 8**: Les routes `/pml/catalog`, `/fr/pml/catalog`, `/zh/pml/catalog` sont accessibles
- [ ] **AC 9**: `npx astro build` passe sans erreur
- [ ] **AC 10**: Les API calls sont correctement routés vers le core API (port 3003 en dev, Vercel rewrites en prod)

## Additional Context

### Dependency Graph Visuel

```
Page: /pml/catalog (Astro SSR)
│
├── PmlLayout.astro (header + footer)
│
└── CatalogPageIsland.tsx (client:load)
    │   ↓ Preact island (hydrated)
    │
    ├── [SSR props] entries: CatalogEntry[]
    │     ↑ fetched from /api/catalog/entries (core API, port 3003)
    │
    ├── BentoPreview (per UI component)
    │   ├── IntersectionObserver (lazy load)
    │   ├── <iframe> → /api/ui/resource?uri=... (core API - déjà existant)
    │   ├── AppBridge + PostMessageTransport
    │   └── getMockData() (static, bundled)
    │
    ├── DetailPanel (on tool/capability click)
    │   ├── fetch(/api/catalog/tool/:id) → ToolDetailPanel
    │   │     ├── SchemaViewer (JSON Schema → tree)
    │   │     └── UiPreview (AppBridge iframe)
    │   └── fetch(/api/catalog/capability/:id) → CapabilityDetailPanel
    │         ├── CodeBlock (syntax highlight)
    │         ├── InputSchema (params table)
    │         └── ToolBadge (tool pills)
    │
    └── Categories + Search (local state, useMemo)
```

### Risques

| Risque | Impact | Mitigation |
|--------|--------|------------|
| `@modelcontextprotocol/ext-apps` incompatible avec Node (Astro/Vite) | Iframes ne marchent pas | Tester l'import tôt (Task 4). Fallback : mock l'AppBridge |
| Tailwind CDN lent ou FOUC | Flash de contenu non-stylé | Ajouter critical CSS inline pour le layout de base |
| CORS bloque les fetch SSR depuis Vercel | Pas de données initiales | Les handlers core API incluent déjà `corsHeaders` — vérifier la config prod |
| Preact version mismatch | Erreurs hydration | Pin la même version que Fresh (`deno.json`) |

### Notes

- Le `VitrineHeader` Fresh est remplacé par `PmlLayout.astro` — il faut retirer le header/footer du JSX de l'island
- Les custom Tailwind classes (`pml-accent`, `pml-bg`, `pml-text`, `pml-text-dim`) sont définies dans le Tailwind config Fresh — à reproduire dans le CDN config
- Le catalog est dark-only (pas de light mode) — cohérent avec la landing PML
- Les animations (`bentoIn`, `chipIn`, `slideUp`) sont définies inline dans un `<style>` block dans l'island — elles fonctionneront telles quelles
- L'`astro.config.mjs` a un proxy Vite vers `localhost:3001` — à changer vers `localhost:3003` (core API)
- Fresh reste en place pour le dashboard authentifié (`/dashboard/*`, post-login) — les routes catalog Fresh deviennent obsolètes mais ne sont pas supprimées immédiatement
- `src/api/ui-resources.ts` (182L) gère déjà `/api/ui/resource` avec cache, AppBridge, et CSP headers — pas besoin de migrer cet endpoint
