# Panel Product-Market Fit PML -- Rapport de synthese

**Date** : 2026-02-13
**Rapporteur** : Technical Writer (synthese)
**Experts** : market-researcher, product-strategist, user-researcher
**Objet** : Trouver LE persona, LE probleme, LA direction pour PML
**Panels precedents integres** :
- Panel consulting platform (2026-02-11)
- Panel standalone distribution (2026-02-13)
- Panel hub vitrine (2026-02-08)

---

## VERDICT EN UNE PHRASE

**Le persona prioritaire est le developpeur backend qui deploie des agents IA en production et qui a besoin d'observabilite, pas de magie.**

---

## 1. Le persona : UN seul

**Alex, 32 ans, backend engineer dans une startup/scale-up (20-200 personnes), bati des agents IA qui appellent des MCP tools en production.**

Pourquoi lui et pas les autres candidats :

| Persona candidat | Verdict | Raison de l'elimination |
|---|---|---|
| **Alex (backend eng, agent builder)** | **RETENU** | A le probleme MAINTENANT, paie pour des outils, connait MCP |
| Yuki (dev MCP contributor) | Elimine | Construit des tools, ne deploie pas d'agents. PML ajoute peu a son workflow quotidien |
| Consultant/integrateur | Elimine | Le marche MCP consulting n'existe pas encore. Zero consultant vend via MCP aujourd'hui. Panel 2026-02-11 unanime : "premature" |
| DSI ETI compliance | Elimine | Ne sait pas ce qu'est MCP. Le cycle de vente est de 6-12 mois. PML n'a pas les ressources pour du enterprise sales |
| Dev Claude Code power user | Absorbe par Alex | C'est le meme profil quand il passe en production |

### Pourquoi trancher pour Alex plutot que pour le consultant

Le product-strategist recommandait les integrateurs/consultants. Le user-researcher recommandait Alex. Voici pourquoi Alex l'emporte :

1. **Le consultant n'a pas de clients MCP.** Le panel consulting (2026-02-11) l'a demontre : "les clients des consultants n'ont PAS d'agent MCP." Le consultant aurait besoin que PML soit un SaaS complet avec playground whitelabel, onboarding, billing. C'est 5-7 mois de dev (estimation du tech-architect, panel 2026-02-11). PML n'a pas ces ressources.

2. **Alex existe deja.** Le PRD le decrit (Journey 1). Il utilise 10-15 MCP servers, il code 8-12h/jour, il deploie en production. Il comprend ce qu'est un DAG, un trace, un sandbox. Il n'a pas besoin d'un editeur visuel.

3. **Alex paie deja pour des outils similaires.** LangSmith ($39-399/mois), Datadog ($23/host/mois), Sentry ($26/mois). Le budget existe. Le cycle de vente est de jours, pas de mois.

4. **Le consultant est la Phase 2.** Quand PML aura 50+ utilisateurs developpeurs et un tracing solide, le consultant technique qui fait du n8n/data viendra naturellement. Construire pour lui maintenant c'est mettre la charrue avant les boeufs.

---

## 2. Le probleme : UNE phrase

**"Je deploie un agent IA multi-outils en production, et quand il echoue a 3h du matin, je n'ai aucune idee de ce qui s'est passe ni pourquoi."**

### Decomposition du probleme

Le user-researcher a identifie 5 pain points classes. Voici les 3 qui comptent pour Alex :

| # | Pain point | Intensite | PML resout ? |
|---|---|---|---|
| 1 | **Pas d'observabilite sur les workflows multi-tools** : quand un agent appelle 8 tools en sequence et echoue au 6eme, le log dit juste "error". Pas de trace causale, pas de replay, pas de DAG visible. | CRITIQUE | OUI -- c'est le coeur de PML (tracing DAG, causalite, fusion, branches) |
| 2 | **Le gap localhost-to-prod** : 15 MCP servers marchent en local, mais en prod les permissions, le networking, les secrets, le monitoring sont un cauchemar. | ELEVE | PARTIELLEMENT -- sandbox + HIL aident, mais PML ne gere pas le deployment infra |
| 3 | **Pas de determinisme** : le meme prompt produit des workflows differents a chaque execution. Impossible de reproduire un bug, impossible de certifier un resultat. | ELEVE | OUI -- execution DAG deterministe, replay exact depuis traces |

