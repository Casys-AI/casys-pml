---
compiled_at: "2026-03-04T16:42:00.000Z"
inputs:
  accountHealthInputs: "{{Account Health Inputs.accountHealthInputs}}"
  revenueRiskScores: "{{Revenue Risk Score.revenueRiskScores}}"
  accounts: "{{Accounts.accounts}}"
code: >-
  accountHealthInputs
    .map(h => {
      const risk = revenueRiskScores.find(r => r.accountId === h.accountId)?.risk ?? 50;
      const expansionSignal = (h.events30d > 10000 ? 25 : 10) + (h.seatsUsed > 30 ? 20 : 5);
      const upsellScore = Math.max(0, Math.min(100, expansionSignal + (h.nps > 30 ? 25 : 10) - (risk > 70 ? 25 : 0)));
      const account = accounts.find(a => a.id === h.accountId);
      return { account: account?.name ?? h.accountId, upsellScore, nps: h.nps, events30d: h.events30d, seatsUsed: h.seatsUsed };
    })
    .sort((a,b) => b.upsellScore - a.upsellScore)
outputs:
  - upsellQueue
---

Actionable upsell queue.

Deps: [[Account Health Inputs]], [[Revenue Risk Score]], [[Accounts]]
