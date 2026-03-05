---
node_type: code
compiled_at: "2026-03-04T16:46:00.000Z"
inputs:
  accounts: "{{REV - Accounts.accounts}}"
  csmOwners: "{{REV - CSM Owners.csmOwners}}"
code: >-
  accounts.map(a => ({
    accountId: a.id,
    account: a.name,
    owner: csmOwners.find(o => o.accountId === a.id)?.owner ?? 'unassigned'
  }))
outputs:
  - accountOwners
---

Primitive: join account with owner.

Deps: [[REV - Accounts]], [[REV - CSM Owners]]
