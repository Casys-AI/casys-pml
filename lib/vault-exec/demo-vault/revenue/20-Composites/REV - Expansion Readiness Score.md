---
node_type: code
compiled_at: "2026-03-04T16:46:00.000Z"
inputs:
  accountHealthInputs: "{{REV - Account Health Inputs.accountHealthInputs}}"
  churnPressure: "{{REV - Churn Pressure Score.churnPressure}}"
code: >-
  accountHealthInputs.map(h => {
    const pressure = churnPressure.find(c => c.accountId === h.accountId)?.churnPressure ?? 60;
    const usage = (h.events30d > 15000 ? 35 : h.events30d > 7000 ? 20 : 10) + (h.seatsUsed > 50 ? 25 : h.seatsUsed > 20 ? 15 : 5);
    const sentiment = h.nps >= 40 ? 30 : h.nps >= 25 ? 18 : 8;
    const score = Math.max(0, Math.min(100, usage + sentiment - (pressure > 80 ? 35 : pressure > 65 ? 20 : 8)));
    return { accountId: h.accountId, expansionReadiness: score };
  }).sort((a,b) => b.expansionReadiness - a.expansionReadiness)
outputs:
  - expansionReadiness
---

Composite: expansion fitness adjusted by churn pressure.

Deps: [[REV - Account Health Inputs]], [[REV - Churn Pressure Score]]
