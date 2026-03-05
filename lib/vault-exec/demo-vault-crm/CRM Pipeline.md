---
compiled_at: "2026-03-04T10:00:00.000Z"
inputs:
  deals: "{{CRM Deals.crmDeals}}"
code: >-
  Object.values(
    deals.reduce((acc, d) => {
      if (!acc[d.stage]) acc[d.stage] = { stage: d.stage, count: 0, totalAmount: 0, dealIds: [] };
      acc[d.stage].count++;
      acc[d.stage].totalAmount += d.amount;
      acc[d.stage].dealIds.push(d.id);
      return acc;
    }, {})
  ).sort((a, b) => b.totalAmount - a.totalAmount)
outputs:
  - pipelineSummary
---

Block: **CRM Pipeline**

Groups all deals by stage and computes count + total amount per stage.
Output is sorted by totalAmount descending.

Deps: [[CRM Deals]]
