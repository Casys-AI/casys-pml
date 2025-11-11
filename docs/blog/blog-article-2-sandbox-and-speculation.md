# Code Sandboxing et exécution spéculative : Repenser la sécurité des agents MCP

**Auteur:** AgentCards Team
**Date:** Janvier 2025
**Sujets:** Code Execution, Security, Predictive Intelligence, MCP Architecture

---

## Repenser le paradigme : Au-delà des appels d'outils

Dans le [premier article](./blog-article-1-gateway-and-dag.md) de cette série, nous avons exploré comment les **Semantic Gateways** et l'**exécution parallèle basée sur les DAGs** résolvent les problèmes de contexte et de latence dans les workflows MCP. Mais ces optimisations, aussi puissantes soient-elles, restent dans le paradigme du "tool call" : l'agent demande, le serveur exécute, les résultats retournent dans le contexte.

Dans cet article, nous explorons deux concepts qui sortent de ce paradigme :

1. **Agent Code Sandboxing** — Exécuter du code généré par l'agent dans un environnement isolé, déplaçant la computation hors du protocole
2. **Speculative Execution** — Prédire et pré-exécuter les workflows avant même que l'agent ne les demande

Ces deux concepts transforment la gateway d'un simple routeur en un **système d'orchestration intelligent** capable d'anticiper les besoins et d'isoler les calculs lourds.

---

## Concept 3 : Agent Code Sandboxing

### Le problème caché des résultats intermédiaires

Le paradigme MCP est fondamentalement basé sur les **appels d'outils** : l'agent demande, le serveur exécute, le résultat retourne dans le contexte. Simple et élégant.

Mais il y a une inefficacité cachée : **les résultats intermédiaires gonflent le contexte**.

```
Exemple concret :
Requête : "Lister les fichiers configs et filtrer les .json"

Approche par tool calls :
1. Agent : "Liste les fichiers dans /configs"
   → MCP retourne : ["app.json", "db.json", ..., "config-687.json"]
   → Résultat : 2,400 tokens dans le contexte

2. Agent : "Maintenant filtre pour garder seulement les .json"
   → Agent doit traiter les 2,400 tokens
   → Ou faire un autre appel d'outil avec des filtres spécifiques

Approche par code execution :
1. Agent génère du TypeScript :
   const files = await listDirectory("/configs");
   const jsonFiles = files.filter(f => f.endsWith(".json"));
   return jsonFiles;

2. Gateway exécute dans un sandbox Deno
   → Retourne : ["app.json", "db.json", "auth.json"]
   → Résultat : 80 tokens

Réduction de contexte : 30x
```

La différence clé : **la computation se fait localement**. Seul le résultat final entre dans le contexte.

### Quand le sandboxing l'emporte-t-il sur les tool calls ?

Le sandboxing n'est pas toujours la meilleure solution. Voici une matrice de décision :

**✅ Le sandbox gagne :**
- **Datasets volumineux** : 1MB+ de données brutes → filtrer/agréger vers <1KB de résumé
- **Transformations multi-étapes** : 5+ opérations sur les mêmes données
- **Logique de filtrage complexe** : Conditions qui nécessiteraient multiples tool calls
- **Données sensibles** : Traiter localement, retourner seulement des agrégats (préservation de la vie privée)
- **Algorithmes itératifs** : Boucles, récursion, traitement stateful

