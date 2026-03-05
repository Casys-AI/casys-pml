---
node_type: code
compiled_at: "2026-03-04T17:02:00.000Z"
inputs:
  ownerCapacity: "{{REV - Owner Capacity.ownerCapacity}}"
code: >-
  ownerCapacity.map(o => ({
    owner: o.owner,
    loadScore: o.loadScore,
    remainingCapacity: o.remainingCapacity,
    workloadBand: o.loadScore >= 8 ? 'overloaded' : o.loadScore >= 5 ? 'balanced' : 'underloaded'
  }))
outputs:
  - ownerWorkloadBalance
---

Composite: banding de charge owner pour équilibrage.

Deps: [[REV - Owner Capacity]]
