# Spike: Simulation Industrielle MBE — Vision Demo PML

**Date:** 2026-02-15
**Status:** Spike / Decision record
**Contexte:** Trouver un use case de demo qui montre la puissance de PML (DAG orchestration, tool discovery, compilation cold→warm→hot) avec un domaine techniquement credible et visuellement impressionnant.

## Probleme

Les demos actuelles type "Minecraft avec 40 outils" sont trop simplistes pour montrer les capacites reelles de PML :
- Pas assez de tools (40 vs capacite de gerer des centaines)
- DAGs lineaires et plats (mine → place → craft)
- Pas de parallelisme reel, pas de feedback loops, pas de HIL
- Le cote "jeu video" peut decribiliser face a des prospects industriels

## Decision

**Construire une simulation open source de fabrication semiconducteur (MBE — Molecular Beam Epitaxy)** comme vitrine PML.

### Pourquoi MBE ?

| Critere | MBE | Minecraft |
|---------|-----|-----------|
| Nombre de tools | **~120 distincts** | ~40 |
| Complexite DAG | **Extreme** (parallele, sequentiel, feedback, loops) | Lineaire |
| Parallelisme | **Oui** (cellules chauffent en parallele, monitoring continu) | Minimal |
| Feedback loops | **Oui** (RHEED → correction temps reel) | Non |
| HIL checkpoints | **Naturel** (approbation avant etapes critiques) | Force |
| Credibilite industrie | **Instruments a 2M$, PhD-level** | Jeu video |
| Visuellement | **Tres riche** (couches, bandes, diffraction) | Voxels |

### Pourquoi pas les alternatives ?

| Option | Verdict | Raison du rejet |
|--------|---------|-----------------|
| Factorio | Paye ($35), proprietaire | Pas open source |
| KSP | Paye, pas headless | Dependance jeu commercial |
| Dwarf Fortress | 400+ tools mais pas visuel | ASCII, pas impressionnant visuellement |
| Blender MCP | Deja existant (51 tools) | Pas assez de tools, DAGs moyens |
| Home Assistant | Open source, 60+ tools | Faut des devices, moins "wow" |
| Kubernetes/AWS | 1200+ tools (AWS CCAPI) | Pas visuel, trop abstrait |
| Simulation custom generique | Control total | Pas de credibilite domaine |

MBE combine : **open source (on le construit), 120+ tools, DAGs complexes, visuellement riche, credibilite industrielle immediate**.

## Architecture de la Simulation

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────┐
│                   PML Cloud                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Discover │  │ Execute  │  │ DAG Compiler      │  │
│  │ (tools)  │  │ (runtime)│  │ cold→warm→hot     │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │                 │              │
│       └──────────────┼─────────────────┘              │
│                      │                                │
│              ┌───────▼────────┐                       │
│              │  MCP Server    │                       │
│              │  mbe-sim       │                       │
│              └───────┬────────┘                       │
│                      │                                │
└──────────────────────┼────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │  MBE Simulator  │
              │  (Deno/TS)      │
              ├─────────────────┤
              │ • Physics Engine│
              │ • State Machine │
              │ • Event System  │
              │ • Viz Renderer  │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  Web Dashboard  │
              │  (Canvas/WebGL) │
              │ • Cross-section │
              │ • RHEED live    │
              │ • Band diagram  │
              │ • DAG graph     │
              └─────────────────┘
