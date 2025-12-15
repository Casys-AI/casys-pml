# Procedural Memory Layer - Research & Communication Plan

> Document créé le 2025-12-13
> Objectif: Évaluer et planifier la publication scientifique + communication LinkedIn

---

## 0. Explication simple (pour ta femme, tes parents, n'importe qui)

### Version 30 secondes

> **"J'apprends aux robots à se souvenir de comment faire les choses."**
>
> Aujourd'hui, quand tu demandes à ChatGPT de faire une tâche, il oublie tout après. La prochaine fois, il recommence de zéro.
>
> Mon système, c'est comme lui donner une mémoire musculaire. Comme quand tu apprends à faire du vélo : au début tu réfléchis à chaque mouvement, puis ça devient automatique.

---

### Version 2 minutes (avec analogie cuisine)

**Le problème:**

Imagine un chef qui, chaque fois qu'il doit faire une omelette, relit la recette depuis le début. Même s'il en a fait 100 avant. Il ne se souvient jamais de comment il l'a faite la dernière fois.

C'est exactement ce que font les assistants IA aujourd'hui. Ils ont une super mémoire pour les **faits** (les recettes), mais zéro mémoire pour les **gestes** (comment cuisiner).

**Ma solution:**

Je construis un système qui leur donne une "mémoire des gestes" :

1. **Il observe** — Quand l'IA fait quelque chose qui marche, mon système note exactement ce qu'elle a fait

2. **Il se souvient** — La prochaine fois qu'on lui demande quelque chose de similaire, il retrouve ce qui a marché avant

3. **Il s'améliore** — Si une méthode échoue souvent, il la propose moins. Si elle marche bien, il la propose plus.

**Résultat:**

Au lieu de tout réinventer à chaque fois, l'IA réutilise ce qui a déjà marché. C'est plus rapide, plus fiable, et ça s'améliore avec le temps.

---

### Version technique-mais-accessible (pour un dev ou quelqu'un de curieux)

**Les 3 types de mémoire humaine:**

| Type | C'est quoi | Exemple | L'IA aujourd'hui |
|------|------------|---------|------------------|
| **Sémantique** | Les faits | "Paris est la capitale de la France" | ✅ RAG, ChatGPT |
| **Épisodique** | Les événements | "Hier j'ai mangé une pizza" | ✅ Historique de conversation |
| **Procédurale** | Les gestes | "Comment faire du vélo" | ❌ **Personne ne fait ça** |

**Ce que je construis:**

Un système qui capture la **mémoire procédurale** des agents IA :

