---
node_type: code
compiled_at: "2026-03-04T16:54:00.000Z"
inputs:
  upsellQueue: "{{REV - Upsell Candidate Queue.upsellQueue}}"
code: >-
  upsellQueue
    .filter(x => x.upsellScore >= 60)
    .map(x => ({
      account: x.account,
      priority: x.upsellScore >= 80 ? 'P1' : 'P2',
      briefType: 'expansion_pricing_scenario',
      context: {
        upsellScore: x.upsellScore,
        nps: x.nps,
        seatsUsed: x.seatsUsed,
        events30d: x.events30d
      }
    }))
outputs:
  - expansionBriefPayload
---

Action node: payload pour préparer les briefs d’expansion.

Deps: [[REV - Upsell Candidate Queue]]
