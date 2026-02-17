# Panel Business SysON+PML — Rapport Complet

**Date** : 2026-02-16
**Experts** : mbse-expert (MBSE/PLM senior), product-expert (produit/startup), devtools-expert (DX/DevTools)
**Rapporteur** : Claude Opus 4.6
**Contexte fondateur** : Expert MBSE/ingénierie système. "C'est peut-être une niche mais c'est MA niche."

---

## Synthèse Initiale

### Consensus (3/3 experts alignés)

**C1. SysON seul n'est PAS le bon angle de démo pour PML.**
Les 3 experts convergent : montrer PML via 24 outils SysON n'illustre aucun moat de PML (DAG compile, STDIO local, ML routing, tracing 7D). Le spectateur voit "un wrapper GraphQL", pas un orchestrateur intelligent.

**C2. Le bridge GraphQL MCP est fragile et non-différenciant.**
Les contournements AQL (eSet au lieu de renameTreeItem, evaluateExpression au lieu de queryBasedObjects) cassent à chaque MAJ de SysON. Moat technique estimé à 6-12 mois.

**C3. La DX actuelle est un bloqueur.**
5 processus locaux, pas de doc dev, DAG implicite non visible, erreurs opaques (bug for...of).

### Divergences

**D1. Le cross-domaine MBSE : potentiel ou mirage ?**
- mbse-expert : SEUL use case défendable ("cahier des charges → SysML → BOM → costing → plan qualité en 5 min")
- product-expert : Ne même pas toucher MBSE (0.01% des devs, TAM trop petit)
- devtools-expert : Pas d'avis fort, DX d'abord

**D2. Que faire de lib/syson ?**
- mbse-expert : Le garder, investir dans le cross-domaine
- product-expert : Le reléguer en "Advanced: Industry Verticals"
- devtools-expert : Le découpler en SDK standalone

### Recommandations initiales
- R1 : Dual-track — horizontal EN PREMIER (context bloat MCP), vertical EN RENFORT (MBSE cross-domaine)
- R2 : Fixer la DX avant toute démo (P0 : bug for...of, error messages, doc dev)
- R3 : Découpler lib/syson en SDK standalone (@casys/syson-mcp)
- R4 : Investir dans le cross-domaine SI les briques PLM/quality existent
- R5 : Ne PAS investir dans le ML routing pour MBSE (24 outils = overfitting garanti)

---

## Addendum 1 — Pipeline industriel et lib/plm

### Contexte fondateur
- lib/plm et lib/quality faisables rapidement
- Marché cible = INDUSTRIE (flottes de machines, processus complexes), pas solo dev
- Obeo peut faire un MCP facilement, MAIS PAS un orchestrateur cross-domaine
- lib/mbe prévu pour parsing CAD, simulation, jumeau numérique

### Positionnement révisé

| Avant (horizontal) | Après (vertical industriel) |
|-------|------|
| Persona : Alex, dev agents | Persona : Marie, ingénieur système OEM aéro |
| Problème : context bloat 5000 tools | Problème : 3 semaines pour changement design → BOM → qualité |
| TAM : 5000 orgs avec 200+ MCP servers (dans 18 mois) | TAM : 5000+ entreprises industrielles EU avec processus MBSE (maintenant) |
| Revenue : 29 EUR/mois SaaS | Revenue : 500-2000 EUR/mois enterprise |

### Recommandations ajoutées
- R6 : lib/plm = priorité P0 pour le vertical (2 semaines)
- R7 : Spike MBE = Phase 2, pas Phase 1

---

## Addendum 2 — Jumeaux numériques et reproductibilité

### Use case : jumeaux numériques d'usines + PML

Le fondateur a des collègues qui numérisent des usines. Le flux :
1. Usine déjà numérisée (jumeau numérique existant)
2. PML compose des workflows de simulation VIA L'IA
3. Workflows REPRODUCTIBLES car stockés comme capabilities
4. Modifier = changer les compositions, le pipeline end-to-end se ré-exécute

### Re-évaluation des positions

