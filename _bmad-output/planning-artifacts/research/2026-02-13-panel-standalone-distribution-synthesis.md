# Panel d'experts : PML Standalone Distribution & Marketplace

**Date :** 2026-02-13
**Rapporteur :** Technical Writer (synthese)
**Experts :** security-expert, codebase-architect, business-strategist
**Objet :** La distribution standalone de capabilities PML sur les marketplaces MCP — est-ce que ca vaut le coup ?
**Spec evaluee :** `2026-02-12-tech-spec-pml-standalone-capability-distribution.md` (6 taches, 750 lignes)
**Contexte prealable :** Spike marketplace (`2026-02-11-mcp-marketplace-distribution-strategy.md`), decisions fondateur

---

## 1. VERDICT

**La distribution standalone est faisable techniquement mais prematuree commercialement.**

Le binaire compile via `deno compile` fonctionne. Le sandbox est solide pour du code first-party. Mais investir aujourd'hui dans un pipeline de build standalone + marketplace revient a construire un canal de distribution pour un produit qui n'a pas encore de clients payants.

**Recommandation du panel : reporter le standalone. Publier 2-3 demos BYOH sur Smithery (effort 1-2 jours). Investir dans le tracing et le playground.**

---

## 2. PROBLEME RESOLU

### Ce que le standalone est cense resoudre

> "Un utilisateur ne peut pas installer une seule capability PML comme MCP server standalone sans connexion cloud."

### Ce que le panel en pense

Le probleme est reel mais le marche ne le demande pas encore. Les 3 experts convergent sur un constat :

- **security-expert** : le sandbox est concu pour du code first-party. L'ouvrir a du code communautaire necessite 3 couches de securite supplementaires (resource limits, scoped permissions, code signing) qui n'existent pas.
- **codebase-architect** : techniquement faisable, PML est deja compile via `deno compile`, mais le binaire de 80-85 MB est lourd pour une marketplace ou les concurrents pesent 1-5 MB.
- **business-strategist** : *"Qui telechargerait un binaire de 87 MB pour executer un script de 15 lignes ?"* Le standalone resout un probleme d'ingenieur, pas un probleme d'utilisateur.

---

## 3. CONSENSUS — Sur quoi les 3 experts sont d'accord

### 3.1 Le sandbox PML est solide pour son usage actuel

