---
compiled_at: "2026-03-04T16:42:00.000Z"
inputs:
  accounts: "{{Accounts.accounts}}"
  tickets: "{{Tickets.tickets}}"
code: >-
  accounts.map(a => ({
    accountId: a.id,
    highSeverityOpen: tickets.filter(t => t.accountId === a.id && t.severity === 'high' && t.status === 'open').length
  }))
outputs:
  - highSeverityCounts
---

Primitive: count high-severity open tickets by account.

Deps: [[Accounts]], [[Tickets]]
