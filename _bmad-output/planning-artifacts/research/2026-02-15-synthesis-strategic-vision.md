# Synthese Strategique PML — Fevrier 2026

**Date** : 2026-02-15
**Equipe** : vision-synthesis (doc-reader, strategist, market-analyst, code-verifier)
**Methode** : Analyse croisee de 13 documents internes (11-15 fev), audit code, recherche marche, veille concurrentielle live

---

## Documents fondateurs (par ordre d'importance)

| # | Document | Ce qu'il contient | Pourquoi c'est fondateur |
|---|----------|-------------------|--------------------------|
| 1 | **[Compiled Routing](2026-02-13-exploration-agents-as-tools-compiled-routing.md)** | Paradigme JIT pour agents, DAG a 3+1 types de noeuds, analogie compilateur, agent distillation, flywheel data, prior art academique (7 papers), Brain.co deterministe >> agentique | **LA** bible de la vision PML. Tout le reste en decoule. C'est ce document qui articule pourquoi "compile" change tout : Phase cold (LLM route) → Phase warm (GRU 60%) → Phase hot (GRU 80%+, LLM dernier recours). |
| 2 | **[Vision Orchestration Distribuee](2026-02-14-vision-orchestration-distribuee.md)** | 8 piliers, decisions D1-D9 du fondateur, positionnement "Ray/Temporal pour MCP" | Les decisions strategiques deliberees du fondateur APRES integration des panels. D1 = relay prioritaire, D9 = orchestration distribuee (pas SaaS tracing). |
| 3 | **[Panel MCP On-Demand](2026-02-14-panel-mcp-on-demand-feasibility.md)** | Faisabilite relay, WebMCP, sandbox, `_meta.device`, consensus "orchestrateur distribue" | Validation technique et business du relay + positionnement. 4 experts convergent vers "orchestration distribuee intelligente de N machines PML". |
| 4 | **[Paper Outline](2026-02-13-paper-outline-compiled-agent-routing.md)** | Structure du paper academique "Compiled Agent Routing" | La formalisation de la vision en contribution scientifique. |
| 5 | **[Spike Relay](../spikes/2026-02-13-spike-relay-publish-capability-exposure.md)** | Effort chiffre : 6-8 jours, 12-14 fichiers, briques existantes listees | La preuve que le relay est faisable rapidement, pas en mois. |

Les panels individuels du 13/02 (business, PMF, pricing, distribution, paper review) etaient des **inputs bruts** — ils ont ete integres dans cette synthese puis supprimes. Les decisions du 14/02 sont les **outputs deliberes** du fondateur.

---

## 1. Ou on en est (factuel)

### Ce qui EXISTE dans le code

| Composant | Etat | Preuves |
|-----------|------|---------|
| CLI local (discover, execute, serve) | Production | 213 tests lib/server |
| DAG compiler (intent → workflow multi-steps) | Production | static-structure-builder.ts, edge-generators.ts |
| Sandbox Worker (`permissions: "none"`) | Production | 20 fichiers, subprocess + Worker |
| Tracing DAG local (7 dimensions) | Production | execution.ts, TraceTaskResult |
| MCP STDIO + HTTP transport | Production | ConcurrentMCPServer, Streamable HTTP |
| SHGAT+GRU routing ML | Experimental | Hit@1=60.6% k-fold, 258K+7.35M params |
| `--expose` capabilities | **Partiel** | **23/41 tests (56%) — cloud routing casse** |
| n8n data augmentation | Complet | 30K+ exemples, pipeline scrape/embed/targets |

### Ce qui N'EXISTE PAS

| Composant | Etat | Effort estime |
|-----------|------|---------------|
| Relay inter-machines | Zero code | ~1 semaine (spike: 6-8 jours, 12-14 fichiers) |
| `_meta.device` (distributed tracing) | Zero code | 2-3 heures (trivial) |
| Capability distribution | Zero code | 6-8 semaines |
| Dashboard tracing cloud | Zero code | 4-6 semaines |
| Auth cloud (GitHub OAuth) | Zero code | 1 semaine |
| Billing (Stripe) | Zero code | 1 semaine |
| Registry/catalog centralise | Local seulement | 2-3 semaines |

### Le contexte marche (donnees market-analyst, fevrier 2026)

| Metrique | Valeur | Source |
|----------|--------|--------|
| MCP servers existants | 5,500+ | Registres publics |
| SDK MCP downloads/mois | 97M | npm/PyPI |
| Deploiements MCP locaux | 86% | Enquete communaute |
| AI inference locale en 2026 | 80% | Tendance edge AI |
| Orgs avec 200+ MCP servers | ~5,000 tools = 60K tokens de contexte | Signaux communaute |