Les 3 experts reconnaissent que l'architecture en 4 couches (Worker `permissions: "none"` + RPC bridge + Capability Loader + Routing) est bien concue :
- Isolation V8 totale (zero acces systeme)
- HIL default `ask: ["*"]` (approbation utilisateur par defaut)
- Integrity SHA-256 via lockfile
- Trace sanitization (pas de leak d'API keys)

**Mais** : "solide pour du code first-party" ne signifie pas "pret pour une marketplace ouverte."

### 3.2 Le standalone est faisable techniquement

Le codebase-architect confirme que la spec est realiste :
- PML est deja compile via `deno compile` (4 plateformes)
- Le modele build-time (cloud) -> manifest embarque -> runtime offline est coherent
- Le code existant (`SandboxExecutor`, `CapabilityLoader`, `StdioManager`) est reutilisable sans modification majeure
- La spec couvre les edge cases (Worker `--include`, HIL, unlock cloud)

### 3.3 Le tracing est le vrai differenciateur

C'est le point le plus fort du consensus. Les 3 experts identifient le tracing structure avec causalite DAG comme le seul avantage competitif durable :
- **security-expert** : le tracing permet la detection d'abus et l'audit trail
- **codebase-architect** : le `recordMcpCall()` avec contexte DAG est unique dans l'ecosysteme
- **business-strategist** : *"C'est le SEUL differenciateur que les concurrents n'ont pas. Rendre le tracing si bon qu'il justifie a lui seul PML."*

**Addendum business-strategist (apres examen du code)** : le tracing PML va bien au-dela du simple logging. Apres audit de `execution-trace-store.ts` et `tracing/collector.ts`, 7 dimensions uniques identifiees :

1. **Position DAG** (`layer_index`) — chaque appel MCP est annote avec sa position dans le graphe de dependances
2. **Fusion de taches** (`is_fused`, `logical_operations`) — les appels parallelises (Promise.all) sont traces comme structures logiques
3. **Abstraction des boucles** (`loop_id`, `loop_type`, `body_tools`) — les boucles sont tracees comme structures, pas comme N appels individuels
4. **Branches** (`decisions`) — le chemin pris ET la condition sont enregistres
5. **Causalite** (`parent_trace_id`) — traçabilite causale complete pour les appels imbriques
6. **Priorite d'apprentissage** (`priority`, PER) — echecs et cas rares surponderes pour le sampling
7. **Sanitization** — donnees sensibles automatiquement redactees

**Conclusion revisee du business-strategist** : *"Le positionnement le plus defensible de PML n'est pas 'marketplace de capabilities' mais l'observabilite pour les workflows MCP. C'est un marche qui n'existe pas encore mais qui va etre OBLIGATOIRE des que les entreprises deploient des agents en production. Aucune entreprise serieuse ne deploie des agents IA en production sans trail d'audit. PML a cette couche. Les autres non."*

### 3.4 La marketplace de capabilities est prematuree

Aucun expert ne recommande de lancer une marketplace ouverte maintenant :
- **security-expert** : 3 gaps critiques a combler avant (resource limits, scoped permissions, code signing)
- **business-strategist** : pas de clients payants, pas de moat defensible sur les capabilities elles-memes
- **codebase-architect** : l'effort technique est reel (6 taches, 750 lignes de spec) pour un ROI non demontre

---

## 4. DESACCORDS

### 4.1 Faut-il construire le standalone MAINTENANT ?

| Expert | Position |
|---|---|
| **business-strategist** | **NON** — "Arreter de construire le standalone tant qu'il n'y a pas 3 clients consulting payants." Le standalone est une solution a un probleme que personne n'a. |
| **codebase-architect** | **OUI, mais pas pour la marketplace** — Le standalone est utile comme outil de deploiement pour les consultants chez leurs clients. Le use case : "le consultant installe un binaire PML chez son client ETI." |
| **security-expert** | **PAS AVANT les fixes P0** — Resource limits et scoped permissions sont des prerequis non negociables. |

### 4.2 Le binaire de 87 MB est-il acceptable ?

| Expert | Position |
|---|---|
| **codebase-architect** | Acceptable pour un outil CLI (comparable a `docker`, `kubectl`, `deno` lui-meme). Le V8 runtime est incompressible. |
| **business-strategist** | Inacceptable pour une marketplace ou les concurrents pesent 1-5 MB. Cree une friction d'installation de 5+ minutes. |

### 4.3 La strategie "trojan horse" est-elle viable ?

| Expert | Position |
|---|---|
| **codebase-architect** | Architecturalement elegante — meme binaire, mode switch via env var. |
| **business-strategist** | Funnel microscopique — 3-5 capabilities showcase, friction d'installation elevee, pari sur la decouverte de PML par l'utilisateur. *"L'unlock est un pari."* |

---

## 5. RISQUES

### 5.1 Securite (identifies par security-expert + codebase-architect)

**8 vecteurs d'attaque identifies, dont 2 CRITIQUES :**

| # | Vecteur | Severite | Description | Remediation |
|---|---|---|---|---|
| V1 | **Resource exhaustion** | **CRITIQUE** | Pas de limite memoire/CPU sur le Worker. `while(true){}` = 5 min de freeze. OOM du process parent possible. | V8 flags `--max-old-space-size`, timeout reduit a 30s pour code non-truste |
| V7 | **Privilege escalation laterale** | **CRITIQUE** | `approvedTools` (Set) est partage entre TOUTES les capabilities d'une session. Si l'utilisateur approve `filesystem:read_file` pour une capability de confiance, une capability malveillante herite de cette approbation automatiquement. Scenario : cap A (confiance) fait approuver FS read → cap B (malveillante) lit `~/.ssh/id_rsa` sans HIL. | **P0** : Scoper `approvedTools` par capability, pas globalement |
| V2 | **Data exfiltration via tools** | ELEVE | Si l'utilisateur approve `filesystem:*`, une capability peut lire des fichiers sensibles et les exfiltrer via un autre tool autorise | Scoped permissions PAR capability + interdire patterns sensibles (`.ssh`, `.aws`, `.env`) |
| V3 | **Supply chain / integrity** | ELEVE | Pas de signature crypto, TOFU lockfile, typosquatting possible | Sigstore provenance, 2FA publishers, scan statique |
| V8 | **Recursive capability chain** | ELEVE | `routeMcpCall` peut appeler recursivement d'autres capabilities via `this.call()` sans limite de profondeur. Le `traceIdStack` suit la profondeur mais ne la limite pas. Masque l'exfiltration dans les traces. | `MAX_CAPABILITY_DEPTH = 3` avec fail-fast |
| V4 | **Sandbox escape via globals** | MOYEN | `self.postMessage()` direct, `BroadcastChannel` entre Workers | Masquer globals dangereux avant execution |
| V5 | **Timing side-channels** | FAIBLE | Mesure des temps de reponse RPC pour inferer l'etat des outils | Acceptable |
| V6 | **Worker zombie accumulation** | FAIBLE | Timeout externe sans cleanup explicite | `clearTimeout` (minor fix) |

**Les 2 P0 absolus avant toute marketplace : resource limits (V1) et scoped permissions par capability (V7).**

### 5.2 Adoption (identifies par business-strategist)

| Risque | Description |
|---|---|
| **Pas de marche demontre** | Zero clients payants pour le standalone. Le consulting n'est pas encore valide. |
| **Positionnement flou** | PML se bat sur 2 fronts contradictoires : contre le no-code (Zapier, n8n) ET contre le code direct (npm, scripts). Il perd sur les deux. |
| **Concurrence asymetrique** | npm packages = 1-5 MB, install en 10s. PML standalone = 87 MB, friction Gatekeeper macOS, mcpDeps Node.js. |
| **Capabilities non defensibles** | 5-15 lignes de TypeScript, reconstructibles en minutes. Pas de moat sur les capabilities elles-memes. |

### 5.3 Maintenance (identifies par codebase-architect)

| Risque | Description |
|---|---|
| **Build impossible sans cloud** | `pml bundle` necessite PML_API_KEY pour fetcher les capabilities. Le code source est dans le registry cloud. |
| **Worker `--include` edge case** | `deno compile` doit bundler le Worker script. Edge case Deno qui necessite validation. |
| **macOS codesign** | Binaires non signes = Gatekeeper bloquant. Necessiterait un Apple Developer certificate. |
| **Divergence spec/runtime** | Le manifest est snapshot au build time. Si la capability evolue cote registry, le binaire est obsolete sans rebuild. |

---

## 6. RECOMMANDATIONS

### Phasing revise (consensus du panel)

**Phase 0 — MAINTENANT (1-2 jours)**
Publier 2-3 demos BYOH sur Smithery. Pas de binaire, pas de standalone. PML Cloud expose un endpoint MCP HTTPS par capability, Smithery proxie. Effort minimal, visibilite maximale, validation data-driven.

**Phase 1 — COURT TERME (3-6 semaines)**
Investir dans les 2 actifs differenciateurs :
1. **Tracing comme USP** — Rendre le tracing DAG si bon qu'il justifie PML a lui seul. Dashboard, replay, audit trail, export.
2. **Playground solide** — C'est le produit pour les non-techniques. Sans playground, pas de consulting.

**Phase 2 — APRES VALIDATION CONSULTING (quand 3 clients payants)**
Si le consulting fonctionne, ALORS construire le standalone :
1. Fixes securite P0 (resource limits, scoped permissions)
2. Pipeline `pml bundle` (taches 1-4 de la spec)
3. Distribution Smithery stdio (pas BYOH, vrai binaire)

**Phase 3 — SCALE (6-12 mois)**
Si le standalone trouve son marche :
1. Code signing (sigstore)
2. Verified publishers
3. GitHub Actions multi-plateforme
4. Unlock features (discover/execute dans le standalone)

### Ce qu'il faut faire DE LA SPEC existante

La spec `2026-02-12-tech-spec-pml-standalone-capability-distribution.md` est bien ecrite et couvre les bons sujets. Elle ne doit PAS etre jetee — elle doit etre DIFFEREE :

| Tache spec | Verdict panel | Raison |
|---|---|---|
| Task 0: HTTP Client-Side | **FAIRE** (independamment du standalone) | Utile pour l'execution offline meme sans marketplace |
| Task 1: Manifest + Builder | REPORTER phase 2 | Pas de marche demontre |
| Task 2: RegistryClient preload | REPORTER phase 2 | Prerequis du standalone uniquement |
| Task 3: Standalone entry point | REPORTER phase 2 | Le coeur du standalone |
| Task 4: `pml bundle` CLI | REPORTER phase 2 | Pipeline de build |
| Task 5: Smithery + GitHub | **REMPLACER** par BYOH immediat | Effort 1-2 jours vs 1-2 semaines |
| Task 6: Tests | REPORTER phase 2 | Suit le standalone |

### Investissements immediats recommandes

| # | Action | Effort | Impact attendu |
|---|---|---|---|
| 1 | Publier 2-3 demos BYOH sur Smithery | 1-2 jours | Visibilite ecosysteme MCP, validation d'interet |
| 2 | Resource limits Worker (V8 flags) | 1 jour | Securite de base, meme pour le code first-party actuel |
| 3 | Tracing dashboard / export | 3-4 semaines | Le vrai differenciateur, argument de vente consulting |
| 4 | Playground robuste | 4-6 semaines | Prerequis pour tout client non-technique |
| 5 | 3 missions consulting avec PML | Temps fondateur | Validation marche, retours terrain, premiers revenus |

---

## 7. POSITIONNEMENT

### Formulation recommandee

> **PML est la couche d'observabilite pour les workflows MCP.** Chaque etape est visible, chaque decision est tracable, chaque workflow est reproductible.

### Ce que PML n'est PAS

- PML n'est pas une marketplace de capabilities (les capabilities sont des scripts de 15 lignes, pas des produits)
- PML n'est pas un concurrent de Zapier/n8n (PML cible les developpeurs, pas le no-code)
- PML n'est pas un binaire standalone (c'est une couche d'infrastructure)

### Ce que PML EST

- La couche d'observabilite pour les workflows IA multi-outils (traces structurees avec causalite DAG, fusion, boucles, branches)
- Un runtime d'orchestration MCP avec sandbox et tracing de production
- Un outil de consulting pour livrer des workflows auditables
- A terme, la reponse a "comment on fait l'audit trail quand on deploie des agents IA en production ?"

### Le marche cible

Le marche de l'observabilite des agents IA n'existe pas encore, mais il va devenir obligatoire. Aucune entreprise serieuse ne deploie des agents en production sans trail d'audit. PML a cette couche aujourd'hui. Les concurrents (Zapier, n8n, scripts directs) ne l'ont pas.

### La phrase

**"Quand vous deployez des agents IA en production, vous ne savez pas ce qui se passe a l'interieur. PML rend chaque etape observable, chaque decision auditable."**

---

## 8. ANALYSE PAR FRAMEWORKS STRATEGIQUES (addendum business-strategist)

Le business-strategist a complete son analyse initiale avec 4 frameworks strategiques classiques. Les conclusions convergent toutes vers le meme verdict.

### Jobs-to-be-Done (Christensen)

| Persona | Job | PML resout ? | Priorite |
|---|---|---|---|
| Dev Claude Code | Connecter 15+ MCP servers sans saturer le contexte LLM | OUI (coeur PRD) | Actuel |
| Dev Claude Code | Paralleliser les workflows multi-tools | OUI (DAG execution) | Actuel |
| Dev Claude Code | Partager/reutiliser un workflow | PARTIELLEMENT | C'est ce que le standalone/marketplace tentent de resoudre |
| Consultant | Vendre son expertise sans etre physiquement present | THEORIQUE (playground MVP) | Phase 2 |
| DSI ETI | Audit trail de ce que l'IA fait dans mon systeme | OUI, si le tracing est expose | **Plus haute valeur business** |

**Insight cle** : Le standalone et la marketplace tentent de resoudre le job #3 (partage) alors que les jobs #4 et #5 ont plus de valeur business mais ne sont pas encore adresses. Les ETI sont en situation de **non-consommation** (Christensen) — ils ne font PAS d'orchestration MCP aujourd'hui. PML peut etre disruptif en bas de marche SI le playground rend ca accessible.

### Blue Ocean (Kim & Mauborgne)

**Strategy Canvas** — PML vs alternatives sur 8 facteurs :

| Facteur | Zapier/Make | n8n | Script direct | PML |
|---|---|---|---|---|
| Simplicite d'usage | TRES HAUT | HAUT | BAS | BAS |
| Communaute | TRES HAUT | HAUT | N/A | QUASI-NUL |
| **Tracing/Audit** | BAS | BAS | NUL | **TRES HAUT** |
| **Sandbox/Securite** | NUL | BAS | NUL | **HAUT** |
| **MCP natif** | NUL | BAS | HAUT | **TRES HAUT** |
| **Auto-apprentissage** | NUL | NUL | NUL | **MOYEN** |
| Distribution | TRES HAUT | HAUT | MOYEN | BAS |

**ERRC recommande** :
- **ELIMINATE** : la marketplace de capabilities (trop tot, pas de valeur unique)
- **REDUCE** : le standalone binaire (reduire a un cas d'usage consultant)
- **RAISE** : le tracing (dashboard, visualisation, export compliance)
- **CREATE** : "Observability-as-a-Service for MCP workflows" — un marche qui n'existe pas encore

### Antifragilite (Taleb)

| Dimension | Analyse |
|---|---|
| Beneficie de la volatilite ? | OUI — plus l'ecosysteme MCP grandit/devient chaotique, plus le besoin d'un gateway structurant augmente |
| Downside si MCP echoue ? | **CRITIQUE** — PML est 100% dependant de MCP. Si Anthropic abandonne MCP ou si un standard rival emerge, PML meurt. C'est la fragilite fondamentale. |
| Black swan positif | Apple/Microsoft adoptent MCP → explosion du marche → PML est positionne |
| Black swan negatif | Incident securite sur un MCP server PML → reputation detruite. Ou Anthropic lance un tracing natif dans Claude → PML perd son moat. |

**Recommandation Taleb** : Barbell strategy — **90% sur le consulting direct** (conservateur, revenue immediat) + **10% sur Smithery BYOH** (agressif, faible cout, potentiel asymetrique). NE PAS surinvestir dans la marketplace/standalone (paris concentres).

### Hedgehog Concept (Collins)

Les 3 cercles de Collins revelent le probleme fondamental :

1. **Ce qui passionne** : L'infrastructure IA deterministe, l'observabilite -- PRESENT
2. **Ce qu'on peut etre le meilleur au monde** : Le tracing structure de workflows MCP avec auto-apprentissage -- PRESENT
3. **Ce qui drive l'economic engine** : ??? -- **ABSENT**

Le standalone et la marketplace ne remplissent PAS le cercle #3. Le consulting direct (500-2000 EUR/mission) pourrait le remplir. L'observability-as-a-service pourrait le remplir a plus grande echelle.

---

## ANNEXE : Matrice de couverture des experts

| Sujet | security-expert | codebase-architect | business-strategist |
|---|---|---|---|
| Sandbox isolation | Analyse detaillee (8 vecteurs, 2 CRITIQUES) | Audit 15 fichiers | — |
| Resource limits | P0 identifie | Confirme | — |
| Scoped permissions | **P0 CRITIQUE** (V7 privilege escalation) | Gap identifie | — |
| Code signing | P1 recommande | — | — |
| deno compile faisabilite | — | FAISABLE confirme | — |
| Taille binaire (87 MB) | — | Acceptable CLI | Inacceptable marketplace |
| Trojan horse | — | Elegant techniquement | Funnel microscopique |
| Marche / clients | — | — | Zero clients, premature |
| Tracing comme USP | Audit trail | Unique ecosysteme | Seul differenciateur |
| Positionnement | — | — | Infrastructure, pas marketplace |
| Comparaison concurrence | Cloudflare/Deno/npm | — | Zapier/n8n/npm/scripts |
| Frameworks strategiques | — | — | JTBD, Blue Ocean, Taleb, Collins |
| Fragilite MCP | — | — | 100% dependant MCP (risque existentiel) |