```

### Catalogue de Tools (~120)

#### 1. Substrate Preparation (~10 tools)

| Tool | Description | Inputs |
|------|-------------|--------|
| `substrate:select` | Choisir materiau, orientation, taille | material, orientation, diameter |
| `substrate:clean` | Sequence de nettoyage chimique | protocol (RCA, piranha, HF) |
| `substrate:mount` | Montage sur bloc Mo/In-free | mount_type |
| `substrate:inspect` | Inspection pre-croissance | method (visual, AFM) |
| `substrate:load_to_loadlock` | Chargement physique | position |
| `substrate:pump_loadlock` | Evacuation sas | target_pressure |
| `substrate:transfer_to_buffer` | Transfert chambre intermediaire | — |
| `substrate:transfer_to_growth` | Transfert chambre de croissance | — |
| `substrate:degas` | Degazage thermique 300-400°C | temperature, duration |
| `substrate:desorb_oxide` | Desorption oxyde natif 580-620°C | temperature |

#### 2. Effusion Cell Management (~15 tools)

| Tool | Description |
|------|-------------|
| `cell:set_temperature` | Definir temperature cible (Ga, Al, In, As, Si, Be) |
| `cell:ramp_to_standby` | Amener a temperature de veille |
| `cell:ramp_to_growth` | Amener a temperature de croissance |
| `cell:stabilize` | Attendre stabilite du flux (30-60 min) |
| `cell:measure_bep` | Mesurer pression equivalente de faisceau |
| `cell:calibrate_flux` | Correler BEP au taux de croissance |
| `cell:open_shutter` | Ouvrir obturateur |
| `cell:close_shutter` | Fermer obturateur |
| `cell:check_material_level` | Verifier niveau de matiere source |
| `cell:refill` | Recharger cellule epuisee (maintenance majeure) |
| `cell:set_valve_position` | Position valve (cellules valvees) |
| `cell:set_cracker_zone` | Temperature zone de craquage (As, P) |
| `cell:read_thermocouple` | Lecture thermocouple |
| `cell:pid_tune` | Auto-tuning PID controleur temperature |
| `cell:log_flux_history` | Enregistrer historique flux |

#### 3. Growth Execution (~15 tools)

| Tool | Description |
|------|-------------|
| `growth:start_layer` | Demarrer depot d'une couche nommee |
| `growth:end_layer` | Terminer couche en cours |
| `growth:set_substrate_temperature` | Changer temperature substrat |
| `growth:set_rotation_speed` | Changer vitesse rotation (RPM) |
| `growth:growth_interrupt` | Pause pour lissage de surface |
| `growth:deposit_monolayers` | Deposer N monocouches exactes |
| `growth:deposit_thickness` | Deposer par epaisseur cible (nm) |
| `growth:deposit_timed` | Deposer pendant une duree exacte |
| `growth:ramp_composition` | Transition graduee d'alliage |
| `growth:start_superlattice` | Demarrer sequence repetee |
| `growth:migration_enhanced` | Mode MEE (obturateurs alternants) |
| `growth:atomic_layer` | Mode ALE |
| `growth:set_v_iii_ratio` | Ajuster ratio V/III |
| `growth:anneal` | Recuit mid-growth ou post-growth |
| `growth:delta_doping` | Couche de dopage ultra-mince |

#### 4. Monitoring & Diagnostics (~12 tools)

| Tool | Description |
|------|-------------|
| `rheed:start_monitoring` | Demarrer acquisition RHEED |
| `rheed:stop_monitoring` | Arreter RHEED |
| `rheed:measure_oscillations` | Frequence oscillation → taux de croissance |
| `rheed:check_pattern` | Analyser pattern (streaky/spotty/ring) |
| `rheed:detect_reconstruction` | Identifier reconstruction de surface |
| `rheed:capture_image` | Sauvegarder image ecran RHEED |
| `vacuum:read_pressure` | Lecture jauge chambre |
| `vacuum:read_rga` | Scan spectrometre de masse |
| `pyrometer:read_temperature` | Lecture pyrometrique |
| `pyrometer:calibrate` | Calibration sur transition connue |
| `monitor:band_edge_temperature` | Thermometrie par bord de bande |
| `monitor:reflectance` | Reflectance optique in-situ |

#### 5. Chamber Management (~8 tools)

| Tool | Description |
|------|-------------|
| `chamber:read_all_pressures` | Toutes les jauges |
| `chamber:cryopanel_fill` | Remplir cryopanneaux LN₂ |
| `chamber:cryopanel_check_level` | Verifier niveau LN₂ |
| `chamber:bakeout_start` | Demarrer etuvage |
| `chamber:bakeout_end` | Terminer etuvage |
| `chamber:ion_pump_status` | Courant pompe ionique |
| `chamber:tsp_fire` | Activer pompe sublimation titane |
| `chamber:leak_check` | Test de fuite helium |

#### 6. Post-Growth & Unloading (~6 tools)

| Tool | Description |
|------|-------------|
| `cooldown:start` | Refroidissement controle sous As |
| `cooldown:monitor` | Suivi descente temperature |
| `cooldown:close_as_shutter` | Fermer As quand T<300°C |
| `unload:transfer_to_buffer` | Transfert vers sas intermediaire |
| `unload:transfer_to_loadlock` | Transfert vers sas de chargement |
| `unload:vent_and_remove` | Mise a l'air et retrait wafer |

#### 7. Characterization (~15 tools)

| Tool | Description |
|------|-------------|
| `xrd:omega_2theta_scan` | Scan diffraction rayons X |
| `xrd:rocking_curve` | Mesure FWHM de pic |
| `xrd:reciprocal_space_map` | Cartographie contrainte/composition |
| `xrd:fit_simulation` | Simulation et fit XRD |
| `pl:room_temperature` | Photoluminescence ambiante |
| `pl:low_temperature` | PL basse temperature (4K) |
| `pl:power_dependent` | PL dependante de l'excitation |
| `pl:map` | Cartographie PL uniformite wafer |
| `afm:surface_scan` | Microscopie force atomique |
| `afm:step_height` | Mesure hauteur de marches |
| `hall:measure` | Effet Hall (concentration, mobilite) |
| `hall:variable_temperature` | Hall en fonction de T |
| `tem:cross_section` | Microscopie electronique transmission |
| `sims:depth_profile` | Profilage dopants SIMS |
| `ellipsometry:measure` | Epaisseur/rugosite optique |

#### 8. Device Fabrication (~12 tools)

| Tool | Description |
|------|-------------|
| `litho:spin_coat` | Etalement photoresist |
| `litho:expose` | Exposition pattern |
| `litho:develop` | Developpement resist |
| `etch:wet_chemical` | Gravure chimique humide |
| `etch:dry_plasma` | Gravure RIE/ICP |
| `deposit:metal_evaporation` | Depot metal e-beam |
| `deposit:sputtering` | Pulverisation cathodique |
| `anneal:rapid_thermal` | RTA pour contacts |
| `oxidation:wet` | Oxydation selective (VCSELs) |
| `passivation:dielectric` | Passivation SiN/SiO₂ |
| `planarization:bcb` | Planarisation BCB |
| `litho:liftoff` | Lift-off metallique |

#### 9. Packaging & Test (~8 tools)

| Tool | Description |
|------|-------------|
| `dice:scribe_and_break` | Decoupe wafer |
| `package:die_attach` | Report de puce |
| `package:wire_bond` | Cablage fil |
| `package:encapsulate` | Encapsulation |
| `test:iv_curve` | Mesure courant-tension |
| `test:spectral_response` | Mesure longueur d'onde |
| `test:lifetime` | Test fiabilite / burn-in |
| `test:thermal_impedance` | Caracterisation thermique |

#### 10. Recipe & Workflow Management (~10 tools)

| Tool | Description |
|------|-------------|
| `recipe:load` | Charger recette de croissance |
| `recipe:validate` | Verifier recette avant croissance |
| `recipe:simulate` | Predire structure depuis recette |
| `recipe:save` | Sauvegarder recette versionee |
| `workflow:create_dag` | Construire DAG d'execution |
| `workflow:checkpoint` | Sauvegarder etat pour resume |
| `workflow:abort` | Arret d'urgence |
| `workflow:pause_for_approval` | Checkpoint HIL |
| `workflow:log_event` | Enregistrer evenement horodate |
| `workflow:generate_report` | Rapport post-croissance |

**Total : ~111 tools repartis en 10 namespaces**

## Exemples de DAGs

### DAG 1 : Croissance simple GaAs buffer (15 noeuds)

```
substrate:select ──→ substrate:clean ──→ substrate:mount ──→ substrate:load_to_loadlock
                                                                       │
                                                                       ▼
                                                          substrate:pump_loadlock
                                                                       │
                     ┌─────────────────────────────────────────────────┤
                     │                                                 ▼
              cell:ramp_to_growth(Ga)                    substrate:transfer_to_growth
              cell:ramp_to_growth(As)                               │
              cell:stabilize(Ga)     ◄── parallelisme               │
              cell:stabilize(As)                                    │
                     │                                               │
                     └──────────────┬────────────────────────────────┘
                                    ▼  (fan-in : tout doit etre pret)
                           growth:start_layer("buffer")
                                    │
                           growth:deposit_thickness(300nm)
                                    │
                           growth:end_layer
                                    │
                           cooldown:start
