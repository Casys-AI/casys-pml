---
node_type: code
compiled_at: "2026-03-04T17:04:00.000Z"
inputs:
  actionDispatchQueue: "{{REV - Action Dispatch Queue.actionDispatchQueue}}"
code: >-
  actionDispatchQueue.map((a, idx) => ({
    kind: a.kind,
    account: a.account,
    priority: a.priority,
    key: `${a.kind}:${a.account}:${a.priority}:${idx}`
  }))
outputs:
  - idempotencyKeys
---

Guardrail: clés d'idempotence pour chaque action.

Deps: [[REV - Action Dispatch Queue]]