**Signal critique** : Anthropic a cree "Tool Search" pour Claude Code (reduction 85% du context bloat). Ils reconnaissent eux-memes que la discovery est un probleme a echelle. Et un **Skill Discovery Protocol (SDP)** a ete propose par la communaute — un MCP server qui indexe et route vers les MCP servers downstream. C'est EXACTEMENT ce que PML fait deja. Ca valide l'approche, mais ca signifie aussi que d'autres voient le meme probleme.

### Le chiffre qui compte

**0 utilisateurs payants. 0 revenus. Ratio technologie/adoption critique.**

Le panel business (James Wright, ex-Gartner) : "le pire ratio technologie/adoption que j'ai vu". C'est dur a entendre mais c'est le point de depart honnete.

Un marche de 5,500+ serveurs et 97M downloads/mois existe. PML y a 0% de part. L'urgence n'est pas technologique — c'est commerciale.

---

## 2. Le probleme qu'on resout

**Dans 6-12 mois, les equipes qui deploient des agents IA en production n'auront aucun moyen de comprendre ce que leurs agents font, pourquoi ils echouent, et combien ils coutent reellement.**

C'est le meme probleme que le monitoring applicatif en 2010 (avant New Relic/Datadog) : les apps tournent en prod, personne ne sait ce qui se passe a l'interieur. Sauf qu'ici les "apps" sont des agents autonomes avec 50+ tools, et les "erreurs" coutent des tokens et font des actions irreversibles.

Ce probleme est DEJA reconnu par l'industrie : Anthropic a cree Tool Search pour reduire le context bloat de 85%. La proposition SDP (Skill Discovery Protocol) montre que la communaute cherche exactement un "meta-MCP server" qui indexe, route et controle. PML fait deja ca — avec du ML en plus.

Les douleurs concretes, par ordre de probabilite :

1. **Discovery/context bloat** (haute probabilite, MAINTENANT) : Une org avec 200 MCP servers = ~5,000 tools = 60K tokens rien que pour lister les outils disponibles AVANT de poser la question. Anthropic a du creer Tool Search pour Claude Code (reduction 85%). C'est une douleur existante, pas future. PML la resout avec le routing ML semantique.

2. **Cost explosion agentique** (haute probabilite, 3-6 mois) : Les equipes decouvrent que le LLM est appele a chaque decision de routing. Les factures API explosent. Un routing ML qui elimine 60-80% des calls LLM = proposition de valeur immediate et mesurable.

3. **Debug 50-tool sessions** (haute probabilite, 6 mois) : L'agent CI crash la nuit, le dev arrive le matin, voit "FAILED", ne peut pas reconstituer le chemin d'execution. LangSmith trace des spans LLM plats, pas des DAGs structures.

4. **Capability sprawl** (moyenne probabilite, 6-12 mois) : 10 devs, 100 capabilities, breaking changes cassent les agents 2-3x/semaine. Pas de versioning, pas de registry.

