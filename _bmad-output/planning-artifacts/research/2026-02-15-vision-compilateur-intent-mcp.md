# PML : Compilateur d'Intents en Workflows MCP

**Date** : 2026-02-15
**Origine** : Session exploratoire fondateur + equipe 4 agents

## En une phrase

PML est un compilateur qui transforme des intents (langage naturel ou code TypeScript) en workflows MCP optimises et deterministes.

## L'analogie compilateur

| Concept | Compilateur C | SQL | PML |
|---------|--------------|-----|-----|
| Source | Code C | Requete SQL | Intent ou code TS |
| AST | Arbre syntaxique | Parse tree | AST TypeScript |
| IR | LLVM IR | Plan logique | DAG de taches MCP |
| Optimisation | Inlining, fusion | Query optimizer | Fusion code:*, parallelisation, GRU routing |
| Target | x86 machine code | Plan physique | Sandbox natif (code:*) + JSON-RPC (MCP externes) |
| Bibliotheques | libc, stdlib | Tables, vues | MCP tools publies par la communaute |

## Le jeu d'instructions

MCP est l'ISA (Instruction Set Architecture). Les "instructions" sont les tools MCP, organisees en 8 categories semantiques :

```
read      → obtenir de la donnee (file, http, db, git)
decode    → transformer un format (base64, utf8, json)
split     → decouper (lignes, csv, json, regex)
match     → trouver un pattern (regex, find, filter)
compare   → comparer (equal, diff, schema validation)
transform → modifier (map, flatMap, reduce, replace)
merge     → fusionner (concat, join, assign)
emit      → produire un resultat (write file, http post, db insert)
```

PML a deja 63 operations code:* (array, string, object, math, logical, json, binary, control) qui mappent sur ces 8 categories. Les categories = VocabNodes L1 dans la hierarchie SHGAT.

## La compilation en 3 phases

**Phase 1 — Interpretee (cold, 0 traces)**
- Le LLM determine quel tools appeler et dans quel ordre
- Chaque execution genere une trace
- Cout : eleve (LLM a chaque decision)

**Phase 2 — Compilee (warm, suffisamment de traces pour que le GRU depasse le seuil de confiance)**
- Le GRU predit la sequence de tools sans LLM (~60% Hit@1 avec 1155 exemples prod)
- Le DAG est connu d'avance, pas besoin de reflechir
- Gain : 0 tokens LLM pour le routing
- Note : 60% = routing assiste, pas garanti. Le LLM reste necessaire pour ~40% des cas

**Phase 3 — Optimisee (hot, futur)**
- Les operations code:* consecutives sont fusionnees en un seul appel sandbox
- Les donnees restent en memoire entre etapes fusionnees (pas de serialisation JSON)
- Les MCP externes (psql, filesystem) restent des appels JSON-RPC
- Gain : reduction de l'overhead d'execution en plus du routing

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

Soit P = {read, decode, split, match, compare, transform, merge, emit} l'ensemble des primitives.

Operateurs de composition :
- `→` (sequence) : a → b execute b apres a, avec passage de donnees
- `||` (parallele) : a || b execute a et b simultanement
- `?:` (conditionnel) : p ? a : b execute a si p, sinon b
- `!` (fallback) : a ! b execute b si a echoue (gestion d'erreur au niveau du DAG)

**Cloture sous composition** : si W1 et W2 sont des workflows, alors W1 → W2 est un workflow. Un workflow compile EST une primitive pour le niveau superieur. C'est la fractalite. [VISION — necessite `pml publish` pour etre effectif, pas encore implemente]

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
| 8 verbes × composition | lower | Dataflow programming | Kahn process networks (1974) |

### Ce que ca implique

1. **Decidabilite** : le DAG est fini et acyclique → terminaison garantie (pas de boucle infinie)
2. **Determinisme du plan** : meme intent + meme ToolSet = meme DAG. L'execution reste non-deterministe pour les MCP externes (I/O, reseau). Le determinisme est une propriete du PLAN, pas de l'execution.
3. **Optimisabilite** : le compilateur peut transformer le DAG sans changer la semantique (fusion, reordonnancement, parallelisation)
4. **Composabilite** : la cloture garantit que tout workflow est reutilisable comme brique

## Precedents

Unix pipes (1973), SQL (1970s), MapReduce (2004) : peu de verbes + compositionalite + compilateur/optimizer = ecosysteme massif. La valeur n'est jamais dans les verbes — elle est dans le compilateur.

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
- Fusion des code:* consecutifs dans le sandbox (operator fusion, ~2-3 semaines)
- Gestion d'erreurs au niveau DAG (operateur fallback `!`)
- Renommage STD MCP en namespaces semantiques (read:*, transform:*, etc.)
- Benchmarks d'overhead reels (latence MCP STDIO, gain fusion)
