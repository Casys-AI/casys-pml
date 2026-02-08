# Tech Spec: MCP-STD UI Decoupling

**Date:** 2026-02-03
**Status:** ✅ Complete (100%)
**Epic:** MCP Apps UI Components
**Last Updated:** 2026-02-03

### Progress Summary
- **38 UI components** built and available in `lib/std/src/ui/dist/`
- **100+ tools** created/mapped with `_meta.ui` configuration
- **Completed:**
  - All new tools and UIs from Phases 1-6
  - All existing tool mappings: `color_*` (13), `crypto_*` (19), `validate_*` (11), `math_*` (7), `geo_*` (10), `transform_*` (8), `encode_*` (10)
  - 2 new math tools: `math_percentile`, `math_correlation`
  - E2E tests: `tests/e2e/ui-components_test.ts` (16 test suites, 241 checks)
  - Unit tests: `tests/unit/lib/std/new-tools_test.ts` (24 tests)
  - Documentation: `lib/std/src/ui/README.md` (complete with Events Reference)
  - diff-viewer enhancement: inline/side-by-side toggle with localStorage persistence

---

## Contexte

Le serveur `mcp-std` expose ~460 tools. Chaque tool peut référencer un composant UI via `_meta.ui.resourceUri`. L'objectif est de découpler les tools pour que chaque type d'output ait son propre composant UI spécialisé.

### Principe
```
1 tool = 1 responsabilité = 1 UI
```

### Stack UI
- **Preact** - Rendu
- **Panda CSS** - Styling
- **Park UI** - Composants (on peut en créer de nouveaux)
- **MCP Apps SDK** - Communication avec l'extension

---

## Inventaire Composants UI Existants (14)

| Composant | Description | Status |
|-----------|-------------|--------|
| `table-viewer` | Tableau interactif tri/filtre/pagination | ✅ Complet |
| `json-viewer` | Arbre JSON collapsible | ✅ Complet |
| `diff-viewer` | Comparaison côte-à-côte | ✅ Complet |
| `log-viewer` | Streaming de logs temps réel | ✅ Complet |
| `schema-viewer` | Structure table DB | ✅ Complet |
| `erd-viewer` | Diagramme relations FK | ✅ Complet |
| `chart-viewer` | Graphiques ECharts | ✅ Complet |
| `metrics-panel` | KPIs et métriques | ✅ Complet |
| `gauge` | Jauge circulaire | ✅ Complet |
| `sparkline` | Mini graphique inline | ✅ Complet |
| `status-badge` | Badge statut | ✅ Complet |
| `qr-viewer` | Affichage QR code | ✅ Complet |
| `color-picker` | Sélecteur couleur | ✅ Complet |
| `form-viewer` | Formulaire dynamique | ✅ Complet |

---

## Phase 1: Database Tools

### 1.1 PostgreSQL

#### Tools existants à mapper
- [ ] `psql_query` → `table-viewer` ✅
- [ ] `psql_tables` → `table-viewer`
- [ ] `psql_schema` → `schema-viewer` ✅
- [ ] `psql_erd` → `erd-viewer` ✅

#### Nouveaux tools à créer
- [x] `psql_explain` - EXPLAIN ANALYZE
  - [x] Créer le tool dans `database.ts`
  - [x] Créer `plan-viewer` UI
  - [x] Ajouter `_meta.ui`
- [x] `psql_stats` - pg_stat_user_tables, tailles
  - [x] Créer le tool
  - [x] Mapper vers `metrics-panel`
- [x] `psql_indexes` - Liste des index avec stats
  - [x] Créer le tool
  - [x] Mapper vers `table-viewer`
- [x] `psql_locks` - Verrous actifs
  - [x] Créer le tool
  - [x] Mapper vers `table-viewer`
- [x] `psql_connections` - Connexions actives
  - [x] Créer le tool
  - [x] Mapper vers `table-viewer`

#### Nouveau composant: `plan-viewer`
- [x] Structure de base (index.html, main.tsx, styles.css)
- [x] Parser EXPLAIN ANALYZE JSON
- [x] Arbre des opérations avec coûts
- [x] Barre de coût relative par noeud
- [x] Highlight des opérations lentes
- [x] Détails au hover (rows, width, buffers)

### 1.2 SQLite (existant)

