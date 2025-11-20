# MCP Gateway Architecture (Part 3): Code Sandboxing + MCP Tools Injection

**Auteur:** Erwan Lee Pesle
**Date:** Novembre 2025
**Série:** MCP Gateway Architecture

---

## Le problème de l'inflation du contexte

Les workflows MCP actuels souffrent d'un problème fondamental : **les résultats intermédiaires gonflent le contexte**.

**Exemple concret :**

Vous demandez : "Analyser les commits de la semaine dernière dans le repo foo"

**Approche tool calls traditionnelle :**
```
Tour 1 : Agent → "Liste les commits"
        Tool → Retourne 1000 commits
        Contexte reçoit : 1000 commits × 500 tokens = 500,000 tokens

Tour 2 : Agent → "Filtre ceux de la semaine dernière"
        Agent analyse les 1000 commits en contexte
        Résultat : 47 commits pertinents

Tour 3 : Agent → "Résume par auteur"
        Génère résumé final
```

**Problème :**
- 3-5 tours LLM nécessaires
- 500K tokens saturent le contexte
- Latence élevée (chaque tour = 1-2s)
- Coût proportionnel aux données brutes

**Et si on pouvait traiter tout ça localement ?**

---

## Anthropic Code Execution : L'Approche Filesystem

Anthropic a récemment proposé une solution élégante : présenter les MCP servers comme des **APIs code** via une structure filesystem.

**Leur approche :**
```typescript
// Structure filesystem
servers/
├── google-drive/
│   ├── getDocument.ts
│   └── index.ts
└── github/
    ├── listCommits.ts
    └── index.ts

// L'agent explore et appelle
import { listCommits } from './servers/github';
const commits = await listCommits({ repo: 'foo' });
```

**Avantages :**
- Contrôle de flux naturel (boucles, conditions)
- Réduction de contexte massive (98.7% dans leurs tests)
- Accès aux MCP servers via imports

**Leur paradigme :**

MCP servers exposés comme **fichiers TypeScript** que l'agent découvre et importe.

**Note importante :** L'article d'Anthropic mentionne "progressive tool loading" mais ne détaille pas le mécanisme exact de découverte des tools. Plusieurs approches sont possibles (exploration filesystem, index préchargé, etc.), mais le détail d'implémentation n'est pas spécifié.

---

## Casys : L'Approche Direct Injection

Casys et Anthropic partagent le même objectif (code execution avec accès MCP), mais avec des **paradigmes différents**.

### Comment ça marche (Story 3.2)

Le **Context Builder** injecte les tools MCP comme fonctions TypeScript accessibles dans le sandbox :

```typescript
// Le Context Builder génère ceci :
const github = {
  listCommits: async (args) => {
    // Appelle le MCP server via la gateway
    return await mcpClient.callTool('list_commits', args);
  },
  createIssue: async (args) => {
    return await mcpClient.callTool('create_issue', args);
  }
};

// Injecté dans le sandbox avec le code de l'agent
const userCode = `
  ${injectedTools}  // github, filesystem, etc.

  ${agentGeneratedCode}  // Le code que l'agent a écrit
`;
```

### Paradigme Casys : Injection Directe

**Au lieu de filesystem imports :**
```typescript
// L'agent génère ce code (s'exécute dans le sandbox)
const commits = await github.listCommits({
  repo: 'foo',
  count: 1000
});

const lastWeek = commits.filter(c => {
  const date = new Date(c.date);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  return date > weekAgo;
});

const byAuthor = lastWeek.reduce((acc, c) => {
  acc[c.author] = (acc[c.author] || 0) + 1;
  return acc;
}, {});

const top5 = Object.entries(byAuthor)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([author, count]) => ({ author, count }));

return top5;
// Retourne : [
//   { author: "alice", count: 12 },
//   { author: "bob", count: 8 },
//   ...
// ]
```

**Impact :**
- **1 tour LLM** au lieu de 3-5
- **500 tokens** retournés au lieu de 500,000 (réduction 1000x)
- **Temps total : 2.1s** au lieu de 8-12s (tool calls multiples)

---