5. **Orchestration cross-machine** (basse probabilite aujourd'hui, haute dans 12-18 mois) : L'agent a besoin de GPU + DB + API dans une seule session, sur des machines differentes.

---

## 3. Positionnement recommande

### En une phrase

**"Les autres font du request/response. PML compile et optimise vos workflows MCP."**

Version longue : "PML tourne sur votre machine, parle STDIO avec vos servers locaux, compile vos workflows en DAGs deterministes, et route avec du ML au lieu de tokens LLM. Le seul outil ou le routing s'ameliore avec l'usage, pas avec la facture API."

Trois angles de pitch selon l'interlocuteur :
- **Tech lead** : "PML compile vos workflows MCP en DAGs deterministes. Une compilation, zero token a l'execution." (moat #1 : DAG compile)
- **Budget owner** : "Reduisez vos couts LLM de 60-80% — le routing ML remplace le LLM-in-the-loop." (mesurable, a valider par benchmark semaine 1)
- **Dev ops** : "Tourne sur votre machine, parle STDIO avec filesystem/git/docker/DB." (moat #2 : impossible pour n8n/Zapier/Make, architecturalement)

### Les 4 moats architecturaux (par ordre de force)

1. **DAG compile** — Le seul qui compile un intent en workflow multi-steps deterministe. Les autres (n8n, Composio, LangGraph) font du request/response tool-par-tool avec un LLM dans la boucle. PML compile une fois, execute sans tokens. Personne ne l'a, des mois a reproduire.
2. **STDIO local** — Moat architectural, pas feature gap. n8n/Zapier/Make/Composio sont des web apps serveur — ils devraient REPENSER TOUTE LEUR ARCHITECTURE pour faire du subprocess local. Ce n'est pas un backlog item, c'est une impossibilite structurelle. Or les MCP servers critiques (filesystem, git, docker, DB) utilisent STDIO. PML est un CLI qui tourne sur la machine du dev. 86% des deploiements MCP sont locaux. C'est le seul moat qu'aucun concurrent web-app ne peut copier sans se reinventer.
3. **Tracing DAG structure 7D** — Les concurrents tracent des spans plats (LangSmith) ou de l'OTel generique (Kong). PML trace des DAGs avec position, fusion, boucles, branches, causalite. Difference de nature, pas de degre.
4. **ML routing (SHGAT+GRU)** — Le seul routing qui apprend des executions passees. Composio utilise un LLM-in-the-loop (cout, latence). Kong fait du lookup par tag. Le ML est le flywheel a rendements croissants.

### Ce qu'on est

- Un **compilateur de workflows MCP** (le seul qui transforme un intent en DAG optimise)
- Un traceur DAG structure a 7 dimensions (le seul avec causalite, fusion, boucles)
- Un CLI local-first avec sandbox securise pour MCP (86% du marche est local)
- Un produit qui s'ameliore avec l'usage (flywheel traces → routing)

### Strategie de positionnement : couche intelligente au-dessus de tout registry

PML n'a pas besoin de se battre avec Kong/Smithery/SDP sur le catalogue. PML peut CONSOMMER n'importe quel registry et ajouter sa couche de valeur par-dessus :

```
Registry (Smithery, Kong, SDP, custom)  →  discovery basique
         ↓
PML  →  compilation DAG + routing ML + sandbox + tracing 7D
```

Discovery = commodity qui sera standardisee. Compilation + execution + apprentissage = valeur.

L'ecosysteme MCP en couches (fevrier 2026) :

```
COUCHE 4: Orchestration (DAG compile, multi-step, parallel)
           → PERSONNE ne fait ca pour MCP ← PML EST SEUL ICI

COUCHE 3: Smart Routing (intent-based, ML, semantic)
           → Composio Tool Router (LLM-in-the-loop, beta, cout API)
           → Anthropic Tool Search (basique, Claude-only)
           → PML discover (SHGAT+GRU, ML dedie, offline, zero cout)

COUCHE 2: Registry/Gateway (catalog, auth, rate limit) — COMMODITY
           → MCP Registry officiel (API REST, ~2000 servers, keyword)
           → Kong (enterprise, auth OAuth 2.0, tech preview)
           → Smithery (marketplace, hosting BYOH)

COUCHE 1: MCP Servers bruts (5500+, 86% locaux)
```

PML consomme les couches 1-2 comme data sources (~1-2 jours pour integrer le MCP Registry officiel via API REST) et domine les couches 3-4. Agent Skills (Anthropic) = complementaire (Skills = COMMENT utiliser, PML = QUEL outil + EXECUTE).

### Ce qu'on n'est PAS (aujourd'hui)

- PAS un orchestrateur distribue (rien n'est distribue)
- PAS Ray/Temporal/Kubernetes pour MCP (c'est une vision, pas un produit)
- PAS un concurrent de Smithery/Composio sur le hosting MCP
- PAS un outil de monitoring generique (c'est du tracing MCP specifique)
- PAS un framework agent (pas un LangGraph/CrewAI — on route, on ne code pas l'agent)

### Ou on se situe dans le paysage concurrentiel

| Concurrent | Ce qu'ils font | Ce qu'ils ne font PAS |
|-----------|---------------|----------------------|
| **n8n** | MCP Server Trigger + Client Tool natifs, 60K+ stars | **PAS de STDIO** (SSE/HTTP seulement — thread communaute ferme sans reponse), pas de discovery ML, pas de DAG compile |
| **Composio** | MCP Gateway, 500+ integrations SaaS, SOC2, routing intelligent | Cloud-only (pas local-first), pas de compiled routing ML |
| **LangSmith** | Tracing LLM spans, $39-399/mois, large base | Pas de tracing DAG structure, pas de routing ML |
| **Toolhouse** | Backend-as-a-Service agents, hosted | Lock-in cloud, pas self-hosted |
| **Smithery** | Annuaire 5000+ MCP servers | Passif — pas de routing, pas de tracing |
| **Anthropic** | Tool Search, MCP Apps, Agent Skills | Propre ecosystem, pas cross-provider |
| **Kong** | MCP Registry (tech preview NOW) | Pas de routing ML, pas de tracing DAG, pas de compilation |

**Differenciateur STDIO confirme** : n8n ne supporte PAS le STDIO nativement (SSE/HTTP Streamable seulement). Or 86% des deploiements MCP sont locaux. Les MCP servers les plus puissants (filesystem, git, DB) utilisent STDIO. n8n/Zapier/Make = web apps, impossibilite STRUCTURELLE de faire du subprocess local. PML le fait nativement.

**Le combo unique de PML** : local STDIO + DAG compile + ML routing. Aucun concurrent ne fait les trois. C'est l'intersection a defendre.

### Evolution du positionnement dans le temps

| Horizon | Positionnement | Condition |
|---------|---------------|-----------|
| Maintenant | CLI qui compile et trace vos workflows MCP | `--expose` + relay fonctionnels |
| +6 mois | Reseau de machines PML qui exposent et consomment des capabilities | 50+ capabilities publiees via relay |
| +12 mois | Compilateur auto-optimise par les traces du reseau | Flywheel mesurable (DAGs ameliores par iteration) |
| +2-3 ans | **Le compilateur + routeur du web des agents** | Effets de reseau, cout marginal zero, determinisme a echelle |

### La vision 2-3 ans : pourquoi COMPILE + DISTRIBUE change tout

**Pourquoi compile : le JIT pour agents.**

Aujourd'hui, chaque agent appelle un LLM a chaque decision de routing. C'est comme executer du Python avec un interpreteur qui re-parse le code a chaque ligne. PML fait passer les agents de l'interpreteur au compilateur JIT :

- **Phase cold** (0 traces) : le LLM route tout. Chaque execution genere une trace.
- **Phase warm** (~500 traces) : le GRU route 60% des decisions. Le LLM = fallback.
- **Phase hot** (~5000 traces) : le GRU route 80%+. Le LLM = dernier recours pour les cas nouveaux.

C'est de l'**agent distillation** : l'agent LLM "enseigne" ses patterns au GRU, puis le GRU prend le relais. Le LLM passe de "employe paye a chaque action" a "professeur qui forme un eleve".

A grande echelle :
- **Determinisme** — meme intent, meme resultat. Pour la finance, la sante, le CI/CD, c'est un pre-requis reglementaire. Les regulateurs ne certifieront jamais un agent stochastique. Ils certifieront un DAG compile.
- **Cout marginal zero** — une fois compile, un DAG coute du CPU, pas des tokens. A 10,000 workflows/jour, $0.01 (ML local) vs $0.50 (LLM cloud) est existentiel.
- **Offline** — un DAG compile tourne sans internet. 80% de l'inference est locale. Offline est le cas nominal.

**Pourquoi distribue : le mega-DAG cross-machine.**

Scenario concret a 2-3 ans. Machine A (GPU) a compile 500 workflows ML. Machine B (DB) a compile 300 workflows data. Machine C (API) a compile 200 workflows integration.

L'agent dit : "prends ces CSVs, genere des embeddings, stocke-les, cree un endpoint API." PML compile un **mega-DAG cross-machine** :

```
Noeud 1 (Machine C): read_file, parse_csv     → deterministe, 0 tokens
Noeud 2 (Machine A): generate_embeddings       → GPU local, 0 tokens
Noeud 3 (Machine B): store_vectors, create_idx → DB locale, 0 tokens
Noeud 4 (Machine C): create_endpoint           → API, 0 tokens
Tracing: un seul DAG, _meta.device sur chaque noeud
```

Zero LLM invoque. Le workflow entier est compile et distribue. Le tracing est gratuit. LangGraph orchestre dans un seul process. CrewAI coordonne dans un seul runtime. Kubernetes orchestre des containers sans comprendre le contenu. PML orchestre des **workflows intelligents cross-machine** avec un routing ML qui s'ameliore.

**Le flywheel distribue : le vrai moat.**

Comme Waze : chaque conducteur ameliore la carte pour tous les autres. PML : chaque machine ameliore le routing pour toutes les autres.

1. Machine A execute des workflows ML → traces collectees
2. Machine B execute des workflows data → traces collectees
3. Les traces A + B + C sont fusionnees dans le training GRU
4. Le GRU apprend des patterns **cross-machine** que personne ne peut voir isolement
5. Plus de machines dans le reseau → meilleur routing → plus de machines

Un concurrent qui copie le code PML n'a pas les traces. Un concurrent qui a des traces locales n'a pas les traces cross-machine. Le moat grandit avec le reseau.

**Ce que ca rend possible :**
- **Agents 24/7 sans LLM continu** — le rapport hebdo ne coute plus 10K tokens/semaine. Son workflow est compile. Cout : ~0.
- **Agents certifiables** — un DAG compile est reproductible et auditable. C'est ce qui ouvre finance et sante.
- **Marketplace de workflows, pas de tools** — les tools sont commodity (5000+). Les workflows compiles (DAGs optimises + routing ML) sont de la valeur.

**En une phrase :** PML transforme les agents IA de consommateurs de tokens en workflows compiles et distribues qui s'ameliorent avec l'usage.

Le positionnement grandit AVEC le produit — mais la destination est claire.

---

## 4. Strategie solo-founder : le plan

### Ce qu'on dit NON

- **NON au multi-persona.** Un solo founder choisit UN persona. C'est Alex (dev agents, startup Series A, 5-15 MCP servers). Pas le consultant ETI. Pas le DSI. Alex d'abord, les autres viendront.
- **NON au standalone binary.** 5 panels l'ont dit. Pas de marche.
- **NON au paper arxiv maintenant.** 1 semaine pour un impact academique marginal. Ca vient apres les premiers utilisateurs.
- **NON aux 8 piliers simultanes.** Scheduling, State/Rollback, Agent-to-Agent = 0% chacun. Chacun est un projet entier. Focus sur ce qui cree le moment "wow" et capture la position.

### Le sequencement (consensus equipe, 3/3 agents alignes)

**Semaines 1-2 : Fixer les fondations + moment "wow"**

| Action | Effort | Livrable |
|--------|--------|----------|
| Fixer `--expose` (18 tests casses) | 1-2 jours | `--expose` production-ready |
| Playground MVP (3 stories restantes) | 2 sem | Demo fonctionnelle |
| Metrique "tokens economises" dans le CLI | 3 jours | `pml execute` affiche "X tokens LLM evites" |

**Semaines 3-4 : Le relay — le "ngrok pour MCP"**

Le relay est le moment "wow" que PML n'a pas encore. `pml serve --expose --publish` = tes capabilities accessibles de partout, en une commande. Zero concurrent sur ce creneau exact. Et c'est 6-8 jours de dev, pas des mois.

| Action | Effort | Livrable |
|--------|--------|----------|
| `handleJsonRpc` refactor | 3-5 jours | Pre-requis relay |
| Relay tunnel MVP | 6-8 jours (spike: 12-14 fichiers) | `pml serve --expose --publish` |
| `_meta.device` | 3h | Distributed tracing natif |
| Demo video + content | 2 jours | "ngrok pour MCP" en 30 secondes |

Cible semaines 1-4 : **50 utilisateurs Free actifs. Premiere capability publiee cross-machine.**

**Semaines 5-8 : Monetisation + flywheel**

| Action | Effort | Livrable |
|--------|--------|----------|
| Auth GitHub OAuth | 1 sem | `pml login` |
| TraceSyncer cloud + dashboard web | 2 sem | Traces visibles en ligne + cout LLM evite |
| Stripe billing (Free/Pro) | 1 sem | 29 EUR/mois encaissable |
| Content (blog + comparatifs) | ongoing | Visibilite |

Cible semaines 5-8 : **Premier utilisateur payant.**

### Pourquoi ce sequencement

Le relay en semaines 3-4 (pas en semaine 13+) pour trois raisons :
1. **C'est le moment "wow" manquant.** `pml serve --expose --publish` est demonstrable en 30 secondes, filmable en video, unique sur le marche. Le dashboard tracing, non.
2. **C'est 6-8 jours, pas des mois.** Le spike est detaille (12-14 fichiers), le ConcurrentMCPServer est production-ready. L'effort est proportionnel a la valeur.
3. **Ca capture une position que personne n'occupe.** Composio/Kong/n8n ne peuvent pas faire du relay STDIO local → cloud. C'est le moat architectural en action.

Le dashboard et le billing viennent APRES parce qu'ils monetisent une base d'utilisateurs — qui doit d'abord exister.

### Metriques de decision

| Metrique | Seuil GO | Seuil PIVOT |
|----------|----------|-------------|
| Users Free actifs (>1 trace/semaine) | >= 50 (sem 4) | < 5 apres 6 semaines |
| Premier utilisateur payant | >= 1 (sem 8) | 0 apres 10 semaines |
| Retention M1 (reviennent apres 30j) | >= 30% | < 10% |
| Capabilities publiees via relay | >= 3 (sem 6) | 0 apres 6 semaines |

---

## 5. Risques et angles morts

### Risque #1 — Anthropic lance un tracing MCP natif (CRITIQUE)

Anthropic controle le protocole MCP. Ils peuvent ajouter un tracing natif dans Claude Desktop/API demain. Ils ont la distribution. Si ca arrive, le differenciateur tracing DAG de PML s'erode en quelques mois.

**Mitigation** : Le moat n'est pas le tracing seul — c'est le flywheel traces → routing ML. Anthropic peut tracer, mais apprendre du tracing pour optimiser le routing est un probleme ML separe. Accelerer le flywheel.

### Risque #2 — Le marche des agents MCP ne decolle pas assez vite (HAUTE)

Le persona "Alex avec 5-15 MCP servers en prod" est peut-etre trop avance. Si le marche MCP reste une niche de early adopters pendant 18 mois, le TAM est insuffisant.

**Mitigation** : Surveiller les signaux (MCP adoption dans Cursor/Claude Code, nombre de MCP servers sur Smithery, articles mainstream). Si les signaux sont faibles a la semaine 12, pivoter vers un use case plus generique (tracing LLM tout court, pas juste MCP).

### Risque #3 — La tension entre vision infrastructure et urgence commerciale (HAUTE)

Il y a deux lectures possibles de l'evolution 13/02 → 14/02 :

**Lecture A (fondateur)** : Les panels du 13 = input brut. Les decisions du 14 = output reflechi. Le fondateur a INTEGRE les panels puis CHOISI deliberement d'elargir le scope vers l'orchestration distribuee. C'est du leadership, pas de l'aveuglement. PML vise a etre une infrastructure fondamentale (modele Cloudflare : construire l'infra, monetiser plus tard), pas un SaaS de tracing a 29 EUR/mois.

**Lecture B (panels + equipe synthese)** : Trois points des panels du 13 ne sont pas adresses dans la vision du 14 :
1. Panel PMF : "Alex ne veut PAS la marketplace" → Vision : Marketplace = pilier 8
2. Panel Business : "le pire ratio tech/adoption" → Vision : ajoute du scope au lieu de couper
3. Panel Business : "fenetre qui s'erode" → Vision : aucune mention d'urgence ou de timeline

Si la lecture A est correcte, ces divergences meritent une explication explicite (pourquoi le fondateur a decide autrement malgre les panels). L'absence d'explication est ce qui fait pencher l'equipe vers la lecture B.

**Le vrai risque** : Si PML vise le modele infrastructure (open-source, adoption d'abord, monetisation plus tard), c'est une strategie defendable — mais elle exige un runway. Cloudflare avait du funding. Un solo founder sans revenus a un runway fini. La question n'est pas "premier client a 29 EUR" vs "vision infrastructure" — c'est "combien de mois de dev le fondateur peut-il financer sans revenus, et est-ce que ca suffit pour atteindre la masse critique d'adoption ?"

**Mitigation** : Expliciter la strategie choisie. Si c'est le modele infrastructure : definir la metrique d'adoption (pas de revenus) qui valide la direction — ex. 100 CLI installs actifs/semaine, 500 traces/jour, 10 contributions communaute. Si c'est le modele SaaS : premier client payant en 8 semaines. Les deux sont viables. Le danger est de ne choisir ni l'un ni l'autre.

### Risque #4 — Le solo founder ne peut pas tout faire (MOYENNE)

Dev + GTM + support + content + sales = 5 roles. Meme en sacrifiant le sleep, c'est physiquement impossible de tout faire bien.

**Mitigation** : Choisir 2 roles : dev + content. Pas de sales outbound (trop chronophage). Le CLI gratuit + Smithery + blog = inbound uniquement. Si ca ne suffit pas a generer de la traction, c'est un signal de product-market fit, pas un probleme de sales.

### Risque #5 — Le flywheel ne demarre jamais (MOYENNE)

Le flywheel traces → routing necessite des centaines de traces prod pour etre utile. Si les 5 premiers utilisateurs generent 50 traces/mois total, le GRU n'apprend rien de significatif.

**Mitigation** : Les donnees n8n (30K+ exemples) couvrent le cold start. Le GRU est deja entraine. Le flywheel ajoute de la precision, il n'est pas requis pour fonctionner. Positionner le routing ML comme "pre-entraine sur 30K workflows" des le depart.

### Risque #6 — SDP (Skill Discovery Protocol) ou equivalent open-source (MOYENNE)

La communaute a propose SDP : un MCP server qui indexe et route vers les MCP servers downstream, valide arguments, applique policies. C'est exactement ce que PML fait. Si un standard ouvert emerges et gagne de la traction, PML perd le positionnement "meta-MCP server".

**Mitigation** : PML fait PLUS que SDP (ML routing, compiled DAG, tracing 7D). Un standard de discovery ouvert pourrait meme aider PML (on l'implemente et on ajoute notre couche ML par-dessus). Surveiller, ne pas paniquer.

### Angle mort #1 — La securite comme wedge product

43% des MCP servers sont vulnerables (Kaspersky 2026). PML a un sandbox serieux, du tracing d'audit, de la validation de schema. Personne ne combine "tracing + securite MCP" aujourd'hui. C'est peut-etre l'angle qui manque au positionnement : pas juste "tracez vos agents" mais "securisez et tracez vos agents MCP".

### Angle mort #2 — Le "moment wow" manquant (CRITIQUE)

Cursor : $500M ARR avec zero marketing, word-of-mouth pur. Bolt.new : $40M ARR en 4 mois. Point commun : un moment "wow" en moins de 30 secondes. L'utilisateur installe, essaie, et comprend immediatement la valeur.

**PML n'a PAS de moment wow.** Le CLI est puissant mais abstrait. Le tracing est invisible tant qu'on n'a pas deploye un agent en prod. Le routing ML est un concept que personne ne peut toucher.

**C'est peut-etre le vrai probleme.** Plus que le relay, plus que le dashboard, PML a besoin d'une experience "zero-to-one" qui fait comprendre la valeur en 30 secondes. Idees :
- `pml discover "send email with attachment"` → resultat instantane, meilleur que grep dans 5000 tools
- `pml execute "analyze this CSV"` → DAG compile + execute en 5 secondes, trace visible
- Un playground web ou on tape un intent et on voit le DAG se compiler en temps reel

Sans moment wow, le produit le plus vendu au monde ne se vend pas.

### Angle mort #3 — Le nom "Procedural Memory Layer" est un probleme

Personne ne cherche "procedural memory layer" sur Google. Personne ne sait ce que ca veut dire. Le nom est academiquement correct mais commercialement opaque. Les devs cherchent "MCP tool discovery", "MCP routing", "MCP orchestration". PML ne rentre dans aucun vocabulaire existant.

**Recommandation** : Le nom de marque peut rester PML (3 lettres, memorable), mais le tagline et le SEO doivent parler le langage du dev : "MCP tool router", "MCP workflow compiler", "smart MCP gateway". Pas "Procedural Memory Layer".

### Angle mort #4 — Pas d'integration IDE agentique

Cursor ($500M ARR), Claude Code, Windsurf — c'est la que les devs vivent. PML est un CLI separe. Il n'y a pas d'extension VS Code, pas d'integration Cursor, pas de plugin Claude Code. Le moment ou le dev "decouvre" PML est absent de son workflow naturel.

**Recommandation** : A moyen terme, une extension VS Code / integration MCP native dans les IDE agentiques serait le canal d'acquisition le plus naturel. A court terme, le playground web peut servir de substitut.

### Risque #7 — Le "good enough" tue le "meilleur" (HAUTE)

La fenetre n'est pas "6-12 mois avant qu'ils copient le ML de PML". La fenetre est "6-12 mois avant que le marche decide que Composio/Kong = bonne-assez solution et que personne ne cherche d'alternative".

Dans les dev tools, le "good enough" gagne toujours :
- GitHub Actions = pas le meilleur CI/CD, mais deja la → CircleCI/TravisCI deviennent niche
- Vercel = pas le meilleur hosting, mais meilleur DX → les alternatives luttent
- Composio = pas de ML, pas de DAG, mais 500+ integrations + auth + "ca marche" + 100K devs annonces

Composio n'a PAS besoin de copier le ML discovery de PML. Il suffit que son Tool Router (LLM-in-the-loop) soit "bon assez" pour que les devs ne cherchent plus. Kong n'a PAS besoin de tracer des DAGs. Il suffit que son registry + auth soit "bon assez" pour que les enterprises s'en contentent.

**Impact** : PML doit etre DANS les mains des devs avant que "bon assez" s'installe. Chaque mois sans utilisateur est un mois ou Composio consolide sa position. Le relay en semaines 3-4 (6-8 jours) cree le moment "wow" qui met PML dans les mains — a condition que la demo soit filmable, partageable, et que le content suive immediatement.

---

## 6. Questions ouvertes a trancher

### Q1. Quel modele : infrastructure open-source ou SaaS monetise ?

C'est LA question strategique fondamentale, et toutes les autres en decoulent.

**Si infrastructure** (modele Cloudflare/Redis) : Le relay AVANT le dashboard est logique — on construit la couche fondamentale, on maximise l'adoption, on monetise plus tard. Le "premier client payant" est une metrique trompeuse. Les metriques qui comptent : installs actifs, traces/jour, integrations communautaires. Le risque : runway fini sans funding.

**Si SaaS** (modele Datadog/LangSmith) : Le dashboard tracing AVANT le relay est logique — on monetise ce qui existe, on finance le reste avec les revenus. Le premier client payant est la metrique qui valide tout. Le risque : etre "un SaaS de plus" sans moat suffisant.

**Position du strategist** : Les deux modeles sont viables. Le danger est de ne choisir ni l'un ni l'autre — construire comme une infrastructure (scope large, pas de monetisation) tout en mesurant comme un SaaS (ou est le premier client ?). Le fondateur doit trancher et assumer les consequences du modele choisi.

### Q2. Le pitch "cost reduction" tient-il face aux chiffres reels ?

Ce document positionne le "60-80% de tokens economises" comme premier pitch. Mais ce chiffre doit etre valide empiriquement : mesurer sur 10 workflows reels combien de tokens un LLM-in-the-loop consomme vs le routing ML de PML. Si le delta reel est <30%, le pitch s'effondre. Si >50%, c'est une proposition de valeur en beton.

**Action semaine 1** : Benchmark "tokens LLM evites" sur 10 workflows representatifs. Le chiffre reel remplace l'estimation.

### Q3. Faut-il open-source le CLI ?

Le CLI gratuit est prevu comme funnel. Mais "gratuit" et "open-source" sont differents. L'open-source apporte de la confiance (securite verifiable) et de la communaute. Mais il expose aussi le code a la copie.

**Position du strategist** : Open-source le CLI avec le routing cosine (basique). Le routing GRU (ML) reste Pro. Le moat est dans les donnees d'entrainement, pas dans le code.

### Q4. WebMCP change-t-il la donne ?

WebMCP (W3C, Microsoft+Google, Chrome 146) transforme les pages web en serveurs MCP client-side. C'est complementaire (frontend vs backend), pas concurrent. Mais ca accelere l'adoption MCP, ce qui agrandit le TAM de PML.

**Position** : Monitoring passif. Aucune action avant Chrome 146 stable.

### Q5. Le relay comme moment "wow" — est-ce que ca marche ?

Le consensus de l'equipe met le relay en semaines 3-4, comme moment "wow" demonstrable. Le fondateur avait raison sur le timing : le relay est faisable en 6-8 jours (pas des mois), et c'est le seul delivrable qui n'a zero concurrent (`pml serve --expose --publish` = "ngrok pour MCP").

La question ouverte n'est plus "relay ou pas" mais "est-ce que `pml serve --expose --publish` est suffisamment spectaculaire pour declencher le bouche-a-oreille ?" La demo doit etre : (1) filmable en 30 secondes, (2) comprehensible sans explication, (3) impossible a reproduire avec les outils existants. Si ce test echoue, le moment "wow" est ailleurs (`pml discover` en split-screen vs 5000 tools).

### Q6. Le paper arxiv a-t-il une valeur strategique ?

Le paper est note 5.3/10 en l'etat, ameliorable a 7/10 en 1 semaine (baselines + ablations). Ca donne de la credibilite academique et differenicie des concurrents pure-produit.

**Position** : Apres les 50 premiers utilisateurs actifs. Le paper renforce la credibilite aupres de la communaute technique et differencie des concurrents pure-produit — mais seulement s'il y a des utilisateurs pour le lire.

### Q7. Le persona Alex a-t-il besoin de discovery ou d'observabilite ?

Tension apparente : le marche dit "5000 tools, impossible de trouver le bon" (discovery). Le panel PMF dit "Alex connait deja ses outils" (ligne 66 du doc 13/02).

**Resolution** : Ce ne sont pas deux personas — ce sont deux moments du meme parcours.

- **Alex aujourd'hui (15 MCP servers)** : connait ses outils. Probleme = orchestration + observabilite + cout. PML value = DAG compile + tracing 7D + cost reduction.
- **Alex dans 6 mois (50-200 servers)** : ne connait plus tous ses outils. Probleme = discovery overload + capability sprawl. PML value = ML discovery + smart routing.

Le panel PMF (13/02) decrit le Moment 1. Le doc "agents-as-tools" (13/02) decrit le Moment 2 ("capability sprawl" comme douleur future). Les deux sont coherents — c'est une trajectoire temporelle, pas une contradiction.

**Implication pour le produit** : PML grandit avec l'utilisateur. On vend le Moment 1 (ce qu'Alex veut maintenant : compile, trace, economise) avec la promesse du Moment 2 (quand ta stack MCP passera de 15 a 150 servers, le ML routing sera deja la). Le discovery gratuit sert de funnel d'acquisition pour les novices, le DAG compile + tracing retient les power users.

---

## Mot de fin

PML a une vision forte, du code solide, et un marche en formation (5,500+ MCP servers, 97M downloads/mois). Le combo local STDIO + DAG compile + ML routing est unique. Aucun concurrent ne fait les trois. Le marche valide le probleme (Anthropic cree Tool Search, SDP emerge). La direction est la bonne.

Le fondateur voit probablement juste sur la destination. L'orchestration distribuee de machines MCP est un probleme reel qui arrive. Les panels voient probablement juste sur l'urgence — Composio et Kong bougent maintenant, et le "good enough" tue le "meilleur" dans les dev tools.

La question n'est pas "construire vs vendre" — c'est "quel modele, et est-ce que le runway le permet ?"

**Les trois questions a trancher lundi matin :**
1. **Infrastructure ou SaaS ?** Si infrastructure : metriques d'adoption (installs, traces/jour, contributions). Si SaaS : premier client payant en 8 semaines. Choisir et assumer.
2. **Quelle est l'experience de 30 secondes qui fait comprendre PML ?** Sans moment wow, ni le modele infrastructure ni le SaaS ne demarre.
3. **Comment le fondateur gere-t-il la tension entre ses deux modes ?** Les panels du 13 et la vision du 14 ne sont pas incompatibles — mais les divergences meritent une explication explicite pour que l'equipe puisse suivre la logique.

---

*Document produit par l'equipe vision-synthesis (2026-02-15). Sources : 13 documents internes (panels business, technique, spikes, explorations), audit code, recherche marche, veille concurrentielle live (market-analyst).*
