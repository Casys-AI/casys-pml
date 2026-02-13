# Panel Consulting Platform -- Rapport Consolide

**Date** : 2026-02-11
**Panelistes** : business-panel, tech-architect, market-researcher
**Rapporteur** : rapporteur (consolidation et moderation)
**Commanditaire** : Fondateur Casys / PML

---

## 0. Contexte et question posee

Le fondateur de PML (Procedural Memory Layer, un gateway MCP open-source) veut pivoter vers une **plateforme permettant a N'IMPORTE QUEL consultant de vendre son expertise via des agents MCP**. Le modele : le consultant publie ses capabilities sur PML, le client du consultant y connecte son propre agent et consomme les capabilities.

**Infrastructure existante** : PML est deja un gateway MCP fonctionnel avec multi-tenant basique (`userId`, `visibility` 4 niveaux, `org/project/namespace`), sandbox execution, tracing complet, playground agentique (gpt-5-mini), et un systeme de capabilities auto-apprises.

### La question architecturale critique (du brainstorming initial)

> "Si c'est mon agent qui va sur LEUR ordinateur en mode computer-use, PML sert a quoi ? PML fournit des MCP tools via gateway. Si l'agent est chez eux en computer-use, il n'a pas besoin de la gateway."

Le panel doit trancher : **le role exact de PML dans le delivery**.

---

## 1. Synthese Business

### Analyse du modele economique

Le brainstorming initial a identifie 3 modeles produit en sequence :

| Phase | Modele | Pricing | Risque |
|---|---|---|---|
| MVP | Audit flash (48-72h, forfait fixe) | 500-2000 EUR/mission | Le fondateur fait tout lui-meme |
| Croissance | Corporate hacker recurrent | Abo mensuel 200-500 EUR | Scale = embaucher |
| Vision | Clone-as-a-Platform (multi-consultants) | Commission 15-20% | Chicken-and-egg marketplace |

**Formule fondamentale** : `AGENT (90% du travail) + CONSULTANT (100% de la credibilite)`

### Critique severe du modele

**Le probleme du "deux marches en un"** : La plateforme consulting a un probleme de marketplace classique. Il faut SIMULTANEMENT :
- Recruter des consultants qui publient des capabilities (offre)
- Recruter des clients qui consomment ces capabilities (demande)

Sans l'un, l'autre n'a aucune raison de venir. C'est le probleme chicken-and-egg le plus connu du business model canvas.

**Le moat est faible** : Si PML est "juste" un gateway MCP, n'importe quel concurrent peut reproduire les features techniques (multi-tenant, sandbox, tracing). Le moat reel ne peut etre QUE :
- Le reseau de consultants (pas encore existant)
- La qualite de l'onboarding (pas encore construite)
- Le first-mover advantage sur le creneau "MCP gateway for consultants" (temporaire)

**Le marche MCP est naissant** : Les clients des consultants n'ont probablement PAS d'agent MCP. Ca signifie que le modele "le client connecte son agent" est premature. Le playground (fallback agent inclus dans PML) devient OBLIGATOIRE, pas optionnel. Ca change l'economie : PML n'est plus un gateway, c'est un SaaS complet avec son propre agent.

### Questions soulevees au business-panel

1. Viabilite a court terme si le marche MCP est naissant ?
2. Le VRAI moat si la tech est reproductible ?
3. Cibler consultants techniques (petit marche, fit parfait) vs consultants generaux (grand marche, onboarding dur) ?

---

## 2. Synthese Technique

### Ce qui existe deja dans PML (audit du code)

| Composant | Etat | Fichier cle |
|---|---|---|
| Multi-tenant | Basique (userId, 4 visibility levels) | `capability-registry.ts` |
| Capability storage | Complet (FQDN, versioning, tags) | `capability-store.ts` |
| Sandbox execution | Complet (DAG, code:* tasks) | `sandbox-executor.ts` |
| Playground agent | MVP (discover -> LLM -> execute loop) | `chat.ts` |
| Tracing | Complet (TraceSyncer, workflow IDs) | `execution-trace-store.ts` |
| UI Pipeline | Wire (read/write, _meta.ui) | `response-builder.ts` |
| MCP Server | v0.8.0 (HMAC auth, CSP) | `serve-command.ts` |
| Package/Install | CLI binaire (pml install, pml upgrade) | `packages/pml/` |