## Architecture Technique

### Sandbox Deno Sécurisé (Story 3.1)

Le sandbox utilise Deno pour son **modèle de sécurité basé sur les capacités** :

**Deny-by-default :**
```bash
deno run \
  --allow-read=/workspace/codebase  # Seulement ce dossier
  --deny-write                      # Pas d'écriture
  --deny-net                        # Pas de réseau (sauf si LLM)
  --deny-run                        # Pas de subprocess
  --deny-ffi                        # Pas de code natif
  --deny-env                        # Pas d'accès env
  sandbox_code.ts
```

**Sécurité multicouche :**
- Niveau 1 : Isolation processus OS (subprocess séparé, mémoire isolée)
- Niveau 2 : Permissions Deno granulaires (path-by-path, domain-by-domain)
- Niveau 3 : Limites de ressources (4GB RAM max, timeout 30s)
- Niveau 4 : Validation entrées/sorties (JSON-only, sanitization des paths)

**Performance mesurée :**
- Sandbox startup : **34ms** (target 100ms) ✅
- Execution overhead : **33ms** (target 50ms) ✅
- Total pour code simple : **67ms** (cible <150ms)

### MCP Tools Injection (Story 3.2)

**Vector Search pour injection intelligente :**

Au lieu d'injecter TOUS les tools (saturation), on utilise la recherche vectorielle pour identifier les tools pertinents :

```
Intent utilisateur : "Analyser commits GitHub et créer issue"
  ↓ Vector search (similarity > 0.6)
  ↓ Top-5 tools :
    - github.listCommits (0.94)
    - github.createIssue (0.89)
    - text.summarize (0.81)
    - ...
  ↓ Injecte SEULEMENT ces 5 tools
```

**Résultat :** Contexte minimal, seulement les tools nécessaires.

**Type Safety :**

Les tools injectés sont typés avec TypeScript :

```typescript
// Généré automatiquement depuis MCP schema
interface GitHubTools {
  listCommits(args: {
    repo: string;
    count?: number;
  }): Promise<Commit[]>;

  createIssue(args: {
    repo: string;
    title: string;
    body: string;
  }): Promise<Issue>;
}
```

L'agent génère du code **type-safe** avec autocomplete support.

---

## Cas d'Usage : Pipeline de Données (Story 3.3)

### Scénario : Analyse de 1000 Commits

**Objectif :** Identifier les auteurs les plus actifs de la semaine dernière

**Approche traditionnelle (tool calls) :**
```
Tour 1 : List 1000 commits → 500K tokens
Tour 2 : Filter last week → Agent raisonne sur 1000 commits
Tour 3 : Group by author → Agent agrège
Tour 4 : Sort & format → Agent formatte
Résultat : 4 tours LLM, 12s total, 500K+ tokens
```

**Approche Casys (code + MCP tools) :**
```typescript
// UN SEUL tour LLM, code généré :
const commits = await github.listCommits({ repo: 'foo', count: 1000 });
const lastWeek = commits.filter(c => isLastWeek(c.date));
const byAuthor = groupBy(lastWeek, 'author');
const top5 = sortByCount(byAuthor).slice(0, 5);
return top5;

// Résultat : 1 tour LLM, 2.1s total, 500 tokens
```

**Gains mesurés :**
- Tours LLM : 4 → 1 (75% réduction)
- Temps total : 12s → 2.1s (5.7x speedup)
- Contexte utilisé : 500K → 500 tokens (1000x réduction)

### Scénario : Analyse Multi-Format

**Objectif :** Traiter un dossier avec JSON, CSV, XML

**Approche traditionnelle :**
```
Tour 1 : List files
Tour 2 : Detect formats
Tour 3 : Parse JSON files
Tour 4 : Parse CSV files
Tour 5 : Parse XML files
Tour 6 : Merge results
Total : 6 tours LLM
```

