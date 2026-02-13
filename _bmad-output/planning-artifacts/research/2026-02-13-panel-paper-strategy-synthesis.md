# SYNTHESE CONSOLIDEE FINALE — Panel d'experts PML Paper + Strategie

**Rapporteur** : Dr. Raj Patel (editeur associe JMLR, 200+ reviews)
**Panelistes** : Sarah Chen (positionnement ML), Marcus Weber (rigueur formelle/PL), Amara Okafor (deploiement/business), Yuki Tanaka (graph ML/code quality), Raj Patel (methodologie)
**Date** : 2026-02-13
**Objet** : Evaluation du paper "Compiled Tool Selection" + priorisation strategique PML

---

## 1. CONSENSUS ET DESACCORDS

### 1.1 Points de CONSENSUS (5/5 experts d'accord)

| # | Point de consensus | Confiance |
|---|---|---|
| C1 | **Le tracing DAG structure est le vrai differenciateur de PML** — les 7 dimensions uniques (position DAG, fusion, boucles, branches, causalite, PER, sanitization) n'existent chez aucun concurrent | UNANIME |
| C2 | **Le test set (374 traces, ~75/fold) est trop petit** pour des conclusions statistiques solides. La variance inter-fold (52.4%-68.2%) le confirme | UNANIME |
| C3 | **Les ablations sont absentes** — aucune ablation input-par-input du GRU, aucune ablation du couplage SHGAT→GRU, aucune baseline triviale | UNANIME |
| C4 | **Table 5 (comparaison cross-benchmark) est methodologiquement invalide** — comparer Hit@1 sur prod traces avec task success sur MCP-Universe est un non-sequitur | UNANIME |
| C5 | **Le code n'est pas publiable en l'etat** — dependance PostgreSQL, copie manuelle dist-node, pas de script reproductible | UNANIME |
| C6 | **Le pipeline n8n est une contribution reelle** (revisee apres correction fondateur) — 7654 workflows communautaires, soft targets, donnees reelles vs synthetiques GPT-4o | UNANIME |
| C7 | **cs.SE est la meilleure venue** — c'est un paper systeme avec composants ML, pas un paper ML pur | FORTE MAJORITE |

### 1.2 DESACCORDS

| # | Sujet | Position A | Position B |
|---|---|---|---|
| D1 | **L'analogie "compilation" dans le titre** | Marcus Weber : "abus de langage, le paper n'a rien de compile, ca va irriter les reviewers PL" | Sarah Chen : "l'analogie est pedagogiquement utile, le framing 'interpreter→compiler' aide a comprendre la contribution" |
| D2 | **Publier maintenant vs attendre** | Raj Patel : "attendre 2-3 mois, collecter 1000+ traces, ajouter ablations" | Sarah Chen / Amara Okafor : "publier rapidement sur arxiv pour planter le drapeau, corriger dans v2" |
| D3 | **Le SHGAT apporte-t-il vraiment quelque chose au GRU ?** | Yuki Tanaka : "les composite features [3D] sont potentiellement redondantes avec le cap fingerprint, pas d'ablation pour trancher" | Le paper revendique un "unified model" mais le code montre un couplage fragile |
| D4 | **Score du paper** | Raj : 5/10, Marcus : ~4-5/10 (rigueur formelle insuffisante) | Sarah : ~6/10 (contribution conceptuelle forte), Amara : ~5-6/10 (deploiement realiste mais claims trop fortes) |
| D5 | **Priorite #1** | Raj + panel PMF : "tracing dashboard cloud" | Yuki : "les ablations pour le paper prennent 1-2 jours, autant les faire maintenant" |

---

## 2. SCORE CONSOLIDE DU PAPER

### Grille de notation (sur 10, par dimension)

| Dimension | Raj | Sarah | Marcus | Amara | Yuki | **Moyenne** |
|---|---|---|---|---|---|---|
| Contribution conceptuelle | 6 | 7 | 5 | 6 | 6 | **6.0** |
| Rigueur experimentale | 4 | 5 | 4 | 5 | 5 | **4.6** |
| Related work / positionnement | 7 | 7 | 6 | 6 | 6 | **6.4** |
| Reproductibilite | 3 | 4 | 3 | 4 | 4 | **3.6** |
| Clarte / writing | 6 | 7 | 5 | 6 | 6 | **6.0** |
| **GLOBAL** | **5** | **6** | **4.5** | **5.5** | **5.5** | **5.3/10** |