### Gaps techniques pour la plateforme multi-consultants

| Gap | Effort estime | Priorite |
|---|---|---|
| **Billing/metering** : transformer traces en factures | 3-4 semaines | P0 |
| **Console consultant** : dashboard pour creer/gerer ses capabilities | 4-6 semaines | P0 |
| **Onboarding simplifie** : editeur visuel ou import n8n/Make | 6-8 semaines | P1 |
| **Marketplace/discovery** : catalogue public de consultants | 2-3 semaines | P1 |
| **Auth multi-niveau** : consultant -> ses clients, permissions fines | 2-3 semaines | P0 |
| **Isolation renforcee** : sandbox par consultant, quotas | 2-3 semaines | P1 |

**Effort total estime** : 20-27 semaines pour une plateforme complete. **C'est 5-7 mois de dev solo.**

### MVP technique en 4 semaines (coupe aggressive)

Si on veut un MVP en 4 semaines, voici le strict minimum :

1. **Semaine 1** : Auth consultant (un seul!) + visibility "public" pour ses capabilities
2. **Semaine 2** : Playground whitelabele (le client du consultant utilise le playground PML comme interface)
3. **Semaine 3** : Metering basique (compteur d'executions par capability, export CSV)
4. **Semaine 4** : Landing page "consultant X powered by PML" + onboarding guide

**Ce qu'on coupe** : editeur visuel, marketplace, billing automatise, multi-consultant, isolation avancee.

### Reponse a la question architecturale critique

**PML a un role MEME dans le scenario computer-use** :

1. **Orchestration** : L'agent computer-use fait des actions atomiques (cliquer, taper). PML orchestre le workflow de 15-40 etapes avec des DAGs deterministes. Sans PML, l'agent navigue a l'aveugle.

2. **Tracing/Audit** : Chaque action est tracee. Le consultant peut voir ce que l'agent a fait. Le client a des preuves. Sans PML, pas de trail d'audit.

3. **HIL (Human-in-the-Loop)** : PML gere l'escalade asynchrone. L'agent s'arrete avant une action destructive et demande validation. Sans PML, l'agent est un missile sans guidage.

4. **Capabilities reutilisables** : Le consultant cree un workflow une fois, il s'execute N fois chez N clients. Sans PML, chaque mission est from scratch.

**MAIS** : PML n'est pertinent que si le workflow est REPRODUCTIBLE. Pour du consulting one-shot ad hoc, PML n'apporte rien de plus qu'un agent avec des tools.

---

## 3. Synthese Marche

### Taille du marche

- **Consultants independants/freelances en France** : ~100 000 dans les domaines tech/data/automatisation (estimation)
- **Consultants utilisant deja l'IA** : 15-25% (Claude Code, Cursor, ChatGPT pour redaction)
- **Consultants prets a "packager" leur expertise en agent** : probablement < 5% (early adopters techniques)

### Concurrence

| Concurrent | Modele | Forces | Faiblesses vs PML |
|---|---|---|---|
| Custom GPTs (OpenAI) | Prompt + tools simples | Enorme base users | Pas de workflows complexes, pas deterministe |
| MindStudio | No-code AI apps | UX simple | Pas de MCP, pas de sandbox |
| n8n Cloud | Workflows automatises | Grande communaute, marketplace | Pas d'agent conversationnel, pas MCP natif |
| Make/Zapier | Automatisation lineaire | Grand public | Lineaire, pas de DAG, pas d'IA |
| Agentive/Fixie | AI agents custom | Agents custom | Ecosysteme ferme |

**Aucun concurrent identifie n'utilise MCP comme couche d'interoperabilite.** PML serait premier sur ce creneau specifique.

### Adoption MCP

L'ecosysteme MCP grandit rapidement :
- 4000+ MCP servers references (2026-02)
- Adopte par Claude Desktop, Cursor, Windsurf, Claude Code
- MAIS principalement utilise par des DEVELOPPEURS, pas par des entreprises grand public

**Conclusion marche** : Le marche MCP est en croissance rapide MAIS reste un marche de developpeurs. Les clients de consultants generaux (PME, ETI) n'ont PAS d'agent MCP et ne savent pas ce que c'est. Le playground est OBLIGATOIRE pour cette cible.

### Le modele B2B2C (consultant -> client du consultant)

Tres peu de concurrents font du B2B2C dans l'IA. La plupart font :
- B2C : l'utilisateur final cree son propre agent (GPTs, MindStudio)
- B2B : l'entreprise achete un SaaS d'automatisation (n8n, Make)

Le modele "le consultant vend VIA la plateforme a SES clients" est un positionnement differentiant mais non prouve. Il combine les difficultes de :
- Un marketplace (chicken-and-egg)
- Un outil B2B SaaS (onboarding, support)
- Un service de consulting (relation humaine, confiance)

---

## 4. Points de consensus entre les 3 analyses

1. **PML a une base technique solide** : Le multi-tenant, le sandbox, le tracing, le playground existent. Ce n'est pas du vaporware.

2. **Le marche MCP est naissant** : Compter sur "le client a son propre agent MCP" est premature. Le playground est obligatoire.

3. **L'onboarding consultant est le goulot d'etranglement** : Aujourd'hui il faut ecrire du TypeScript pour creer une capability. Un consultant non-technique ne peut pas utiliser PML.

4. **Le determinisme est un atout technique** : Les workflows PML sont reproductibles, tracables, auditables. C'est mieux que du prompt engineering. Mais le marche ne comprend pas encore cette difference.

5. **Le MVP doit etre simple** : Pas de marketplace multi-consultants au jour 1. Un seul consultant (le fondateur), quelques clients, prouver le concept.

---

## 5. Points de desaccord et contradictions

### Contradiction #1 : Plateforme vs Service

- **Vision business** : "Construire une plateforme multi-consultants, prendre 15-20% de commission"
- **Realite technique** : 5-7 mois de dev pour la plateforme complete
- **Realite marche** : Pas de consultants prets a publier, pas de clients MCP-equipped

**Verdict** : La plateforme est la VISION, pas le PRODUIT de demarrage. Le produit de demarrage est un SERVICE de consulting augmente par PML, opere par le fondateur lui-meme.

### Contradiction #2 : Determinisme vs "Magie IA"

- **Force technique** : PML fait du deterministe, reproductible, tracable
- **Perception marche** : Les clients veulent de la "magie IA", pas des DAGs

**Verdict** : Le determinisme est un argument B2B (audit, compliance, reproductibilite). PAS un argument B2C. Cibler les ETI/entreprises, pas les independants.

### Contradiction #3 : Complexite produit vs Cible consultant

- **PML est un outil technique** : CLI binaire, TypeScript, MCP protocol
- **Cible declaree** : "N'IMPORTE QUEL consultant"
- **Realite** : Seuls les consultants techniques (IT, data, dev) peuvent l'utiliser

**Verdict** : NE PAS cibler "n'importe quel consultant". Cibler les consultants TECHNIQUES qui font deja du n8n, du Power BI, du scripting. Elargir ensuite QUAND l'editeur visuel existe.

### Contradiction #4 : Computer-use vs Gateway

- **Scenario computer-use** : L'agent opere directement chez le client, pas besoin de gateway
- **Scenario gateway** : Le client envoie des requetes, PML orchestre

**Verdict** : Les deux scenarios coexistent. PML apporte de la valeur dans les DEUX cas (orchestration, tracing, HIL). Mais la valeur ajoutee est PLUS FORTE en mode gateway (reproductibilite, reutilisation). Le computer-use est pour les cas ou il n'existe PAS d'API/MCP server pour l'outil du client.

---

## 6. Verdict

### GO AVEC CONDITIONS

La plateforme consulting IA via PML est **viable a terme** mais **prematuree en tant que plateforme multi-consultants**. Le concept est solide, l'infrastructure existe, le marche emerge. MAIS le fondateur confond la VISION (plateforme) avec le PRODUIT (service).

### Conditions du GO

1. **Commencer comme SERVICE, pas comme PLATEFORME** : Le fondateur est le premier (et seul) consultant. Il utilise PML pour ses propres missions. Il prouve le concept avec 3-5 vrais clients payants.

2. **Le playground est le PRODUIT, pas un fallback** : Les clients n'ont pas d'agent MCP. Le playground est l'interface client. Il doit etre solide, joli, et simple.

3. **Cibler les consultants TECHNIQUES uniquement** pour la phase plateforme (6-12 mois) : IT, data, automatisation, n8n. Pas les consultants generaux.

4. **NE PAS construire la marketplace avant d'avoir 5 consultants actifs** qui utilisent PML pour leurs propres missions et demandent a y publier.

5. **Le billing peut etre MANUEL au debut** : Exporter les traces en CSV, facturer a la main. Pas besoin d'automatiser avant 50+ clients.

---

## 7. Les 5 prochaines actions concretes

| # | Action | Delai | Effort |
|---|---|---|---|
| 1 | **Prouver le concept soi-meme** : Le fondateur fait 3 missions consulting avec PML. Domaine KM/knowledge audit. Forfait 1000 EUR. | 4 semaines | Temps fondateur |
| 2 | **Solidifier le playground** : UX "client final" (pas dev), whitelabel basique (logo consultant), auth simple (lien magique) | 3 semaines | Dev |
| 3 | **Creer 5 capabilities de reference** : Workflows complets, documentes, demoables. Montrer ce que PML peut faire. | 2 semaines | Contenu + dev |
| 4 | **Metering basique** : Compteur d'executions par capability, export CSV. Suffisant pour facturer manuellement. | 1 semaine | Dev |
| 5 | **Pitch consultants techniques** : Trouver 3 consultants n8n/data/IT prets a tester PML pour LEURS clients. Offre gratuite 3 mois. | 6 semaines | Business dev |

**Budget total Phase 1** : ~6 semaines de dev + temps fondateur pour les missions.

---

## 8. Plus gros risque / Plus grosse opportunite

### Plus gros risque : Le marche n'existe pas encore

Le modele "consultant qui vend via un agent MCP" est THEORIQUE. Aucun consultant ne fait ca aujourd'hui. Le fondateur parie que le marche va emerger. Si MCP reste un outil de developpeurs et ne penetre pas le consulting generique, la plateforme n'a pas de marche.

**Mitigation** : Commencer par etre SOI-MEME le consultant. Si ca marche pour le fondateur, ca marchera pour d'autres.

### Plus grosse opportunite : Premier sur un marche emergent

Si MCP devient le standard d'interoperabilite IA (ce qui semble probable vu l'adoption par Anthropic, les IDEs, etc.), PML est DEJA le gateway le plus avance. Etre la plateforme de reference "publish your expertise as MCP capabilities" AVANT que le marche explose serait un avantage enorme.

