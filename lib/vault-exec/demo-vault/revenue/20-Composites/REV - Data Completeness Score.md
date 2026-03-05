---
node_type: code
compiled_at: "2026-03-04T17:02:00.000Z"
inputs:
  accounts: "{{REV - Accounts.accounts}}"
  npsFreshness: "{{REV - NPS Freshness.npsFreshness}}"
  usageFreshness: "{{REV - Usage Freshness.usageFreshness}}"
  activeContracts: "{{REV - Contract Status Filter.activeContracts}}"
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

Deps: [[REV - Accounts]], [[REV - NPS Freshness]], [[REV - Usage Freshness]], [[REV - Contract Status Filter]]
