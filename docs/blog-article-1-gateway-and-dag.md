# L'architecture Gateway MCP : Découverte sémantique et exécution parallèle

**Auteur:** AgentCards Team
**Date:** Janvier 2025
**Sujets:** MCP Protocol, Agent Architecture, Performance Optimization

---

## Le paradoxe de la scalabilité MCP

Le Model Context Protocol (MCP) se voulait le "standard USB" des agents IA — une interface universelle pour connecter les modèles de langage aux outils et sources de données. Et sur de nombreux aspects, c'est une réussite : des centaines de serveurs MCP existent aujourd'hui, couvrant l'accès aux systèmes de fichiers, l'intégration GitHub, les requêtes de bases de données, et bien plus encore.

Mais il y a une ironie au cœur de l'adoption de MCP : **le protocole scale, mais pas l'expérience utilisateur.**

L'architecture standard aujourd'hui consiste à connecter Claude Desktop (ou Claude Code) directement à plusieurs serveurs MCP simultanément. Une configuration typique ressemble à ceci :

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem"] },
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] },
    "database": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-postgres"] },
    // ... 12 serveurs supplémentaires
  }
}
```

Cette approche fonctionne admirablement bien pour 3 à 5 serveurs. Mais au-delà de 15 serveurs, des fissures apparaissent :

1. **Saturation du contexte** : Les schémas d'outils consomment 30-50% de la fenêtre de contexte de Claude avant même que le travail ne commence
2. **Exécution séquentielle** : Les workflows multi-outils s'exécutent un outil à la fois, accumulant de la latence
3. **Ballonnement des données intermédiaires** : Des ensembles de données volumineux transitent inutilement par la fenêtre de contexte

Ce ne sont pas des bugs — ce sont des limitations architecturales du modèle de connexion directe.

Dans cet article (premier d'une série de deux), nous explorons deux concepts architecturaux qui adressent ces limitations :

1. **Semantic Gateway Pattern** — Découverte dynamique d'outils via recherche vectorielle
2. **DAG-Based Parallel Execution** — Éliminer les goulots d'étranglement séquentiels via des graphes de dépendances

---

## Concept 1 : Le Semantic Gateway Pattern

### De la découverte statique à la découverte dynamique

Le protocole MCP définit une méthode simple pour la découverte d'outils : le client demande la liste complète, le serveur renvoie tous ses outils. Simple, mais avec un problème critique : **aucun contexte sur ce que l'utilisateur essaie de faire**.

Le serveur n'a d'autre choix que de tout renvoyer. Si vous avez 15 serveurs MCP avec en moyenne 45 outils chacun, cela représente 687 schémas d'outils chargés dans le contexte de Claude. À environ 80-150 tokens par schéma, on parle de 55 000 à 103 000 tokens consommés avant le premier message utilisateur.

Pour la fenêtre de contexte de 200 000 tokens de Claude, cela représente **27-51% de surcharge rien que pour les définitions d'outils**.

Cette décision architecturale avait du sens quand MCP était nouveau et les serveurs peu nombreux. Mais elle ne passe pas à l'échelle. C'est une asymétrie d'information : le serveur ne connaît pas l'intention de l'utilisateur, donc il doit tout envoyer. Le client doit tout charger pour décider ce qui est pertinent.

### L'architecture Gateway

Une gateway se positionne entre Claude et vos serveurs MCP :

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE TRADITIONNELLE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                          ┌──────────────┐                              │
│                          │  Claude Code │                              │
│                          └───────┬──────┘                              │
│                                  │                                      │
│              ┌───────────────────┼───────────────────┐                 │
│              │                   │                   │                 │
│              ▼                   ▼                   ▼                 │
│    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │
│    │  Filesystem MCP │ │   GitHub MCP    │ │  Database MCP   │       │
│    │   (8 outils)    │ │   (12 outils)   │ │   (15 outils)   │       │
│    └─────────────────┘ └─────────────────┘ └─────────────────┘       │
│                                                                         │
│              Tous les 35 schémas chargés dans le contexte              │
│              Utilisation : ~4,200 tokens (2.1% de 200K)                │
│              Pour 15 serveurs : ~82,440 tokens (41% du contexte !)     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      ARCHITECTURE GATEWAY                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                          ┌──────────────┐                              │
│                          │  Claude Code │                              │
│                          └───────┬──────┘                              │
│                                  │ Connexion MCP unique                │
│                                  ▼                                      │
│                    ┌─────────────────────────┐                         │
│                    │   AgentCards Gateway    │                         │
│                    ├─────────────────────────┤                         │
│                    │  🔍 Vector Search       │                         │
│                    │  📊 PGlite + pgvector   │                         │
│                    │  🧠 Semantic Discovery  │                         │
│                    │  ⚡ DAG Executor        │                         │
│                    └──────────┬──────────────┘                         │
│                               │ Proxy des appels d'outils               │
│              ┌────────────────┼────────────────┐                       │
│              │                │                │                        │
│              ▼                ▼                ▼                        │
│    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │
│    │  Filesystem MCP │ │   GitHub MCP    │ │  Database MCP   │       │
│    │   (8 outils)    │ │   (12 outils)   │ │   (15 outils)   │       │
│    └─────────────────┘ └─────────────────┘ └─────────────────┘       │
│                               │                                         │
│              ... + 12 serveurs MCP supplémentaires (15 au total)       │
│                                                                         │
│    ┌────────────────────────────────────────────────────────────┐     │
│    │ Requête : "Lire les fichiers de configuration"            │     │
│    │ → La recherche vectorielle identifie 3 outils pertinents : │     │
│    │   • filesystem:read_file                                   │     │
│    │   • filesystem:list_directory                              │     │
│    │   • json:parse                                             │     │
│    │                                                             │     │
│    │ Utilisation contexte : ~360 tokens (0.18%)                 │     │
│    │ vs. charger les 687 outils : ~82,440 tokens (41%)          │     │
│    │                                                             │     │
│    │ 🎯 Réduction du contexte : amélioration de 229x            │     │
│    └────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

La gateway fournit un point de terminaison MCP unique à Claude tout en maintenant des connexions vers tous vos serveurs MCP réels. Mais plus important encore, elle peut prendre des décisions intelligentes sur les outils à exposer.

### Les embeddings vectoriels comme mécanisme de découverte

Pourquoi la recherche vectorielle plutôt qu'une indexation traditionnelle ?

Les approches basées sur des mots-clés échouent rapidement. Par exemple, pour l'intention "Lire les fichiers de configuration et les parser", une recherche par mots-clés manquerait `yaml:load` (vocabulaire différent) ou `S3:get_object` (pourrait lire des configs depuis S3).

Les embeddings sémantiques capturent l'intention à travers les variations de vocabulaire :

```
Requête : "lire les fichiers de configuration et les parser"

