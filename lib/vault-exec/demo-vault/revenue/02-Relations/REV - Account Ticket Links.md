---
node_type: code
compiled_at: "2026-03-04T16:46:00.000Z"
inputs:
  tickets: "{{REV - Tickets.tickets}}"
code: >-
  tickets.map(t => ({ from: t.accountId, to: t.id, type: 'HAS_TICKET' }))
outputs:
  - accountTicketLinks
---

Explicit account->ticket edges.

Deps: [[REV - Tickets]]
