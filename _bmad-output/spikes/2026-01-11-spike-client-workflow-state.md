# Spike: Client Workflow State Management

**Date:** 2026-01-11
**Author:** Claude + Erwan
**Status:** In Progress
**Epic:** 14 (JSR Package Local/Cloud MCP Routing)
**Stories impactées:** 14.3b, 14.4, 14.6

---

## Contexte du problème

Lors des tests du package PML, on a découvert que le flow `continue_workflow` pour l'installation dynamique de dépendances MCP ne fonctionne pas.

### Symptôme observé

```
1. pml:execute avec mcp.filesystem.read_file()
2. → Serveur retourne execute_locally (car filesystem = client tool)
3. → Client exécute, détecte que filesystem MCP pas installé
4. → Client retourne approval_required avec workflow_id généré
5. → Claude approuve avec continue_workflow: { workflow_id, approved: true }
6. → Client forward au serveur cloud
7. → Serveur: "workflow not found" → result: null
8. → Rien ne se passe, re-demande l'installation au prochain appel
```

### Cause racine

Le `workflow_id` est généré côté client (ligne 260 de `stdio-command.ts`) mais :
- N'est **pas stocké** côté client
- Est **envoyé au serveur** qui ne le connaît pas
- Le serveur cherche dans `workflowRepo` → null

---

## Question clé

> **Le client a-t-il besoin de gérer plusieurs workflows en parallèle ?**

### Analyse des scénarios

#### Scénario 1: Un seul tool call à la fois (Claude Code standard)

Claude Code envoie généralement **un seul** `pml:execute` à la fois, attend la réponse, puis continue.

```
Claude → pml:execute(code1) → approval_required → continue_workflow → result
Claude → pml:execute(code2) → ...
```

**Dans ce cas :** Un seul workflow actif suffit. Pas besoin de Map.

#### Scénario 2: Tool calls parallèles (batch mode)

Claude pourrait théoriquement envoyer plusieurs appels en parallèle :

```
Claude → pml:execute(code1) ─┐
Claude → pml:execute(code2) ─┼→ 2 approval_required avec workflow_ids différents
Claude → pml:execute(code3) ─┘
```

**Question :** Est-ce que ça arrive vraiment ?

- **pml:execute** est appelé via MCP stdio qui est **séquentiel** (JSON-RPC sur stdin)
- Même si Claude envoie 3 appels "en parallèle", ils sont traités **un par un**
- Le premier qui retourne `approval_required` **bloque** la suite

**Conclusion :** En pratique, on a **au plus 1 workflow en attente** pour les dépendances.

#### Scénario 3: Approbations multiples (API keys + dépendances)

Un même code pourrait déclencher plusieurs approbations :

```
code: await mcp.filesystem.read_file() → mcp.tavily.search()

1. approval_required: filesystem (dependency)
2. continue_workflow → installe filesystem
3. approval_required: tavily (api_key_required)
4. continue_workflow → recharge .env
5. success
```

**Dans ce cas :** C'est séquentiel. Un seul workflow actif à la fois.

---

## Options de design

### Option A: Stateless (pas de stockage)

Le client ne stocke rien. À chaque `continue_workflow`, on ré-analyse le contexte.

```typescript
// Pas de Map, pas de state
// Le continue_workflow ré-exécute tout avec flag "approved"
```

**Problème :** Comment savoir quel code ré-exécuter ?

**Solution possible :** Le client renvoie le `code` original dans le `continue_workflow` context.

```json
{
  "status": "approval_required",
  "workflow_id": "uuid",
  "context": {
    "code": "await mcp.filesystem.read_file(...)",  // ← Le code original
    "dependency": { "name": "filesystem", ... }
  }
}
```

Quand `continue_workflow` arrive, le context contient déjà tout. Pas besoin de stocker.

**Avantages:**
- Zéro état côté client
- Pas de race conditions
- Pas de memory leaks
- Workflow_id devient optionnel (juste pour tracking)

**Inconvénients:**
- Le code voyage dans les messages (déjà le cas avec execute_locally)
- Claude doit renvoyer le context (il le fait déjà)

### Option B: Map simple

```typescript
const pendingWorkflows = new Map<string, PendingWorkflow>();

// TTL de 5 minutes pour éviter memory leaks
setTimeout(() => pendingWorkflows.delete(id), 5 * 60 * 1000);
```

**Avantages:**
- Pattern classique
- Workflow_id a un sens

**Inconvénients:**
- État à gérer
- TTL à gérer
- Cas de process restart (perte de state)

### Option C: Pas de workflow_id du tout

Le client gère tout de manière synchrone. Pas besoin de `continue_workflow` côté client.

```typescript
// Quand approval_required, on attend directement la réponse MCP
// Le "continue" est juste le prochain message MCP

// Premier appel
pml:execute → approval_required: { needs_install: "filesystem" }

// Claude voit et demande à l'utilisateur (via UI natif)
// L'utilisateur clique "Install" dans Claude UI

// Deuxième appel (Claude renvoie automatiquement)
pml:execute → (client installe au vol) → success
```

