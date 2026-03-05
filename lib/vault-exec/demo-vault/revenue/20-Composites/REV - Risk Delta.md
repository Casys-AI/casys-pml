---
node_type: code
compiled_at: "2026-03-04T17:02:00.000Z"
inputs:
  revenueRiskScores: "{{REV - Revenue Risk Score.revenueRiskScores}}"
  renewalWindowBands: "{{REV - Renewal Window Band.renewalWindowBands}}"
code: >-
  revenueRiskScores.map(r => {
    const band = renewalWindowBands.find(x => x.contractId === r.contractId)?.window ?? '61+';
    const baseline = band === '0-30' ? 70 : band === '31-60' ? 55 : 40;
    const riskDelta = r.risk - baseline;
    return {
      accountId: r.accountId,
      contractId: r.contractId,
      baselineRisk: baseline,
      currentRisk: r.risk,
      riskDelta
    };
  })
outputs:
  - riskDelta
---

Composite: delta de risque vs baseline de fenêtre de renouvellement.

Deps: [[REV - Revenue Risk Score]], [[REV - Renewal Window Band]]
