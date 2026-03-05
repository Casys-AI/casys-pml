---
node_type: code
compiled_at: "2026-03-04T17:02:00.000Z"
inputs:
  actionEligibility: "{{REV - Action Eligibility.actionEligibility}}"
  revenueRiskScores: "{{REV - Revenue Risk Score.revenueRiskScores}}"
  upsellQueue: "{{REV - Upsell Candidate Queue.upsellQueue}}"
  accounts: "{{REV - Accounts.accounts}}"
code: >-
  actionEligibility.map(a => {
    const risk = revenueRiskScores.find(x => x.accountId === a.accountId)?.risk ?? 0;
    const accountName = accounts.find(x => x.id === a.accountId)?.name ?? null;
    const upsell = upsellQueue.find(x => x.account === accountName)?.upsellScore ?? 0;
    const base = Math.max(risk, upsell);
    const priority = !a.canAct ? 'HOLD' : base >= 80 ? 'P1' : base >= 60 ? 'P2' : 'P3';
    return { accountId: a.accountId, normalizedPriority: priority };
  })
outputs:
  - priorityNormalized
---

Composite: normalisation unique des priorités par compte.

Deps: [[REV - Action Eligibility]], [[REV - Revenue Risk Score]], [[REV - Upsell Candidate Queue]], [[REV - Accounts]]
