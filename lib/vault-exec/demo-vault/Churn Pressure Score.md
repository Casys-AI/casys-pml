---
compiled_at: "2026-03-04T16:46:00.000Z"
inputs:
  revenueRiskScores: "{{Revenue Risk Score.revenueRiskScores}}"
  overdueInvoiceCounts: "{{Overdue Invoice Count.overdueInvoiceCounts}}"
  ticketAgingScores: "{{Open Ticket Aging Score.ticketAgingScores}}"
code: >-
  revenueRiskScores.map(r => {
    const overdue = overdueInvoiceCounts.find(o => o.accountId === r.accountId)?.overdueInvoices ?? 0;
    const aging = ticketAgingScores.find(a => a.accountId === r.accountId)?.ticketAgingScore ?? 0;
    const score = Math.min(100, r.risk + overdue * 10 + aging * 0.5);
    return { accountId: r.accountId, contractId: r.contractId, churnPressure: score };
  }).sort((a,b) => b.churnPressure - a.churnPressure)
outputs:
  - churnPressure
---

Composite: churn pressure by combining risk, payment, support friction.

Deps: [[Revenue Risk Score]], [[Overdue Invoice Count]], [[Open Ticket Aging Score]]
