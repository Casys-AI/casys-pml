# Trace Compiler — OpenClaw → VaultExec

> Statut : **exploration / design** — pas encore implémenté.

## Vision

Transformer les traces d'exécution OpenClaw (sessions JSONL) en notes Markdown
visualisables dans Obsidian, structurées pour VaultExec.

## Phase 1 — Extraction + visualisation (MVP)

### Source

Les sessions OpenClaw sont stockées en JSONL :
`~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`

### Types d'events exploitables

| Event JSONL | Utilité |
|---|---|
| `type: "session"` | Métadonnées session (id, timestamp, cwd) |
| `type: "model_change"` | Quel modèle utilisé |
| `type: "message"` + `role: "user"` | Intention utilisateur (input) |
| `type: "message"` + `role: "assistant"` + `thinking` | Signal sémantique (label, plan) |
| `type: "message"` + `role: "assistant"` + `toolCall` | Action concrète (outil + args) |
| `type: "message"` + `role: "toolResult"` | Résultat (toolName, content, isError) |

### Pipeline MVP

```
sessions/*.jsonl
    ↓ extracteur (Deno/Python)
    ↓ filtre + groupement par "turn" (user → chain of tools → response)
    ↓ génération markdown
    ↓
vault/traces/YYYY-MM-DD-<session-short-id>.md
```

### Décisions de design

#### Granularité des nœuds

**1 nœud = 1 outil dédupliqué** (clé = tool name seul).

Les différents payloads d'arguments sont stockés comme **itérations** sous le même nœud.
Les arguments ne font PAS partie de la clé de déduplication (ils sont toujours différents).

```
Nœud: web_search
  ├── invocation 1: {query: "n8n RBAC"} → résultat A (session-abc)
  ├── invocation 2: {query: "Hostinger version"} → résultat B (session-def)
  └── invocation 3: {query: "agent trace"} → résultat C (session-ghi)
```

Sub-clustering optionnel (phase 2) : distinguer args de config vs args utilisateur.

#### Raisonnement = nœud parent (sous-graphe)

Le thinking/planning n'est PAS une simple métadonnée.
Quand l'agent planifie une chaîne, ça engendre un **sous-graphe** de tool calls.

```
Nœud planning: "review PR #33924"
  └── sous-graphe:
      exec(gh pr view) → exec(gh api) → read(file) → edit(file) → exec(git push)
```

Le raisonnement est donc un **nœud parent** dont les enfants sont les tool calls.
C'est le lien structurel entre intention et exécution.

#### Liens cross-session

Émergent naturellement : deux sessions qui appellent le même outil convergent
vers le même nœud. Les chemins (séquences de nœuds) se recoupent entre sessions.

#### Structure d'une note turn

```markdown
---
vault-exec:
  type: trace
  session: <session-id>
  turn: <turn-index>
  timestamp: <ISO>
  agent: <agent-id>
  model: <model-id>
  intent_label: "<extrait du thinking ou résumé>"
  tools_used: ["web_search", "exec", "read"]
  success: true|false
---

# Turn <N> — <intent_label>

## Intention utilisateur
> <message user>

## Chaîne d'exécution

### 1. <tool_name>
**Args:**
```json
{ ... }
```
**Résultat:** (succès|erreur)
> <résumé résultat>

### 2. <tool_name>
...

## Réponse agent
> <message assistant final>

## Liens
- Session: [[<session-note>]]
- Précédent: [[<turn-N-1>]]
- Suivant: [[<turn-N+1>]]
```

#### Liens Obsidian (wikilinks)

- `[[session-YYYY-MM-DD-<id>]]` → note index de la session
- `[[turn-N]]` → chaînage temporel
- `[[tool:<tool_name>]]` → index par outil (optionnel, phase 2)

#### Stockage KV

Si on veut indexer pour le routing GRU ultérieur :
- clé : `trace:<session-id>:<turn-index>`
- valeur : `{ intent, tools, args_hash, success, timestamp }`

Mais KV = phase 2. MVP = juste les notes markdown.

### Format de sortie minimal (MVP)

```
vault/
  tools/
    web_search.md                    ← 1 note par outil (dédupliqué)
    exec.md
    read.md
    edit.md
    message.md
  sessions/
    2026-03-05-<short-id>.md         ← index session (liens vers tools)
  plans/
    review-pr-33924.md               ← nœud planning (sous-graphe)
```

Nommage des nœuds : pas important au MVP. Clé = tool name.

## Phase 2 — Pattern detection (post-MVP)

- Identifier les séquences de tools récurrentes
- Proposer des nœuds VaultExec candidats
- Validation humaine avant cristallisation
- Stockage KV pour routing

## Phase 3 — Replay / exécution

- Nœuds cristallisés deviennent exécutables
- Intent matching → DAG déterministe
- Fallback exploration si pattern inconnu

## Contraintes

- **Isolation client** : ne jamais mélanger les traces inter-agents/clients
- **Thinking** : signal sémantique uniquement (labeling), pas source d'exécution
- **Thinking chiffré** : certains providers encryptent le thinking → fallback sur tool chain pour le label
- **Volume** : une session peut faire 400+ lignes JSONL → filtrer les events non-message