**Capability learning réévalué** : Dans l'industrie, le même workflow se lance des dizaines de fois/semaine. Cold → warm → hot prend tout son sens :
- Cold (1ère fois) : LLM compose le DAG
- Warm (2-10) : GRU route sans LLM (coût ÷100)
- Hot (11+) : DAG compilé, déterministe, zéro token LLM

**PML vs script Python — 4 axes différentiels** :
1. Composition vs code (ingénieur modifie sans dev)
2. Reproductibilité certifiée (audit ISO/DO-178C)
3. Cross-domaine automatique (traverse N MCP servers)
4. Apprentissage collectif (senior capitalise pour junior)

### Recommandations ajoutées
- R9 : Pivoter le pitch de la technologie vers le résultat
- R10 : Construire la démo sur le use case exact des collègues
- R11 : Le canal chaud first, la démo second

---

## Addendum 3 — Réalité terrain : stack 3DS+Siemens+SAP

### Stack réel du collègue
- 3DS (Dassault Systèmes) — plateforme principale
- Format IFC (BIM) — jumeau numérique d'usine
- Siemens Simulate (Tecnomatix) — simulation lignes
- SAP — ERP connecté
- Logiciels d'automates (PLC)

### Constat : IFC ≠ SysML
Le jumeau numérique d'usine utilise IFC (BIM), pas SysML v2. SysON n'est pas le point d'entrée pour ce use case précis.

### Faisabilité bridges MCP

| Outil | API | Bridge faisable ? | Effort |
|-------|-----|-------------------|--------|
| IFC | IFC.js (TypeScript, open source) | **Facile** | 1 semaine |
| SAP | REST OData, bien documenté | **Faisable** | 2 semaines |
| OPC-UA (automates) | Node-OPCUA (TS) | **Faisable** | 2 semaines |
| 3DS | REST API, auth complexe | Oui mais pénible | 2-3 semaines |
| Siemens Simulate | COM/DCOM, pas de REST | **Difficile** | 3-4 semaines |

### Distinction clé : ingénierie produit vs ingénierie usine
- Ingénierie PRODUIT (terrain du fondateur) : SysON, SysML v2, conception système
- Ingénierie USINE (terrain du collègue) : IFC, 3DS, simulation ligne, automates
- Le PONT entre les deux = la BOM

### Recommandations ajoutées
- R12 : Commencer par IFC pour le prospect usine
- R13 : MVP "2 silos" (IFC → SAP) suffit pour démo usine
- R14 : Repositionner le pitch pour CE prospect
- R15 : Ne pas abandonner SysON (showcase technique, conférences)

---

## Addendum 4 — Démo pragmatique : modèle → coût en 2 clics

### Scénario en 4 temps (5-7 minutes de démo)

**Temps 1 — Création (30s)** : Intent "Crée un système de contrôle thermique satellite avec 3 sous-systèmes" → DAG ~15 tâches → modèle visible dans SysON UI

**Temps 2 — Costing (10s)** : Intent "Estime le coût" → plm_bom_generate + plm_bom_cost + plm_bom_flatten → tableau BOM avec coûts

**Temps 3 — Variante (10s)** : Intent "Remplace aluminium par cuivre et recalcule" → re-exécution DAG compilé → "+23% coût, -15% masse, conductivité x2"

**Temps 4 — Reproductibilité (10s)** : Intent "Applique la même analyse à mon autre système" → capability warm → exécution instantanée

### Verdict unanime : cette démo est la bonne
- Faisable (SysON + lib/plm, ~2 semaines)
- Tangible (modèle + coût + delta visibles)
- Reproductible (même workflow, N modèles)
- Extensible (ajouter lib/ifc + SAP plus tard)

---

## Addendum 5 — Choix du backend PLM

### Recommandation unanime : Option 4

**SysON comme source + logique PLM dans PML. Pas de PLM externe pour le MVP.**

