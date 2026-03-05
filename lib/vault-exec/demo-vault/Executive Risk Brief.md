---
compiled_at: "2026-03-04T16:46:00.000Z"
inputs:
  churnPressure: "{{Churn Pressure Score.churnPressure}}"
  contractsWithDays: "{{Days To Renewal.contractsWithDays}}"
  accounts: "{{Accounts.accounts}}"
code: >-
  churnPressure.slice(0, 3).map(c => {
    const ctr = contractsWithDays.find(x => x.id === c.contractId);
    const acc = accounts.find(a => a.id === c.accountId);
    return {
      account: acc?.name ?? c.accountId,
      arr: ctr?.arr ?? 0,
      daysToRenewal: ctr?.daysToRenewal ?? null,
      churnPressure: c.churnPressure,
      summary: c.churnPressure > 85 ? 'Critical retention risk' : 'Elevated retention risk'
    };
  })
outputs:
  - executiveRiskBrief
---

Top-3 risk brief for leadership.

Deps: [[Churn Pressure Score]], [[Days To Renewal]], [[Accounts]]