- [ ] `sqlite_query` → `table-viewer`
- [ ] `sqlite_tables` → `table-viewer`
- [ ] `sqlite_schema` → `schema-viewer`
- [ ] `sqlite_info` → `schema-viewer`

### 1.3 PGLite (embedded)

- [ ] `pglite_query` → `table-viewer`
- [ ] `pglite_exec` → `status-badge`

### 1.4 Redis

- [ ] `redis_cli` → `json-viewer`
- [ ] `redis_keys` → `table-viewer`
- [ ] `redis_info` → `metrics-panel`
- [ ] `redis_get` → `json-viewer`

### 1.5 MongoDB

- [ ] `mongo_query` → `json-viewer`
- [ ] `mongo_collections` → `table-viewer`

---

## Phase 2: Git Tools

### Tools existants à mapper
- [ ] `git_status` → `table-viewer` ✅
- [ ] `git_log` → `table-viewer` ✅
- [ ] `git_diff` → `diff-viewer` ✅
- [ ] `git_branch` → `table-viewer` ✅

### Nouveaux tools à créer

#### `git_blame`
- [x] Créer le tool dans `git.ts`
- [x] Créer `blame-viewer` UI
  - [x] Code avec annotations par ligne
  - [x] Couleurs par auteur (hash → color)
  - [x] Hover pour détails commit
  - [x] Clic pour voir le commit complet
- [x] Ajouter `_meta.ui`

#### `git_graph`
- [x] Créer le tool (git log --graph --oneline --all)
- [x] Créer `commit-graph` UI
  - [x] SVG pour les lignes de branches
  - [x] Noeuds de commits cliquables
  - [x] Couleurs par branche
  - [x] Zoom/pan
- [x] Ajouter `_meta.ui`

#### `git_stash_list`
- [x] Créer le tool
- [x] Mapper vers `table-viewer`

#### `git_contributors`
- [x] Créer le tool (git shortlog -sn)
- [x] Mapper vers `chart-viewer` (bar chart)

#### `git_file_history`
- [x] Créer le tool (git log --follow -- file)
- [x] Mapper vers `table-viewer` avec timeline

---

## Phase 3: Docker Tools

### Tools existants à mapper
- [ ] `docker_images` → `table-viewer`
- [ ] `docker_ps` → `table-viewer`
- [ ] `docker_network_ls` → `table-viewer`
- [ ] `docker_volume_ls` → `table-viewer`

### Nouveaux tools à créer

#### `docker_inspect`
- [x] Créer le tool
- [x] Mapper vers `json-viewer`

#### `docker_stats`
- [x] Créer le tool (stats en temps réel)
- [x] Créer `resource-monitor` UI
  - [x] Gauges CPU/Memory
  - [x] Sparklines historique
  - [x] Network I/O
- [x] Ajouter `_meta.ui`

#### `docker_logs`
- [x] Créer le tool
- [x] Mapper vers `log-viewer`

#### `docker_compose_ps`
- [x] Créer le tool
- [x] Mapper vers `table-viewer`

#### `docker_diff`
- [x] Créer le tool (docker diff)
- [x] Mapper vers `diff-viewer`

---

## Phase 4: Kubernetes Tools

### Tools existants à mapper
- [ ] `kubectl_get` → `table-viewer`
- [ ] `kubectl_logs` → `log-viewer`
- [ ] `kubectl_apply` → `status-badge`
- [ ] `kubectl_exec` → `log-viewer`

### Nouveaux tools à créer

#### `kubectl_describe`
- [x] Créer le tool
- [x] Créer `yaml-viewer` UI
  - [x] Coloration syntaxique YAML
  - [x] Sections collapsibles
  - [x] Recherche
  - [x] Copy to clipboard
- [x] Ajouter `_meta.ui`

#### `kubectl_events`
- [x] Créer le tool
- [x] Créer `timeline-viewer` UI
  - [x] Événements sur axe temporel
  - [x] Filtrage par type (Normal, Warning)
  - [x] Regroupement par objet
- [x] Ajouter `_meta.ui`

#### `kubectl_top`
- [x] Créer le tool (kubectl top pods/nodes)
- [x] Mapper vers `metrics-panel`

#### `kubectl_rollout_status`
- [x] Créer le tool
- [x] Mapper vers `status-badge`