```

### DAG 2 : Structure VCSEL complete (~200 noeuds)

```
[Preparation substrat]  ──→  [Preparation 7 cellules en parallele]
         │                              │
         └──────────┬───────────────────┘
                    ▼ (fan-in sync)
           [Buffer GaAs 300nm]
                    │
                    ▼
           [Bottom DBR: 30× repeat]
           ┌─ AlAs λ/4n ──→ GaAs λ/4n ─┐
           └────────────────────────────┘  × 30
                    │
                    ▼
           [Lower cladding graded AlGaAs]
                    │
                    ▼
           [Active region: 3× QW]
           ┌─ Barrier ──→ QW ──→ Growth Interrupt ─┐
           └────────────────────────────────────────┘  × 3
                    │
                    ▼
          ★ workflow:pause_for_approval (HIL)
                    │
                    ▼
           [Oxide aperture layer — 30nm precision]
                    │
                    ▼
           [Top DBR: 25× repeat]
                    │
                    ▼
           [Contact layer + cool-down]
                    │
                    ├──→ [XRD scan]     ┐
                    ├──→ [PL mesure]    ├── parallelisme post-growth
                    ├──→ [AFM scan]    ┘
                    │
                    ▼
           [Device fabrication pipeline]
                    │
                    ▼
           [Test + rapport]