**Analogie** : Shopify a commence quand le e-commerce etait naissant. La plupart des gens ne voyaient pas l'interet. Ceux qui se sont positionnes tot ont gagne.

**Attention** : L'analogie est flatteuse mais dangereuse. Shopify avait un produit SIMPLE (creer une boutique en 10 minutes). PML est COMPLEXE (ecrire du TypeScript). Le Shopify du consulting IA devra etre aussi simple que Shopify. PML n'y est pas encore.

---

## 9. Matrice de decision resumee

| Dimension | Etat actuel | Necessaire pour GO | Gap |
|---|---|---|---|
| Tech/Infra | 70% pret | Playground solide + metering | 4-6 semaines |
| Marche | Naissant | 3 clients payants | 4-8 semaines |
| Business model | Theorique | Revenue recurrent prouve | 3-6 mois |
| Onboarding consultant | Inexistant | Guide + templates | 2-3 semaines |
| Moat | Faible (tech reproductible) | Reseau de consultants | 6-12 mois |

---

## 10. Mot du rapporteur

Ce panel confirme une chose : **le concept est bon, le timing est potentiellement bon, mais l'execution proposee est prematuree**. Le fondateur veut construire une plateforme multi-consultants alors qu'il n'a pas encore prouve que UN consultant (lui-meme) peut vendre via PML.