**Approche Casys :**
```typescript
const files = await filesystem.listDirectory('/data');

const results = await Promise.all(
  files.map(async (file) => {
    if (file.endsWith('.json')) {
      return JSON.parse(await filesystem.readFile(file));
    } else if (file.endsWith('.csv')) {
      return parseCSV(await filesystem.readFile(file));
    } else if (file.endsWith('.xml')) {
      return parseXML(await filesystem.readFile(file));
    }
  })
);

return mergeResults(results);
// Total : 1 tour LLM
```

**Gain : 6 tours → 1 tour (83% réduction)**

---

## Positionnement : Casys vs Anthropic

| Aspect | Anthropic Code Execution | Casys Code Sandboxing |
|--------|-------------------------|----------------------|
| **Code execution** | ✅ Sandbox | ✅ Sandbox Deno |
| **Accès MCP tools** | ✅ Filesystem imports | ✅ Direct injection |
| **Tool discovery** | ⚠️ Non spécifié dans l'article | ✅ Vector search (similarity) |
| **Paradigme** | `import { listCommits } from './servers/github'` | `const commits = await github.listCommits()` |
| **Type safety** | ✅ TypeScript files | ✅ Generated TypeScript types |
| **Sécurité** | ✅ Sandbox (à implémenter) | ✅ Deno permissions granulaires |
| **Combine avec Adaptive Loops** | ❌ Non | ✅ Oui (AIL/HIL replanning) |

**Différences clés :**

**Anthropic :** Structure filesystem explicite. L'agent explore `./servers/` et importe les tools comme des modules. Le mécanisme de découverte n'est pas détaillé dans leur article.

**Casys :** Injection directe dans le contexte. **Vector search intelligent** identifie les tools pertinents (similarity > 0.6), qui sont injectés comme fonctions disponibles globalement. Seuls les top-k tools pertinents sont injectés, évitant la saturation du contexte.

**Les deux approches** permettent au code d'accéder aux MCP servers, mais **Casys ajoute** :
- ✅ Vector search intelligent (top-k tools pertinents)
- ✅ Intégration avec Adaptive Loops (replanning dynamique)
- ✅ GraphRAG meta-learning
- ✅ Implémentation sécurité Deno production-ready

---

## Benchmarks de Performance

Tests réalisés sur MacBook Pro M2 (16GB RAM) :

### Sandbox Startup & Overhead

```
Simple code execution (return 1 + 1) :
  Startup : 34.77ms (target <100ms) ✅
  Execution : 33.22ms (target <50ms) ✅
  Total : 67.99ms

Speedup vs target : 2.2x mieux que requis
```

### Data Processing Pipeline

```
Scénario : 1000 GitHub commits processing

Approche séquentielle (tool calls) :
  List commits : 2.3s
  Filter (agent raisonne) : 3.4s
  Aggregate (agent calcule) : 2.1s
  Format : 0.8s
  Total : 8.6s

Approche Casys (code + MCP tools) :
  Code execution (tout en une fois) : 2.1s
  Total : 2.1s

Speedup : 4.1x plus rapide
```

### Context Reduction

```
Dataset : 1000 commits (1.2MB JSON)

Tool calls approach :
  Input : 1.2MB (600K tokens)
  Output : 5KB résumé (2.5K tokens)
  Réduction : 99.6%
  Mais : 600K tokens passent par le contexte

Casys approach :
  Input : Code (200 tokens)
  Processing : Local (0 tokens contexte)
  Output : 5KB résumé (2.5K tokens)
  Contexte total utilisé : 2.7K tokens

Réduction effective : 99.55% (600K → 2.7K)
```

---

## Sécurité : Défense en Profondeur

### Tests d'Isolation (65 tests passés)

**Filesystem access :**
```typescript
// ❌ Tentative lecture /etc/passwd
await Deno.readFile('/etc/passwd');
// Error: PermissionDenied

// ✅ Lecture autorisée
await Deno.readFile('/workspace/codebase/config.json');
// Success (path whitelisted)
```

**Network access :**
```typescript
// ❌ Tentative fetch non autorisé
await fetch('https://evil.com');
// Error: PermissionDenied

// ✅ Appel MCP tool autorisé (via gateway)
await github.listCommits({ repo: 'foo' });
// Success (routed via MCP gateway)
```