Scores de similarité sémantique :
[0.94] filesystem:read_file
[0.89] json:parse
[0.87] yaml:load
[0.85] toml:parse
[0.81] S3:get_object
[0.78] config:get_value
[0.24] github:create_issue  ← Correctement exclu
[0.19] slack:send_message   ← Correctement exclu
```

La gateway génère des embeddings pour tous les schémas d'outils lors de l'initialisation (opération ponctuelle), puis effectue une recherche de similarité vectorielle au moment de l'exécution. La philosophie d'implémentation est simple :

**Initialisation** : Pour chaque outil, on combine nom + description + schéma en un texte recherchable, on génère l'embedding, et on le stocke dans une base vectorielle (PGlite + pgvector).

**Recherche runtime** : On génère l'embedding de l'intention utilisateur, on interroge la base vectorielle avec un seuil de similarité (0.6), et on retourne les outils les plus pertinents.

> **Note de validation :** Les métriques de réduction de contexte (229x) sont validées empiriquement par nos tests. Pour une requête typique "lire config.json et créer une issue GitHub", la recherche vectorielle identifie 3 outils pertinents sur 687 disponibles (score de similarité >0.6), réduisant l'utilisation du contexte de 82,440 tokens (41%) à 360 tokens (0.18%) — une amélioration de 229x. Temps de recherche : <6ms en moyenne.

### Embeddings locaux vs. cloud : analyse des trade-offs

Nous avons choisi les embeddings locaux (Transformers.js + BGE-M3) plutôt que les API cloud. Voici pourquoi :

**Embeddings locaux (notre choix) :**
- ✅ Latence nulle (pas d'aller-retour réseau)
- ✅ Confidentialité totale (aucune donnée ne quitte la machine)
- ✅ Coût nul (pas de frais d'API)
- ✅ Fonctionne hors ligne
- ⚠️ Coût de setup ponctuel (60s pour embedder 687 outils)
- ⚠️ Qualité : très bonne, pas parfaite

**Embeddings cloud (OpenAI, Cohere, Voyage) :**
- ✅ Meilleure qualité d'embedding
- ⚠️ Latence de 100-300ms par requête
- ⚠️ Préoccupations de confidentialité (les schémas révèlent l'architecture système)
- ⚠️ Coûts API qui scalent avec l'usage
- ⚠️ Dépendance réseau

Pour une gateway qui s'exécute localement et manipule des schémas d'outils potentiellement sensibles, **la confidentialité et la latence l'emportent sur des améliorations marginales de qualité**. Le modèle local est "suffisamment bon" pour la récupération d'outils — nous voyons rarement des outils pertinents classés sous le seuil.

### La gateway comme middleware universel

Une question intéressante se pose : la recherche sémantique devrait-elle faire partie du protocole MCP lui-même ?

**Arguments pour l'extension du protocole :**
- Standardise la découverte sémantique
- Permet aux clients d'optimiser leur propre chargement d'outils
- Rétrocompatible (paramètre optionnel)

**Arguments contre :**
- Déplace la complexité vers chaque implémentation de serveur
- Tous les serveurs n'ont pas de capacités d'embedding
- Pourrait fragmenter l'écosystème
- La recherche sémantique n'est peut-être pas la bonne primitive pour tous les cas d'usage

**Notre approche : La gateway comme couche middleware**

Au lieu d'exiger que tous les serveurs MCP implémentent la recherche sémantique, la gateway la fournit comme couche universelle. Tout serveur MCP existant en bénéficie immédiatement sans modification de code. Les serveurs restent simples. La complexité vit à un seul endroit.

Cela reflète des patterns de l'infrastructure web : nginx gère le caching et le load balancing pour que les services backend n'aient pas à le faire. La gateway MCP gère l'optimisation de la découverte d'outils pour que les serveurs MCP n'aient pas à le faire.

---

## Concept 2 : Exécution parallèle basée sur les DAGs

### GraphRAG vs DAG : clarification architecturale

Avant de plonger dans l'exécution parallèle, il est crucial de comprendre la distinction entre deux composants architecturaux qui travaillent ensemble :

**GraphRAG (Graphe de connaissances)** — La base de connaissances complète
- Stocke TOUS les outils de TOUS les serveurs MCP (ex: 687 outils)
- Contient l'historique des exécutions de workflows et leurs patterns de succès/échec
- Maintient les relations entre outils (ex: "filesystem:read souvent suivi de json:parse")
- Contient les embeddings pour la recherche sémantique
- **Portée :** Globale, toutes les possibilités

**DAG (Directed Acyclic Graph)** — L'instance de workflow spécifique
- Un workflow concret pour UNE tâche spécifique
- Contient seulement les 3-5 outils pertinents pour cette requête
- Définit explicitement les dépendances (la tâche B dépend de la tâche A)
- **Portée :** Locale, exécution unique

```
┌────────────────────────────────────────────────────────┐
│ GRAPHRAG : Toutes les possibilités (Base de connaissances) │
│                                                        │
│ • 687 outils sur 15 serveurs                          │
│ • 10,000+ exécutions historiques                      │
│ • Relations entre outils & patterns                   │
│ • Embeddings vectoriels pour la recherche             │
│                                                        │
│ Exemple de relations apprises :                       │
│ - "filesystem:read" → "json:parse" (85% corrélation)  │
│ - "git:log" → "text:summarize" (72% corrélation)      │
│                                                        │
│ = LA CONNAISSANCE, pas l'exécution                    │
└────────────────┬───────────────────────────────────────┘
                 │
                 │ Intention utilisateur : "Lire config et créer issue"
                 │
                 ▼
       ┌─────────────────────┐
       │  DAG SUGGESTER      │  ← Couche d'intelligence
       │                     │
       │ 1. Interroger GraphRAG
       │ 2. Trouver les patterns
       │ 3. Prédire le workflow
       │ 4. Construire le DAG
       └──────────┬──────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ DAG : Instance de workflow spécifique                   │