---

## Phase 5: Network/HTTP Tools

### Tools existants à mapper
- [ ] `http_request` → `json-viewer`
- [ ] `curl_fetch` → `json-viewer`
- [ ] `http_parse_url` → `json-viewer`
- [ ] `traceroute` → `table-viewer`

### Nouveaux tools à créer

#### `http_headers`
- [x] Créer le tool (headers only)
- [x] Créer `headers-viewer` UI
  - [x] Table key/value
  - [x] Highlight des headers importants
  - [x] Explication au hover
- [x] Ajouter `_meta.ui`

#### `http_timing`
- [x] Créer le tool (curl timing breakdown)
- [x] Créer `waterfall-viewer` UI
  - [x] DNS, Connect, TLS, TTFB, Download
  - [x] Barres horizontales
- [x] Ajouter `_meta.ui`

#### `ssl_check`
- [x] Créer le tool (certificat SSL)
- [x] Créer `certificate-viewer` UI
  - [x] Chain de certificats
  - [x] Dates d'expiration
  - [x] Status badge validity
- [x] Ajouter `_meta.ui`

#### `dns_lookup`
- [x] Créer le tool (dig-like)
- [x] Mapper vers `table-viewer`

#### `whois_lookup`
- [x] Créer le tool
- [x] Mapper vers `json-viewer`

---

## Phase 6: Process/System Tools

### Tools existants à mapper
- [x] `du` → `disk-usage-viewer` (treemap)
- [ ] `process_kill` → `status-badge`

### Nouveaux tools à créer

#### `ps_tree`
- [x] Créer le tool (pstree format)
- [x] Créer `tree-viewer` UI
  - [x] Arborescence collapsible
  - [x] Icônes par type de process
  - [x] PID, CPU, MEM inline
  - [x] Recherche
- [x] Ajouter `_meta.ui`

#### `top_snapshot`
- [x] Créer le tool
- [x] Mapper vers `table-viewer` avec sorting

#### `disk_usage`
- [x] Utilise tool `du` existant (mappé vers `disk-usage-viewer`)
- [x] Créer `disk-usage-viewer` UI
  - [x] Treemap des répertoires
  - [x] Ou pie chart
  - [x] Drill-down
- [x] Ajouter `_meta.ui`

#### `memory_info`
- [x] Créer le tool (/proc/meminfo)
- [x] Mapper vers `metrics-panel`

#### `netstat_connections`
- [x] Créer le tool
- [x] Mapper vers `table-viewer`

---

## Phase 7: Color Tools

### Tools existants
- [x] `color_hex_to_rgb` → `color-picker`
- [x] `color_rgb_to_hex` → `color-picker`
- [x] `color_rgb_to_hsl` → `color-picker`
- [x] `color_parse` → `color-picker`
- [x] `color_lighten` → `color-picker`
- [x] `color_darken` → `color-picker`
- [x] Tous les `color_*` → `color-picker` (13 tools mapped)

### Amélioration `color-picker`
- [x] Afficher input ET output
- [x] Preview before/after
- [x] Palette générée (complémentaire, analogues)

### Nouveaux tools
#### `color_palette`
- [x] Créer le tool (génère palette de N couleurs)
- [x] Créer `palette-viewer` UI
  - [x] Swatches cliquables
  - [x] Export CSS variables
  - [x] Contrast checker
- [x] Ajouter `_meta.ui`

#### `color_contrast`
- [x] Créer le tool (WCAG contrast ratio)
- [x] Mapper vers `gauge` + `status-badge`

---

## Phase 8: Crypto/Encoding Tools

### Tools existants à mapper
- [x] `crypto_hash` → `json-viewer` simple
- [x] `crypto_uuid` → `json-viewer` simple
- [x] `crypto_jwt_decode` → `jwt-viewer` ✅ (déjà configuré)
- [x] `crypto_password` → `status-badge`

### Nouveaux tools

#### `jwt_inspector`
- [x] Tool existant: `crypto_jwt_decode` (fait la même chose)
- [x] Créer `jwt-viewer` UI
  - [x] Header / Payload / Signature séparés
  - [x] Coloration JSON
  - [x] Expiration status
  - [x] Claims expliqués
- [x] `_meta.ui` configuré sur `crypto_jwt_decode`

