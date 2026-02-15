# Exploration en profondeur : Agents comme outils dans un workflow compile avec routing ML

**Date** : 2026-02-13
**Statut** : Exploration prospective
**Auteur** : Claude Opus 4.6 (deep research)

---

## Table des matieres

1. [Resume executif](#1-resume-executif)
2. [Le modele theorique : DAG a 3 types de noeuds](#2-le-modele-theorique)
3. [Le routing intelligent SHGAT/GRU etendu aux agents](#3-le-routing-intelligent)
4. [Implications architecturales](#4-implications-architecturales)
5. [Prior art et etat de l'art](#5-prior-art-et-etat-de-lart)
6. [Le paradigme "compilateur JIT pour agents"](#6-le-paradigme-compilateur-jit)
7. [Agent distillation et flywheel data](#7-agent-distillation-et-flywheel-data)
8. [Limites et risques](#8-limites-et-risques)
9. [Recommandations et directions prometteuses](#9-recommandations)
10. [Sources](#10-sources)

---

## 1. Resume executif

PML propose un renversement du paradigme dominant ou le LLM orchestre tout. La vision :

```
PARADIGME ACTUEL (LLM-centric)           VISION PML (DAG-compiled + ML routing)
================================           =========================================

  User Query                                User Query
      |                                         |
      v                                         v
  [  LLM  ] <-- decide TOUT                [DAG Compiler] -- analyse statique
      |                                         |
      +-- tool call?                            v
      +-- agent call?                      [DAG optimise]
      +-- code exec?                            |
      +-- done?                                 v
      |                                    [SHGAT/GRU Router] <-- ML, 0 tokens
      v                                         |
  [Execution]                              +----+------+-------+
                                           |           |       |
                                        [tool]     [code]  [agent/LLM]
                                      determin.   sandbox   SEULEMENT
                                                           si necessaire
```

Cette exploration couvre le modele theorique, les mecanismes de routing, l'etat de l'art
academique et industriel, et les directions les plus prometteuses pour PML.

**Conclusion principale** : La vision est non seulement viable mais alignee avec une
tendance lourde de l'industrie en 2025-2026. Plusieurs papiers recents (MasRouter,
OI-MAS, RouteLLM, Tool-to-Agent Retrieval) explorent des morceaux de cette vision.
PML est unique en ce qu'il les integre dans un framework compile end-to-end avec
un flywheel data natif.

---

## 2. Le modele theorique

### 2.1 DAG a 3 types de noeuds

Le DAG PML actuel (cf. `src/graphrag/types/dag.ts`) supporte deja 3 types de taches :

```typescript
type?: "mcp_tool" | "code_execution" | "capability";
```

L'extension naturelle ajoute un 4eme type : `agent` (ou `sampling`).

```
Types de noeuds dans le DAG compile :

+-------------+------------------+------------------------+----------------------+
| Type        | Determinisme     | Permissions            | Cout                 |
+-------------+------------------+------------------------+----------------------+
| mcp_tool    | Deterministe     | Minimales (RPC only)   | ~0 tokens, ~50ms     |
| code        | Deterministe     | Sandbox (none/read)    | ~0 tokens, ~100ms    |
| capability  | Deterministe     | Heritage du code       | ~0 tokens, ~200ms    |
| agent       | NON-deterministe | Sampling + tools       | ~1K-10K tokens, ~5s  |
+-------------+------------------+------------------------+----------------------+
```

### 2.2 Analogie avec les compilateurs

L'analogie compilateur est profonde et precise :

```
Concept compilateur             Equivalent PML
===================             ===============
Source code                     Intent + code TypeScript utilisateur
AST                             AST du code parse
IR (Intermediate Repr.)         DAG de taches
Static dispatch                 mcp_tool / code_execution (resolu au compile)
Dynamic dispatch                agent / capability (resolu au runtime)
vtable lookup                   SHGAT scoring (quel outil pour ce contexte?)
Inline expansion                Capability expansion (sous-DAG inseree)
Branch prediction               GRU prediction (prochain outil probable)
Profile-guided optimization     Apprentissage sur traces de production
JIT compilation                 Cold: LLM route | Warm: GRU route
Dead code elimination           DAG pruning (branches non atteignables)
Loop unrolling                  Boucles bornees deployees en DAG lineaire
```

### 2.3 Cycles bornes vs DAG pur

Le DAG pur (acyclique) ne peut pas representer les boucles. Trois strategies :

**Strategie A : Unrolling (actuel PML)**
```
while(condition) { tool_A; tool_B; }
  -->  [tool_A_1] -> [tool_B_1] -> [tool_A_2] -> [tool_B_2] -> ... (N iterations)
```
Limite : N doit etre connu au compile-time ou borne.

**Strategie B : Cycles bornes (LangGraph-style)**
```
[tool_A] -> [condition_check] --true--> [tool_B] -> [tool_A]  (cycle)
                              --false-> [exit]
Max iterations = K (configurable, defaut 10)
```
Avantage : expressivite. Risque : non-terminaison si K trop grand.

**Strategie C : Agent-as-loop-controller (vision PML)**
```
[agent_node] --> evalue la condition dynamiquement
      |
      +--> genere un sous-DAG pour la prochaine iteration
      +--> ou signal DONE
```
L'agent est le SEUL noeud qui peut decider dynamiquement de creer de nouveaux
noeuds. C'est le "dynamic dispatch" du compilateur.

**Recommandation** : Strategie C pour les cas complexes. Le noeud agent est
le point d'injection controlable de non-determinisme dans un DAG autrement
deterministe.

### 2.4 Structure formelle du graphe etendu

```
G = (V, E, T, B)

V = ensemble de noeuds (taches)
E = aretes de dependance (donnees et controle)
T : V -> {tool, code, capability, agent}  -- type de chaque noeud
B : V_agent -> N  -- budget tokens de chaque noeud agent

Contraintes :
  1. Sous-graphe {v in V | T(v) != agent} est acyclique (DAG pur)
  2. Les cycles ne passent QUE par des noeuds agent
  3. Chaque cycle a un bound : sum(B(v)) <= BUDGET_MAX
  4. Profondeur de recursion <= DEPTH_MAX (nested execution)
```

---

## 3. Le routing intelligent

### 3.1 Extension du SHGAT aux noeuds agent

Le SHGAT actuel opere sur un hypergraphe de tools et capabilities avec une
hierarchie de niveaux (VocabNode L0=tools, L1+=capabilities). L'extension
naturelle :

```
Hierarchie etendue du vocabulaire unifie :

L0 : Tools atomiques        [read_file, psql_query, http_get, ...]     N=644
L1 : Capabilities           [data_pipeline, file_analysis, ...]        N=226
L2 : Agent templates         [code_reviewer, data_analyst, researcher]  N=~20
L3 : Meta-capabilities       [complex_analysis, creative_writing]       N=~5

L2 (agents) = super-noeuds dans l'hypergraphe :
  - Embedding = moyenne ponderee des tools qu'ils utilisent le plus souvent
  - Hyperedges = patterns d'usage observes dans les traces
  - Score = cout-benefice (tokens vs precision vs latence)
```

Le message-passing V2V (vertex-to-vertex) existant peut propager
l'information de co-occurrence entre agents et tools :

```
Si agent_A utilise souvent [tool_1, tool_2, tool_3] ensemble :
  -> Co-occurrence forte agent_A <-> {tool_1, tool_2, tool_3}
  -> Le SHGAT apprend que dans ce contexte, agent_A est un "raccourci"
     pour la sequence [tool_1, tool_2, tool_3]
```

### 3.2 Le GRU et la decision tool vs agent

Le GRU actuel (CompactInformedGRU v0.3.0, ~258K params) predit le prochain
outil dans une sequence. L'extension cle est d'ajouter les agents au vocabulaire :

```
Vocabulaire etendu :

Indices 0..643        : tools atomiques (L0)
Indices 644..869      : VocabNodes/capabilities (L1+)
Indices 870..889      : agents (L2)        <-- NOUVEAU
                                            20 agents = +20 indices

La tete de similarite (softmax sur vocabSize) inclut deja les L1+ nodes.
Ajouter les L2 nodes est trivial : vocabSize passe de 870 a ~890.
```

Le GRU apprend a choisir entre tool et agent a partir des traces :

```
Trace d'entrainement (actuelle) :
  intent="analyser les ventes"
  sequence=[psql_query, code:filter, code:map, code:aggregate]

Trace d'entrainement (avec agent) :
  intent="analyser les ventes et rediger un rapport"
  sequence=[psql_query, code:filter, AGENT:data_analyst]
                                       ^-- le GRU apprend que apres
                                           des donnees filtrees, un agent
                                           est necessaire pour la redaction
```

### 3.3 Concept de "agent budget" et routing cout-conscient

Inspire directement de OI-MAS (Wang et al., Jan 2026) et RouteLLM (LMSYS, 2024) :

```
Agent Budget System :

WORKFLOW_BUDGET = 10000 tokens
budget_remaining = WORKFLOW_BUDGET

Pour chaque noeud du DAG :
  1. GRU predit les top-K candidats (tools + agents)
  2. Pour chaque candidat agent :
     - cout_estime = historique median de tokens pour cet agent
     - Si cout_estime > budget_remaining : SKIP (ne propose pas l'agent)
  3. Score final = GRU_score * cost_weight(budget_remaining / WORKFLOW_BUDGET)
     - Plus le budget est entame, plus le score des agents est penalise
     - Plus le budget est disponible, plus on "autorise" les agents

cost_weight(ratio) :
  ratio > 0.5 : weight = 1.0      (budget confortable, agents OK)
  0.2 < ratio < 0.5 : weight = ratio * 2  (budget serre, penalite croissante)
  ratio < 0.2 : weight = 0.0      (budget epuise, tools only)
```

Ce mecanisme est directement inspire par la formule OI-MAS :
`min lambda * Conf_adj(s_t) * C(r_t, m_t)` ou la confiance module le cout.

### 3.4 Optimisation par observation : le GRU apprend a eviter les agents inutiles

Scenario cle : un workflow utilise un agent au step 3 mais un tool suffirait.

```
Traces observees :
  Trace A (avec agent) : [tool_1, tool_2, AGENT:analyst, tool_4] -- 3500 tokens
  Trace B (sans agent) : [tool_1, tool_2, code:transform, tool_4] -- 0 tokens

Si les deux traces produisent le meme resultat (meme output) :
  -> Le GRU recoit un signal de reward plus fort pour Trace B
  -> Sur les futures requetes similaires, le GRU prefere code:transform a AGENT:analyst

Signal de reward :
  reward = success_weight * accuracy - cost_weight * normalized_tokens

  Trace A : reward = 1.0 * 0.95 - 0.3 * (3500/10000) = 0.845
  Trace B : reward = 1.0 * 0.93 - 0.3 * (0/10000)    = 0.930
                                                          ^-- favorise B
```

C'est l'essence du "agent distillation passive" : le GRU observe les cas ou
un tool suffit et apprend a les privilegier, sans entrainement explicite.

---

## 4. Implications architecturales

### 4.1 Nested execution : recursion controlee

Le spike `2026-01-22-nested-execution-usecase.md` documente deja le probleme.
Avec des noeuds agent, la recursion devient naturelle :

```
Execution nestee avec agents :

[DAG racine]
  |-- [tool: psql_query]
  |-- [tool: code:filter]
  |-- [agent: data_analyst]           <-- noeud agent
       |
       v
       [Sous-DAG genere par l'agent]   <-- compile a runtime
         |-- [tool: code:aggregate]
         |-- [tool: chart_create]
         |-- [agent: report_writer]    <-- recursion niveau 2
              |
              v
              [Sous-sous-DAG]
                |-- [tool: code:format]
                |-- [tool: pdf_export]

Contraintes :
  - DEPTH_MAX = 3 (pas de recursion infinie)
  - BUDGET inherite : sous-DAG recoit le budget_remaining du parent
  - TIMEOUT cascade : chaque niveau reduit le timeout max
```

### 4.2 Tracing hierarchique

Les traces doivent capturer la structure arborescente :

```
Trace hierarchique (proposal) :

{
  traceId: "root-001",
  intent: "analyser et rapporter",
  nodes: [
    { id: "t1", type: "tool", tool: "psql_query", duration: 120, tokens: 0 },
    { id: "t2", type: "code", tool: "code:filter", duration: 80, tokens: 0 },
    { id: "a1", type: "agent", tool: "data_analyst", duration: 4500, tokens: 2800,
      childTrace: {
        traceId: "child-001",
        parentTraceId: "root-001",
        parentNodeId: "a1",
        nodes: [
          { id: "c1", type: "code", tool: "code:aggregate", duration: 90, tokens: 0 },
          { id: "c2", type: "tool", tool: "chart_create", duration: 300, tokens: 0 },
          { id: "c3", type: "agent", tool: "report_writer", duration: 3000, tokens: 1500,
            childTrace: { ... }   // recursion
          }
        ]
      }
    }
  ],
  totalTokens: 4300,
  totalDuration: 5020
}
```

### 4.3 Sandbox et permissions

Les noeuds agent ont des besoins speciaux :

```
Modele de permissions par type de noeud :

+-------------+-------------------+------------------+-------------------------+
| Type        | Sandbox           | Network          | MCP Sampling            |
+-------------+-------------------+------------------+-------------------------+
| mcp_tool    | N/A (RPC only)    | Via MCP server   | Non                     |
| code        | Deno --allow=none | Non              | Non                     |
| capability  | Heritage parent   | Heritage parent  | Non                     |
| agent       | Deno --allow=none | Via SamplingRelay| OUI (createMessage)     |
+-------------+-------------------+------------------+-------------------------+

L'agent s'execute dans le meme sandbox restrictif mais a acces au
SamplingRelay (cf. src/mcp/sampling/sampling-relay.ts) pour invoquer un LLM.
Le LLM genere du texte/code, mais NE peut PAS faire d'I/O directement.
Toute I/O passe par des tool calls traces.
```

### 4.4 HIL (Human-in-the-Loop) pour agents vs tools

```
Matrice de decision HIL :

+-------------+------------------+-------------------+------------------------+
| Type        | Auto-approve si  | HIL obligatoire   | Exemption possible     |
+-------------+------------------+-------------------+------------------------+
| mcp_tool    | read-only tools  | write/delete      | Whitelist par serveur  |
| code        | pure computation | side effects      | sandboxConfig explicit |
| capability  | tested & signed  | untested          | version pinning        |
| agent       | JAMAIS auto      | TOUJOURS (v1)     | Budget < seuil (v2)   |
+-------------+------------------+-------------------+------------------------+

Phase 1 : Tout noeud agent requiert HIL (securite maximale)
Phase 2 : Auto-approve si :
  - L'agent est dans une whitelist
  - Le budget tokens estime < seuil (ex: 500 tokens)
  - L'historique montre un taux de succes > 95% sur des requetes similaires
Phase 3 : Le GRU apprend quand l'HIL est refuse et ajuste ses predictions
```

---

## 5. Prior art et etat de l'art

### 5.1 LangGraph : le principal comparable

LangGraph (LangChain) est le framework le plus proche architecturalement :

| Aspect | LangGraph | PML (vision) |
|--------|-----------|--------------|
| Structure | Graphe avec cycles | DAG compile + cycles bornes via agents |
| Routing | LLM decide les transitions | SHGAT/GRU ML routing (0 tokens) |
| State | StateGraph centralise | Trace hierarchique distribuee |
| Compilation | Aucune (interprete) | AST -> DAG -> optimisation |
| Apprentissage | Aucun natif | Flywheel traces -> GRU/SHGAT training |
| Determinisme | Non-deterministe (LLM) | Deterministe sauf noeuds agent |
| Cout | LLM call a chaque transition | ML inference (~0 tokens) sauf agents |

**Avantage cle de PML** : LangGraph est "interprete" -- le LLM re-derive la
strategie a chaque execution. PML est "compile" -- le DAG est optimise une
fois et le routing ML est quasi-gratuit.

**Avantage LangGraph** : Flexibilite maximale, communaute large (80K+ stars),
ecotype riche.

Ref: [LangGraph Architecture Guide](https://latenode.com/blog/ai-frameworks-technical-infrastructure/langgraph-multi-agent-orchestration/langgraph-ai-framework-2025-complete-architecture-guide-multi-agent-orchestration-analysis)

### 5.2 DSPy : compilation de prompts

DSPy (Stanford, 28K+ stars) est le plus proche de la philosophie "compilateur" :

```
DSPy                           PML
====                           ====
Modules declaratifs            Code TypeScript declaratif
Teleprompter (compiler)        DAG compiler (AST -> IR -> DAG)
Signature optimization         Pas de prompt optimization (tools, pas prompts)
Few-shot compilation           Trace-based learning (SHGAT/GRU)
Metric-driven                  Reward-driven (success + cost)
```

**Difference fondamentale** : DSPy optimise les PROMPTS (comment parler au LLM).
PML optimise le ROUTING (quand et si parler au LLM). Les deux sont complementaires.

**Integration potentielle** : Un noeud agent PML pourrait utiliser DSPy en interne
pour optimiser ses prompts, tandis que PML decide QUAND invoquer cet agent.

Ref: [DSPy GitHub](https://github.com/stanfordnlp/dspy), [DSPy Paper](https://arxiv.org/pdf/2310.03714)

### 5.3 AutoGen / CrewAI / Semantic Kernel

```
Framework         Modele               Routing          Apprentissage
=========         ======               =======          =============
AutoGen           Conversation entre   LLM decide       Aucun natif
                  agents (chat)        dynamiquement

CrewAI            Roles pre-definis    Role-based,      Aucun natif
                  (equipe humaine)     LLM complete

Semantic Kernel   Plugins + planners   LLM planner      Aucun natif
                  (enterprise)

Microsoft Agent   Fusion AutoGen +     LLM + hardened   Telemetrie
Framework         Semantic Kernel      patterns          enterprise

PML (vision)      DAG compile + ML     SHGAT/GRU        Flywheel traces
                  routing              (0 tokens)        natif
```

**Observation critique** : AUCUN de ces frameworks n'apprend de ses executions
passees pour ameliorer le routing futur. C'est le differenciateur majeur de PML.

Refs:
- [AutoGen vs Semantic Kernel vs CrewAI Comparison](https://slashdot.org/software/comparison/AutoGen-vs-Semantic-Kernel-vs-crewAI/)
- [Langfuse Agent Framework Comparison](https://langfuse.com/blog/2025-03-19-ai-agent-comparison)

### 5.4 Papers academiques cles (2025-2026)

#### MasRouter (ACL 2025) -- Le plus directement pertinent
"Learning to Route LLMs for Multi-Agent Systems" par Yue et al.

- **Contribution** : Premier framework de routing appris pour systemes multi-agents
- **Approche** : Controleur en cascade qui route modes de collaboration, roles, et LLM backbones
- **Resultats** : +1.8-8.2% perf vs SOTA, -52% overhead cout
- **Lien PML** : MasRouter route entre LLMs. PML peut etendre ca au routing tools vs agents

Ref: [MasRouter Paper](https://arxiv.org/abs/2502.11133)

#### OI-MAS (Jan 2026) -- Routing confidence-aware
"Orchestrating Intelligence: Confidence-Aware Routing" par Wang et al.

- **Contribution** : Routing dynamique base sur la confiance token-level
- **Mecanisme** : `Conf_adj(s_t)` module le cout des decisions, routant les sous-taches
  simples vers des modeles legers et les complexes vers des modeles lourds
- **Resultats** : -17 a -78% cout, +7.68% precision vs baselines
- **Lien PML** : Le score de confiance GRU pourrait jouer le role de Conf_adj

Ref: [OI-MAS Paper](https://arxiv.org/abs/2601.04861)

#### Tool-to-Agent Retrieval (Nov 2025) -- Espace d'embedding partage
"Bridging Tools and Agents for Scalable LLM Multi-Agent Systems" par Lumer et al.

- **Contribution** : Embedding unifie tools + agents dans un meme espace vectoriel
- **Mecanisme** : Index commun, retrieval au query-time sur l'index joint
- **Resultats** : +19.4% Recall@5, +17.7% nDCG@5 sur LiveMCPBench
- **Lien PML** : Le vocabulaire unifie VocabNode (L0=tools, L1=caps) est EXACTEMENT
  cette idee. L'extension aux agents (L2) est naturelle

Ref: [Tool-to-Agent Retrieval Paper](https://arxiv.org/abs/2511.01854)

#### RouteLLM (LMSYS, 2024-2025) -- Classifieur de routing
- **Contribution** : Petit classifieur BERT qui route entre modele fort/faible
- **Resultats** : -85% cout sur MT-Bench, -45% sur MMLU sans perte de qualite
- **Lien PML** : Le GRU est l'equivalent de ce classifieur mais pour tools vs agents

Ref: [RouteLLM Paper](https://arxiv.org/abs/2406.18665)

#### Trace (Microsoft Research, 2024-2025) -- AutoDiff pour workflows
"Trace is the New AutoDiff -- Unlocking Efficient Optimization of Computational Workflows"

- **Contribution** : Framework qui capture l'execution comme un DAG et optimise
  end-to-end avec du feedback heterogene (scores, texte, erreurs)
- **Mecanisme** : OPTO (Optimization with Trace Oracle), Minimal Subgraph Propagator
- **Lien PML** : PML trace deja tout. Trace montre que ces traces SONT la base
  pour une optimisation automatique. Le GRU est un premier pas dans cette direction.

Ref: [Trace Paper](https://arxiv.org/html/2406.16218v1)

#### SWE-Search (ICLR 2025) -- MCTS pour agents software
- **Contribution** : Monte Carlo Tree Search + agents pour exploration de code
- **Resultats** : +23% vs agents sans MCTS
- **Lien PML** : Le DAG PML pourrait utiliser MCTS pour explorer les chemins
  possibles quand plusieurs routes sont viables (beam search etendu)

Ref: [SWE-Search Paper](https://openreview.net/forum?id=G7sIFXugTX)

#### AgentArch (ServiceNow, Sep 2025) -- Benchmark enterprise
- **Contribution** : 18 configurations agentiques evaluees, max 35.3% success
  sur taches complexes enterprise
- **Lien PML** : Confirme que les architectures agentiques pures plafonnent.
  L'approche hybride PML (deterministe + agent quand necessaire) est prometteuse.

Ref: [AgentArch Paper](https://arxiv.org/abs/2509.10769)

#### ReaGAN (Aug 2025) -- Nodes-as-Agents dans un GNN
"Node-as-Agent-Reasoning Graph Agentic Network"
- **Contribution** : Chaque noeud d'un GNN agit comme un agent autonome avec
  Planning, Actions, Memory, et Tool Use
- **Lien PML** : Convergence conceptuelle avec le SHGAT ou chaque outil/agent
  est un noeud avec des capacites de decision

Ref: [ReaGAN Paper](https://arxiv.org/html/2508.00429v3)

### 5.5 Le signal industriel : determinisme > agentique

L'article "When Deterministic Pipelines Outperform Agentic Wandering" (Brain.co, 2025)
est un cas d'etude eclairant :

```
Resultats Brain.co :

Approche agentique :     F1 = 62.2% (plafond)   | 28 min   | cout eleve
Pipeline deterministe :  F1 = 94.5%              | 182 sec  | 5x moins cher
                                                    9x plus rapide

Citation cle : "When you already know what evidence matters,
don't ask the model to guess."
```

**Alignement avec la vision PML** : Le DAG compile EST la pipeline deterministe.
Les noeuds agent ne sont invoques QUE quand le routing ML detecte qu'un outil
deterministe ne suffit pas. C'est le meilleur des deux mondes.

Refs:
- [Brain.co Article](https://brain.co/blog/when-deterministic-pipelines-outperform-agentic-wandering)
- [AI Agents vs AI Workflows (IntuitionLabs)](https://intuitionlabs.ai/articles/ai-agent-vs-ai-workflow)

---

## 6. Le paradigme "compilateur JIT pour agents"

### 6.1 Les 3 phases du JIT agent

Inspire de la compilation JIT classique (interpreted -> baseline compiled -> optimized) :

```
Phase 1 : INTERPRETED (cold start)
========================================
- Pas de traces d'entrainement
- Le LLM route tout (comme LangGraph/AutoGen)
- Chaque execution genere une trace
- PML = simple orchestrateur agentique
- Cout : eleve (LLM a chaque decision)

       +--------+
       |  LLM   |  <-- decide TOUT
       +--------+
           |
    +------+------+
    |      |      |
  [tool] [tool] [agent]


Phase 2 : BASELINE COMPILED (warm)
========================================
- ~100-500 traces collectees
- GRU entraine sur les patterns recurrents
- Le GRU route les cas "connus" (~60% Hit@1)
- Le LLM route les cas nouveaux/ambigus
- Cout : reduit de ~60%

       +--------+     +--------+
       |  GRU   | --> |  LLM   |  <-- fallback si GRU incertain
       +--------+     +--------+
           |               |
    +------+------+   +----+----+
    |      |      |   |         |
  [tool] [tool] [cap] [agent] [tool]


Phase 3 : OPTIMIZED (hot)
========================================
- ~5000+ traces
- GRU route 80%+ des decisions
- SHGAT affine le scoring (co-occurrences)
- LLM = dernier recours pour cas nouveaux
- Cout : reduit de ~90%
- Le GRU apprend aussi QUAND un agent est superflu

       +--------+     +--------+     +--------+
       |  GRU   | --> | SHGAT  | --> |  LLM   |  <-- <10% des cas
       +--------+     +--------+     +--------+
           |               |               |
    +------+------+   +----+----+     +----+
    |      |      |   |         |     |
  [tool] [tool] [code] [cap]  [agent]
                                  ^-- seulement quand
                                      ML confirme que
                                      necessaire
```

### 6.2 Detection de "hot paths" et optimisation

Comme un JIT qui detecte les "hot loops" :

```
Hot Path Detection :

1. Frequence : Si la sequence [psql_query -> code:filter -> code:map]
   apparait dans 30%+ des traces -> "hot path"

2. Optimisations possibles :
   a. Fusion : [code:filter -> code:map] -> [code:filter_and_map] (single sandbox call)
   b. Pre-allocation : tools du hot path pre-connectes (connection pool)
   c. Agent elimination : Si un agent suit toujours le hot path ->
      le GRU apprend a predire la sequence directement

3. Metriques de chaleur :
   - Frequence d'execution
   - Stabilite du resultat (meme input -> meme output ?)
   - Ratio succes (taux d'erreur sur ce path)
```

### 6.3 Le continuum interpreted -> compiled

```
              GRU confidence
              (0.0 - 1.0)
                  |
    0.0           |           1.0
    |-------------|-------------|
    "Je ne sais   | "J'ai vu   | "J'ai vu ca
     pas"         |  ca avant  |  1000 fois"
                  |  mais..."  |
    |             |            |
    v             v            v
  INTERPRETED   MIXED        COMPILED
  (LLM route)  (GRU+LLM)   (GRU route)

  Phase 1       Phase 2      Phase 3

Le seuil de confiance est adaptatif :
  - Seuil initial : 0.8 (conservateur, beaucoup de fallback LLM)
  - Apres validation des predictions GRU : seuil descend a 0.6
  - En production stable : seuil a 0.4 (GRU route agressivement)
```

---

## 7. Agent distillation et flywheel data

### 7.1 Agent distillation passive

Le concept est simple mais puissant :

```
Agent Distillation Loop :

1. Agent LLM execute un workflow :
   [intent: "nettoyer les CSV"]
   Agent choisit : [read_file, code:parse_csv, code:clean_nulls, code:validate, write_file]

2. PML trace la sequence complete avec timings et resultats

3. GRU s'entraine sur cette trace :
   - Input : intent embedding + contexte vide
   - Target : read_file (1er outil)
   - Input : intent + [read_file]
   - Target : code:parse_csv (2eme outil)
   - ...

4. Prochaine fois, meme intent :
   GRU predit directement : [read_file, code:parse_csv, code:clean_nulls, ...]
   SANS invoquer le LLM = 0 tokens

5. L'agent LLM n'est invoque QUE pour les variantes nouvelles :
   - "nettoyer les CSV avec des regles custom" -> cas nouveau -> LLM
   - "nettoyer les CSV" (vu 50 fois) -> GRU route directement
```

C'est exactement l'approche FireAct (Princeton NLP) mais appliquee au ROUTING
plutot qu'au raisonnement. FireAct fine-tune un petit modele sur les trajectoires
GPT-4. PML entraine un GRU sur les traces de production.

Ref: [FireAct Paper](https://fireact-agent.github.io/)

### 7.2 Le flywheel data

```
PML Data Flywheel :

+------------------+
| Utilisateurs     |
| executent des    |
| workflows        |
+--------+---------+
         |
         v
+------------------+
| Traces de        | <-- Chaque execution = donnee d'entrainement
| production       |
+--------+---------+
         |
         v
+------------------+
| GRU/SHGAT        | <-- Entrainement periodique (cron ou seuil)
| training         |
+--------+---------+
         |
         v
+------------------+
| Routing plus     | <-- Plus de traces = meilleur routing
| intelligent      |
+--------+---------+
         |
         v
+------------------+
| Moins de tokens  | <-- Cout reduit, latence reduite
| meilleure UX     |
+--------+---------+
         |
         v
+------------------+
| Plus             | <-- Flywheel : meilleur produit = plus d'usage
| d'utilisateurs   |
+------------------+

Tempo du flywheel :
  - Traces collectees : temps reel
  - Re-entrainement GRU : quotidien (ou quand 100+ nouvelles traces)
  - Re-entrainement SHGAT : hebdomadaire (co-occurrences stables)
  - Evaluation A/B : en continu (GRU v(N) vs v(N+1))
```

### 7.3 Le moat competitif

Pourquoi ce flywheel est un moat :

1. **Donnees proprietaires** : Les traces de production sont uniques a chaque
   instance PML. Aucun concurrent ne peut les reproduire.

2. **Cout marginal decroissant** : Plus PML est utilise, moins il coute
   (GRU remplace LLM progressivement). L'inverse des systemes LLM-centric.

3. **Effet de reseau** : Si PML est multi-tenant, les patterns d'un tenant
   beneficient (anonymises) aux autres. Un tool populaire chez le tenant A
   est mieux score pour le tenant B.

4. **Temps d'avance** : Un nouvel entrant part de zero traces.
   PML avec 6 mois de production a un avantage de 50K+ traces.

5. **Composabilite** : Les capabilities apprises (L1) deviennent des
   building blocks pour de nouveaux workflows, accelerant le flywheel.

Citation pertinente (Hampton Global Business Review, 2025) :
> "Unlike model weights, which any well-funded lab can approximate,
>  your organization's accumulated process knowledge is genuinely unique."

Refs:
- [AI Flywheel Data Network Effects](https://hgbr.org/research_articles/the-ai-flywheel-how-data-network-effects-drive-competitive-advantage/)
- [Enterprise AI Agent Stack](https://philippdubach.com/posts/dont-go-monolithic-the-agent-stack-is-stratifying/)
- [NVIDIA Data Flywheel](https://galileo.ai/blog/nvidia-data-flywheel-for-de-risking-agentic-ai)

---

## 8. Limites et risques

### 8.1 Quand le routing ML NE PEUT PAS remplacer le LLM

```
Matrice de remplacement :

                      Structuration du probleme
                      Faible          |         Forte
                   +-----------------+-----------------+
  Frequence   |   | Zone 4 :        | Zone 1 :        |
  des cas     |   | IMPOSSIBLE       | GRU EXCELLE     |
  Haute       |   | Creatif, ouvert  | Patterns recur. |
              |   | -> LLM toujours  | -> GRU remplace |
              +---+-----------------+-----------------+
              |   | Zone 3 :        | Zone 2 :        |
  Faible      |   | IMPOSSIBLE       | GRU RISQUE      |
              |   | Nouveau + creatif| Rare mais struct.|
              |   | -> LLM toujours  | -> Overfit risk  |
              +---+-----------------+-----------------+

Estimation de couverture (base sur les benchmarks actuels) :
  Zone 1 (GRU remplace) : ~60% des workflows (Hit@1 actuel)
  Zone 2 (GRU risque)   : ~15% (patterns rares, overfit possible)
  Zone 3+4 (LLM requis) : ~25% (nouveau, creatif, ambigu)
```

Cas specifiques ou le LLM est irreplacable :
- **Raisonnement multi-hop** : "Trouver l'email du manager du collegue qui a modifie le fichier X"
- **Creativite** : "Rediger un rapport avec des analogies pertinentes"
- **Ambiguite** : "Nettoyer ces donnees" (quelles donnees ? quel nettoyage ?)
- **Negociation** : Dialogue avec l'utilisateur pour clarifier l'intent
- **Meta-raisonnement** : "Ce workflow a echoue, pourquoi et que faire?"

### 8.2 Le cold start

```
Probleme du cold start :

Jour 0 : 0 traces -> GRU inutile -> LLM route tout -> cout maximal
Jour 7 : ~50 traces -> GRU instable -> LLM route 90%
Jour 30 : ~500 traces -> GRU viable -> LLM route 50%
Jour 90 : ~5000 traces -> GRU mature -> LLM route 20%

Strategies de mitigation :
1. Donnees synthetiques n8n (DEJA IMPLEMENTE) : 1978 exemples de depart
2. Transfer learning : pre-entrainer sur des traces publiques
3. Few-shot bootstrap : 20 traces annotees manuellement
4. Progressive rollout : GRU actif seulement quand confiance > 0.8
```

### 8.3 Qualite du DAG et du code capability

```
Garbage in -> Garbage out :

Si le code capability est mal ecrit :
  - DAG mal structure -> routing sub-optimal
  - Types manquants -> edges de dependance manquantes
  - Side effects non declares -> sandbox violations

Si l'intent est ambigue :
  - Le GRU peut predire le mauvais premier outil
  - Le SHGAT peut scorer un outil semantiquement proche mais fonctionnellement different

Mitigation :
  - Linting des capabilities (structure, types, side effects)
  - Intent canonicalization (normaliser les formulations)
  - Feedback loop : si l'utilisateur refuse le resultat -> signal negatif
```

### 8.4 Risque d'overfitting

```
Overfit du GRU aux patterns passes :

Scenario : Le GRU a vu 200 traces avec psql_query pour les requetes "donnees".
Un nouvel outil bigquery_query est ajoute. Le GRU continue de predire psql_query
meme quand BigQuery est plus appropriate.

Symptomes :
  - Hit@1 stagne ou baisse apres ajout de nouveaux outils
  - Biais vers les outils frequents (popularity bias)
  - Incapacite a router vers des outils recents

Mitigation :
  1. Exploration epsilon : 5% des requetes routees aleatoirement
  2. Recency weighting : traces recentes ponderees plus fort
  3. Novelty bonus : boost temporaire pour nouveaux outils
  4. SHGAT embedding : si bigquery_query est proche de psql_query dans
     l'espace d'embedding, le GRU le decouvre via les features SHGAT
```

### 8.5 Risques non-techniques

- **Adoption** : Les developpeurs sont habitues au paradigme LLM-centric.
  Le DAG compile est moins "magique" mais plus fiable.
- **Explicabilite** : Le routing GRU est un modele ML -- moins explicable
  qu'un LLM qui "explique" ses choix (meme si ces explications sont des
  confabulations).
- **Complexite operationnelle** : Maintenir SHGAT + GRU + DAG compiler +
  sandbox + tracing + training pipeline est significativement plus complexe
  qu'un wrapper LLM.

---

## 9. Recommandations

### 9.1 Directions les plus prometteuses (classees par impact/faisabilite)

```
+-----+------------------------------------+-----------+--------------+
| Rang| Direction                          | Impact    | Faisabilite  |
+-----+------------------------------------+-----------+--------------+
| 1   | Agent comme VocabNode L2           | ELEVE     | HAUTE        |
|     | (extension triviale du vocab GRU)  |           | ~1 semaine   |
+-----+------------------------------------+-----------+--------------+
| 2   | Agent budget cost-aware routing    | ELEVE     | MOYENNE      |
|     | (inspire OI-MAS)                   |           | ~2 semaines  |
+-----+------------------------------------+-----------+--------------+
| 3   | JIT Phase 2 : GRU + LLM fallback  | TRES ELEVE| MOYENNE      |
|     | (seuil de confiance adaptatif)     |           | ~3 semaines  |
+-----+------------------------------------+-----------+--------------+
| 4   | Traces hierarchiques pour agents   | MOYEN     | HAUTE        |
|     | (extend trace schema)              |           | ~1 semaine   |
+-----+------------------------------------+-----------+--------------+
| 5   | Agent distillation passive         | TRES ELEVE| BASSE        |
|     | (reward-based learning)            |           | ~4-6 semaines|
+-----+------------------------------------+-----------+--------------+
| 6   | MCTS beam search pour multi-route  | MOYEN     | BASSE        |
|     | (inspire SWE-Search)               |           | ~4 semaines  |
+-----+------------------------------------+-----------+--------------+
```

### 9.2 Plan d'execution suggere

**Sprint 1 (2 semaines) : Fondations**
- Ajouter le type `agent` / `sampling` au DAG Task
- Etendre VocabNode avec niveau L2 pour agents
- Implementer traces hierarchiques (parentTraceId, childTrace)
- Tester avec un agent simple (summarizer) dans un workflow

**Sprint 2 (2 semaines) : Routing cost-aware**
- Ajouter budget_tokens au workflow context
- Implementer cost_weight dans le scoring GRU
- A/B test : GRU routing vs LLM-only routing
- Metriques : tokens economises, latence, precision

**Sprint 3 (3 semaines) : JIT Phase 2**
- Implementer le seuil de confiance GRU adaptatif
- Pipeline : GRU route si confiant, LLM fallback sinon
- Dashboard de monitoring : % GRU vs % LLM routing
- Boucle de feedback : succes/echec -> ajustement du seuil

**Sprint 4+ (ongoing) : Flywheel**
- Agent distillation passive (reward-based)
- Hot path detection et optimisation
- Multi-tenant aggregation (anonymisee)
- MCTS pour exploration de routes alternatives

### 9.3 Metriques de succes

```
KPI du compilateur JIT agent :

1. GRU Routing Rate : % de decisions prises par le GRU (vs LLM)
   - Phase 1 : 0% (cold start)
   - Phase 2 : 40-60%
   - Phase 3 : 70-85%
   - Asymptote theorique : ~90% (zone 1 + zone 2)

2. Token Savings : tokens economises vs full-LLM routing
   - Phase 1 : 0%
   - Phase 2 : 30-50%
   - Phase 3 : 60-80%

3. Latency Reduction : temps moyen par workflow
   - GRU inference : ~5ms vs LLM call : ~2000ms
   - Target : -60% latence en Phase 3

4. Quality Parity : la qualite ne doit PAS baisser
   - Success rate : >= baseline LLM-only
   - User satisfaction (si mesurable) : >= baseline

5. Flywheel Velocity : traces/jour -> re-entrainement -> amelioration
   - Target : re-entrainement automatique quand +100 traces
   - Target : Hit@1 monte de 1%+ par semaine de production
```

### 9.4 Positionnement strategique

```
Positionnement PML dans le paysage 2026 :

                    Cout par decision
                    Eleve (LLM)     |     Faible (ML/rule)
                  +-----------------+-----------------+
  Flexibilite |  | LangGraph       | PML Phase 3      |
              |  | AutoGen         | (compile + ML)    |
  Haute       |  | CrewAI          |                   |
              |  | (LLM orchestre) | <-- SWEET SPOT    |
              +--+-----------------+-----------------+
              |  | OpenAI Agents   | n8n / Zapier      |
  Faible      |  | SDK             | (rules-based)     |
              |  | (single agent)  |                   |
              +--+-----------------+-----------------+

PML vise le quadrant haut-droit : flexibilite d'un systeme agentique,
cout d'un systeme rule-based. Le flywheel data est le chemin pour
y arriver.
```

---

## 10. Sources

### Papers academiques

1. [MasRouter: Learning to Route LLMs for Multi-Agent Systems](https://arxiv.org/abs/2502.11133) (ACL 2025)
2. [OI-MAS: Confidence-Aware Routing for Multi-Agent Collaboration](https://arxiv.org/abs/2601.04861) (Jan 2026)
3. [Tool-to-Agent Retrieval: Bridging Tools and Agents](https://arxiv.org/abs/2511.01854) (Nov 2025)
4. [RouteLLM: Learning to Route LLMs with Preference Data](https://arxiv.org/abs/2406.18665) (LMSYS, 2024)
5. [Trace: The New AutoDiff for Computational Workflows](https://arxiv.org/html/2406.16218v1) (Microsoft Research)
6. [SWE-Search: Monte Carlo Tree Search for Software Agents](https://openreview.net/forum?id=G7sIFXugTX) (ICLR 2025)
7. [AgentArch: Benchmark for Enterprise Agent Architectures](https://arxiv.org/abs/2509.10769) (ServiceNow, Sep 2025)
8. [DSPy: Compiling Declarative Language Model Calls](https://arxiv.org/pdf/2310.03714) (Stanford NLP)
9. [FireAct: Toward Language Agent Fine-tuning](https://fireact-agent.github.io/) (Princeton NLP)
10. [Gorilla: Large Language Model Connected with Massive APIs](https://arxiv.org/abs/2305.15334) (UC Berkeley)
11. [ReaGAN: Node-as-Agent-Reasoning Graph Agentic Network](https://arxiv.org/html/2508.00429v3) (Aug 2025)
12. [Towards Generalized Routing: Model and Agent Orchestration](https://arxiv.org/html/2509.07571v2) (Sep 2025)
13. [AgentOrchestra: Hierarchical Multi-Agent Framework](https://arxiv.org/html/2506.12508v1) (Jun 2025)

### Articles industriels

14. [When Deterministic Pipelines Outperform Agentic Wandering](https://brain.co/blog/when-deterministic-pipelines-outperform-agentic-wandering) (Brain.co, 2025)
15. [AI Agents vs AI Workflows: Why Pipelines Dominate](https://intuitionlabs.ai/articles/ai-agent-vs-ai-workflow) (IntuitionLabs, 2025)
16. [The AI Flywheel: Data Network Effects](https://hgbr.org/research_articles/the-ai-flywheel-how-data-network-effects-drive-competitive-advantage/) (Hampton Global Business Review)
17. [Enterprise AI Agent Stack: Context Beats Models](https://philippdubach.com/posts/dont-go-monolithic-the-agent-stack-is-stratifying/)
18. [NVIDIA Data Flywheel for De-Risking Agentic AI](https://galileo.ai/blog/nvidia-data-flywheel-for-de-risking-agentic-ai)
19. [LangGraph Architecture Guide](https://latenode.com/blog/ai-frameworks-technical-infrastructure/langgraph-multi-agent-orchestration/langgraph-ai-framework-2025-complete-architecture-guide-multi-agent-orchestration-analysis) (Latenode, 2025)
20. [AutoGen vs Semantic Kernel vs CrewAI](https://slashdot.org/software/comparison/AutoGen-vs-Semantic-Kernel-vs-crewAI/) (2026)
21. [Langfuse AI Agent Framework Comparison](https://langfuse.com/blog/2025-03-19-ai-agent-comparison) (Mar 2025)
22. [State of Agent Engineering](https://www.langchain.com/state-of-agent-engineering) (LangChain, 2025)
23. [5 Key Trends Shaping Agentic Development in 2026](https://thenewstack.io/5-key-trends-shaping-agentic-development-in-2026/) (The New Stack)
24. [Karpathy 2025 LLM Year in Review](https://karpathy.bearblog.dev/year-in-review-2025/)
25. [Self-Evolving Agents Cookbook](https://cookbook.openai.com/examples/partners/self_evolving_agents/autonomous_agent_retraining) (OpenAI)

### Contexte interne PML

26. `src/graphrag/types/dag.ts` -- Types DAG (3 task types actuels)
27. `src/mcp/sampling/sampling-relay.ts` -- MCP Sampling relay
28. `lib/gru/src/transition/gru-model.ts` -- CompactInformedGRU v0.3.0
29. `lib/shgat-tf/src/message-passing/vertex-to-vertex-phase.ts` -- V2V message passing
30. `_bmad-output/planning-artifacts/spikes/2026-01-22-nested-execution-usecase.md` -- Nested execution spike

---

*Rapport genere par exploration en profondeur avec 12+ recherches web, 6 extractions de pages,
et analyse croisee du codebase PML existant.*
