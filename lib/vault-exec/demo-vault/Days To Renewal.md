---
compiled_at: "2026-03-04T16:42:00.000Z"
inputs:
  contracts: "{{Contracts.contracts}}"
code: >-
  contracts.map(c => ({
    ...c,
    daysToRenewal: Math.ceil((new Date(c.renewalDate) - new Date('2026-03-04')) / 86400000)
  }))
outputs:
  - contractsWithDays
---

Primitive: derive days-to-renewal per contract.

Deps: [[Contracts]]