│                                                          │
│ tasks: [                                                 │
│   { id: "t1", tool: "filesystem:read_file" },           │
│   { id: "t2", tool: "json:parse", depends_on: ["t1"] }, │
│   { id: "t3", tool: "github:create_issue",              │
│     depends_on: ["t2"] }                                 │
│ ]                                                        │
│                                                          │
│ = LE PLAN D'EXÉCUTION, extrait de la connaissance       │
└─────────────────────────────────────────────────────────┘
```

**Pourquoi cette distinction est importante :**
- GraphRAG = "Quels workflows ont fonctionné avant ?"
- DAG Suggester = "Basé sur cette intention, quel workflow construire ?"
- DAG = "Voici le plan concret à exécuter"
- DAG Executor = "Exécutons ce plan (possiblement de manière spéculative)"

Sans GraphRAG (la connaissance), on ne peut pas prédire quel DAG construire. Sans DAG (la structure), on ne peut pas exécuter les workflows en parallèle. Ils sont complémentaires.

### Le goulot d'étranglement de l'exécution séquentielle

Les workflows MCP aujourd'hui s'exécutent séquentiellement. Le LLM doit :
1. Faire un appel d'outil
2. Attendre le résultat
3. Incorporer le résultat dans le contexte
4. Décider du prochain appel d'outil
5. Répéter

C'est by design. MCP garde les serveurs stateless et simples. L'orchestration est laissée au client (Claude). Mais cela crée un goulot d'étranglement fondamental : **même quand les tâches sont indépendantes, elles s'exécutent en série**.

Prenons un exemple concret :

```
Requête utilisateur : "Lire ces 5 fichiers de configuration"
Fichiers : config.json, database.json, api.json, auth.json, features.json

