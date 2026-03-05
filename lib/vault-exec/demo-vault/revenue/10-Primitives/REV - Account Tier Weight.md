---
node_type: code
compiled_at: "2026-03-04T17:01:00.000Z"
inputs:
  accounts: "{{REV - Accounts.accounts}}"
code: >-
  accounts.map(a => {
    const segment = (a.segment ?? '').toLowerCase();
    const tierWeight = segment === 'enterprise' ? 1.35 : segment === 'mid-market' ? 1.15 : 1.0;
    return { accountId: a.id, segment: a.segment, tierWeight };
  })
outputs:
  - accountTierWeights
---

Primitive: poids de priorité selon segment.

Deps: [[REV - Accounts]]
