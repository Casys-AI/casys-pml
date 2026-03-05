---
compiled_at: "2026-03-04T16:46:00.000Z"
inputs:
  accountOwners: "{{Owner Join.accountOwners}}"
  churnPressure: "{{Churn Pressure Score.churnPressure}}"
  expansionReadiness: "{{Expansion Readiness Score.expansionReadiness}}"
code: >-
  accountOwners.map(o => {
    const churn = churnPressure.find(c => c.accountId === o.accountId)?.churnPressure ?? 50;
    const expand = expansionReadiness.find(e => e.accountId === o.accountId)?.expansionReadiness ?? 40;
    return {
      owner: o.owner,
      accountId: o.accountId,
      account: o.account,
      mode: churn >= 75 ? 'save' : expand >= 65 ? 'expand' : 'stabilize',
      churnPressure: churn,
      expansionReadiness: expand
    };
  })
outputs:
  - ownerPriorityMatrix
---

Composite: decide save/expand/stabilize mode per account-owner pair.

Deps: [[Owner Join]], [[Churn Pressure Score]], [[Expansion Readiness Score]]
