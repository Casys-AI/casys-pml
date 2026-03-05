---
compiled_at: "2026-03-04T17:01:00.000Z"
inputs:
  accounts: "{{Accounts.accounts}}"
  tickets: "{{Tickets.tickets}}"
code: >-
  accounts.map(a => ({
    accountId: a.id,
    openTicketCount: tickets.filter(t => t.accountId === a.id && t.status === 'open').length
  }))
outputs:
  - openTicketCounts
---

Primitive: nombre total de tickets ouverts par compte.

Deps: [[Accounts]], [[Tickets]]
