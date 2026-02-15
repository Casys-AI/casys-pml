# PML : Compilateur d'Intelligence Agent

**Date** : 2026-02-15
**Mise a jour** : 2026-02-15 (revision fondateur — ISA ouverte, sampling, manifeste)
**Origine** : Session exploratoire fondateur + equipe 4 agents

## La these

**L'intelligence agent est un artefact compilable.**

Les agents IA ne devraient pas re-reflechir a chaque execution. Leurs patterns d'action ET de raisonnement sont capturables, compilables, et optimisables. PML est le compilateur.

## En une phrase

PML est un compilateur qui transforme les actions et le raisonnement d'un agent (tools, sampling, resources) en workflows deterministes et optimises.

## L'analogie compilateur

| Concept | Compilateur C | SQL | PML |
|---------|--------------|-----|-----|
| Source | Code C | Requete SQL | Intent ou code TS |
| AST | Arbre syntaxique | Parse tree | AST TypeScript |
| IR | LLVM IR | Plan logique | DAG de taches MCP |
| Optimisation | Inlining, fusion | Query optimizer | Fusion code:*, parallelisation, GRU routing |
| Target | x86 machine code | Plan physique | Sandbox natif (code:*) + JSON-RPC (MCP externes) |
| Bibliotheques | libc, stdlib | Tables, vues | MCP tools publies par la communaute |

## L'ISA : MCP est le jeu d'instructions

MCP est l'ISA (Instruction Set Architecture) — ouvert, extensible, defini par la communaute. L'ISA n'est pas un ensemble fige de verbes. C'est tout ce que le protocole MCP expose :

- **Tools** — l'agent agit sur le monde (filesystem, DB, API, deploy, n'importe quoi)
- **Sampling** — le serveur demande au LLM de raisonner (un noeud de raisonnement dans le DAG)
- **Resources** — l'agent accede a du contexte (fichiers, schemas, documentation)

Demain quelqu'un publie un MCP server `deploy_kubernetes` ou `train_model`. Ca devient une instruction disponible. Le compilateur n'a pas besoin de la connaitre d'avance — il compile ce que l'agent fait, point.

C'est plus **LLVM que x86**. LLVM n'a pas 8 instructions fixes. Il a un IR riche et extensible. La valeur c'est les passes d'optimisation sur l'IR, pas la restriction du jeu d'instructions.

### Le routeur ML : SHGAT (GNN) + GRU — 4 dimensions

Le routeur PML n'est pas un simple matching vectoriel. C'est un GNN (Graph Neural Network) + un modele sequentiel qui operent sur 4 dimensions complementaires :

**1. Semantique** — embeddings des descriptions de tools. "De quoi parle cet outil ?" Similarite cosine, le socle. Necessaire mais insuffisant seul (~85-90% plafond).

**2. Structurel (GNN message passing)** — le SHGAT propage l'information a travers les edges du graphe de tools. Les VocabNodes L1 (categories semantiques : read, transform, emit, etc.) servent de clusters hierarchiques. Le message passing L0 tools ↔ L1 categories enrichit les representations au-dela de l'embedding isole. C'est du raisonnement structurel, pas juste vectoriel.

**3. Types I/O (edges de compatibilite schema)** [A AJOUTER] — si tool A output `{rows: Array<Record>}` et tool B accepte `Array<Record>` en input, un edge de compatibilite de type connecte A → B dans le graphe SHGAT. Le GNN apprend non seulement "ces tools sont semantiquement proches" mais "ces tools se connectent au niveau donnees." Deux sources :
- **code:*** → output schema statiquement typable (derive du code, gratuit)
- **MCP externes** → output schema infere progressivement depuis les traces (PGO applique au typage)

Les edges I/O schema se construisent incrementalement. En phase cold, seuls les edges code:* existent. Plus les traces s'accumulent, plus les edges MCP externes apparaissent. Le graphe SHGAT s'enrichit avec l'usage — le flywheel s'applique aussi au typage.