La recommandation unanime est : **arreter de construire des features plateforme et aller chercher 3 clients payants**. Le code existant est suffisant pour demarrer. Ce qui manque n'est pas technique -- c'est commercial.

Le fondateur est TECHNIQUE. Il aime construire. C'est un piege classique : construire le produit parfait avant d'avoir un seul client. La verite severe mais constructive est : **PML a besoin de clients, pas de features**.

---

*Rapport consolide par le rapporteur sur la base du brainstorming initial, de l'analyse du code source PML, et des analyses des 3 panelistes (business, technique, marche). Les agents ont ete interroges et mis en confrontation sur les contradictions identifiees.*

---

## Addendum — Strategie de Distribution via Marketplaces MCP (Panel #2, 2026-02-11)

### Contexte du Panel #2

Suite aux conclusions du Panel #1 ("chercher 3 clients payants d'abord"), un second panel a explore un canal de distribution complementaire : **publier des capabilities PML sous forme de MCP servers standalone sur les marketplaces MCP existantes** (Smithery, Glama, Cloudflare Workers, Apify).

### Panel compose de 3 experts

- **marketplace-researcher** : Recherche ToS, exigences techniques et faisabilite par plateforme
- **tech-architect** : Validation de l'architecture technique du bundling et deploiement
- **business-strategist** : Challenge du modele business et de la strategie de distribution