- Le modèle SysML v2 dans SysON contient déjà les données (parts, hiérarchie, matériaux, masse)
- lib/plm ajoute le CALCUL (costing, comparaison, aplatissement), pas un SERVICE
- Base de prix = fichier JSON avec ~50 matériaux (prix défendables, sources publiques)
- Odoo = Phase 2 si traction (même interface MCP, seul le backend change)

### Architecture

```
PML
  └── lib/plm (logique métier pure, pas de backend)
        ├── plm_bom_generate → appelle syson_element_children + syson_query_aql
        ├── plm_bom_cost → 3 modèles (raw_material, component, parametric)
        ├── plm_bom_flatten → somme quantités tous niveaux
        └── plm_bom_compare → delta entre 2 BOM
              │
              ▼
  └── lib/syson (bridge GraphQL existant, 24 outils)
              │ GraphQL
              ▼
        SysON (Docker, seul backend)
```

### Séquençage 2 semaines

| Jour | Livrable |
|------|----------|
| J1-2 | Types BOM + base de prix matériaux (~50 matériaux) |
| J3-4 | `plm_bom_generate` (traverse SysON via AQL) |
| J5-6 | `plm_bom_cost` (3 modèles de costing) |
| J7 | `plm_bom_flatten` + `plm_bom_compare` |
| J8-9 | Tests unitaires + intégration |
| J10 | Démo end-to-end scenario satellite |

---

## Addendum 6 — UI lib/plm : où et comment afficher BOM/coûts

### Recommandation : Combo précis
- **Couche 1 (baseline)** : Texte markdown structuré dans les réponses MCP — fonctionne partout (Claude Desktop, terminal, Cursor)
- **Couche 2 (démo)** : Widget HTML unique via `_meta.ui` — tableau BOM triable + barre de répartition des coûts + vue delta (vert/rouge). Un seul fichier HTML/CSS/JS vanilla, ~200-300 lignes
- **PAS maintenant** : injection dans SysON (pollue le modèle), export CSV/PDF (Phase 2)

### Analyse des options
- Option 1 Terminal : OBLIGATOIRE comme baseline, pas visuellement impressionnant
- Option 2 Widget _meta.ui : Impact visuel fort pour la démo, pipeline déjà câblé (Epic 16)
- Option 3 SysON injection : Non recommandé (pollue le modèle, mélange conception et costing)
- Option 4 Export : Phase 2, un `plm_bom_export` CSV est trivial (~20 lignes)

### Verdict unanime
Texte markdown (baseline) + Widget HTML (démo). Pas de framework, pas de build. 200-300 lignes HTML/CSS/JS vanilla.

---

## Addendum 7 — Widgets `_meta.ui` pour lib/plm + séquençage 3 jours

### Séquençage révisé : 2-3 jours

| Jour | Matin | Après-midi |
|------|-------|------------|
| J1 | Types BOM + material-prices.ts + plm_bom_generate | plm_bom_cost (3 modèles) + plm_bom_flatten |
| J2 | plm_bom_compare + tests unitaires | Intégration SysON (test sur modèle réel) |
| J3 | Fix bugs intégration + _meta.ui sur les 4 tools | Démo end-to-end filmable |

### 4 schémas `_meta.ui`

1. **`bom-tree`** (plm_bom_generate) : Tableau BOM hiérarchique avec `level` + `parentId` pour l'arbre, colonnes triables
2. **`cost-breakdown`** (plm_bom_cost) : Total + répartition par sous-système avec couleurs, détail par part avec modèle de costing utilisé, marge d'erreur affichée
3. **`bom-diff`** (plm_bom_compare) : Vue delta entre 2 variantes, severity (minor/major/critical) pour code couleur, résumé (coûts +/-, masse +/-, parts ajoutées/supprimées/changées)
4. **`bom-flat`** (plm_bom_flatten) : Vue aplatie tous niveaux, somme des quantités, tri par coût décroissant

### Convention de nommage
- `bom-*` : widgets BOM
- `cost-*` : widgets financiers
- `quality-*` : widgets qualité (Phase 2)
- `change-*` : widgets change management (Phase 2)