**Subprocess spawning :**
```typescript
// ❌ Tentative spawn subprocess
new Deno.Command('rm', { args: ['-rf', '/'] });
// Error: PermissionDenied
```

**Toutes les tentatives de contournement bloquées** : 15/15 tests d'isolation passés.

---

## Exemples de Code Réels

### Exemple 1 : Agrégation de Données

```typescript
// L'agent génère ce code pour analyser des logs
const logs = await filesystem.readFile('/var/log/app.log');
const lines = logs.split('\n');

const errorsByType = lines
  .filter(line => line.includes('ERROR'))
  .reduce((acc, line) => {
    const type = line.match(/ERROR: (\w+)/)?.[1] || 'Unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

const sorted = Object.entries(errorsByType)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

return {
  total_errors: lines.filter(l => l.includes('ERROR')).length,
  top_10_types: sorted.map(([type, count]) => ({ type, count }))
};

// Input : 10MB de logs
// Output : 500 bytes résumé
// Réduction : 99.995%
```

### Exemple 2 : Workflow Multi-Source

```typescript
// Combiner données de plusieurs sources
const [commits, issues, prs] = await Promise.all([
  github.listCommits({ repo: 'foo', since: '2024-01-01' }),
  github.listIssues({ repo: 'foo', state: 'closed' }),
  github.listPullRequests({ repo: 'foo', state: 'merged' })
]);

const activity = {
  commits: commits.length,
  issues_closed: issues.length,
  prs_merged: prs.length,
  top_contributors: getTopContributors(commits, prs)
};

return activity;

// 3 appels parallèles au lieu de 3 tours séquentiels
// Speedup : 3x
```

---

## Limitations et Trade-offs

### Quand utiliser Code Sandboxing

**✅ Excellent pour :**
- Datasets volumineux (1MB+) → résumé (<1KB)
- Transformations multi-étapes sur mêmes données
- Logique de filtrage/agrégation complexe
- Workflows nécessitant plusieurs tools MCP
- Données sensibles (traitement local, retour agrégats)

**❌ Pas optimal pour :**
- Opérations simples (lire 1 fichier)
- Tâches nécessitant raisonnement sémantique complexe
- Workflows où l'agent doit décider de la stratégie

### Complémentarité avec Adaptive Loops

Le code sandboxing fonctionne **en synergie** avec les adaptive loops :

```
Agent découvre dataset volumineux
  ↓ Adaptive Loop (AIL) décide :
  "Utiliser code execution pour traiter localement"
  ↓ Génère code avec MCP tools
  ↓ Sandbox exécute
  ↓ Retourne résumé
  ↓ Loop 3 (Meta-Learning) apprend :
  "Dataset >1MB → code execution optimal"
```

---

## Conclusion

Le code sandboxing d'Anthropic a introduit un paradigme puissant : exécuter du code généré dans un environnement isolé pour réduire le contexte.

**Casys pousse ce concept plus loin** en permettant au code d'accéder aux MCP tools directement :

- **Moins de tours LLM** : Fetch + process en une seule exécution (3-5 tours → 1)
- **Réduction de contexte massive** : >99% pour data-heavy workloads
- **Workflows complets** : Accès à filesystem, GitHub, databases depuis le code
- **Type-safe** : TypeScript types générés automatiquement
- **Sécurisé** : Permissions Deno granulaires, isolation OS

Le résultat : des workflows MCP qui traitent des données volumineuses efficacement, sans saturer le contexte, tout en maintenant la sécurité.

---

---

**À propos de cette série :**
- **Part 1:** [Semantic Discovery and Parallel Execution](https://www.linkedin.com/pulse/mcp-gateway-architecture-part-1-semantic-discovery-erwan-lee-pesle-kiczf/)
- **Part 2:** [Adaptive Workflows with AIL/HIL](#) (publié)
- **Part 3:** Code Sandboxing + MCP Tools Injection (cet article)

**À propos de Casys MCP Gateway** : Casys est une plateforme d'orchestration intelligente pour agents MCP, combinant code sandboxing sécurisé, MCP tools injection, et adaptive feedback loops. Open source bientôt.
