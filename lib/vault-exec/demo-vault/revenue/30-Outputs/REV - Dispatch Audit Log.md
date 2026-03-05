---
node_type: code
compiled_at: "2026-03-04T17:04:00.000Z"
inputs:
  dispatchDryRun: "{{REV - Dispatch Dry Run.dispatchDryRun}}"
code: >-
  dispatchDryRun.flatMap(batch =>
    batch.items.map(item => ({
      ts: '2026-03-04T17:04:00.000Z',
      batchId: batch.batchId,
      owner: batch.owner,
      kind: item.kind,
      account: item.account,
      status: item.dryRunStatus,
      idempotencyKey: item.idempotencyKey,
      reason: item.blockReason
    }))
  )
outputs:
  - dispatchAuditLog
---

Guardrail: journal d'audit de la simulation de dispatch.

Deps: [[REV - Dispatch Dry Run]]