**❌ Les tool calls gagnent :**
- **Opérations simples** : Lire un fichier, appeler une API
- **APIs externes** : GitHub, Slack, bases de données (ne peuvent pas s'exécuter dans le sandbox)
- **Opérations stateful** : Transactions de base de données, écritures de fichiers avec verrous
- **Requêtes ponctuelles** : Pas de traitement répété

Exemple chiffré :

```
Scénario 1 : Lire un fichier
Tool call : 1 round-trip, 1,200 tokens
Sandbox : 1 round-trip + overhead d'exécution, 1,200 tokens
Gagnant : Tool call (plus simple, pas d'overhead)

Scénario 2 : Lire 50 fichiers, extraire les numéros de version, agréger
Tool calls : 51 round-trips (50 lectures + 1 agrégation), 75,000 tokens
Sandbox : 1 round-trip, 500 tokens (juste la liste des versions)
Gagnant : Sandbox (50x moins de tokens, 1 round-trip vs 51)

Scénario 3 : Créer une issue GitHub
Tool call : 1 round-trip, fonctionne
Sandbox : Ne peut pas accéder à l'API GitHub (pas dans le sandbox)
Gagnant : Tool call (seule option)
```

### Le défi de la sécurité

Pourquoi ne pas juste utiliser `eval()` de JavaScript ?

```typescript
// ❌ EXTRÊMEMENT DANGEREUX
const agentCode = await llm.generateCode();
eval(agentCode);

// Le code de l'agent peut :
// - Accéder à tous les fichiers (lire /etc/passwd, ~/.ssh/id_rsa)
// - Faire des requêtes réseau (exfiltrer des données)
// - Exécuter des commandes shell (rm -rf /)
// - Crasher le processus (process.exit(1))
```

Nous avons besoin d'isolation. Mais combien, et à quel coût ?

**Options d'isolation :**

| Approche | Sécurité | Latence démarrage | Overhead runtime | Complexité |
|----------|----------|-------------------|------------------|------------|
| **VM** (Firecracker) | ★★★★★ Excellente | ⚠️ 1-2 secondes | ★★★★ Faible | ⚠️ Élevée |
| **Container** (Docker) | ★★★★ Très bonne | ⚠️ 100-500ms | ★★★★ Faible | ⚠️ Élevée |
| **WASM** (Wasmer) | ★★★★ Très bonne | ★★★★★ <10ms | ★★★★★ Nulle | ★★★ Moyenne |
| **Deno sandbox** | ★★★★ Très bonne | ★★★★★ <10ms | ★★★★★ Nulle | ★★ Faible |
| Node.js vm2 | ⚠️ Faible (vecteurs d'évasion) | ★★★★★ <1ms | ★★★★★ Nulle | ★★ Faible |

**Pourquoi Deno ?**

Deno offre une **sécurité basée sur les capacités** avec des permissions granulaires. Au lieu d'un modèle "tout ou rien", Deno permet de spécifier exactement ce qu'un script peut faire :

```typescript
// Subprocess Deno avec permissions explicites
const sandbox = Deno.run({
  cmd: ["deno", "run",
    "--allow-read=/configs",      // Peut SEULEMENT lire /configs
    "--allow-write=/tmp/output",  // Peut SEULEMENT écrire dans /tmp/output
    // PAS de --allow-net (réseau complètement bloqué)
    // PAS de --allow-run (ne peut pas spawner de sous-processus)
    // PAS de --allow-env (ne peut pas lire les variables d'environnement)
    "agent_code.ts"
  ]
});
```

Cela nous donne :
- **Contrôle granulaire** : Par répertoire, par domaine, par capacité
- **Deny-by-default** : Tout est interdit sauf ce qui est explicitement autorisé
- **Application runtime** : Pas juste de l'isolation de processus, mais des restrictions de capacités au niveau OS
- **Démarrage rapide** : <10ms d'overhead vs 100-500ms pour les containers
- **TypeScript natif** : Pas d'étape de compilation, le code de l'agent s'exécute directement

### Architecture du sandbox Deno

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ARCHITECTURE DU SANDBOX DENO                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Code généré par l'agent                                          │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │ const files = await listDirectory("/configs");              │  │ │
│  │  │ const configs = await Promise.all(                          │  │ │
│  │  │   files.map(f => readFile(f).then(JSON.parse))              │  │ │
│  │  │ );                                                           │  │ │
│  │  │ return configs.map(c => ({ name: c.name, version: c.ver }));│  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────┬──────────────────────────────────────────┘ │
│                           │ Injection de wrappers clients MCP           │
│                           ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Wrappers d'outils MCP injectés (auto-générés)                    │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │ async function listDirectory(path) {                        │  │ │
│  │  │   return await __MCP_CALL__("filesystem:list", { path });   │  │ │
│  │  │ }                                                            │  │ │
│  │  │ async function readFile(path) {                             │  │ │
│  │  │   return await __MCP_CALL__("filesystem:read", { path });   │  │ │
│  │  │ }                                                            │  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────┬──────────────────────────────────────────┘ │
│                           │ Exécution dans subprocess Deno              │
│                           ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Subprocess Deno (isolé)                                          │ │
│  │                                                                   │ │
│  │  Permissions :                                                    │ │
│  │  ✅ --allow-read=/configs      (seulement répertoire /configs)   │ │
│  │  ✅ --allow-net=localhost:9000 (seulement gateway MCP proxy)     │ │
│  │  ❌ PAS de --allow-write        (ne peut pas écrire de fichiers) │ │
│  │  ❌ PAS de --allow-run          (ne peut pas spawner de processus)│ │
│  │  ❌ PAS de --allow-env          (ne peut pas lire les env vars)  │ │
│  │                                                                   │ │
│  │  Limites :                                                        │ │
│  │  ⏱️  Timeout : 5 secondes                                        │ │
│  │  💾 Mémoire : 100MB max                                          │ │
│  │                                                                   │ │
│  └────────────────────────┬──────────────────────────────────────────┘ │
│                           │ __MCP_CALL__ proxie vers la gateway         │
│                           ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Gateway MCP Proxy (localhost:9000)                               │ │
│  │                                                                   │ │
│  │  Transfère les appels vers les vrais serveurs MCP                │ │
│  │  La gateway a les permissions complètes filesystem                │ │
│  │                                                                   │ │
│  └────────────────────────┬──────────────────────────────────────────┘ │
│                           │                                             │
│                           ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Couche de détection PII                                          │ │
│  │                                                                   │ │
│  │  Scanne les résultats pour :                                      │ │
│  │  • Adresses email    (patterns regex)                             │ │
│  │  • Clés API          (analyse d'entropie)                         │ │
│  │  │  Cartes de crédit (algorithme de Luhn)                        │ │
│  │  • SSN, téléphones   (pattern matching)                           │ │
│  │                                                                   │ │
│  │  Trouvé : 2 adresses email → [REDACTED]                           │ │
│  │                                                                   │ │
│  └────────────────────────┬──────────────────────────────────────────┘ │
│                           │                                             │
│                           ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Résultat final (sûr pour le contexte LLM)                        │ │
│  │                                                                   │ │
│  │  [{                                                               │ │
│  │    name: "app-config",                                            │ │
│  │    version: "2.1.0"                                               │ │
│  │  }, {                                                             │ │
│  │    name: "db-config",                                             │ │
│  │    version: "1.5.3"                                               │ │
│  │  }]                                                               │ │
│  │                                                                   │ │
│  │  Utilisation contexte : ~120 tokens (vs. 15,000+ pour les fichiers bruts) │
│  │  🎯 Réduction de 125x                                             │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Frontières de sécurité :
┌────────────────┐
│ Code agent     │  Subprocess isolé, permissions minimales
├────────────────┤
│ Proxy MCP      │  Contrôle l'accès aux outils MCP
├────────────────┤
│ Détection PII  │  Empêche les fuites de données sensibles
├────────────────┤
│ Contexte LLM   │  Reçoit seulement des résumés sanitizés
└────────────────┘
```

### Intégration MCP : Injection d'outils dans le sandbox

Le sandbox est isolé du processus de la gateway. Mais le code de l'agent a besoin d'accéder aux outils MCP. Comment résoudre ce paradoxe ?

**Solution : Client MCP auto-généré**

Avant d'exécuter le code de l'agent, la gateway injecte des stubs clients qui proxient les appels vers les serveurs MCP :

```typescript
// Étape 1 : Générer le code client MCP
const mcpClientCode = `
// Wrappers d'outils MCP auto-générés
async function readFile(path: string): Promise<string> {
  const response = await fetch("http://localhost:9000/call", {
    method: "POST",
    body: JSON.stringify({
      tool: "filesystem:read_file",
      arguments: { path }
    })
  });
  return await response.json();
}

async function parseJSON(input: string): Promise<any> {
  const response = await fetch("http://localhost:9000/call", {
    method: "POST",
    body: JSON.stringify({
      tool: "json:parse",
      arguments: { input }
    })
  });
  return await response.json();
}

// ... un wrapper par outil pertinent
`;

// Étape 2 : Préfixer au code utilisateur
const fullCode = mcpClientCode + "\n\n" + agentCode;

// Étape 3 : Exécuter avec permission réseau vers localhost uniquement
await sandbox.execute({
  code: fullCode,
  permissions: {
    net: ["localhost:9000"]  // Peut seulement parler à la gateway
  }
});
```

**Optimisation : Injection sémantique d'outils**

Ne pas injecter les 687 outils — cela irait à l'encontre de l'objectif du sandboxing. Utiliser la recherche vectorielle pour identifier quels outils le code aura probablement besoin :

```typescript
async function injectRelevantTools(agentCode: string): string {
  // Analyse sémantique : quels outils ce code a-t-il besoin ?
  const codeEmbedding = await embedder.embed(agentCode);

  const relevantTools = await vectorSearch.searchTools(
    codeEmbedding,
    limit = 20,      // Au maximum 20 outils
    threshold = 0.7  // Confiance élevée seulement
  );

  // Générer des wrappers seulement pour les outils pertinents
  const clientCode = generateMCPClient(relevantTools);

  return clientCode + "\n\n" + agentCode;
}
```

### La couche de détection PII

Avant de retourner les résultats du sandbox au contexte LLM, scanner pour des données sensibles :

```typescript
class PIIDetector {
  private patterns = [
    { name: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { name: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
    { name: "credit_card", regex: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g },
    { name: "api_key", fn: this.detectAPIKey.bind(this) },
  ];

  scan(text: string): PIIFinding[] {
    // Détecte tous les patterns PII
  }

  redact(text: string, findings: PIIFinding[]): string {
    // Remplace par [REDACTED_EMAIL], [REDACTED_API_KEY], etc.
  }

  private detectAPIKey(text: string): PIIFinding[] {
    // Détection de chaînes à haute entropie (probablement des clés API)
    const words = text.split(/\s+/);
    return words
      .filter(word => word.length > 20 && this.calculateEntropy(word) > 4.5)
      .map(word => ({ type: "api_key", value: word }));
  }
}
```

Cette couche agit comme un **firewall de données** entre le sandbox et le contexte LLM, empêchant les fuites accidentelles de données sensibles.

---

## Concept 4 : Exécution spéculative

### L'idée centrale : Travailler pendant que l'agent "pense"

L'exécution DAG permet la parallélisation, mais il y a toujours de la latence : l'agent doit **construire le DAG** avant que l'exécution ne commence. Et si on pouvait commencer à exécuter avant même que l'agent ne décide quoi faire ?

C'est l'**exécution spéculative** — utiliser le graphe de dépendances et l'analyse d'intention pour prédire et pré-exécuter les appels d'outils.

**Comparaison visuelle :**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FLUX TRADITIONNEL (Piloté par l'agent)                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Utilisateur : "Lire config.json et créer une issue GitHub avec version" │
│                                                                         │
│  t=0.0s ────► Agent réfléchit ──────────► [500ms] ──┐                  │
│               "Je dois d'abord lire le fichier"      │                  │
│                                                      │                  │
│  t=0.5s ────────────────────────────────────────────┴──► Exécute       │
│                                                           read_file     │
│                                                           [800ms]       │
│                                                              │          │
│  t=1.3s ────► Agent réfléchit ──────────► [200ms] ──────────┴──┐       │
│               "Parser JSON pour obtenir version"              │       │
│                                                               │       │
│  t=1.5s ──────────────────────────────────────────────────────┴─► Exec │
│                                                                  parse  │
│                                                                  [600ms]│
│                                                                     │   │
│  t=2.1s ────► Agent réfléchit ──────────► [150ms] ──────────────────┴─┐│
│               "Créer l'issue GitHub maintenant"                       ││
│                                                                       ││
│  t=2.25s ─────────────────────────────────────────────────────────────┴►
│                                                                  create │
│                                                                  [1.2s] │
│                                                                    │    │
│  t=3.45s ─────────────────────────────────────────────────────────┘    │
│                                            TERMINÉ                      │
│                                                                         │
│  Temps total : 3.45s                                                   │
│  - Réflexion agent : 850ms (25%)                                       │
│  - Exécution outils : 2,600ms (75%)                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  FLUX SPÉCULATIF (Piloté par la prédiction)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Utilisateur : "Lire config.json et créer une issue GitHub avec version" │
│                                                                         │
│  t=0.0s ────► Gateway prédit le DAG ─► [100ms] ──┐                     │
│               Confiance : 0.89 (élevée)            │                     │
│               DAG : read → parse → create          │                     │
│                                                   │                     │
│               ┌──────────────────────────────────┘                     │
│               │  L'EXÉCUTION SPÉCULATIVE DÉMARRE                       │
│               │  (pendant que l'agent réfléchit)                       │
│               ▼                                                        │
│  t=0.1s ────► Exécute read_file ─────► [800ms] ──┐                    │
│               (mis en cache pour plus tard)        │                    │
│                                                    │                    │
│               ┌─ Agent réfléchit ──────────────────┤                    │
│               │  [500ms en arrière-plan]           │                    │
│               │  "Je dois lire le fichier..."      │                    │
│               └────────────────────────────────────┘                    │
│                                                    │                    │
│  t=0.5s ─────► Agent : "Lis le fichier s'il te plaît" │                │
│                Gateway : "Déjà fait ! ✓"           │                    │
│                Retourne résultat caché ────────►[0ms - instantané]      │
│                                                                         │
│  t=0.9s ─────► Exécute json:parse ──────► [200ms] ──┐                 │
│                (spéculatif, sur données cachées)     │                 │
│                                                      │                 │
│                ┌─ Agent réfléchit ───────────────────┤                 │
│                │  [100ms en arrière-plan]             │                 │
│                │  "Parser pour obtenir version..."    │                 │
│                └──────────────────────────────────────┘                 │
│                                                      │                 │
│  t=1.0s ─────► Agent : "Parse s'il te plaît"        │                 │
│                Gateway : "Déjà fait ! ✓"             │                 │
│                Retourne résultat caché ────────►[0ms - instantané]      │
│                                                                         │
│  t=1.1s ─────► Agent : "Créer l'issue"                                │
│                Exécute github:create_issue ──► [400ms]                 │
│                (PAS spéculatif - a des effets de bord)   │             │
│                                                           │             │
│  t=1.5s ───────────────────────────────────────────────────┘            │
│                                            TERMINÉ                      │
│                                                                         │
│  Temps total : 1.5s                                                    │
│  - Overhead spéculatif : 100ms (prédiction DAG)                        │
│  - Computation gaspillée : 0ms (toutes les prédictions correctes)      │
│  - Temps économisé : 1.95s (réduction de 56%)                          │
│                                                                         │
│  🎯 Résultat : L'agent reçoit des réponses instantanées pour les étapes prédites │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Comment ça fonctionne : Le moteur de prédiction

L'exécution spéculative repose sur trois composants :

1. **GraphRAG** : La base de connaissances qui stocke les patterns de workflows historiques
2. **DAG Suggester** : Le système d'intelligence qui prédit quel DAG construire basé sur l'intention
3. **Speculative Executor** : Le moteur qui décide d'exécuter ou non le DAG prédit

**Calcul de confiance :**

```typescript
class SpeculativeExecutor {
  async processIntent(intent: string): Promise<ExecutionMode> {
    // Étape 1 : Utiliser GraphRAG pour prédire le workflow probable
    const predictedDAG = await this.dagSuggester.suggestWorkflow(intent);

    // Étape 2 : Calculer le score de confiance
    const confidence = this.calculateConfidence(predictedDAG, intent);

    // Étape 3 : Décider de la stratégie d'exécution basée sur la confiance
    if (confidence > 0.85) {
      // Haute confiance → Exécuter spéculativement
      const results = await this.dagExecutor.execute(predictedDAG);
      return { mode: "speculative", results, confidence };
    } else if (confidence > 0.65) {
      // Confiance moyenne → Suggérer le DAG, laisser l'agent décider
      return { mode: "suggestion", dagStructure: predictedDAG, confidence };
    } else {
      // Faible confiance → Requérir un workflow explicite
      return { mode: "explicit_required", confidence };
    }
  }

  private calculateConfidence(dag: DAGStructure, intent: string): number {
    // Facteurs affectant la confiance :
    // 1. Similarité sémantique entre intention et outils prédits
    // 2. Précision historique (intentions similaires ont-elles mené à ce DAG avant ?)
    // 3. Complexité du DAG (DAGs plus simples = confiance plus élevée)
    // 4. Ambiguïté des dépendances (dépendances claires = confiance plus élevée)

    let confidence = 0.5; // Base

    // Facteur 1 : Pertinence des outils
    const toolRelevance = this.measureToolRelevance(dag, intent);
    confidence += toolRelevance * 0.3;

    // Facteur 2 : Précision historique
    const historicalAccuracy = this.getHistoricalAccuracy(intent);
    confidence += historicalAccuracy * 0.2;

    // Facteur 3 : Bonus de simplicité
    if (dag.tasks.length <= 5) {
      confidence += 0.1;
    }

    // Facteur 4 : Certitude des dépendances
    const dependencyCertainty = this.analyzeDependencies(dag);
    confidence += dependencyCertainty * 0.15;

    return Math.min(confidence, 0.99); // Plafonné à 99%
  }
}
```

### Le trade-off risque-récompense

L'exécution spéculative est un pari :

✅ **Quand la prédiction est correcte (>85% confiance) :**
- Réduction massive de latence (5-10x plus rapide)
- Meilleure expérience utilisateur (réponses instantanées)
- Utilisation plus efficace du temps d'inactivité (exécuter pendant que l'agent réfléchit)

❌ **Quand la prédiction est incorrecte (<85% confiance) :**
- Computation gaspillée (exécuté des outils inutiles)
- Effets de bord potentiels (si les outils ne sont pas idempotents)
- Pollution du contexte (mauvais résultats dans le cache)

**Mécanismes de sécurité :**

```typescript
class SpeculativeExecutor {
  // Exécuter seulement les outils idempotents spéculativement
  private readonly SAFE_TOOLS = [
    "filesystem:read_file",      // ✅ Lecture seule
    "filesystem:list_directory", // ✅ Lecture seule
    "json:parse",                // ✅ Fonction pure
    "yaml:load",                 // ✅ Fonction pure
    "github:get_issue",          // ✅ API lecture seule
  ];

  private readonly UNSAFE_TOOLS = [
    "filesystem:write_file",     // ❌ Effets de bord
    "github:create_issue",       // ❌ Crée des ressources
    "database:execute",          // ❌ Mute l'état
    "slack:send_message",        // ❌ Actions externes
  ];

  canExecuteSpeculatively(task: Task): boolean {
    if (this.UNSAFE_TOOLS.includes(task.tool)) {
      return false;
    }

    // Outil inconnu → vérifier s'il semble sûr
    if (!this.SAFE_TOOLS.includes(task.tool)) {
      if (task.tool.includes("create") || task.tool.includes("delete")) {
        return false;
      }
    }

    return true;
  }
}
```

### Branches safe-to-fail : Le mariage parfait avec la spéculation

Les **tâches sandbox** sont idempotentes et isolées — elles peuvent échouer ou être jetées sans conséquences. Cela débloque une **spéculation aggressive** :

```typescript
// ✅ SÛR : Exécution spéculative avec branches sandbox

Intention utilisateur : "Analyser les commits et résumer les tendances"
Gateway prédit (confiance : 0.78) :
  1. fetch_commits (appel MCP)
  2. analyze_fast (sandbox) ← Sûr de spéculer
  3. analyze_ml (sandbox) ← Sûr de spéculer
  4. analyze_stats (sandbox) ← Sûr de spéculer

Gateway exécute spéculativement TOUTES les approches en parallèle :
→ Si prédictions fausses : Jeter les résultats (pas d'effets de bord)
→ Si prédictions correctes : L'agent obtient une analyse multi-perspective instantanée
→ Succès partiel : Garder ce qui a marché, ignorer les échecs

Résultat : Spéculation aggressive avec zéro risque
```

**Dégradation gracieuse :**

```typescript
// Exécution spéculative avec fallbacks intégrés

Scénario : "Analyse rapide nécessaire, mais complète si le temps le permet"

Gateway exécute spéculativement :
  t=0ms:  Lance analyse rapide (timeout : 300ms)
  t=0ms:  Lance analyse ML (timeout : 2000ms)
  t=0ms:  Lance analyse complète (pas de timeout)

Résultats possibles :
  • Toutes réussissent → Retourner résultats complets
  • ML timeout → Utiliser rapide + complète (gain partiel)
  • Seulement rapide réussit → Retourner analyse basique (dégradé mais fonctionnel)

L'agent obtient : Meilleurs résultats disponibles dans les contraintes de temps
Pas de rollback nécessaire : Les branches échouées sont juste ignorées
```

---

## Architecture unifiée : Tout ensemble

Ces quatre concepts ne sont pas mutuellement exclusifs — ce sont des couches complémentaires d'optimisation qui travaillent ensemble :

**1. Semantic Gateway** : Réduit le contexte de 15x en exposant uniquement les outils pertinents
**2. DAG Execution** : Accélère les workflows de 4-6x via la parallélisation
**3. Speculative Execution** : Élimine le temps de "réflexion" de l'agent pour 5-10x d'amélioration d'expérience
**4. Code Sandboxing** : Réduit le contexte de 100x+ pour les workloads lourds en données

**Performance combinée (benchmark réel) :**

```
Scénario : Traiter 50 fichiers JSON de config (total 2.1MB)
          Extraire les numéros de version
          Créer une issue GitHub avec résumé

┌─────────────────────┬──────────────┬─────────────┬──────────┐
│ Approche            │ Contexte     │ Temps total │ Succès   │
├─────────────────────┼──────────────┼─────────────┼──────────┤
│ MCP séquentiel      │ 187K tokens  │ 42.3s       │ ❌ Échec │
│ (baseline)          │ (>100% limit)│             │ (context)│
├─────────────────────┼──────────────┼─────────────┼──────────┤
│ Gateway seulement   │ 4.2K tokens  │ 42.3s       │ ✅ OK    │
│ (recherche sémantique)│             │             │ (lent)   │
├─────────────────────┼──────────────┼─────────────┼──────────┤
│ Gateway + DAG       │ 4.2K tokens  │ 8.7s        │ ✅ OK    │
│ (lectures parallèles)│             │             │          │
├─────────────────────┼──────────────┼─────────────┼──────────┤
│ Gateway + Sandbox   │ 1.8K tokens  │ 2.1s        │ ✅ OK    │
│ (traitement local)  │              │             │ (optimal)│
└─────────────────────┴──────────────┴─────────────┴──────────┘

Amélioration par rapport au baseline :
- Contexte : Réduction de 104x (187K → 1.8K)
- Vitesse : 20x plus rapide (42.3s → 2.1s)
```

L'insight clé : **ces optimisations se combinent multiplicativement, pas additivement**.

---

## Implications pour l'écosystème MCP

### Est-ce une nouvelle couche de protocole ?

Le pattern gateway est du **middleware**, pas un remplacement de protocole :

- ✅ Se positionne entre les LLMs et les serveurs MCP (comme nginx entre clients et backends)
- ✅ Compatible avec n'importe quel serveur MCP existant (zéro changement de code requis)
- ✅ Fournit l'optimisation sans changer le protocole MCP
- ✅ Peut être adopté incrémentalement (commencer avec 1 serveur, en ajouter plus)

**Analogie : Proxies HTTP**

Tout comme nginx fournit du caching, du load balancing, et de la terminaison SSL sans changer HTTP, les gateways MCP fournissent de l'optimisation de contexte, de l'orchestration, et du sandboxing sans changer MCP.

Le protocole reste simple. La complexité vit à un seul endroit (la gateway). Les serveurs restent stateless et focalisés.

### Ces concepts devraient-ils faire partie de la spec MCP ?

**Notre position :**

> "Ces concepts devraient rester dans la couche application (gateways, frameworks) pour l'instant. S'ils s'avèrent précieux à travers de multiples implémentations, les futures versions de MCP pourraient standardiser les interfaces. Mais une standardisation prématurée étoufferait l'innovation."

Le protocole MCP est jeune. Laissons mille fleurs fleurir. Standardisons les patterns qui se révèlent universellement utiles.

### Questions ouvertes pour la communauté

1. **Découverte de gateway** : Comment les clients MCP devraient-ils savoir qu'une gateway existe vs. des serveurs directs ?
2. **Sémantiques de cache** : MCP devrait-il avoir des headers cache-control de style HTTP ?
3. **Streaming de résultats partiels** : L'exécution DAG peut-elle streamer les résultats au fur et à mesure que les couches se terminent ?
4. **Frontières de sécurité** : Qui est responsable du sandboxing ?
5. **Gestion des erreurs dans les DAGs** : Que se passe-t-il quand une tâche échoue en milieu de workflow ?
6. **Observabilité** : Comment débugger les comportements complexes de gateway ?

Nous n'avons pas toutes les réponses. Ce sont des domaines pour l'expérimentation communautaire et l'éventuelle standardisation.

---

## Prior Art et inspirations

Ces concepts architecturaux n'ont pas émergé dans le vide. AgentCards s'appuie sur le travail pionnier de la communauté des agents IA et MCP :

**LLMCompiler** : A introduit l'idée de traiter les workflows d'agents comme des graphes de computation avec appels de fonction parallèles

**AIRIS** : Un des premiers gateways MCP à tenter l'optimisation de contexte et la consolidation multi-serveurs

**Article d'Anthropic sur l'exécution de code** : A démontré comment l'exécution de code résout les problèmes réels d'agents (réduction de contexte de 98.7%, préservation de la vie privée)

**Notre contribution est la synthèse** : Combiner semantic gateways + exécution DAG + prédiction spéculative + sandboxing de code dans une **couche d'optimisation MCP unifiée** qui fonctionne avec n'importe quel serveur MCP existant.

C'est l'intégration qui crée de la valeur — chaque concept amplifie les autres.

---

## Conclusion

Le Model Context Protocol permet la composabilité. Des centaines de serveurs MCP peuvent maintenant connecter les agents IA au monde.

Mais la composabilité sans optimisation mène à la saturation du contexte, des goulots d'étranglement séquentiels, et du ballonnement des données intermédiaires. À 15+ serveurs MCP, le modèle de connexion directe s'effondre.

Dans cette série de deux articles, nous avons exploré quatre concepts architecturaux pour adresser ces limitations :

1. **Semantic Gateway Pattern** — Réduction de contexte de 15x
2. **DAG-Based Parallel Execution** — Réduction de latence de 4-6x
3. **Speculative Execution** — Expérience utilisateur 5-10x plus rapide
4. **Agent Code Sandboxing** — Réduction de contexte de 100x+ pour les workloads lourds

Ces concepts transforment la gateway d'un simple routeur en un **système d'orchestration intelligent** qui :
- Travaille en avance sur l'agent (spéculatif)
- Essaye multiples approches (résilient)
- Opère dans des environnements isolés (sûr)
- Retourne seulement les résultats essentiels (contexte-efficace)
- Dégrade gracieusement en cas d'échec (robuste)

### La vision

Imaginez un futur où :
- Une seule configuration MCP contient 50+ serveurs sans saturation de contexte
- Les workflows multi-outils s'exécutent en latence sub-seconde via parallélisation et prédiction intelligentes
- Les résultats apparaissent instantanément quand les agents prédisent correctement (90%+ de précision avec apprentissage historique)
- Les agents traitent des datasets de plusieurs gigaoctets localement, retournant seulement des insights au contexte
- Tout cela fonctionne avec les serveurs MCP existants, aucun changement de code requis

C'est ce que ces concepts permettent.

### Essayez par vous-même

AgentCards implémente ces quatre concepts en open-source. Rejoignez-nous pour construire la couche d'optimisation qui rend les workflows d'agents à grande échelle pratiques.

---

**À propos d'AgentCards** : AgentCards est une exploration open-source de patterns architecturaux avancés pour les agents MCP. Le code complet et les benchmarks sont disponibles sur GitHub.

**Questions ou feedback ?** Nous serions ravis d'entendre vos retours sur ces concepts. Ces patterns devraient-ils faire partie du protocole MCP lui-même ? Contactez-nous sur notre dépôt GitHub.
