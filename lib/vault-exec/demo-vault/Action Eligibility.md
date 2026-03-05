---
compiled_at: "2026-03-04T17:02:00.000Z"
inputs:
  dataCompletenessScores: "{{Data Completeness Score.dataCompletenessScores}}"
  churnPressure: "{{Churn Pressure Score.churnPressure}}"
  expansionReadiness: "{{Expansion Readiness Score.expansionReadiness}}"
code: >-
  dataCompletenessScores.map(d => {
    const churn = churnPressure.find(x => x.accountId === d.accountId)?.churnPressure ?? 0;
    const expand = expansionReadiness.find(x => x.accountId === d.accountId)?.expansionReadiness ?? 0;
    const canAct = d.completenessScore >= 50;
    return {
      accountId: d.accountId,
      canAct,
      blockReason: canAct ? null : 'insufficient_data',
      allowSaveFlow: canAct && churn >= 50,
      allowExpandFlow: canAct && expand >= 50,
      confidence: d.completenessScore >= 80 ? 'high' : d.completenessScore >= 50 ? 'medium' : 'low'
    };
  })
outputs:
  - actionEligibility
---

Composite: autorisation d'action selon qualité des données.

Deps: [[Data Completeness Score]], [[Churn Pressure Score]], [[Expansion Readiness Score]]