### Principales conclusions

1. **GO CONDITIONNEL** : Le panel recommande un prototype a faible cout (2-3 jours) sur Smithery, puis decision data-driven apres 30 jours de metriques.

2. **Le free tier comme funnel marketing** : Publier 2-3 tools de demo gratuits sur les marketplaces pour generer du trafic vers PML. Ce n'est PAS un remplacement du consulting direct, c'est un canal marketing complementaire.

3. **Pas de cannibalisation** : Les marketplaces servent un persona DIFFERENT (developpeurs) avec un produit DIFFERENT (tools atomiques preview) du consulting direct (ETI, workflows complets). Les deux canaux coexistent.

4. **Smithery est la plateforme prioritaire** : La plus mature, format Docker supporte, pas de commission, API documentee.

5. **Docker resout les deps natives** : Le probleme des deps natives (ONNX, libvips) identifie dans le spike de distribution binaire (novembre 2025) n'existe PAS en Docker. Le serveur marketplace est un thin client sans embeddings locaux.

6. **Ne PAS investir dans le tooling** avant validation : Pas de CLI `pml publish` tant que le prototype n'a pas demontre >100 installations en 30 jours.

### Critiques severes du business-strategist

Le business-strategist a formule des objections DURES qui ont ete integrees :

1. **Le flooding est du spam** : Publier N listings du meme runtime sous des noms differents est de l'astroturfing. Decision : 3-5 capabilities PREMIUM maximum, pas de flooding.

2. **Risque "Trojan Horse"** : Un binaire opaque qui phone home ressemble a du malware (rapport Kaspersky 2026 sur MCP supply chain attacks). Decision : code open-source OBLIGATOIRE pour le serveur marketplace.

3. **ToS providers LLM** : Revendre l'acces API peut violer les ToS Anthropic/OpenAI. Decision : verifier AVANT publication. PML utilise les API comme composant (autorise), pas comme revente directe (interdit).

4. **Mismatch persona** : Les acheteurs marketplace sont des devs, PAS des acheteurs de consulting. Decision : le canal marketplace est un FUNNEL MARKETING, pas un canal de vente consulting.

5. **Protection IP illusoire** : Les DAGs sont reconstructibles en quelques heures. Le moat est dans la plateforme, pas dans les workflows individuels.

### Points de desaccord resolus

- **Timing (premature vs first-mover)** : Les deux approches coexistent. Le prototype a faible cout ne ralentit PAS le consulting direct.
- **Investissement tooling** : Compromis sur "prototype hacky d'abord, automatisation ensuite".
- **Cannibalisation** : Risque faible, canaux differents, personas differents.
- **Flooding vs showcase** : Unanimite sur l'approche "Purple Cow" (qualite > quantite).
- **Protection IP** : Accepte que le moat est dans la plateforme, pas dans les DAGs.

### Impact sur le Panel #1

Les conclusions du Panel #2 **ne modifient PAS** les priorites du Panel #1 :
- La priorite #1 reste "chercher 3 clients payants"
- La priorite #2 reste "solidifier le playground"
- Le prototype marketplace est une **action laterale a faible cout** qui peut etre faite en parallele
- Le business-strategist recommande de NE PAS faire le prototype avant d'avoir termine la Phase 1 du Panel #1 (3 clients payants)

### Document complet

Le spike detaille est disponible dans : `_bmad-output/planning-artifacts/spikes/2026-02-11-mcp-marketplace-distribution-strategy.md`

---

*Addendum redige par le rapporteur suite au Panel #2 (distribution marketplace), 2026-02-11.*