**4. Temporel (GRU)** — le GRU predit la sequence de tools autoregressivement. "Apres A, quel tool vient ?" Capture les patterns d'ordonnancement que le GNN seul ne voit pas.

Ces 4 dimensions combinees (semantique + structure + types + temporel) depassent tout ce qui existe dans la litterature. Aucun systeme publie ne combine GNN + sequence + type matching pour le routing d'agents.

PML a deja 63 operations code:* (array, string, object, math, logical, json, binary, control). Les VocabNodes L1 du SHGAT organisent ces operations et les tools externes en clusters semantiques.

## La compilation en 3 phases

**Phase 1 — Interpretee (cold, 0 traces)**
- Le LLM determine quel tools appeler et dans quel ordre
- Le LLM raisonne a chaque etape (sampling)
- Chaque execution genere une trace complete (actions + raisonnement)
- Cout : eleve (LLM a chaque decision)

**Phase 2 — Compilee (warm, suffisamment de traces pour que le GRU depasse le seuil de confiance)**
- Le GRU predit la sequence de tools sans LLM (~60% Hit@1 avec 1155 exemples prod, objectif 99%)
- Le DAG est connu d'avance, pas besoin de reflechir
- Le LLM reste en fallback pour les cas nouveaux ou ambigus
- Gain : 0 tokens LLM pour le routing sur les chemins compiles

**Phase 3 — Optimisee (hot, futur)**
- Les operations code:* consecutives sont fusionnees en un seul appel sandbox (operator fusion)
- Les noeuds de sampling recurrents sont eux-memes compiles (le raisonnement previsible est elimine)
- Les donnees restent en memoire entre etapes fusionnees (pas de serialisation JSON)
- Les MCP externes (psql, filesystem) restent des appels JSON-RPC
- Gain : reduction de l'overhead d'execution ET de raisonnement

L'objectif final : le LLM passe de "travailleur paye a chaque geste" a "professeur qui a fini de former l'eleve." L'agent compile est autonome.

## La granularite

L'overhead MCP JSON-RPC en STDIO = ~2ms par appel. En mode interprete, les operations < 2ms sont trop couteuses en MCP. En mode compile avec fusion, le plancher tombe a ~0.01ms — on peut descendre jusqu'aux octets.

"Ecris en MCP granulaire, execute en code fusionne."

## Composition fractale et communaute

Un workflow compile peut etre expose comme un nouveau MCP tool (via --expose/relay). Ce tool est reutilisable dans un workflow plus grand :

```
N0 : read:file, code:split, code:filter           (primitives)
N1 : clean_csv = [read + split + filter + write]   (workflow compile, publie)
N2 : analyze_sales = [clean_csv + aggregate + chart] (compose des workflows)
N3 : quarterly_report = [analyze_sales + format + email] (compose des compositions)
```

La communaute construit des bibliotheques de workflows compiles, comme npm pour le code. Le compilateur PML inline et optimise les appels aux bibliotheques importees.

## Le modele economique

- Gratuit : compiler et executer en local
- Payant : publier des workflows avec SLA (uptime, tracing, latence)
- Commission : sur les workflows payants (marketplace)

## Formalisation

### Algebre de workflows

Soit T = l'ensemble des operations MCP disponibles (tools + sampling + resources). T est ouvert et extensible — n'importe quel MCP server peut l'enrichir.

