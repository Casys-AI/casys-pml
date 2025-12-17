# What is a Capability?

> Reusable code patterns learned from execution

## En bref

Imaginez que vous apprenez a cuisiner. La premiere fois que vous reussissez un plat, vous notez la recette dans un carnet. La prochaine fois que vous voulez le meme plat, vous consultez simplement votre carnet au lieu de recommencer de zero.

Une capability fonctionne exactement ainsi : c'est une "recette de code" que PML enregistre automatiquement chaque fois qu'une tache reussit. Quand vous demandez quelque chose de similaire plus tard, PML peut reutiliser cette recette au lieu de tout reconstruire.

**Exemple concret :** Vous demandez a PML de "lire un fichier JSON et en extraire le champ email". PML execute le code, ca fonctionne, et hop - cette solution est sauvegardee comme une capability. La semaine suivante, quand vous demandez "extraire le nom d'un fichier JSON", PML reconnait le pattern et propose d'adapter la recette existante.

## Definition

A **capability** is a piece of code that PML has learned from successful execution. It represents a complete solution to a problem, ready to be reused.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Capability                                  │
│                                                                  │
│  Intent: "Read JSON file and extract field"                     │
│                                                                  │
│  Tools Used: [read_file, parse_json]                            │
│                                                                  │
│  Code Pattern: Stored for reuse                                  │
│                                                                  │
│  Success Rate: 95%                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Think of capabilities as **recipes** - tried and tested solutions that worked before and will work again.

## Capability vs Tool

Understanding the difference is key:

| Aspect | Tool | Capability |
|--------|------|------------|
| **Source** | MCP servers | Learned from execution |
| **Scope** | Single operation | Complete workflow |
| **Parameters** | Fixed schema | Inferred from usage |
| **Complexity** | Atomic | Composite |

### Example

```
Tool: read_file
  → Reads one file from disk

Capability: file_to_issue
  → Reads a file
  → Extracts error information
  → Creates GitHub issue with details
```

A capability **orchestrates** multiple tools to accomplish a goal.

### Exemple de la vie quotidienne

Pensez a la difference entre :
- **Un outil** : Un marteau (fait une seule chose)
- **Une capability** : "Accrocher un tableau au mur" (prendre le marteau, trouver un clou, mesurer la hauteur, taper le clou, accrocher le tableau)

La capability encapsule toute la sequence d'actions, pas juste l'outil individuel.

## Benefices pour vous

| Benefice | Ce que ca signifie |
|----------|-------------------|
| **Gain de temps** | Les taches repetitives deviennent instantanees |
| **Amelioration continue** | Plus vous utilisez PML, plus il devient intelligent |
| **Zero configuration** | Pas besoin de definir manuellement vos workflows |
| **Contextuel** | Les suggestions s'adaptent a votre facon de travailler |

## Lifecycle

Capabilities go through distinct phases:

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│  CAPTURE   │───▶│  STORE     │───▶│  MATURE    │───▶│  REUSE     │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
      │                 │                 │                 │
 Code executes    Saved with        Used multiple      Suggested
 successfully     intent & code     times, gains       for similar
                                    confidence         intents
```

### 1. Capture

When code executes successfully, PML captures:
- The original intent (what the user wanted)
- The code that was executed
- The tools that were called
- The execution trace

### 2. Store

The captured pattern is stored in the database:
- Embeddings generated for semantic search
- Dependencies extracted for graph relationships
- Parameters inferred from the code

### 3. Mature

As the capability is reused:
- Success rate is tracked
- Confidence increases
- Related capabilities are linked

### 4. Reuse

Mature capabilities are suggested when:
- Intent matches semantically
- Context is similar
- Related tools are in use

## Storage

Capabilities are stored in the `workflow_pattern` table:

| Field | Purpose |
|-------|---------|
| `intent` | What the capability accomplishes |
| `code` | The executable TypeScript/JavaScript |
| `tools_used` | Array of MCP tools called |
| `parameters` | Inferred parameters schema |
| `embedding` | Vector for semantic search |
| `success_count` | Times executed successfully |
| `last_used` | Recency for ranking |

## Capability Relationships (Hyperedges)

### Pourquoi "hyperedge" ?

Dans un graphe classique, une relation connecte **2** elements (A → B). Mais une capability connecte **N** outils simultanement. C'est ce qu'on appelle un **hyperedge** en theorie des graphes.

```
Relation classique (edge):        Capability (hyperedge):
─────────────────────────        ────────────────────────
    A ──────▶ B                  ┌─────────────────────────────┐
                                 │  Capability "file_to_issue" │
                                 │                             │
                                 │  read  parse  create_issue  │
                                 │   │      │         │        │
                                 └───┴──────┴─────────┴────────┘
                                     Tous connectes ensemble
```

### Outils partages entre capabilities

Un outil peut appartenir a **plusieurs** capabilities :

```
┌─────────────────────┐          ┌─────────────────────┐
│ Cap: File Analysis  │          │ Cap: Error Triage   │
│                     │          │                     │
│ read_file  parse    │          │ read_file  classify │
└─────────────────────┘          └─────────────────────┘
      │                                │
      └────────────┬───────────────────┘
                   │
              ┌────────┐
              │read_   │  ← Appartient aux deux capabilities
              │file    │
              └────────┘
```

Cette structure permet de decouvrir des connexions inattendues entre capabilities qui partagent des outils communs.

### Visualisation dans le dashboard

Le dashboard offre deux modes de visualisation :

| Mode | Affichage | Utilisation |
|------|-----------|-------------|
| **Tools** | Graphe classique des outils | Vue d'ensemble des connexions |
| **SuperHyperGraph** | Capabilities et meta-capabilities | Voir les patterns appris (structure récursive) |

En mode SuperHyperGraph, cliquer sur une capability affiche :
- Le code source reutilisable
- Les outils utilises
- Le taux de succes et l'historique d'usage

### Capability Chains

Les capabilities peuvent s'enchainer pour former des workflows plus complexes :

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Cap: Read Data  │ ──▶ │ Cap: Transform  │ ──▶ │ Cap: Export     │
│                 │     │                 │     │                 │
│ read  validate  │     │ map  filter     │     │ format  write   │
└─────────────────┘     └─────────────────┘     └─────────────────┘

Workflow complet : capability → capability → capability
```

Ces chaines emergent naturellement de l'usage. PML detecte quand une capability en appelle regulierement une autre et renforce cette connexion.

## Next

- [Eager Learning](./02-eager-learning.md) - How capabilities are captured
- [Schema Inference](./03-schema-inference.md) - Automatic parameter detection
