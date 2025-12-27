# Checkpoints

> Human and Agent decision points in workflows

## En bref

Les checkpoints sont comme les points de sauvegarde dans un jeu video : le workflow met en pause
l'execution a des moments strategiques pour vous permettre de verifier ce qui s'est passe et de
decider si vous voulez continuer. Vous pouvez approuver, rejeter, ou modifier les parametres avant
que l'action critique ne soit executee. C'est votre filet de securite.

**Points cles :**

- Points de pause pour revision humaine (HIL) ou par agent (AIL)
- Controle des actions critiques ou irreversibles
- Prevention des erreurs couteuses
- Flexibilite d'ajuster le workflow en cours d'execution

**Analogie :** Sauvegarde de jeu video - Avant un boss difficile, le jeu sauvegarde. Si vous
echouez, vous revenez au checkpoint au lieu de tout recommencer.

## What Are Checkpoints?

**Checkpoints** are points in a workflow where execution pauses for review or decision-making. They
provide control over automated workflows, ensuring critical actions are verified before proceeding.

![DAG Observability](excalidraw:src/web/assets/diagrams/dag-observability.excalidraw)

![DAG Resilience](excalidraw:src/web/assets/diagrams/dag-resilience.excalidraw)

## HIL (Human-in-the-Loop)

**Human-in-the-Loop** checkpoints pause for human review and approval.

### When to Use HIL

| Scenario                    | Example                         |
| --------------------------- | ------------------------------- |
| **Destructive operations**  | Deleting files, dropping tables |
| **External actions**        | Sending emails, creating issues |
| **Cost implications**       | API calls with billing          |
| **Sensitive data**          | Accessing credentials, PII      |
| **Compliance requirements** | Audit trails, approvals         |

### HIL Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         HIL Checkpoint                           │
│                                                                  │
│  Workflow executes Task A, Task B...                            │
│                                                                  │
│  ─────────────────────────────────────────────────              │
│  ⏸️  PAUSED: Human approval required                             │
│                                                                  │
│  Action: Delete 47 files from /data/archive                     │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  ✓ Approve  │  │  ✗ Reject   │  │  ✏️ Modify  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│  ─────────────────────────────────────────────────              │
│                                                                  │
│  On Approve: Continue to Task C                                 │
│  On Reject: Stop workflow, mark as cancelled                    │
│  On Modify: Adjust parameters, then continue                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### HIL Information Provided

When a HIL checkpoint triggers, the human sees:

| Information          | Purpose                    |
| -------------------- | -------------------------- |
| **Task description** | What will happen           |
| **Parameters**       | Specific values being used |
| **Context**          | Previous task results      |
| **Risk level**       | Severity indicator         |
| **Alternatives**     | Other options available    |

## AIL (Agent-in-the-Loop)

**Agent-in-the-Loop** checkpoints delegate decisions to an AI agent rather than a human.

### When to Use AIL

| Scenario                | Example                            |
| ----------------------- | ---------------------------------- |
| **Quality decisions**   | Is this output good enough?        |
| **Routing logic**       | Which path should we take?         |
| **Error recovery**      | Should we retry or abort?          |
| **Dynamic adjustments** | Modify parameters based on results |

### AIL Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         AIL Checkpoint                           │
│                                                                  │
│  Workflow executes Task A...                                    │
│                                                                  │
│  ─────────────────────────────────────────────────              │
│  🤖 AGENT REVIEW                                                 │
│                                                                  │
│  Task A output: { status: "partial", items: 15, errors: 2 }     │
│                                                                  │
│  Agent analyzes:                                                │
│    • 15 items processed successfully                            │
│    • 2 errors encountered                                       │
│    • Error rate: 13%                                            │
│                                                                  │
│  Agent decides:                                                 │
│    "Error rate acceptable. Proceeding with successful items."   │
│                                                                  │
│  ─────────────────────────────────────────────────              │
│                                                                  │
│  Continue to Task B with 15 items                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### AIL Capabilities

An AIL checkpoint can:

| Action                | Description                    |
| --------------------- | ------------------------------ |
| **Approve/Reject**    | Binary decision on continuing  |
| **Modify parameters** | Adjust next task's inputs      |
| **Add tasks**         | Insert new tasks dynamically   |
| **Skip tasks**        | Remove unnecessary steps       |
| **Replan**            | Restructure remaining workflow |

## Combining HIL and AIL

Complex workflows can use both:

```
┌─────────────────────────────────────────────────────────────────┐
│  Workflow: Automated Report Generation                          │
│                                                                  │
│  [Fetch Data] ──▶ 🤖 AIL: Validate data quality                 │
│        │                                                        │
│        ▼                                                        │
│  [Generate Report] ──▶ 🤖 AIL: Check formatting                 │
│        │                                                        │
│        ▼                                                        │
│  [Send to Stakeholders] ◀── ⏸️ HIL: Approve before sending      │
│                                                                  │
│  AIL handles routine validation                                 │
│  HIL ensures human oversight for external actions               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## When to Use

**HIL:** Irreversible actions, external impact, compliance, sensitive data, high stakes.

**AIL:** Routine context-dependent decisions, speed important, recoverable errors, objective
criteria.

**None:** Read-only, easily reversible, tested workflow, low risk.

## Checkpoint Configuration

Checkpoints are configured per task:

```
Task: delete_files
  checkpoint:
    type: HIL
    message: "About to delete {count} files"
    risk_level: high
    timeout: 3600  (1 hour to respond)

Task: validate_output
  checkpoint:
    type: AIL
    prompt: "Is this output acceptable?"
    fallback: reject  (if agent fails)
```

## Exemple concret : Publication de contenu

```
Workflow: Publish Blog Post

Layer 0: Fetch draft + Check images + Spell check
Layer 1: Generate HTML, optimize images

🤖 AIL: Quality check (alt text, SEO, links)

Layer 2: Generate preview

⏸️ HIL: Editorial Review
  Preview URL + Post details
  Options: ✓ Approve  ✗ Reject  ✏️ Edit
  Decision: Approved (changed publish time)

Layer 3: Publish to CMS + RSS + Tweet + Sitemap

🤖 AIL: Post-publish verification
  Checks: Post live? RSS ok? Tweet sent?
  If fail → Rollback + Alert ops

Layer 4: Send notifications, update dashboard

ANALOGIE JEU VIDEO (Dark Souls) :

AIL Checkpoint (auto):
  Avant donjon: "Assez de potions? Arme reparee?"

HIL Checkpoint (humain):
  Porte du boss: SAUVEGARDE
  Vous decidez: Continuer? Revenir plus tard?
  Si mort → Retour au checkpoint

AIL Checkpoint (verif):
  Apres boss: Butin obtenu?
```

**Cas reels :**

```
E-commerce: Mise a jour prix (500 produits, -20%)
  🤖 AIL: Verif calculs
  ⏸️ HIL: Impact -$45k → Approuver?
  Update DB + Clear cache

Database Migration:
  🤖 AIL: Backup integrity
  Test sur staging
  🤖 AIL: Staging validation
  ⏸️ HIL: Migrate prod? (Risque HIGH, 15min downtime)
  🤖 AIL: Post-migration checks → Auto-rollback si fail

Regles:
  HIL: Irreversible, impact financier, jugement humain
  AIL: Criteres objectifs, technique, rapide
  Aucun: Lecture seule, reversible, risque faible
```

## Next

- [Sandbox Execution](../06-code-execution/01-sandbox.md) - Secure code execution
- [Tracing](../06-code-execution/03-tracing.md) - Execution visibility
