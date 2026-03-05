---
compiled_at: "2026-03-04T16:42:00.000Z"
inputs:
  contractsWithDays: "{{Days To Renewal.contractsWithDays}}"
  highSeverityCounts: "{{High Severity Ticket Count.highSeverityCounts}}"
  accountHealthInputs: "{{Account Health Inputs.accountHealthInputs}}"
code: >-
  contractsWithDays.map(c => {
    const sev = highSeverityCounts.find(x => x.accountId === c.accountId)?.highSeverityOpen ?? 0;
    const health = accountHealthInputs.find(x => x.accountId === c.accountId) ?? { nps: 30 };
    const renewalPressure = c.daysToRenewal < 30 ? 35 : c.daysToRenewal < 60 ? 20 : 10;
    const supportPressure = Math.min(30, sev * 12);
    const sentimentPressure = Math.max(0, 30 - (health.nps ?? 30));
    const risk = Math.min(100, renewalPressure + supportPressure + sentimentPressure);
    return { accountId: c.accountId, contractId: c.id, arr: c.arr, daysToRenewal: c.daysToRenewal, risk };
  }).sort((a,b) => b.risk - a.risk)
outputs:
  - revenueRiskScores
---

Composite: unified revenue risk score per contract/account.

Deps: [[Days To Renewal]], [[High Severity Ticket Count]], [[Account Health Inputs]]