Timeline d'exécution (séquentielle) :
0.0s → 1.2s: Lire config.json
1.2s → 2.3s: Lire database.json
2.3s → 3.3s: Lire api.json
3.3s → 4.6s: Lire auth.json
4.6s → 5.7s: Lire features.json

Temps total : 5.7 secondes
```

Mais ces lectures sont **complètement indépendantes**. Elles pourraient s'exécuter en parallèle :

```
Timeline d'exécution (parallèle) :
0.0s → 1.2s: Lire les 5 fichiers simultanément
             (le fichier le plus long prend 1.2s)

Temps total : 1.2 secondes
Accélération : 4.75x
```

Pourquoi cela n'arrive-t-il pas automatiquement ? **Parce que le protocole MCP n'exprime pas les dépendances entre les appels d'outils**.

### Introduction au modèle d'exécution DAG

Un **Graphe Acyclique Dirigé (DAG)** représente explicitement les dépendances entre les tâches. Voici la différence :

**Workflow séquentiel :**
```
t1 → t2 → t3
(doit s'exécuter séquentiellement)
```

**Workflow parallèle :**
```
t1 ─┐
t2 ─┤
t3 ─┼─→ Toutes s'exécutent simultanément
t4 ─┤
t5 ─┘
```

L'executeur DAG utilise un tri topologique pour identifier les "couches" de tâches qui peuvent s'exécuter en parallèle. Pour chaque couche, toutes les tâches s'exécutent simultanément via `Promise.all()`. Entre les couches, on attend que toutes les tâches se terminent avant de passer à la suivante.

### Résolution de dépendances avec les références $OUTPUT

Les tâches ont souvent besoin des résultats des tâches précédentes. Nous utilisons une syntaxe de placeholder simple :

```typescript
{
  id: "t2",
  tool: "json:parse",
  arguments: {
    input: "$OUTPUT[t1]"  // Référence au résultat de t1
  },
  depends_on: ["t1"]
}
```

Cela supporte des références complexes avec une syntaxe de style JSONPath :

```typescript
{
  arguments: {
    title: "$OUTPUT[t1].config.version",      // Accès à une propriété profonde
    tags: "$OUTPUT[t2][0].labels",            // Indexation de tableau
    summary: "$OUTPUT[t3].data.summary.text"  // Objets imbriqués
  }
}
```

### Quand l'exécution parallèle est-elle importante ?

Nous avons benchmarké divers patterns de workflows :

| Type de workflow | Tâches | Séquentiel | Parallèle | Accélération |
|-----------------|--------|------------|-----------|--------------|
| Lectures de fichiers indépendantes | 5 | 5.7s | 1.2s | **4.75x** |
| Appels API parallèles (I/O bound) | 8 | 12.4s | 2.1s | **5.90x** |
| Mixte (quelques dépendances) | 10 | 15.2s | 4.8s | **3.17x** |
| Chaîne purement séquentielle | 5 | 5.7s | 5.7s | **1.00x** |
| Fan-out puis fan-in | 12 | 18.9s | 4.2s | **4.50x** |

**Insight clé : Les gains de parallélisation sont proportionnels à la "largeur" du workflow** (nombre de branches indépendantes).

### Comparaison visuelle : Exécution séquentielle vs. parallèle

```
┌─────────────────────────────────────────────────────────────────────────┐
│  EXÉCUTION SÉQUENTIELLE (MCP Traditionnel)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Workflow : Lire 5 fichiers de config                                  │
│                                                                         │
│  t=0.0s ─────► lire config1 ─────► [1.2s] ──────┐                      │
│                                                  │                      │
│  t=1.2s ─────► lire config2 ─────► [1.1s] ──────┤                      │
│                                                  │                      │
│  t=2.3s ─────► lire config3 ─────► [1.0s] ──────┤  Attente             │
│                                                  │  séquentielle        │
│  t=3.3s ─────► lire config4 ─────► [1.3s] ──────┤                      │
│                                                  │                      │
│  t=4.6s ─────► lire config5 ─────► [1.1s] ──────┘                      │
│                                                                         │
│  t=5.7s ────────────────────────────► TERMINÉ                          │
│                                                                         │
│  Temps total : 5.7 secondes                                            │
│  Temps d'inactivité CPU : ~80% (attente I/O)                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  EXÉCUTION PARALLÈLE (Basée sur DAG)                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Workflow : Lire 5 fichiers de config (mêmes tâches, parallélisées)    │
│                                                                         │
│                ┌─► lire config1 ─► [1.2s] ──┐                          │
│                │                             │                          │
│                ├─► lire config2 ─► [1.1s] ──┤                          │
│                │                             │                          │
│  t=0.0s ───────┼─► lire config3 ─► [1.0s] ──┼─► TERMINÉ (toutes complètes) │
│                │                             │                          │
│                ├─► lire config4 ─► [1.3s] ◄─┘   (tâche la plus longue: 1.3s) │
│                │                                                        │
│                └─► lire config5 ─► [1.1s]                              │
│                                                                         │
│  t=1.3s ────────────────────────────► TERMINÉ                          │
│                                                                         │
│  Temps total : 1.3 secondes (max de toutes les tâches parallèles)      │
│  Accélération : 4.4x plus rapide                                       │
│  Utilisation CPU : ~95% (tous les cœurs actifs)                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

Les workflows du monde réel ont typiquement 30-50% de tâches parallélisables. Même les workflows modestes voient des accélérations de 2-3x. Les workflows hautement parallèles (lecture de multiples fichiers, appels multiples d'API) peuvent voir des améliorations de 5-6x.

### Pattern complexe : Fan-Out, Fan-In

Un pattern courant est le "fan-out, fan-in" : exécuter plusieurs tâches en parallèle, puis agréger les résultats.

```
Workflow : "Lire 5 configs, parser chacune, puis agréger en un résumé"

                         ┌─► lire f1 ─► [0.8s] ──┐
                         │                        │
  t=0.0s ► lister fichiers ─┼─► lire f2 ─► [0.9s] ──┼─► parser tous ──┐
           [0.5s]        │                        │   [0.3s]      │
                         └─► lire f3 ─► [0.7s] ──┘               │
                                                                  │
  t=1.4s ─────────────────────────────────────────────► agréger  │
                                                         [0.2s]   │
                                                                  │
  t=1.6s ───────────────────────────────────────────────────► TERMINÉ

  Couche 0 : lister (1 tâche)         → 0.5s
  Couche 1 : lire (3 parallèles)      → 0.9s (max)
  Couche 2 : parser (1 tâche)         → 0.3s
  Couche 3 : agréger (1 tâche)        → 0.2s

  Total : 1.9s
  Séquentiel serait : 0.5 + (0.8+0.9+0.7) + 0.3 + 0.2 = 3.4s
  Accélération : 1.8x
```

Ce pattern est extrêmement courant dans les workflows d'agents : récupérer des données de multiples sources, traiter en parallèle, puis agréger pour l'analyse finale.

---

## Conclusion de la Partie 1

Nous avons exploré deux concepts architecturaux qui adressent les limitations de scalabilité de l'architecture MCP traditionnelle :

1. **Semantic Gateway Pattern** : Utiliser la recherche vectorielle pour exposer dynamiquement uniquement les outils pertinents, réduisant l'utilisation du contexte de 229x (validé empiriquement)

2. **DAG-Based Parallel Execution** : Exprimer explicitement les dépendances entre tâches pour permettre l'exécution parallèle, avec des accélérations de 2-6x selon la "largeur" du workflow

Ces deux concepts fonctionnent en synergie : la gateway réduit la surcharge de contexte, rendant possible l'ajout de plus de serveurs MCP, tandis que l'exécution DAG optimise les workflows multi-outils qui deviennent possibles avec cet écosystème élargi.

Dans la **Partie 2** de cette série, nous explorerons deux concepts encore plus ambitieux :

- **Agent Code Sandboxing** : Déplacer la computation hors du protocole vers l'exécution locale de code
- **Speculative Execution** : Prédire et pré-exécuter les workflows avant même qu'ils soient demandés

Ces concepts poussent encore plus loin les limites de ce qui est possible avec l'architecture MCP, introduisant des questions fascinantes sur la sécurité, l'intelligence prédictive, et l'avenir des agents IA.

---

**À propos d'AgentCards** : AgentCards est une exploration open-source de patterns architecturaux avancés pour les agents MCP. Le code complet et les benchmarks sont disponibles sur GitHub.

**Questions ou feedback ?** Nous serions ravis d'entendre vos retours sur ces concepts. Ces patterns devraient-ils faire partie du protocole MCP lui-même ? Contactez-nous sur notre dépôt GitHub.