### Interpretation

- **5.3/10 = sous le seuil de publication serieuse** pour un venue peer-reviewed
- **Publiable sur arxiv** comme preprint (arxiv n'a pas de seuil de review)
- **Ameliorable a 7/10** avec les corrections identifiees (ablations, baselines, reproductibilite, framing)
- **La contribution conceptuelle (6.0) est le point fort** — l'idee de separer selection/filling et l'analogie JIT ont du merite
- **La reproductibilite (3.6) est le point faible critique** — sans artifact standalone, le paper est non-verifiable

---

## 3. PRIORISATION STRATEGIQUE CONSOLIDEE

### La question centrale : paper vs produit

Le panel converge sur une reponse nuancee : **le produit EST le paper, et le paper NOURRIT le produit**.

### Classement consolide (par impact business)

| Rang | Option | Impact | Effort | Ratio | Consensus |
|---|---|---|---|---|---|
| **#1** | **Tracing Dashboard cloud** | CRITIQUE | 4-6 sem | ELEVE | 5/5 d'accord |
| **#2** | **Ablations + baselines paper** | ELEVE | 1-2 jours | TRES ELEVE | 5/5 d'accord |
| **#3** | **Artifact reproductible** | ELEVE | 3-5 jours | ELEVE | 5/5 d'accord |
| **#4** | **Evaluation LiveMCPBench** | ELEVE | 1-2 jours | TRES ELEVE | 4/5 d'accord |
| **#5** | **Playground demo video** | MOYEN | 2-3 sem | MOYEN | 3/5 d'accord |
| **#6** | **Paper arxiv publication** | MOYEN | 2-3 sem redaction | MOYEN | Debat (D2) |
| **#7** | **Router ML (ameliorer Hit@1)** | FAIBLE (court terme) | 2-4 sem | FAIBLE | 5/5 : premature |
| **#8** | **Standalone distribution** | FAIBLE | 4-6 sem | FAIBLE | 5/5 : premature |

### Observation cle

Les rangs #2, #3, #4 (ablations, artifact, LiveMCPBench) sont des **prerequis du paper** qui prennent **moins d'une semaine** au total. Ils devraient etre faits IMMEDIATEMENT, independamment de la decision paper vs produit. C'est le meilleur ratio impact/effort de toute la liste.

---

## 4. TOP 10 RECOMMANDATIONS ACTIONNABLES

Classees par **impact/effort** (le plus rentable d'abord) :

| # | Action | Effort | Impact | Qui |
|---|---|---|---|---|
| **1** | **Ajouter 3 baselines triviales** : random (1/870), frequency (most-common tool), cosine-only (BGE-M3 sans GRU/SHGAT). Reporter dans une Table "Baselines". | 2-3h | CRITIQUE — sans ca, 60.6% est un chiffre sans contexte | Fondateur |
| **2** | **Ablation input-par-input du GRU** : retirer chaque input un par un (5 runs), reporter delta Hit@1. Focus sur composite_features SHGAT (prouve le couplage) et cap_fingerprint (prouve la hierarchie). | 4-6h | CRITIQUE — justifie l'architecture a 5 inputs | Fondateur |
| **3** | **Evaluer sur LiveMCPBench en next-tool prediction** : utiliser le pipeline SHGAT+GRU sur les 95 queries LiveMCPBench. Permet une comparaison directe avec ToolACE-MCP. | 1-2 jours | ELEVE — seule comparaison cross-system valide | Fondateur |
| **4** | **Creer un artifact reproductible** : dossier paper-artifacts/ avec donnees JSON pre-traitees, reproduce.sh, README. Pas besoin de PostgreSQL. | 3-5 jours | ELEVE — reproductibilite est a 3.6/10 | Fondateur |
| **5** | **Mesurer la latence reellement** : 1000 inferences, reporter p50/p95/p99 en ms. Remplacer "<1ms" par un chiffre mesure. | 1h | MOYEN — remplace une claim non verifiee | Fondateur |
| **6** | **Reformuler Table 5** : retirer la comparaison numerique directe avec ToolACE-MCP. Faire un tableau qualitatif (model size, paradigm, data source) + un paragraphe discursif. | 2h | MOYEN — elimine le point de rejet le plus probable | Fondateur |
| **7** | **Ajouter precision/recall/F1 pour la termination** : decomposer le 73.3% en TP/FP/FN. Un modele "jamais terminer" ou "toujours terminer" ne devrait pas scorer pareil. | 1h | MOYEN — complete la Table 1 | Fondateur |
| **8** | **Insister sur "donnees reelles vs synthetiques"** : ajouter un paragraphe dans Section 4.3.2 comparant les donnees n8n (workflows communautaires reels) vs ToolACE-MCP (15K trajectoires GPT-4o synthetiques). C'est un argument de qualite de donnees fort. | 1h | MOYEN — differenciateur methodologique | Fondateur |
| **9** | **Deployer le tracing dashboard cloud** : c'est le produit qui genere les donnees pour le prochain paper. Plus d'utilisateurs = plus de traces = meilleur paper v2. | 4-6 sem | ELEVE (long terme) | Fondateur |
| **10** | **Ajouter une section Limitations dediee** : 374 traces test, ratio params/data, variance inter-fold, coverage rate non mesure. La transparence est VALORISEE par les reviewers. | 2h | MOYEN — transforme une faiblesse en preuve de maturite | Fondateur |

### Effort total pour les corrections paper (#1-8, #10) : ~2-3 jours de travail

C'est le meilleur investissement possible. Le paper passe de 5.3/10 a potentiellement 7/10 avec moins d'une semaine de travail.

---

## 5. LE MOAT — Consensus des experts

### Ce qui N'EST PAS un moat

| Candidat | Verdict | Raison |
|---|---|---|
| Paper arxiv | PAS un moat | Citable et reimplementable par quiconque. Un preprint n'est pas une barriere. |
| Implementation ML (258K params) | PAS un moat | 1544 LOC pour le GRU, ~2300 LOC pour SHGAT. Reproductible en 2 semaines par un ingenieur ML competent. |
| Capabilities marketplace | PAS un moat | 5-15 lignes de TypeScript, reconstructibles en minutes. |

### Ce qui EST un moat (consensus 5/5)

| Candidat | Defensibilite | Raison |
|---|---|---|
| **Flywheel traces → routing → traces** | **ELEVE** | Avantage cumulatif. Plus de traces = meilleur routing = meilleur produit = plus d'utilisateurs = plus de traces. Les concurrents partent de zero. C'est un network effect sur les donnees. |
| **Tracing DAG structure (7 dimensions)** | **ELEVE** | Architecturalement profond. La combinaison position DAG + fusion + boucles + branches + causalite + PER + sanitization est un paradigme, pas un feature. Reproduire du tracing plat est facile. Reproduire du tracing structure est dur (6 mois minimum). |
| **Pipeline n8n data augmentation** | **MOYEN** | Les 7654 workflows + embeddings + soft targets sont une propriete intellectuelle non-triviale. Les donnees communautaires reelles ont plus de valeur que les trajectoires synthetiques. Mais c'est reproductible avec effort. |
| **First-mover sur le tracing MCP** | **MOYEN (decroissant)** | PML est tot dans le tracing MCP, mais les barrieres d'entree sont basses. Ce moat se deprecie chaque mois qui passe sans monetisation. Anthropic ou LangChain pourrait lancer un tracing MCP natif demain. |

### La phrase du moat

**"Le moat de PML n'est pas le modele ML ni le paper. C'est l'accumulation de traces structurees dans un flywheel ou chaque execution rend le routing meilleur et chaque trace rend le tracing plus intelligent."**

---

## 6. TIMELINE RECOMMANDEE

### Semaines 1-2 (MAINTENANT)

| Jour | Action | Livrable |
|---|---|---|
| J1 | Baselines triviales (random, frequency, cosine) | Table "Baselines" pour le paper |
| J2 | Ablations input-par-input GRU (5 runs) | Table "Ablation Study" revisee |
| J3 | Mesure latence (p50/p95/p99) + termination P/R/F1 | Chiffres verifies pour claims |
| J4-J5 | Evaluation LiveMCPBench en next-tool prediction | Comparaison cross-system valide |
| J6-J7 | Artifact reproductible (JSON pre-traite + reproduce.sh) | Dossier paper-artifacts/ |
| J8 | Reformuler Table 5, ajouter Limitations, insister n8n vs synthetique | Outline v2 pret |

**Livrable semaine 2** : Paper outline v2 avec toutes les corrections. Score attendu : 7/10.

### Mois 1 (semaines 3-4)

| Action | Livrable |
|---|---|
| Rediger le paper complet (14 pages) | Draft v1 sur Overleaf |
| Solliciter 2-3 relecteurs externes (pas ce panel) | Feedback pre-soumission |
| Commencer le tracing dashboard cloud (sprint 1) | MVP : timeline des executions |

**Decision point** : publier sur arxiv apres la relecture externe ? Si les relecteurs donnent >= 6/10, publier. Sinon, iterer.

### Mois 2-3

| Action | Livrable |
|---|---|
| Publier sur arxiv (si pret) | Preprint en ligne |
| Tracing dashboard : sprint 2-3 | Dashboard avec DAG, detail trace, replay |
| Onboarding "0 to trace" en 5 minutes | `pml init` + premiere trace visible |
| Collecter traces utilisateurs (objectif : 500+) | Donnees pour paper v2 / workshop |

**Decision point mois 3** : soumettre a un workshop FSE/ICSE 2027 ? Si 500+ traces et resultats ameliores, oui. Sinon, continuer a collecter.

### Mois 6+

| Action | Condition |
|---|---|
| Paper v2 avec 1000+ traces | Si tracing dashboard a des utilisateurs |
| Soumission FSE/ICSE workshop | Si paper v2 >= 7/10 |
| Router ML ameliore (Hit@1 > 70%) | Si les traces nouvelles le justifient |
| Standalone distribution | Si 3+ clients consulting payants |

---

## 7. MOT DE LA FIN

Ce panel a identifie un paradoxe productif : **le meilleur investissement pour le paper (2-3 jours d'ablations et baselines) est aussi le meilleur investissement pour le produit** (ca valide que l'architecture fonctionne). Et le meilleur investissement pour le produit (tracing dashboard) est aussi le meilleur investissement pour le prochain paper (plus de donnees).

Le fondateur n'a pas a choisir entre paper et produit. **Les 10 premiers jours de travail servent les deux objectifs simultanement.** Apres, la priorite bascule vers le tracing dashboard pour alimenter le flywheel.

L'idee de "compiled tool selection" est bonne. L'execution experimentale est insuffisante mais corrigeable en quelques jours. Le vrai produit est le tracing. Le paper est un accelerateur de credibilite, pas une fin en soi.

---

**Score consolide final : 5.3/10 (en l'etat) → 7/10 (apres corrections, ~1 semaine)**

-- Dr. Raj Patel, rapporteur du panel
Pour : Sarah Chen, Marcus Weber, Amara Okafor, Yuki Tanaka

---

## ADDENDUM 1 — Correction dataset (fondateur)

Le dataset d'entrainement est de **3100 exemples** (1122 prod oversampled 3x + 1978 n8n filtres), PAS 374. Les 374 traces sont le nombre de traces production uniques utilisees pour le TEST (split par trace). Le ratio params/data est 258K/3100 = 83:1, pas 230:1.

**Impact** : Amara revise son score a 8/10. Le ratio 83:1 est meilleur que ToolACE-MCP (~353:1 meme en LoRA 5.3M active/15K). Le data bottleneck est reel mais pas aussi severe. La variance ±5.2% vient du test set petit (70/fold), pas de l'overfitting.

---

## ADDENDUM 2 — Vision "Gateway de workflows deployables" (fondateur)

Le fondateur a clarifie : PML n'est PAS juste du tracing passif. C'est une **gateway complete** : creer (playground) → tracer (DAG structure) → reutiliser (replay) → deployer (Deno Deploy, Telegram via MCP Apps Bridge).

### Ce que ca change

1. **Positionnement produit** : plus "Vercel pour agents" que "LangSmith pour MCP"
2. **Le router ML remonte** : c'est l'intelligence du discover/suggest dans l'IDE, pas de la recherche isolee
3. **Le playground monte a priorite #1** : c'est l'entree de la boucle creer→tracer→deployer

### Priorisation REVISEE (post-gateway)

| Rang | Option | Justification |
|---|---|---|
| **#1** | **Playground fonctionnel** (Epic 17) | C'est LE produit gateway — sans playground, pas de workflows |
| **#2** | **Ablations + baselines paper** | Inchange, 2-3 jours, meilleur ratio |
| **#3** | **Integration SHGAT+GRU dans discover** | REMONTE — c'est le suggest intelligent du playground |
| **#4** | **Auth + billing** (Epic 9) | Prerequis monetisation |
| **#5** | **Deploy pipeline** (workflow → MCP server → Deno Deploy) | Boucle complete |
| **#6** | **Paper arxiv** | Framing "infrastructure paper" (IDE pour agents) |
| **#7** | **Standalone distribution** | Se fond dans le deploy pipeline |

### Framing paper recommande FINAL (3 couches)

1. **Couche systeme** (contribution principale) : "PML is a gateway for creating, tracing, and deploying MCP agent workflows"
2. **Couche ML** (contribution technique) : "The compiled router (SHGAT+GRU, 258K params) replaces cosine discovery with sequential prediction"
3. **Couche empirique** (validation) : "Evaluated offline (60.6% Hit@1) and in shadow mode on N production queries"

### Score revise

Le score du paper RESTE 5.3/10 en l'etat. Mais le potentiel post-corrections monte a **7.5-8/10** si le modele est deploye en prod (shadow mode) et le paper inclut des metriques online.

### Warning

"La vision IDE pour agents est seduisante mais dilue le focus. Choisir UN use case pour le paper, UN pour le produit." — Raj Patel

---

## ADDENDUM 3 — Points complementaires des echanges croises

### Analogie PGO > JIT (Marcus Weber)
Marcus propose **Profile-Guided Optimization** comme meilleure analogie que JIT :
- PGO : on profile (traces) → on recompile (training) → binaire optimise (modele statique)
- JIT : compilation a runtime (pas ce qu'on fait)
- PGO colle mieux car notre modele est statique une fois entraine

### Couplage SHGAT→GRU = 67D, pas 3D (Marcus Weber)
Le couplage reel est :
- **capInput** [64D] — projection du fingerprint de capabilities (derive de la hierarchie L1+ SHGAT)
- **compositeInput** [3D] — sortie directe de scoreNodes() du SHGAT
- **Total : 67D**, pas "juste 3 features" comme Yuki le suggerait

### Hit@3 = 80.9% comme metrique pivot (Amara Okafor)
Reframer : "reduit le search space de 870 a 3 candidats" plutot que "choisit le bon outil a 60.6%". Plus defensible et plus utile en pratique (le LLM choisit parmi 3 au lieu de 870).

### Titre final recommande (consensus)
**"Learned Tool Routing for MCP Workflows: A 258K-Parameter Model Trained on Production Traces and Community Workflows"**
- Sans "Compiled" (Marcus : formellement incorrect)
- Sans "SHGAT" (Yuki : pas novel)
- Avec "Community Workflows" (pipeline n8n = contribution reelle)

### Message Passing = ongoing work, pas resultat negatif
Le fondateur precise que le MP est en cours d'amelioration avec plus de donnees. 282 exemples etaient insuffisants. Framing recommande : "With 282 contrastive examples, MP operates as a no-op. Validation with 1000+ examples is ongoing."

### SHGAT+GRU pas en production
Le discover actuel utilise du cosine similarity basique. Le SHGAT+GRU est evalue offline seulement. Le paper DOIT le dire explicitement. L'integration en shadow mode (A/B test cosine vs SHGAT+GRU) renforcerait significativement le paper.

---

## Fichiers de reference

- Synthese Sarah Chen : `2026-02-13-panel-sarah-chen-final-synthesis.md`
- Paper outline : `2026-02-13-paper-outline-compiled-agent-routing.md`
- Panel PMF precedent : `2026-02-13-panel-product-market-fit.md`
- Panel standalone : `2026-02-13-panel-standalone-distribution-synthesis.md`