### Règles
- PAS de `type: "table"` générique — renderers spécialisés par domaine
- PAS de HTML inline dans `_meta.ui` — données structurées portables
- PAS de `resourceUri` pour le MVP — données embarquées directement
- Fallback `renderJson` obligatoire pour les clients sans viewer spécialisé

---

## Addendum 8 — Bloqueur client UI : chemin le plus court

### Problème identifié
Aucun client fonctionnel ne rend les `_meta.ui` aujourd'hui. Claude Code = texte brut, Playground = buggé (tunnel agent story 17.6), CLI = texte brut.

### Recommandation unanime : Option D — HTML standalone + flag `--open`

Le tool PML retourne DEUX choses :
- `content[0].text` : tableau markdown (lisible en CLI/Claude Code)
- `_meta.html` : HTML standalone prêt à l'emploi (inline CSS/JS, dark theme, zéro deps)

Le CLI PML détecte `_meta.html`, écrit `/tmp/pml-result-{workflowId}.html`, et ouvre le browser avec `--open`.

### Flow démo
```
$ pml execute --intent "Estime le coût du système thermique" --open
→ Terminal : tableau markdown lisible
→ Browser : s'ouvre avec rendu visuel (tableau interactif + barre de répartition des coûts)
```

### Template HTML
- ~150 lignes, zéro framework, zéro deps
- Dark theme cohérent PML (`#08080a`, `#e7e5e4`)
- 4 renderers : `bom-tree`, `cost-breakdown`, `bom-diff`, `bom-flat`
- Données injectées via `{{JSON_DATA}}` inline
- Imprimable, emailable, archivable (= livrable, pas juste un widget éphémère)

### Effort : 2-3h
- Template HTML : 150 lignes vanilla
- `generateStandaloneHtml()` : 30 lignes
- Flag `--open` dans CLI : 10 lignes

### Multi-client progressif
1. **Maintenant** : CLI `pml execute --open` → HTML standalone
2. **Claude Desktop** : `_meta.ui` natif (MCP resources)
3. **Playground fixé** : Composite UI + sync events (quand story 17.6 résolue)

Les UI composites viendront naturellement : quand une capability exécute plusieurs tools avec `_meta.ui`, `buildCompositeUi()` les assemble automatiquement.

---

## Tableau de bord final

| # | Addendum | Insight clé | Impact stratégie |
|---|----------|-------------|-----------------|
| 0 | Synthèse | SysON seul = wrapper GraphQL | Dual-track horizontal + vertical |
| 1 | Pipeline industriel | lib/plm faisable rapidement, marché = industrie | TAM révisé, 500-2000€/mois enterprise |
| 2 | Jumeaux numériques | Reproductibilité = mécanisme central | Capability learning validé pour industrie |
| 3 | Stack terrain | IFC ≠ SysML, silos propriétaires | Pivot vers orchestration silos industriels |
| 4 | Démo pragmatique | Modèle → coût en 2 clics, 4 temps | Scénario de démo validé unanimement |
| 5 | Backend PLM | Option 4 unanime : logique pure, SysON = source | Zéro dépendance, 2-3 jours |
| 6 | UI PLM | Texte markdown + widget _meta.ui | Pas d'injection SysON, HTML vanilla |
| 7 | Widgets _meta.ui | 4 schémas (bom-tree, cost-breakdown, bom-diff, bom-flat) | Séquençage 3 jours complet |
| 8 | Client UI | HTML standalone + `--open` CLI | Multi-client progressif (CLI → Desktop → Playground) |

### Positionnement final
"PML connecte les silos industriels et rend les workflows d'ingénierie reproductibles. Modèle → coût du produit en 2 clics, N variantes simulées instantanément."

### Prochaines étapes (finales)
1. Construire lib/plm MVP (J1-J2 avec IA)
2. Template HTML standalone + `generateStandaloneHtml()` (J2 après-midi)
3. Flag `--open` dans CLI + intégration (J3 matin)
4. Démo end-to-end filmable (J3 après-midi)
5. Montrer au collègue (validation terrain immédiate)
6. Si traction : lib/ifc + bridge SAP + fix playground (Phase 2)