Operateurs de composition :
- `→` (sequence) : a → b execute b apres a, avec passage de donnees
- `||` (parallele) : a || b execute a et b simultanement
- `?:` (conditionnel) : p ? a : b execute a si p, sinon b
- `!` (fallback) : a ! b execute b si a echoue (gestion d'erreur au niveau du DAG)

**Cloture sous composition** : si W1 et W2 sont des workflows, alors W1 → W2 est un workflow. Un workflow compile EST une primitive pour le niveau superieur. C'est la fractalite. [VISION — necessite `pml publish` pour etre effectif, pas encore implemente]

**Noeuds de raisonnement** : un noeud sampling est un noeud du DAG comme un autre. En phase cold, il invoque le LLM. En phase hot, si le pattern de raisonnement est previsible, le noeud est compile (le resultat est predit sans LLM).

### Pipeline du compilateur

```
parse   : Source → AST                              (TypeScript parser)
lower   : AST → DAG                                 (static-structure-builder)
route   : Intent × DAG × Vocab → RoutedDAG          (SHGAT scoring + GRU sequencing)
optimize: RoutedDAG × TraceHistory → OptimizedDAG    (fusion, parallelisation)
execute : OptimizedDAG × Environment → Result × Trace
```

**Parsing** [IMPL] : le code TypeScript est parse en AST, puis abaisse en DAG de taches MCP par le `static-structure-builder`. C'est le front-end classique du compilateur — analyse lexicale, syntaxique, construction de l'IR.

**Routing** [IMPL, module separe] : etant donne un intent et un vocabulaire de tools, le systeme SHGAT+GRU selectionne et ordonne les tools. SHGAT enrichit les embeddings par message passing hierarchique (L0 tools ↔ L1 categories). Le GRU predit la sequence de tools autoregressivement (~60% Hit@1). C'est le middle-end — selection d'instructions et ordonnancement. Note : aujourd'hui le routing est un module entraine offline sur les traces, pas encore chaine au parse+lower dans un pipeline unifie.

**Optimisation** [VISION] : fusion des code:* consecutifs (operator fusion), elimination des serialisations intermediaires, parallelisation des branches independantes. C'est le back-end — optimisation peephole sur l'IR.

La trace produite par `execute` alimente `TraceHistory`, qui ameliore `route` et `optimize` au run suivant. Boucle d'apprentissage fermee — le compilateur s'ameliore avec l'usage.

### Correspondances theoriques

| Concept PML | Phase | Theorie | Reference |
|-------------|-------|---------|-----------|
| Source → AST → DAG | parse + lower | Compilation classique | Dragon Book (Aho et al.) |
| SHGAT+GRU tool selection | route | Instruction selection / scheduling | Cooper & Torczon (2011) |
| Intent → DAG (cold path) | route (LLM) | Program synthesis | Gulwani et al. (2017) |
| Fusion code:* | optimize | Operator/kernel fusion | XLA, TVM, Halide |
| Traces → amelioration | route + optimize | Profile-Guided Optimization | GCC PGO, JVM JIT |
| Workflow = primitive | toutes | Compositional semantics | Denotational semantics (Scott/Strachey) |
| GRU adaptatif | route | Online learning | Regret minimization |
| ISA ouverte × composition | lower | Dataflow programming | Kahn process networks (1974) |
| Sampling compile | optimize | Distillation / caching | Knowledge distillation (Hinton et al. 2015) |
| Edges I/O schema | route | Type checking / inference | Hindley-Milner, gradual typing |
| Schema inference depuis traces | route | Profile-guided type inference | Flow-sensitive typing |

### Ce que ca implique

1. **Decidabilite** : le DAG est fini et acyclique → terminaison garantie (pas de boucle infinie)
2. **Determinisme du plan** : meme intent + meme ToolSet = meme DAG. L'execution reste non-deterministe pour les MCP externes (I/O, reseau). Le determinisme est une propriete du PLAN, pas de l'execution.
3. **Optimisabilite** : le compilateur peut transformer le DAG sans changer la semantique (fusion, reordonnancement, parallelisation)
4. **Composabilite** : la cloture garantit que tout workflow est reutilisable comme brique

## Prior art et positionnement

### Ce qui existe (et ce que PML fait differemment)

| Travail | Ce qu'il fait | Limite | PML |
|---------|--------------|--------|-----|
| **LLMCompiler** (Berkeley, ICML 2024) | DAG + execution parallele, 3.7x speedup | Le planner est un LLM | ML routing (GNN+GRU), pas LLM-in-the-loop |
| **DSPy** (Stanford, 2023+) | Compile prompts et few-shot, 25-65% gain | Ne compile pas away du LLM | Compile les chemins eux-memes, 0 token a l'execution |
| **Voyager** (NVIDIA, 2023) | Skills compilees en JS, replay sans LLM | Domain-specific (Minecraft) | Generalise a tout workflow MCP |
| **AgentDistill** (2025) | "MCP Boxes" reutilisables, training-free | Frame comme augmentation de modele | Frame comme artefact standalone versionne |
| **Graph-Memoized Reasoning** (2025) | Sous-graphes de raisonnement reutilisables | Theorique, pas d'implementation | Implementation prod (DAG compiler + tracing) |
| **Microsoft Trace** (NeurIPS 2024) | PGO pour agents, feedback via DAG | Optimise les parametres | Optimise les chemins + compile les patterns |
| **SPAgent / SpecCache** (2025) | Execution speculative, predit les tool calls | Fallback LLM sur cache miss | Compilation persistante, pas speculative |

### Ce que personne ne fait (valide par recherche, fev 2026)

1. **Pipeline compilation unifie cold/warm/hot** — le JIT applique comme lifecycle complet d'un agent n'existe pas comme concept nomme
2. **Intelligence comme artefact deployable et versionne** — un DAG qu'on peut tester, diffter, rollback, et composer (pas un modele, pas un prompt)
3. **Compilation des noeuds sampling** — zero travaux dans l'ecosysteme MCP
4. **GNN + sequence + types I/O pour le routing** — aucun systeme publie ne combine ces 4 dimensions

## Pourquoi compiler — et pourquoi maintenant

L'IA peut deja construire des choses sans MCP. Claude Code ecrit du code, manipule des fichiers, query des bases — sans protocol standardise. Mais c'est comme ecrire de l'assembleur a la main : ca marche, c'est pas reproductible, c'est pas composable, c'est pas optimisable.

MCP standardise les actions. PML les compile. La difference entre "un agent qui fait 47 actions en re-reflechissant a chaque fois" et "un DAG compile qui rejoue le meme chemin en 0 tokens" — c'est la difference entre taper des commandes shell et executer un Makefile.

## Precedents

Unix pipes (1973), SQL (1970s), MapReduce (2004) : compositionalite + compilateur/optimizer = ecosysteme massif. La valeur n'est jamais dans les verbes — elle est dans le compilateur. Et les verbes n'ont jamais ete figes : Unix a commence avec quelques commandes, il en a des milliers aujourd'hui. L'ISA est ouverte. Le compilateur optimise.

## Ce qui existe deja

- 63 operations code:* (le jeu d'instructions)
- DAG compiler (AST → DAG)
- SHGAT+GRU routing (le scheduler/optimizer)
- Tracing 7D (l'observabilite)
- --expose + relay spike (la publication)
- VocabNode hierarchie L0/L1 (la taxonomie)

## Ce qui manque

- Relay fonctionnel (--expose a 23/41 tests, cloud routing casse) — prerequis pour tout le reste
- `pml publish --dag <workflow_id>` (3-4 jours APRES relay)
- Chainage parse→lower→route dans un pipeline unifie (aujourd'hui modules separes)
- Edges I/O schema dans le SHGAT (statiques pour code:*, inferes pour MCP externes)
- Fusion des code:* consecutifs dans le sandbox (operator fusion, ~2-3 semaines)
- Gestion d'erreurs au niveau DAG (operateur fallback `!`)
- Benchmarks d'overhead reels (latence MCP STDIO, gain fusion)
- Noeuds sampling dans le DAG (capturer le raisonnement, pas juste les actions)
- Compilation des noeuds sampling recurrents (distillation des patterns de raisonnement)

## Le manifeste

L'intelligence agent est un artefact compilable, pas un flux stochastique perpetuel.

Les agents IA d'aujourd'hui re-reflechissent a chaque execution. Demain, leurs patterns d'action et de raisonnement seront compiles, optimises, et partages. Le LLM passera de travailleur perpetuel a professeur temporaire. Et PML sera le compilateur.