### Ce qui n'est PAS le probleme d'Alex

- La decouverte de tools (il connait ses outils)
- La parallelisation (nice-to-have, pas un dealbreaker)
- La marketplace de capabilities (il veut ses propres workflows, pas ceux des autres)

---

## 3. Pourquoi PML et pas autre chose

### Le paysage concurrentiel

| Concurrent | Ce qu'il fait | Ce qu'il ne fait PAS |
|---|---|---|
| **LangSmith** (Langchain) | Tracing LLM, evaluation, datasets | Pas de tracing MCP natif, pas de DAG execution, pas de sandbox |
| **Datadog APM** | Observabilite infrastructure | Pas de semantique agent/tool, traces plats sans causalite DAG |
| **Arize Phoenix** | LLM observability open-source | Meme lacune que LangSmith : LLM-centric, pas workflow-centric |
| **n8n / Make** | Orchestration visuelle | Pas d'agents, pas de MCP, pas de code-first |
| **Script direct** | Liberte totale | Zero observabilite, zero replay, zero sandbox |

### L'avantage unique de PML

**PML est le seul outil qui combine tracing structure avec causalite DAG + execution deterministe + sandbox pour des workflows MCP multi-outils.**

Le panel standalone (2026-02-13) a identifie 7 dimensions uniques du tracing PML qu'aucun concurrent n'a :
1. Position DAG (layer_index) -- chaque appel annote dans le graphe
2. Fusion de taches (is_fused) -- parallelisation tracee comme structure
3. Abstraction de boucles (loop_id) -- boucles = structures, pas N appels
4. Branches (decisions) -- chemin pris ET condition enregistres
5. Causalite (parent_trace_id) -- tracabilite complete
6. Priorite d'apprentissage (PER) -- echecs surponderes
7. Sanitization -- donnees sensibles redactees automatiquement

**La phrase defensible : "PML rend chaque etape d'un workflow agent observable, chaque decision auditable, chaque execution reproductible."**

LangSmith trace les appels LLM. PML trace les workflows. Ce n'est pas le meme niveau d'abstraction.

---

## 4. Le prix et le modele

### Modele recommande : Open Core avec SaaS cloud

| Tier | Prix | Ce qu'il inclut | Persona |
|---|---|---|---|
| **Free (OSS)** | 0 EUR | CLI local, execution, tracing local, 3 MCP servers | Dev qui teste |
| **Pro** | 29 EUR/mois | Tracing cloud, dashboard, replay, 15+ servers, retention 30j | Alex (individuel) |
| **Team** | 49 EUR/user/mois | Tracing partage, RBAC, retention 90j, alertes | Equipe de 3-10 agents builders |
| **Enterprise** | Sur devis | SSO, audit export, SLA, retention illimitee, on-prem | ETI compliance (Phase 3) |

### Justification des prix

- **29 EUR/mois** : inferieur a LangSmith Developer ($39/mois), comparable a Sentry Developer ($26/mois). C'est un prix "essayer sans friction" pour un outil de monitoring.
- **49 EUR/user/mois** : comparable a Datadog APM par host. Se justifie par la valeur "je vois ce que mes agents font en prod."
- Le PRD proposait 15/25 EUR. C'est trop bas. A 15 EUR/mois il faut 333 clients pour atteindre 5K MRR. A 29 EUR il en faut 172. Le marche de niche justifie un prix plus eleve.

### Metriques cibles

| Metrique | Cible 6 mois | Cible 12 mois |
|---|---|---|
| Users OSS (CLI installs) | 500 | 2 000 |
| Users Pro payants | 20 | 80 |
| MRR | 580 EUR | 2 320 EUR |
| Conversion free->pro | 4% | 4% |