```

### Ce que PML demontre sur ce DAG

| Feature PML | Illustration MBE |
|-------------|------------------|
| **Tool discovery** | `discover("deposer couche AlGaAs")` → retourne `growth:deposit_thickness`, `growth:ramp_composition` |
| **DAG compilation cold** | Premiere execution : parse recette VCSEL → genere DAG 200 noeuds |
| **DAG compilation warm** | Deuxieme VCSEL similaire : reutilise sous-DAGs (DBR, QW active) |
| **DAG compilation hot** | VCSEL identique : execution instantanee depuis cache |
| **Parallelisme** | 7 cellules chauffent simultanement (fan-out → fan-in) |
| **Sequential strict** | Couche N doit finir avant couche N+1 |
| **Sub-DAG templates** | DBR = template reutilisable (AlAs/GaAs × N) |
| **Feedback loops** | RHEED detecte derive → ajustement cellule mid-growth |
| **HIL checkpoints** | Approbation avant couche critique (oxide aperture) |
| **Error recovery** | Si vacuum degrade → sous-DAG abort/recovery |

## Visualisation (Dashboard Web)

### Panel 1 : Coupe transversale temps reel
- Vue laterale qui grandit vers le haut couche par couche
- Couleurs par materiau : GaAs (gris), AlAs (bleu), InGaAs (rouge), AlGaAs (gradient)
- Epaisseur proportionnelle, barre d'echelle dynamique
- Zone de depot animee au sommet (atomes qui arrivent)

### Panel 2 : RHEED live
- Pattern de diffraction simule (lignes streaky = 2D, spots = 3D)
- Oscillations temps reel (sinusoide) → extraction taux de croissance
- Transitions de reconstruction de surface pendant changements de composition

### Panel 3 : Diagramme de bandes
- Bandes de conduction/valence en fonction de la profondeur
- Se met a jour couche par couche
- Niveaux d'energie confines apparaissent dans les puits quantiques
- Profil de dopage en overlay

### Panel 4 : DAG d'execution
- Graphe de noeuds avec aretes de dependance
- Etats colores : gris (pending), bleu (in_progress), vert (completed), rouge (failed), jaune (approval)
- Chemin critique surligne
- Voies paralleles visibles (cellules en parallele)
- Animation : noeuds s'allument progressivement
- Zoom : vue recette complete → repeat superlattice → couche individuelle

## Stack Technique

```
Simulation Engine    : Deno + TypeScript
Physics/State        : Classes TS avec state machine par equipement
MCP Server           : @casys/mcp-server (lib/server)  ← deja en prod
Tools exposure       : 111 tools enregistres via MCP standard
Dashboard            : Fresh (SSR) + Canvas 2D / WebGL pour les viz
Data format          : JSON pour recettes, events, etats
Tests                : Deno test, simulation deterministe
```

### Modules

```
packages/mbe-sim/
├── src/
│   ├── engine/
│   │   ├── simulator.ts          # Boucle principale, clock simule
│   │   ├── state-machine.ts      # Etats equipement (idle, ramping, stable, error)
│   │   ├── physics.ts            # Modeles simplifie (flux, croissance, temperature)
│   │   └── events.ts             # Systeme d'evenements pour feedback
│   ├── tools/
│   │   ├── substrate.ts          # 10 tools substrate:*
│   │   ├── cell.ts               # 15 tools cell:*
│   │   ├── growth.ts             # 15 tools growth:*
│   │   ├── monitoring.ts         # 12 tools monitoring:*
│   │   ├── chamber.ts            # 8 tools chamber:*
│   │   ├── cooldown.ts           # 6 tools cooldown/unload:*
│   │   ├── characterization.ts   # 15 tools xrd/pl/afm/hall:*
│   │   ├── fabrication.ts        # 12 tools litho/etch/deposit:*
│   │   ├── packaging.ts          # 8 tools dice/package/test:*
│   │   └── workflow.ts           # 10 tools recipe/workflow:*
│   ├── recipes/
│   │   ├── gaas-buffer.ts        # Recette simple (15 noeuds)
│   │   ├── quantum-well.ts       # Recette intermediaire (50 noeuds)
│   │   ├── vcsel.ts              # Recette complexe (200 noeuds)
│   │   ├── hemt.ts               # HEMT pour telecom
│   │   └── solar-cell.ts         # Cellule solaire multi-jonction
│   ├── mcp/
│   │   └── server.ts             # MCP server wrapping les 111 tools
│   └── viz/
│       ├── cross-section.ts      # Rendu coupe transversale
│       ├── rheed.ts              # Simulation RHEED
│       ├── band-diagram.ts       # Diagramme de bandes
│       └── dag-graph.ts          # Visualisation DAG
├── web/
│   ├── routes/
│   │   └── index.tsx             # Dashboard Fresh
│   └── islands/
│       ├── SimulatorView.tsx      # Vue principale
│       ├── CrossSection.tsx       # Panel coupe
│       ├── RheedPanel.tsx         # Panel RHEED
│       ├── BandDiagram.tsx        # Panel bandes
│       └── DagViewer.tsx          # Panel DAG
├── tests/
│   ├── engine/
│   ├── tools/
│   └── recipes/
└── deno.json
```

## Scenario de Demo (5 minutes)

### Acte 1 : Discovery (30s)
```
> "Je veux faire croitre un puits quantique InGaAs sur GaAs"
> pml_discover({ intent: "grow InGaAs quantum well on GaAs" })
→ Retourne les 25 tools pertinents avec scores de relevance
```

### Acte 2 : Execution cold (2 min)
```
> pml_execute({ intent: "Grow VCSEL structure", code: "..." })
→ DAG de 200 noeuds compile en temps reel
→ Dashboard montre : cellules chauffent en parallele (fan-out)
→ Buffer layer grandit (coupe transversale s'anime)
→ DBR mirror se construit repetition par repetition
→ RHEED oscille, diagramme de bandes se dessine
→ HIL checkpoint : "Approve oxide aperture layer?" → Approve
→ Structure complete, caracterisation lance en parallele
```

### Acte 3 : Warm compilation (30s)
```
> "Meme VCSEL mais avec 4 puits quantiques au lieu de 3"
→ PML reutilise le sous-DAG DBR (cache warm)
→ Seul le sous-DAG active region est recompile
→ Execution 3x plus rapide
```

### Acte 4 : Hot execution (15s)
```
> "Relance le meme VCSEL 4-QW"
→ DAG entier depuis cache hot
→ Execution quasi-instantanee
→ Dashboard replay accelere
```

### Acte 5 : Chaine de fabrication (1 min)
```
> "Fabrique le device complet : litho, gravure, contacts, test"
→ Pipeline post-growth se declenche
→ Montre PML orchestrant la chaine complete wafer-to-chip
```

## Effort Estime

| Phase | Contenu | Effort |
|-------|---------|--------|
| **Phase 1 : Engine** | Simulateur, state machine, 30 tools core (substrate + cell + growth) | 3-4 jours |
| **Phase 2 : Tools complets** | 111 tools, recettes, MCP server | 3-4 jours |
| **Phase 3 : Dashboard** | 4 panels de visualisation (Fresh + Canvas) | 3-4 jours |
| **Phase 4 : Integration PML** | Connexion PML discover/execute, demo scenario | 2-3 jours |
| **Phase 5 : Polish** | Animations, recettes additionnelles, documentation | 2-3 jours |
| **Total** | | **~2-3 semaines** |

## Risques

| Risque | Mitigation |
|--------|------------|
| Physique trop simplifiee = pas credible | Calibrer sur des donnees reelles (taux de croissance GaAs = 1 ML/s, temperatures standard) |
| Trop de tools = bruit | Grouper par namespace, discovery filtre par contexte |
| Dashboard trop complexe | Phase 1 = texte/logs, dashboard progressif |
| Scope creep | Phase 1 = 30 tools + 1 recette simple, iterer |

## Extension PLM : De la Simulation au Product Lifecycle Management

### Le parallele PML ↔ PLM

Le naming n'est pas un accident. **PML (Procedural Memory Layer)** orchestre des procedures composables — c'est exactement ce que fait un **PLM (Product Lifecycle Management)** pour un produit physique. La simulation MBE est le noyau, mais la vraie demo c'est le **flux de production complet** :

```
  Conception        Fabrication       Qualification      Production        Fin de vie
 ┌──────────┐     ┌──────────────┐   ┌─────────────┐   ┌────────────┐   ┌──────────┐
 │ Design   │────→│ MBE Growth   │──→│ Caract.     │──→│ Production │──→│ Yield /  │
 │ Recipe   │     │ + Fab        │   │ + Qualif.   │   │ Scale-up   │   │ Costing  │
 └──────────┘     └──────────────┘   └─────────────┘   └────────────┘   └──────────┘
      │                  │                  │                 │               │
      ▼                  ▼                  ▼                 ▼               ▼
  BOM + Costing    Process Control    Go/No-Go          Scheduling      ROI Analysis
  Material Specs   Equipment State    SPC/SQC           Multi-chamber   Cost per wafer
  Target Specs     Real-time DAG      Pass/Fail         Throughput      Margin
```

### Namespaces supplementaires PLM (~40 tools additionnels)

#### 11. BOM & Costing (~10 tools)

| Tool | Description |
|------|-------------|
| `bom:create` | Creer nomenclature produit (substrat, gaz, dopants, masques) |
| `bom:add_item` | Ajouter materiau avec quantite, fournisseur, prix unitaire |
| `bom:calculate_cost` | Calculer cout total materiaux pour une recette |
| `bom:compare_recipes` | Comparer couts entre 2 recettes (ex: 3-QW vs 4-QW VCSEL) |
| `bom:material_availability` | Verifier stock/delai fournisseur pour chaque materiau |
| `bom:estimate_consumables` | Estimer consommation (LN₂, gaz, targets) par run |
| `bom:cost_per_wafer` | Cout total wafer (materiaux + equipement + temps machine + operateur) |
| `bom:cost_per_die` | Cout par puce (wafer cost / yield × dies per wafer) |
| `bom:margin_analysis` | Marge brute = prix vente - cout die - packaging - test |
| `bom:what_if_pricing` | Simulation "et si le Gallium augmente de 20%?" |

#### 12. Production Planning (~10 tools)

| Tool | Description |
|------|-------------|
| `planning:schedule_run` | Planifier un run MBE (date, chambre, recette, priorite) |
| `planning:check_conflicts` | Verifier conflits equipement (maintenance, autre run) |
| `planning:optimize_batch` | Regrouper wafers compatibles pour un meme run |
| `planning:estimate_duration` | Duree totale estimee (prep + growth + charact + fab) |
| `planning:capacity_forecast` | Prevision capacite N chambres sur M semaines |
| `planning:maintenance_window` | Planifier maintenance (cell refill, bakeout) sans bloquer production |
| `planning:gantt_generate` | Generer Gantt multi-chambre avec dependances |
| `planning:bottleneck_analysis` | Identifier goulots (ex: XRD partage entre 3 chambres MBE) |
| `planning:throughput_simulate` | Simuler debit wafers/semaine pour differentes configs |
| `planning:backlog_priority` | Prioriser backlog commandes par urgence/marge/client |

#### 13. Quality & SPC (~10 tools)

| Tool | Description |
|------|-------------|
| `quality:define_spec` | Definir specifications produit (epaisseur ±2%, composition ±1%) |
| `quality:spc_chart` | Generer carte de controle (X-bar, R, Cpk) |
| `quality:check_in_spec` | Verifier si wafer est dans les specs |
| `quality:disposition` | Disposition wafer : pass / rework / scrap |
| `quality:yield_calculate` | Calcul rendement (wafers bons / wafers lances) |
| `quality:yield_trend` | Tendance rendement sur N runs (amelioration ou degradation?) |
| `quality:defect_pareto` | Analyse Pareto des defauts (haze, particules, epi defects) |
| `quality:root_cause` | Correler defauts avec parametres process (temperature, flux, pression) |
| `quality:cpk_report` | Rapport capabilite process pour chaque parametre critique |
| `quality:lot_genealogy` | Tracabilite complete : substrat → epitaxie → device → test |

#### 14. Supply Chain (~8 tools)

| Tool | Description |
|------|-------------|
| `supply:inventory_check` | Etat du stock (substrats, sources MBE, gaz, produits chimiques) |
| `supply:reorder_point` | Seuil de reapprovisionnement atteint? |
| `supply:lead_time_estimate` | Delai fournisseur pour chaque materiau |
| `supply:purchase_order` | Generer commande d'achat |
| `supply:vendor_compare` | Comparer fournisseurs (prix, qualite, delai) |
| `supply:forecast_consumption` | Prevision consommation basee sur le planning de production |
| `supply:critical_materials` | Alerter sur materiaux critiques (single-source, long lead time) |
| `supply:cost_trend` | Evolution prix matieres premieres (Ga, In, As) sur 12 mois |

**Nouveau total : ~150 tools repartis en 14 namespaces**

### Ce que ca demontre en plus

| Feature PML | Illustration PLM |
|-------------|------------------|
| **Composition de DAGs** | Recette MBE + BOM + Planning + Quality = mega-DAG compose |
| **Cross-namespace discovery** | `discover("combien coute ce VCSEL")` → traverse bom:*, quality:*, planning:* |
| **Decision support** | `bom:what_if_pricing` + `quality:yield_trend` → "on reste rentable meme si Ga +20%" |
| **Data pipeline** | Resultats growth → characterization → quality:check_in_spec → planning:next_run |
| **Multi-domain orchestration** | Un seul `pml_execute` orchestre physique + finance + logistique |

### Scenario Demo Etendu : "Combien me coute ce VCSEL?"

```
> pml_execute({
>   intent: "Simulate VCSEL production cost for 100 wafers",
>   code: `
>     // 1. Charger recette et calculer BOM
>     const recipe = await mcp.sim.recipe:load({ name: "vcsel-4qw-850nm" });
>     const bom = await mcp.sim.bom:calculate_cost({ recipe_id: recipe.id });
>
>     // 2. Simuler rendement base sur historique
>     const yield = await mcp.sim.quality:yield_trend({ recipe: "vcsel", last_n: 20 });
>
>     // 3. Planifier production
>     const plan = await mcp.sim.planning:capacity_forecast({
>       chambers: 2, wafers: 100, recipe: recipe.id
>     });
>
>     // 4. Cout total
>     const cost = await mcp.sim.bom:cost_per_die({
>       wafer_cost: bom.total,
>       yield_percent: yield.average,
>       dies_per_wafer: 2400
>     });
>
>     return {
>       cost_per_wafer: bom.total,        // $1,250
>       average_yield: yield.average,      // 78%
>       cost_per_good_die: cost.per_die,   // $0.67
>       production_weeks: plan.duration,   // 6.5 weeks
>       total_good_dies: plan.total_dies,  // 187,200
>       total_cost: plan.total_cost,       // $125,000
>       margin_at_1_50: "55%"              // si prix vente = $1.50/die
>     };
>   `
> })
```

### Le mot "Composition" — le lien PML ↔ PLM ↔ MBE

C'est le concept unificateur :

| Niveau | Composition |
|--------|-------------|
| **MBE physique** | Composition d'alliage : Al₀.₃Ga₀.₇As — chaque couche est une **composition** de materiaux |
| **Recette** | Composition de couches : buffer + DBR + QW + cap — une recette est une **composition** d'etapes |
| **DAG PML** | Composition de tools : `cell:* + growth:* + rheed:*` — un DAG est une **composition** d'operations |
| **PLM produit** | Composition de process : epitaxie + fab + test + packaging — un produit est une **composition** de phases |
| **Business** | Composition de couts : materiaux + machine-time + main d'oeuvre — un P&L est une **composition** de lignes |

PML orchestre des compositions a tous les niveaux. C'est le pitch.

### Scope : In vs Out

| In scope (demo) | Out of scope (futur) |
|-----------------|---------------------|
| Simulation MBE avec physique simplifiee | Physique ab-initio realiste |
| BOM statique avec prix fixes | Integration ERP reel (SAP, Oracle) |
| Planning mono-site | Multi-site / multi-fab |
| Quality avec specs manuelles | ML-based predictive quality |
| Supply chain mock | Integration fournisseurs reels |
| Costing deterministe | Monte Carlo sur variabilite rendement |
| Recettes pre-definies (VCSEL, HEMT, solar) | Editeur de recettes libre |

La simulation est un **sandbox credible** — pas un jumeau numerique de production. L'objectif est de montrer que PML **peut** orchestrer tout ca, pas de remplacer un MES.

## Next Steps

1. Valider cette direction avec l'equipe
2. Prototyper le simulateur engine (Phase 1) avec `substrate:*` et `cell:*`
3. Brancher sur MCP server existant (`@casys/mcp-server`)
4. Premier DAG fonctionnel : croissance GaAs buffer (15 noeuds)
5. Iterer vers VCSEL complet + dashboard
6. **Phase 6 (PLM)** : Ajouter BOM, costing, planning, quality apres que le core MBE fonctionne
