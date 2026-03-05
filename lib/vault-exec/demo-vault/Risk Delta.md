---
compiled_at: "2026-03-04T17:02:00.000Z"
inputs:
  revenueRiskScores: "{{Revenue Risk Score.revenueRiskScores}}"
  renewalWindowBands: "{{Renewal Window Band.renewalWindowBands}}"
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

Deps: [[Revenue Risk Score]], [[Renewal Window Band]]