#### `crypto_analyze`
- [x] Créer le tool (détecte type d'encodage)
- [x] Mapper vers `json-viewer`

### Encodings à mapper
- [x] `encode_morse` → `json-viewer`
- [x] `encode_nato` → `table-viewer`
- [x] `encode_binary` → `json-viewer`

---

## Phase 9: Math/Stats Tools

### Tools existants à mapper
- [x] `math_eval` → `json-viewer`
- [x] `math_stats` → `metrics-panel`
- [x] `math_linear_regression` → `chart-viewer`

### Nouveaux tools ajoutés
- [x] `math_percentile` → `metrics-panel`
- [x] `math_correlation` → `chart-viewer`

### Amélioration
#### `math_stats` enhanced
- [x] Mapped to `metrics-panel` with enhanced display
- [ ] Future: `stats-panel` UI with Histogram, Box plot, Distribution curve (optional)

---

## Phase 10: Geo Tools

### Tools existants à mapper
- [x] `geo_distance` → `map-viewer`
- [x] `geo_nearest` → `map-viewer`
- [x] `geo_distance_matrix` → `table-viewer`
- [x] `geo_validate` → `status-badge`
- [x] `geo_bounds` → `map-viewer`
- [x] `geo_point_in_polygon` → `map-viewer`

### Nouveaux composants

#### `map-viewer`
- [x] Créer composant (SVG-based, simplified approach)
  - [x] Afficher points
  - [x] Lignes de distance
  - [x] Polygones
  - [x] Popup au clic
- [x] Mapper:
  - [x] `geo_distance` → ligne entre 2 points
  - [x] `geo_nearest` → points avec highlight du plus proche
  - [x] `geo_bounds` → rectangle
  - [x] `geo_point_in_polygon` → polygone + point

---

## Phase 11: Data Transform Tools

### Tools existants à mapper
- [x] `transform_csv_parse` → `table-viewer`
- [x] `transform_json_to_csv` → `table-viewer`
- [x] `transform_csv_to_json` → `json-viewer`
- [x] `transform_xml_to_json` → `xml-viewer`

### Nouveaux composants

#### `xml-viewer`
- [x] Créer composant
  - [x] Arbre XML collapsible
  - [x] Coloration syntaxique
  - [x] Attributs stylés différemment
- [x] Mapper `transform_xml_to_json` → `xml-viewer`

---

## Phase 12: Validation Tools

### Tools existants à mapper
- [x] `validate_email` → `status-badge`
- [x] `validate_url` → `status-badge`
- [x] `validate_uuid` → `status-badge`
- [x] `validate_json` → `status-badge`
- [x] `validate_schema` → `validation-result`

### Nouveau composant: `validation-result`
- [x] Créer composant
  - [x] Status global (valid/invalid)
  - [x] Liste des erreurs avec path
  - [x] Suggestions de correction
- [x] Mapper `validate_schema`

---

## Phase 13: Text Analysis Tools

### Tools existants à mapper
- [ ] `text_statistics` → `metrics-panel`

### Amélioration
- [ ] `text_statistics` enhanced UI
  - [ ] Word cloud
  - [ ] Reading level indicator
  - [ ] Comparison with targets

---

## Phase 14: Diff Tools

### Tools existants à mapper
- [ ] `diff_words` → `diff-viewer`
- [ ] `diff_chars` → `diff-viewer`
- [ ] `diff_similarity` → `gauge`
- [ ] `diff_arrays` → `table-viewer`

### Amélioration `diff-viewer`
- [ ] Mode inline vs side-by-side toggle
- [ ] Syntax highlighting par langage
- [ ] Stats de changements

---

## Nouveaux Composants UI à Créer (Résumé)

| Composant | Priorité | Phase | Effort |
|-----------|----------|-------|--------|
| `plan-viewer` | P0 | 1 | M |
| `blame-viewer` | P1 | 2 | M |
| `commit-graph` | P1 | 2 | L |
| `yaml-viewer` | P1 | 4 | S |
| `tree-viewer` | P2 | 6 | M |
| `timeline-viewer` | P2 | 4 | M |
| `waterfall-viewer` | P2 | 5 | M |
| `certificate-viewer` | P2 | 5 | S |
| `jwt-viewer` | P2 | 8 | S |
| `palette-viewer` | P3 | 7 | S |
| `map-viewer` | P3 | 10 | L |
| `xml-viewer` | P3 | 11 | M |
| `validation-result` | P3 | 12 | S |
| `disk-usage-viewer` | P3 | 6 | M |
| `resource-monitor` | P3 | 3 | M |
| `headers-viewer` | P3 | 5 | S |

**Légende effort:** S = Small (1-2h), M = Medium (3-4h), L = Large (5-8h)

---

## Park UI Components à Créer

Pour les nouveaux viewers, on peut créer des composants Park UI réutilisables :

### Base Components
- [ ] `TreeView` - Arbre collapsible générique
- [ ] `Timeline` - Axe temporel avec événements
- [ ] `Waterfall` - Barres horizontales stacked
- [ ] `CodeBlock` - Code avec coloration syntaxique
- [ ] `KeyValue` - Liste key/value stylée
- [ ] `StatusIndicator` - Indicateur avec couleur + texte

### Composite Components
- [ ] `PlanNode` - Noeud d'EXPLAIN avec coût
- [ ] `CommitNode` - Noeud de commit avec branches
- [ ] `CertificateCard` - Carte certificat SSL
- [ ] `JwtSection` - Section JWT (header/payload/sig)

---

## Plan d'Implémentation par Sprint

### Sprint 1: Database Deep (P0)
- [x] **psql_explain + plan-viewer**
  - [x] Tool psql_explain
  - [x] plan-viewer UI
  - [ ] Tests
- [ ] psql_stats → metrics-panel
- [ ] psql_indexes → table-viewer
- [ ] psql_locks → table-viewer

### Sprint 2: Git Visualization (P1)
- [x] **git_blame + blame-viewer**
  - [x] Tool git_blame
  - [x] blame-viewer UI
  - [ ] Tests
- [x] **git_graph + commit-graph**
  - [x] Tool git_graph
  - [x] commit-graph UI
  - [ ] Tests
- [x] git_contributors → chart-viewer

### Sprint 3: K8s & YAML (P1)
- [x] **kubectl_describe + yaml-viewer**
  - [x] Tool kubectl_describe
  - [x] yaml-viewer UI
  - [ ] Tests
- [x] kubectl_events + timeline-viewer
- [x] kubectl_top → metrics-panel
- [x] kubectl_rollout_status → status-badge

### Sprint 4: Network Deep (P2)
- [x] **http_timing + waterfall-viewer**
- [x] **ssl_check + certificate-viewer**
- [x] **http_headers + headers-viewer**
- [x] dns_lookup
- [x] whois_lookup → json-viewer

### Sprint 5: System & Process (P2)
- [x] **ps_tree + tree-viewer**
- [x] **du → disk-usage-viewer** (treemap)
- [x] docker_stats + resource-monitor
- [x] top_snapshot → table-viewer
- [x] memory_info → metrics-panel
- [x] netstat_connections → table-viewer

### Sprint 6: Crypto & JWT (P2)
- [x] **crypto_jwt_decode + jwt-viewer** (tool existait déjà)
- [x] crypto_analyze → json-viewer
- [x] Mapping autres crypto tools (crypto_hash, crypto_uuid, crypto_password)

### Sprint 7: Colors & Palette (P3)
- [x] palette-viewer + color_palette tool
- [x] color_contrast tool
- [x] Mapping tous les color tools vers color-picker (13 tools)

### Sprint 8: Geo & Maps (P3)
- [x] **map-viewer** (SVG-based implementation)
- [x] Mapping geo tools (6 tools)

### Sprint 9: Validation & Schema (P3)
- [x] validation-result
- [x] xml-viewer
- [x] Mapping validate_* tools (5 tools)
- [x] Mapping transform_* tools (4 tools)
- [x] Mapping encode_* tools (3 tools)

### Sprint 10: Math Enhancements
- [x] math_percentile → metrics-panel
- [x] math_correlation → chart-viewer
- [x] Mapping existing math_* tools (5 tools)

### Sprint 11: Polish & Integration ✅
- [x] Amélioration diff-viewer (inline vs side-by-side toggle)
- [x] Tests E2E (241 checks)
- [ ] Optional: stats-panel with histogram/box plot

### Sprint 12: Remaining Tool Mappings ✅
- [x] Database tools mapping (psql_*, sqlite_*, pglite_*, redis_*, mongo_*) - tous déjà faits, ajouté pglite_exec
- [x] Git tools mapping (git_status, git_log, git_diff, git_branch) - tous déjà faits
- [x] Docker tools mapping (docker_images, docker_ps, docker_network_ls, docker_volume_ls) - tous déjà faits
- [x] Kubernetes tools mapping (kubectl_get, kubectl_logs, kubectl_apply, kubectl_exec) - tous déjà faits
- [x] Network tools mapping (http_request, curl_fetch, http_parse_url, traceroute) - tous déjà faits
- [x] System tools mapping (kill_process) - ajouté status-badge
- [x] Text tools mapping (text_statistics) - déjà fait
- [x] Diff tools mapping (diff_words, diff_chars, diff_similarity, diff_arrays) - tous déjà faits

### Sprint 13: New Database/Docker Tools ✅
- [x] psql_stats → metrics-panel
- [x] psql_indexes → table-viewer
- [x] psql_locks → table-viewer
- [x] psql_connections → table-viewer
- [x] docker_compose_ps → table-viewer
- [x] docker_diff → diff-viewer

---

## Critères de Découplage

Un tool doit être découpé si :
1. **Output mixte** - Retourne plusieurs types de données
2. **UI non adaptée** - Le viewer générique ne suffit pas
3. **Interaction spécifique** - Nécessite des actions UI particulières
4. **Volume de données** - Pagination/virtualisation nécessaire
5. **Visualisation spécialisée** - Graphs, maps, timelines

---

## Convention de Nommage

```
Tool:  <domain>_<action>
       <domain>_<object>_<action>

UI:    <type>-viewer
       <domain>-<type>

Exemples:
- psql_explain      → plan-viewer
- git_blame         → blame-viewer
- kubectl_describe  → yaml-viewer
- http_timing       → waterfall-viewer
```

---

## Notes Techniques

### Structure d'un composant UI
```
lib/std/src/ui/<component>/
├── index.html
└── src/
    ├── main.tsx
    └── styles.css
```

### Build
```bash
cd lib/std/src/ui && node build-all.mjs
```

### Référencement dans un tool
```typescript
_meta: {
  ui: {
    resourceUri: "ui://mcp-std/<component>",
    emits: ["select", "filter", ...],
    accepts: ["highlight", "scrollTo", ...],
  },
},
```

---

## Métriques de Succès

- [x] 90+ tools avec `_meta.ui` défini
- [x] 0 tools avec `table-viewer` par défaut inapproprié
- [x] Chaque nouveau composant UI testé manuellement
- [x] Documentation des événements emits/accepts (README.md)
- [x] Tests E2E complets (241 checks)
- [x] Tests unitaires (24 tests)

---

## Completed Work ✅

### Tests
- [x] Tests E2E: `tests/e2e/ui-components_test.ts` (16 suites, 241 checks)
- [x] Tests unitaires: `tests/unit/lib/std/new-tools_test.ts` (24 tests)

### Enhancements
- [x] diff-viewer: mode inline vs side-by-side toggle avec localStorage
- [x] Documentation: Events Reference dans README.md

### Sprint 14: Additional Enhancements ✅
- [x] diff-viewer: syntax highlighting par langage (JS, TS, Python, JSON, CSS, HTML, SQL, Bash)
- [x] stats-panel UI avec Histogram, Box plot, Distribution curve
- [x] word-cloud UI component (taille proportionnelle, 3 palettes)
- [x] markdown-viewer UI component (TOC, syntax highlighting, copy button)
- [x] cron-viewer UI component (calendrier, prochaines exécutions, éditeur)
- [x] cron_parse tool → cron-viewer
- [x] log-viewer amélioré (recherche, filtres niveau, highlight, export)
- [x] text_statistics amélioré (Flesch-Kincaid, word frequency, sentence analysis)
- [x] math_stats → stats-panel

### Sprint 15: Developer Tools ✅
- [x] regex-tester UI component (highlight, groupes, explication)
- [x] regex_test tool → regex-tester
- [x] env-viewer UI component (masquage secrets, groupement, recherche)
- [x] env_list tool → env-viewer

### Future Enhancements (optional)
- [ ] Documentation complète des événements emits/accepts
