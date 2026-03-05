---
node_type: code
compiled_at: "2026-03-04T16:46:00.000Z"
inputs:
  expansionReadiness: "{{REV - Expansion Readiness Score.expansionReadiness}}"
  accounts: "{{REV - Accounts.accounts}}"
code: >-
  expansionReadiness
    .filter(x => x.expansionReadiness >= 50)
    .map(x => ({
      account: accounts.find(a => a.id === x.accountId)?.name ?? x.accountId,
      expansionReadiness: x.expansionReadiness,
      step: x.expansionReadiness >= 75 ? 'Send expansion proposal' : 'Run discovery for upsell hypothesis'
    }))
outputs:
  - expansionPipeline
---

Actionable expansion pipeline.

Deps: [[REV - Expansion Readiness Score]], [[REV - Accounts]]
