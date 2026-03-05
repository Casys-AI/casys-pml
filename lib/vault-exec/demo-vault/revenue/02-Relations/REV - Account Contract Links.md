---
node_type: code
compiled_at: "2026-03-04T16:46:00.000Z"
inputs:
  accounts: "{{REV - Accounts.accounts}}"
  contracts: "{{REV - Contracts.contracts}}"
code: >-
  contracts.map(c => ({ from: c.accountId, to: c.id, type: 'HAS_CONTRACT' }))
outputs:
  - accountContractLinks
---

Explicit account->contract edges.

Deps: [[REV - Accounts]], [[REV - Contracts]]