Ces chiffres sont conservateurs et realistes pour un outil de niche MCP.

---

## 5. Ce qu'il faut construire EN PREMIER

### Les 3 choses, dans l'ordre

**1. Tracing Dashboard cloud (4-6 semaines)**

C'est le PRODUIT. Pas le CLI, pas le DAG executor, pas le SHGAT. Le tracing.

Delivrables :
- Dashboard web avec visualisation DAG des traces
- Timeline des executions avec filtres (succes/echec/timeout)
- Detail d'une trace : chaque tool call, inputs/outputs, duree, position DAG
- Replay : re-executer un workflow depuis une trace
- Retention 30 jours cloud, export JSON/CSV

Pourquoi : C'est le seul differenciateur que les concurrents n'ont pas (panel standalone unanime). C'est ce pour quoi Alex paierait 29 EUR/mois. Le tracing existe deja dans PML (TraceSyncer, execution-trace-store.ts, collector.ts) -- il manque juste l'interface.

**2. Onboarding "0 to trace" en 5 minutes (2 semaines)**

Delivrables :
- `pml init` qui detecte les MCP servers existants
- Premiere execution qui genere un trace visible dans le dashboard
- Guide interactif "votre premier workflow observe"

Pourquoi : Le PRD promet <10 minutes (NFR002). Aujourd'hui c'est plus proche de 30-45 min. Si Alex ne voit pas de valeur en 5 minutes, il est perdu.

**3. `pml login` + cloud sync (1-2 semaines)**

Delivrables :
- Authentification GitHub OAuth (Epic 9, deja spec)
- `pml login` dans le CLI qui connecte au cloud
- Traces automatiquement synchronisees vers le dashboard cloud

Pourquoi : Sans auth et sync, le dashboard cloud n'a pas de donnees. C'est le pont entre le CLI local (gratuit) et le SaaS (payant).

### Effort total Phase 1 : 7-10 semaines

---

## 6. Ce qu'il faut ARRETER

| # | Ce qu'il faut arreter | Pourquoi |
|---|---|---|
| 1 | **SHGAT/GRU training pipeline** | Optimization prematuree. Hit@1 de 60% est impressionnant mais personne ne paie pour ca. Le scoring cosine basique suffit pour la decouverte de tools tant qu'il n'y a pas 1000+ utilisateurs. |
| 2 | **Standalone capability distribution** | Le panel standalone (2026-02-13) l'a dit : "prematuree commercialement." Un binaire de 87 MB pour des scripts de 15 lignes n'a pas de marche. |
| 3 | **Marketplace de capabilities** | Les capabilities sont reconstructibles en minutes. Pas de moat, pas de marche. |
| 4 | **Landing page V2 / vitrine hub** | Le panel vitrine (2026-02-08) a identifie la confusion d'identite. Simplifier plutot qu'embellir. La vitrine ne convertira pas tant qu'il n'y a pas de produit clair a vendre. |
| 5 | **Playground agent conversationnel** | Nice-to-have pour les demos, pas le produit. Alex n'utilisera pas un chat web -- il utilise Claude Code/Cursor. Le playground est utile pour le consulting (Phase 2), pas pour Phase 1. |
| 6 | **n8n data augmentation** | 30K exemples d'entrainement pour un modele que personne n'utilise encore en prod. |

### Ce qui est dur a entendre

PML a beaucoup de technologie impressionnante (SHGAT, GRU, HyperGraphViz, CapabilityCarousel, sandbox Worker isolation). Mais la technologie n'est pas le produit. Le produit est : "je vois ce que mon agent fait." Tout le reste est de l'infrastructure invisible que le client ne paie pas.

---

## 7. Le risque si on se trompe

### Scenario catastrophe : PML reste un projet OSS technique sans utilisateurs payants

**Probabilite** : ELEVEE si on continue sur la trajectoire actuelle (features plateforme, ML training, marketplace).