**Problème :** MCP n'a pas de mécanisme natif pour ça. Le `approval_required` est un pattern PML, pas MCP.

---

## Recommandation

### Option B (Stateful Map) est la bonne approche

**Pourquoi ?** MCP stdio est **stateful par design** :
- Processus persistant tant que Claude Code tourne
- Connexion stdin/stdout maintenue
- Si le process meurt, la connexion MCP meurt aussi → cohérent

**Avantages :**
1. **Cohérent avec MCP** : Profite du stateful natif
2. **Moins de payload** : Pas besoin de renvoyer le code dans les messages
3. **Workflow_id a un sens** : C'est une vraie clé de lookup
4. **Simple** : Une Map en mémoire suffit

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    stdio-command.ts                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │           PendingWorkflowStore                    │   │
│  │                                                   │   │
│  │  Map<workflowId, {                               │   │
│  │    code: string,                                 │   │
│  │    toolId: string,                               │   │
│  │    dependency: McpDependency,                    │   │
│  │    createdAt: number                             │   │
│  │  }>                                              │   │
│  │                                                   │   │
│  │  + create(code, toolId, dep) → workflowId        │   │
│  │  + get(workflowId) → PendingWorkflow | null      │   │
│  │  + delete(workflowId)                            │   │
│  │  + cleanup() // TTL 5min                         │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Flow:                                                   │
│  1. pml:execute → executeLocalCode → approval_required  │
│  2. store.create(code, toolId, dep) → workflowId        │
│  3. return { approval_required, workflow_id }            │
│  4. continue_workflow arrives                            │
│  5. store.get(workflow_id) → pending                     │
│  6. if approved: install + re-execute                    │
│  7. store.delete(workflow_id)                            │
└─────────────────────────────────────────────────────────┘
```

### Changements requis

1. **Créer `PendingWorkflowStore`** : Classe simple avec Map + TTL

```typescript
// packages/pml/src/workflow/pending-store.ts

export interface PendingWorkflow {
  code: string;
  toolId: string;
  dependency: McpDependency;
  createdAt: number;
}

export class PendingWorkflowStore {
  private workflows = new Map<string, PendingWorkflow>();
  private readonly ttlMs = 5 * 60 * 1000; // 5 minutes

  create(code: string, toolId: string, dependency: McpDependency): string {
    this.cleanup(); // Nettoie les expirés
    const id = crypto.randomUUID();
    this.workflows.set(id, { code, toolId, dependency, createdAt: Date.now() });
    return id;
  }

  get(id: string): PendingWorkflow | null {
    const workflow = this.workflows.get(id);
    if (!workflow) return null;
    if (Date.now() - workflow.createdAt > this.ttlMs) {
      this.workflows.delete(id);
      return null;
    }
    return workflow;
  }

  delete(id: string): void {
    this.workflows.delete(id);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, wf] of this.workflows) {
      if (now - wf.createdAt > this.ttlMs) {
        this.workflows.delete(id);
      }
    }
  }
}
```

2. **Modifier `stdio-command.ts`** : Utiliser le store

3. **Intercepter continue_workflow AVANT d'envoyer au cloud** : Si c'est un workflow local, le traiter localement

---

## Questions ouvertes

1. **Taille du code dans context** : Le code peut être long. Est-ce un problème ?
   - Réponse probable : Non, le code est déjà passé dans execute_locally

2. **Sécurité** : Le code qui revient est-il le même que celui envoyé ?
   - Le workflow_id peut servir de vérification (hash du code)
   - Ou faire confiance au transport MCP

3. **Multiple dépendances** : Si le code a besoin de 2 MCPs à installer ?
   - Réponse : On les traite un par un (séquentiel)
   - Chaque `continue_workflow` installe 1 dépendance et re-exécute
   - Si une 2e dépendance manque → nouvelle `approval_required`

---

## Prochaines étapes

- [ ] Valider l'approche avec l'équipe
- [ ] Implémenter Option A (stateless)
- [ ] Tester le flow complet : install → execute → success
- [ ] Vérifier que les tests E2E passent

---

## Annexe: Code actuel problématique

```typescript
// packages/pml/src/cli/stdio-command.ts:256-271

// Handle dependency approval
const data = {
  status: "approval_required",
  approval_type: "dependency",
  workflow_id: crypto.randomUUID(),  // ← Généré mais jamais stocké
  description: approvalResult.description,
  context: {
    tool: toolName,
    dependency: {
      name: approvalResult.dependency.name,
      version: approvalResult.dependency.version,
      install: approvalResult.dependency.install,
    },
    // code: ← MANQUE LE CODE ORIGINAL
  },
  options: ["continue", "abort", "replan"],
};
```
