---
node_type: code
compiled_at: "2026-03-04T16:46:00.000Z"
inputs:
  contractsWithDays: "{{REV - Days To Renewal.contractsWithDays}}"
code: >-
  contractsWithDays.map(c => ({
    contractId: c.id,
    accountId: c.accountId,
    window: c.daysToRenewal <= 30 ? '0-30' : c.daysToRenewal <= 60 ? '31-60' : '61+'
  }))
outputs:
  - renewalWindowBands
---

Primitive: classify contracts by renewal proximity.

Deps: [[REV - Days To Renewal]]
