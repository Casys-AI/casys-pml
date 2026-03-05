---
compiled_at: "2026-03-04T17:03:00.000Z"
inputs:
  taskUpsertPayload: "{{Task Upsert Payload.taskUpsertPayload}}"
  actionEligibility: "{{Action Eligibility.actionEligibility}}"
  riskDelta: "{{Risk Delta.riskDelta}}"
  accounts: "{{Accounts.accounts}}"
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

Deps: [[Task Upsert Payload]], [[Action Eligibility]], [[Risk Delta]], [[Accounts]]
