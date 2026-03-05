---
compiled_at: "2026-03-04T17:02:00.000Z"
inputs:
  accounts: "{{Accounts.accounts}}"
  npsFreshness: "{{NPS Freshness.npsFreshness}}"
  usageFreshness: "{{Usage Freshness.usageFreshness}}"
  activeContracts: "{{Contract Status Filter.activeContracts}}"
code: >-
  accounts.map(a => {
    const nps = npsFreshness.find(x => x.accountId === a.id);
    const usage = usageFreshness.find(x => x.accountId === a.id);
    const hasActiveContract = activeContracts.some(c => c.accountId === a.id);
    const score =
      (nps && !nps.isStale ? 30 : 0) +
      (usage && !usage.isStale ? 30 : 0) +
      (usage?.hasSnapshot ? 20 : 0) +
      (hasActiveContract ? 20 : 0);
    return {
      accountId: a.id,
      completenessScore: score,
      quality: score >= 80 ? 'good' : score >= 50 ? 'partial' : 'low'
    };
  })
outputs:
  - dataCompletenessScores
---

Composite: qualité des données d'entrée par compte.

Deps: [[Accounts]], [[NPS Freshness]], [[Usage Freshness]], [[Contract Status Filter]]
