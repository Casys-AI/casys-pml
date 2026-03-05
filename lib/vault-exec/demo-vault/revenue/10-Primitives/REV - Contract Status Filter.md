---
node_type: code
compiled_at: "2026-03-04T17:01:00.000Z"
inputs:
  contracts: "{{REV - Contracts.contracts}}"
code: >-
  contracts.filter(c => (c.status ?? '').toLowerCase() === 'active')
outputs:
  - activeContracts
---

Primitive: ne garder que les contrats actifs.

Deps: [[REV - Contracts]]