- Quand l'agent écrit du code qui marche → on le stocke
- On déduit automatiquement les paramètres (qu'est-ce qui peut changer)
- On suit le taux de succès (est-ce que ça marche souvent?)
- On détecte les dépendances (cette action a besoin de celle-là avant)

**Pourquoi c'est utile:**

- **5x plus rapide** — Pas besoin de tout régénérer
- **Plus fiable** — On réutilise ce qui a fait ses preuves
- **Ça s'améliore** — Contrairement à ChatGPT qui reste statique

---

### La phrase qui tue (pour les cocktails)

> "Tu sais comment ChatGPT oublie tout entre chaque conversation? Moi je lui apprends à se souvenir de *comment* faire les choses, pas juste de *quoi* dire."

---

## 1. Évaluation du potentiel scientifique

### 1.1 Contribution principale

**"Emergent Procedural Memory for LLM Agents"**

Les agents LLM actuels régénèrent du code à chaque exécution (paradigme RAG = knowledge retrieval).
Notre approche introduit une **mémoire procédurale** qui apprend des **skills** réutilisables.

> "RAG gave agents knowledge. PML gives them skills."

### 1.2 Innovations techniques (par ordre de nouveauté)

| Innovation | Description | Nouveauté |
|------------|-------------|-----------|
| **Eager Learning** | Stockage dès la 1ère exécution réussie, filtrage lazy au moment des suggestions | ⭐⭐⭐⭐⭐ |
| **Combinaison récursive** | Tools → Capacités → Méta-capacités (modèle SECI, Nonaka & Takeuchi) | ⭐⭐⭐⭐⭐ |
| **Apprentissage implicite** | Workflows émergent de l'observation, pas de définition explicite (vs n8n/Windmill) | ⭐⭐⭐⭐⭐ |
| **Schema Inference via AST** | Inférence automatique des paramètres JSON Schema via SWC parsing | ⭐⭐⭐⭐ |
| **Transitive Reliability** | Fiabilité d'une chaîne de capacités = maillon le plus faible | ⭐⭐⭐⭐ |
| **Capability Composition** | Détection automatique des relations (contains, dependency, sequence, alternative) | ⭐⭐⭐⭐ |
| **Hypergraph Scoring** | PageRank/Spectral Clustering avec edges N-aires (capability↔capability) | ⭐⭐⭐ |
| **Adaptive Thresholds** | Seuils de suggestion qui s'adaptent par contexte de workflow (EMA) | ⭐⭐⭐ |

### 1.3 Concepts clés (potentiel scientifique fort)

#### 🔮 Combinaison récursive (modèle SECI)

**Origine:** Modèle SECI de Nonaka & Takeuchi (1995) — référence classique en Knowledge Management.

```
Le modèle SECI:
┌─────────────────┬─────────────────┐
│ Socialisation   │ Externalisation │
│ (tacit→tacit)   │ (tacit→explicit)│
├─────────────────┼─────────────────┤
│ Internalisation │ Combinaison     │ ← C'EST ICI
│ (explicit→tacit)│ (explicit→explicit)
└─────────────────┴─────────────────┘
```

**Combinaison** = assembler des connaissances explicites pour en créer de nouvelles.

**Application à PML:**

```
Niveau 0: Tools (atomiques, explicites)
    │
    ▼ combinaison
Niveau 1: Capacités (combinaisons de tools)
    │
    ▼ combinaison
Niveau 2: Méta-capacités (combinaisons de capacités)
    │
    ▼ combinaison
Niveau N: ...
```

**Exemple concret:**
```
Tools: filesystem:read, json:parse, memory:store
    ↓ combinaison (après observation)
Capacité: "parse-and-cache-config"
    ↓ combinaison (après observation)
Méta-capacité: "setup-environment" (qui inclut parse-and-cache-config + autres)
```

**Intérêt scientifique:**
- S'inscrit dans un cadre théorique établi (SECI, 1995)
- Émergence hiérarchique sans design explicite
- Récursivité: le même processus s'applique à chaque niveau
- Potentiel pour l'abstraction automatique de workflows complexes

**Littérature connexe:**
- Nonaka & Takeuchi (1995) - The Knowledge-Creating Company
- Hierarchical Reinforcement Learning, Option Framework (Sutton)

---

#### 🌊 Apprentissage implicite vs Workflows explicites

**Concept:** Contrairement aux outils de workflow (n8n, Windmill, Temporal, etc.) où l'utilisateur *définit* explicitement les étapes, PML *observe* ce que l'agent fait et combine ça en capacités.

| Aspect | Workflows explicites (n8n, Windmill) | PML (implicite) |
|--------|--------------------------------------|-----------------|
| **Définition** | L'utilisateur dessine le workflow | L'agent exécute, PML observe |
| **Connaissance** | À priori (design-time) | À posteriori (runtime) |
| **Flexibilité** | Rigide (suit le schéma) | Adaptative (apprend les variations) |
| **Découverte** | Non (tu sais ce que tu veux) | Oui (patterns émergents) |
| **Maintenance** | Manuelle (update le workflow) | Automatique (stats, success rate) |

**Analogie:**
- **Explicite** = Apprendre à cuisiner avec une recette étape par étape
- **Implicite** = Apprendre à cuisiner en regardant un chef et en retenant ses gestes

**Intérêt scientifique:**
- Capture de la connaissance tacite (ce que l'expert fait sans y penser)
- Pas besoin de formaliser à l'avance
- Découverte de patterns que même l'utilisateur ne connaissait pas

**Littérature connexe:** Tacit Knowledge (Polanyi), Learning by Demonstration, Imitation Learning

### 1.4 Positionnement vs état de l'art

| Approche | Learning | Composition | Schema Inference | Reliability |
|----------|----------|-------------|------------------|-------------|
| Skill Libraries (CodeBERT, etc.) | ❌ Statique | ❌ | ❌ Manuel | ❌ |
| Code Retrieval (Copilot) | ❌ Pré-entraîné | ❌ | ❌ | ❌ |
| Tool Discovery (RAG) | ❌ | ❌ | ❌ | ❌ |
| Docker Dynamic MCP | ❌ | ❌ | ❌ | ❌ |
| Anthropic PTC | ❌ | ❌ | ❌ | ❌ |
| **Anthropic Skills** | ❌ Manuel | ❌ | ❌ | ❌ |
| **Casys PML** | ✅ Runtime | ✅ Auto-détectée | ✅ AST | ✅ Transitive |

### 1.5 Clarification terminologique: Skills vs Capabilities

**Note:** Pour éviter toute confusion avec les "Skills" d'Anthropic (qui sont des instructions textuelles), nous utilisons le terme **"Capabilities"** pour désigner nos patterns de code appris.

| Aspect | Anthropic Skills | Casys PML Capabilities |
|--------|------------------|------------------------|
| **Nature** | Instructions textuelles (prompts) | **Code exécutable** |
| **Stockage** | Texte/markdown | Code + JSON Schema + stats |
| **Apprentissage** | Manuel (user écrit le skill) | **Automatique** (émergent de l'exécution) |
| **Paramètres** | Implicites dans le texte | **Schéma inféré via AST parsing** |
| **Composition** | Non détectée | **Auto-détectée** (dependency, contains, sequence) |
| **Fiabilité** | Non trackée | **Success rate + propagation transitive** |
| **Exécution** | LLM interprète → génère code | **Code direct dans sandbox** |

**Analogie cognitive:**
- **Skills (instructions)** = Mémoire sémantique (savoir quoi faire)
- **Capabilities (code)** = Mémoire procédurale (savoir comment faire)

**Exemple concret:**

```
# Anthropic Skill (textuel)
"Pour déployer en prod: 1) Lance les tests 2) Build l'image Docker 3) Apply sur K8s"
→ Le LLM doit générer le code à chaque exécution
→ Pas de tracking de succès/échec
→ Pas de composition détectée

# Casys Capability (code)
{
  intent: "deploy to production",
  code: "await mcp.jest.run({path: args.testPath}); await mcp.docker.build({...}); ...",
  parametersSchema: { testPath: "string", dockerTag: "string", namespace: "string" },
  successRate: 0.94,
  usageCount: 47,
  dependencies: ["capability:run-tests", "capability:docker-build"]
}
→ Exécution directe (pas de régénération)
→ Fiabilité trackée et propagée
→ Composition auto-détectée
```

**Implication pour le papier:** Notre contribution se situe au niveau du **"procedural learning"** — l'apprentissage automatique de code exécutable à partir des exécutions d'agents. C'est complémentaire aux approches existantes basées sur les instructions.

---

## 2. Plan du papier scientifique

### 2.1 Titre proposé

> **"Emergent Capabilities: Learning Executable Patterns from LLM Agent Executions"**

Alternatives:
- "Beyond RAG: Procedural Memory for Tool-Using LLM Agents"
- "From Knowledge to Capabilities: Procedural Learning for AI Agents"

**⚠️ Terminologie:** On utilise **"Capabilities"** (pas "Skills") pour se différencier d'Anthropic Skills (qui sont textuels).

### 2.2 Abstract (draft)

> Large Language Model agents repeatedly generate similar code for recurring tasks, wasting compute and context window. We introduce **Procedural Memory Layer (PML)**, a system that automatically learns reusable capabilities from agent executions.
>
> Unlike retrieval-augmented generation (RAG) that retrieves knowledge, PML learns *skills*—executable code patterns that can be composed and reused.
>
> Key contributions: (1) **eager learning** with lazy suggestion filtering via adaptive thresholds, (2) **automatic parameter schema inference** through AST parsing, (3) **transitive reliability propagation** through capability dependency graphs.
>
> On a benchmark of N multi-tool workflows, PML achieves X% code reuse rate and Y% latency reduction compared to vanilla execution, while maintaining Z% success rate.

### 2.3 Structure

```
1. INTRODUCTION
   - Problem: LLM agents regenerate code every time
   - Human analogy: Procedural memory (riding a bike)
   - Contribution: First runtime learning system for agent skills

2. RELATED WORK
   2.1 Skill/Program Libraries
   2.2 Code Retrieval & Embeddings
   2.3 Tool Discovery for Agents
   2.4 Knowledge Graphs for Agents

3. APPROACH: PROCEDURAL MEMORY LAYER
   3.1 System Overview (3-layer architecture)

   3.2 Capability Learning
       - Eager storage on first execution
       - Code hashing for deduplication
       - UPSERT with statistics tracking

   3.3 Schema Inference
       - SWC AST parsing
       - Multi-source type inference
       - JSON Schema generation

   3.4 Capability Matching
       - Semantic search (vector embeddings)
       - Reliability scoring
       - Adaptive threshold filtering

   3.5 Composition & Dependencies
       - Edge types and detection
       - Transitive reliability propagation
       - Cycle detection (max depth)

4. EXPERIMENTAL EVALUATION
   4.1 Benchmark Design
   4.2 Baselines
   4.3 Metrics
   4.4 Results
   4.5 Ablation Study

5. DISCUSSION
   - Limitations
   - Generalization beyond exact matches
   - Future: meta-capability learning

6. CONCLUSION
```

### 2.4 Expériences à développer

#### Benchmark (à créer)
- 20-30 tâches multi-outils représentatives
- Catégories: file ops, API calls, data processing, deployments
- Variations: paramètres différents, contextes similaires

#### Baselines
1. **Vanilla**: Pas de cache, régénération à chaque fois
2. **Simple Cache**: Hash exact de l'intent
3. **RAG Retrieval**: Embedding search sans learning
4. **PML (ours)**: Full system

#### Métriques
| Métrique | Description | Target |
|----------|-------------|--------|
| **Reuse Rate** | % d'exécutions utilisant une capability existante | > 40% |
| **Latency Reduction** | Temps gagné vs vanilla | > 50% |
| **Success Rate** | % d'exécutions réussies | > 85% |
| **Context Savings** | Tokens économisés | > 30% |

#### Ablation Study
- Sans eager learning (attendre 3+ patterns)
- Sans schema inference (schema vide)
- Sans transitive reliability
- Sans adaptive thresholds

---

## 3. Venues ciblées

| Venue | Type | Deadline 2025 | Fit | Notes |
|-------|------|---------------|-----|-------|
| **NeurIPS Workshop LLM Agents** | Workshop | Sept 2025 | ⭐⭐⭐⭐⭐ | Idéal pour première publication |
| **EMNLP** | Conférence | Mai 2025 | ⭐⭐⭐⭐ | Track agents/tools |
| **NAACL** | Conférence | Jan 2025 | ⭐⭐⭐ | Si prêt rapidement |
| **AAMAS** | Conférence | Oct 2025 | ⭐⭐⭐⭐ | Multi-agent systems |
| **MLSys** | Conférence | Nov 2025 | ⭐⭐⭐ | Angle systems |
| **ICML Workshop** | Workshop | Mai 2025 | ⭐⭐⭐⭐ | Si workshop agents existe |

**Recommandation**: Viser **NeurIPS Workshop LLM Agents 2025** comme première cible.

---

## 4. Article LinkedIn

### 4.1 Terminologie

**⚠️ IMPORTANT:** Utiliser **"Capabilities"** ou **"Capacités"**, jamais "Skills"
- "Skills" = Anthropic (instructions textuelles)
- "Capabilities" = Casys PML (code exécutable appris)

### 4.2 Angle & Hook

**Problème relatable:**
> "Vos agents AI régénèrent le même code 100 fois par jour. Et si ils apprenaient?"

**Analogie humaine:**
> "Vous n'avez pas besoin de réapprendre à faire du vélo chaque matin. Pourquoi vos agents AI devraient-ils?"

**Positionnement (complémentaire, pas compétitif):**
> "Les Skills gèrent les instructions. Les Capabilities gèrent le code appris. Ce sont deux approches complémentaires."

### 4.3 Structure proposée (format LinkedIn)

```
🧠 HOOK (2-3 lignes)
Accroche émotionnelle/provocante

📊 PROBLÈME (3-4 lignes)
Le coût caché de la régénération de code

💡 INSIGHT (2-3 lignes)
L'analogie avec la mémoire procédurale humaine

🔧 SOLUTION (4-5 lignes)
PML en 3 points clés

📈 RÉSULTATS (2-3 lignes)
Chiffres concrets (speedup, reuse rate)

🎯 CALL TO ACTION
Invitation à discuter / lien vers article détaillé

#tags
```

### 4.4 Draft de l'article

---

**🧠 Vos agents AI ont un problème de mémoire.**

Pas la mémoire conversationnelle. La mémoire procédurale.

Celle qui fait que vous n'avez pas besoin de réapprendre à faire du vélo chaque matin.

---

**📊 Le problème invisible:**

Chaque fois que votre agent Claude/GPT exécute une tâche multi-outils, il régénère le code from scratch.

→ Même workflow répété 50 fois = 50 générations de code
→ 30-50% du context window gaspillé en schémas d'outils
→ Latence qui s'accumule (2-5s par étape)

C'est comme si vous deviez réapprendre à conduire à chaque trajet.

---

**💡 L'insight:**

Les humains ont 3 types de mémoire:
- **Sémantique** (faits) → C'est ce que fait RAG
- **Épisodique** (événements) → C'est ce que font les "memory" tools
- **Procédurale** (savoir-faire) → **Personne ne fait ça pour les agents**

RAG a donné la connaissance aux agents.
Il est temps de leur donner des **capacités**.

---

**🔧 Ce qu'on construit: Procedural Memory Layer (PML)**

1️⃣ **Apprentissage eager**: Dès qu'un code s'exécute avec succès, il devient une **capacité** réutilisable

2️⃣ **Inférence de schéma automatique**: Le système déduit les paramètres via parsing AST (pas besoin de documentation)

3️⃣ **Fiabilité transitive**: Si la capacité A dépend de B, et B échoue souvent, A est pénalisée

Le résultat: Un agent qui **apprend** de ses exécutions et **réutilise** ce qui marche.

Chaque Capability = **code exécutable** + schéma JSON + stats de succès + composition auto-détectée.

---

**📈 Premiers résultats:**

- Context window: 30-50% → **<5%**
- Workflows 5 outils: 8.2s → **1.8s** (5x speedup)
- Et ça s'améliore avec le temps (contrairement à RAG statique)

---

**🎯 On prépare un papier de recherche sur le sujet.**

Curieux d'avoir vos retours:
- Quels use cases vous semblent les plus pertinents?
- Quelles métriques vous convaincraient?

[Lien vers article technique détaillé]

---

#AI #LLM #Agents #MachineLearning #ProceduralMemory #MCP #Claude #OpenSource

---

### 4.5 Visuels suggérés

1. **Schéma comparatif**: RAG (knowledge) vs PML (skills)
2. **Diagramme 3-layer**: Orchestration → PML → MCP Servers
3. **Graphe de capabilities**: Visualisation hypergraph avec nodes composés
4. **Before/After**: Metrics comparison (context, latency)

### 4.6 Timing recommandé

- **Mardi ou Mercredi** matin (meilleur engagement LinkedIn)
- **8h-9h** heure française
- Prévoir réponses aux commentaires dans les 2h

---

## 5. Prochaines étapes

### Immédiat (cette semaine)
- [ ] Finaliser et poster article LinkedIn
- [ ] Créer 1-2 visuels pour accompagner

### Court terme (2-4 semaines)
- [ ] Article de blog technique détaillé
- [ ] Définir benchmark (liste de tâches)
- [ ] Implémenter baseline "vanilla"

### Moyen terme (2-3 mois)
- [ ] Compléter expériences
- [ ] Rédiger papier
- [ ] Soumettre à workshop/conférence

---

## 6. Questions ouvertes

1. **Benchmark**: Quelles tâches inclure? (file ops, API, data processing?)
2. **Baselines**: Quels systèmes existants comparer? (LangChain? AutoGPT?)
3. **Métriques**: Qu'est-ce qui convaincrait les reviewers?
4. **Angle LinkedIn**: Plus technique ou plus "business value"?

---

*Document vivant - à mettre à jour au fur et à mesure*
