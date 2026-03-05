---
compiled_at: "2026-03-04T16:42:00.000Z"
inputs:
  revenueRiskScores: "{{Revenue Risk Score.revenueRiskScores}}"
  accounts: "{{Accounts.accounts}}"
code: >-
  revenueRiskScores.map(r => {
    const account = accounts.find(a => a.id === r.accountId);
    const priority = r.risk >= 75 ? 'P1' : r.risk >= 55 ? 'P2' : 'P3';
    return {
      priority,
      account: account?.name ?? r.accountId,
      arr: r.arr,
      risk: r.risk,
      daysToRenewal: r.daysToRenewal,
      action: priority === 'P1'
        ? 'Exec sponsor call + recovery plan in 48h'
        : priority === 'P2'
        ? 'CSM follow-up + mitigation plan this week'
        : 'Monitor monthly'
    };
  })
outputs:
  - renewalActionQueue
---

Actionable output for account teams.

Deps: [[Revenue Risk Score]], [[Accounts]]
