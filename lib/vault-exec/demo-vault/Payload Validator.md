---
compiled_at: "2026-03-04T17:04:00.000Z"
inputs:
  actionDispatchQueue: "{{Action Dispatch Queue.actionDispatchQueue}}"
  actionEligibility: "{{Action Eligibility.actionEligibility}}"
  accounts: "{{Accounts.accounts}}"
code: >-
  actionDispatchQueue.map(a => {
    const accountId = accounts.find(x => x.name === a.account)?.id ?? null;
    const eligible = accountId ? (actionEligibility.find(x => x.accountId === accountId)?.canAct ?? true) : true;
    const hasPayload = !!a.payload;
    const valid = hasPayload && (a.account === 'portfolio' ? true : eligible);
    return {
      kind: a.kind,
      account: a.account,
      valid,
      reason: valid ? null : (!hasPayload ? 'missing_payload' : 'ineligible_account')
    };
  })
outputs:
  - payloadValidation
---

Guardrail: validation de payload avant dispatch.

Deps: [[Action Dispatch Queue]], [[Action Eligibility]], [[Accounts]]