**Mecanisme** :
1. Le fondateur continue a construire des features impressionnantes (SHGAT v0.4, GRU k-fold, standalone distribution)
2. Personne ne les utilise parce que personne ne sait que PML existe
3. Anthropic ou un concurrent finance lance un tracing MCP natif
4. PML perd son seul avantage (first-mover sur le tracing MCP)
5. Le projet meurt dans l'anonymat avec 0 EUR de revenus

**Ce qu'il faut pour eviter ca** :
- Publier le tracing dashboard AVANT que quelqu'un d'autre le fasse
- Etre present sur les lieux ou Alex traine : GitHub, Discord MCP, Hacker News, Twitter/X
- Avoir 20 utilisateurs payants dans les 6 mois, pas 20 features supplementaires

### Le vrai risque existentiel

Le market-researcher l'a identifie : **PML est 100% dependant de MCP.** Si Anthropic abandonne MCP, si un standard rival emerge, ou si Anthropic lance son propre tracing MCP (le plus probable), PML perd son marche.

**Mitigation** : Etre le standard de facto du tracing MCP AVANT qu'Anthropic ne s'en occupe. Si PML est utilise par 500+ developpeurs quand Anthropic lance un tracing natif, il y a deux issues possibles : (a) Anthropic acquiert/integre PML, (b) PML se differencie par la profondeur (DAG, replay, learning). Les deux sont bonnes. Si PML a 0 utilisateur a ce moment-la, il est mort.

---

## RESUME EXECUTIF

```
PERSONA  : Alex, backend eng, deploie des agents IA multi-tools en prod
PROBLEME : "Mon agent echoue en prod et je ne sais pas pourquoi"
SOLUTION : Tracing DAG structure pour workflows MCP
PRIX     : 29 EUR/mois (Pro) / 49 EUR/user/mois (Team)
CONSTRUIRE EN PREMIER : Dashboard tracing cloud (7-10 semaines)
ARRETER  : SHGAT/GRU training, standalone, marketplace, landing page V2
RISQUE   : Anthropic lance un tracing MCP natif avant que PML ait des users
```

---

## ANNEXE : Arbitrage entre experts

### Ou les experts etaient d'accord

- Le tracing est le seul differenciateur defensible
- La marketplace/standalone est prematuree
- Le marche MCP est en croissance mais encore naissant
- Le consulting est Phase 2, pas Phase 1

### Ou j'ai tranche

| Sujet | product-strategist | user-researcher | Ma decision |
|---|---|---|---|
| Persona primaire | Integrateurs/consultants | Devs MCP (Yuki) + backend eng (Alex) | **Alex seulement** -- le consultant n'a pas de clients MCP, Yuki n'a pas le probleme |
| Modele Terraform | PML comme "Terraform des MCP" (infra as code) | N/A | **Rejete** -- le marche n'est pas pret pour cette abstraction. PML doit etre un outil d'observabilite, pas un outil d'infrastructure |
| Compliance comme axe | Strategique pour enterprise | Pain point reel mais niche | **Reporte Phase 3** -- le compliance necessite SSO, audit export, certifications. PML n'a pas les ressources pour du enterprise sales maintenant |
| Prix | Modele par-agent-seat | N/A | **29/49 EUR simple** -- le per-agent pricing est confusant pour un marche naissant |

### Coherence avec les panels precedents

Ce rapport est coherent avec :
- **Panel consulting (2026-02-11)** : "PML a besoin de clients, pas de features" -- confirme
- **Panel standalone (2026-02-13)** : "Reporter le standalone, investir dans le tracing" -- confirme
- **Panel vitrine (2026-02-08)** : "Confusion d'identite entre produit et service" -- le dashboard tracing resout cette confusion en donnant UN produit clair

La direction est constante depuis 3 panels : **tracing + clients payants > features + plateforme**.

---

*Rapport de synthese produit par le rapporteur sur la base des analyses de market-researcher, product-strategist, et user-researcher, croise avec 3 panels precedents et le PRD. Decision de tranchage assumee par le rapporteur.*
