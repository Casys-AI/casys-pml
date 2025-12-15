# Checkpoints

> Human and Agent decision points in workflows

## What Are Checkpoints?

**Checkpoints** are points in a workflow where execution pauses for review or decision-making. They provide control over automated workflows, ensuring critical actions are verified before proceeding.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Workflow with Checkpoints                     │
│                                                                  │
│  [Task A] ──▶ [Task B] ──▶ ⏸️ CHECKPOINT ──▶ [Task C] ──▶ [Task D]│
│                                  │                               │
│                                  │                               │
│                           Review & Approve                       │
│                           before continuing                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## HIL (Human-in-the-Loop)

**Human-in-the-Loop** checkpoints pause for human review and approval.

### When to Use HIL

| Scenario | Example |
|----------|---------|
| **Destructive operations** | Deleting files, dropping tables |
| **External actions** | Sending emails, creating issues |
| **Cost implications** | API calls with billing |
| **Sensitive data** | Accessing credentials, PII |
| **Compliance requirements** | Audit trails, approvals |

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

| Information | Purpose |
|-------------|---------|
| **Task description** | What will happen |
| **Parameters** | Specific values being used |
| **Context** | Previous task results |
| **Risk level** | Severity indicator |
| **Alternatives** | Other options available |

## AIL (Agent-in-the-Loop)

**Agent-in-the-Loop** checkpoints delegate decisions to an AI agent rather than a human.

### When to Use AIL

| Scenario | Example |
|----------|---------|
| **Quality decisions** | Is this output good enough? |
| **Routing logic** | Which path should we take? |
| **Error recovery** | Should we retry or abort? |
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

| Action | Description |
|--------|-------------|
| **Approve/Reject** | Binary decision on continuing |
| **Modify parameters** | Adjust next task's inputs |
| **Add tasks** | Insert new tasks dynamically |
| **Skip tasks** | Remove unnecessary steps |
| **Replan** | Restructure remaining workflow |

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

### Use HIL When:

```
✓ Action is irreversible
✓ Action has external impact
✓ Compliance requires human approval
✓ Action involves sensitive data
✓ Stakes are high (cost, security, reputation)
```

### Use AIL When:

```
✓ Decision is routine but context-dependent
✓ Speed is important
✓ Human oversight is not required
✓ Decision can be made from available data
✓ Errors are recoverable
```

### Skip Checkpoints When:

```
✓ Action is read-only
✓ Action is easily reversible
✓ Workflow is fully tested and trusted
✓ Speed is critical and risk is low
```

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

## Next

- [Sandbox Execution](../06-code-execution/01-sandbox.md) - Secure code execution
- [Tracing](../06-code-execution/03-tracing.md) - Execution visibility
