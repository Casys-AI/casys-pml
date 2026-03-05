---
node_type: code
compiled_at: "2026-03-04T17:03:00.000Z"
inputs:
  taskUpsertPayload: "{{REV - Task Upsert Payload.taskUpsertPayload}}"
  actionEligibility: "{{REV - Action Eligibility.actionEligibility}}"
  riskDelta: "{{REV - Risk Delta.riskDelta}}"
  accounts: "{{REV - Accounts.accounts}}"
code: >-
  taskUpsertPayload
    .filter(t => {
      const accountId = accounts.find(a => a.name === t.account)?.id ?? null;
      const eligible = accountId ? (actionEligibility.find(a => a.accountId === accountId)?.canAct ?? true) : true;
      const delta = accountId ? (riskDelta.find(r => r.accountId === accountId)?.riskDelta ?? 0) : 0;
      return !eligible || delta <= -20;
    })
    .map(t => ({
      externalId: t.externalId,
      account: t.account,
      action: 'close',
      reason: 'ineligible_or_risk_decreased'
    }))
outputs:
  - taskClosePayload
---

Action node: payload de fermeture des tâches obsolètes.

Deps: [[REV - Task Upsert Payload]], [[REV - Action Eligibility]], [[REV - Risk Delta]], [[REV - Accounts]]
