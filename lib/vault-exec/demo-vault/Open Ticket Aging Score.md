---
compiled_at: "2026-03-04T16:46:00.000Z"
inputs:
  accounts: "{{Accounts.accounts}}"
  tickets: "{{Tickets.tickets}}"
code: >-
  accounts.map(a => {
    const age = tickets
      .filter(t => t.accountId === a.id && t.status === 'open')
      .reduce((s,t) => s + t.openDays, 0);
    return { accountId: a.id, ticketAgingScore: Math.min(40, age) };
  })
outputs:
  - ticketAgingScores
---

Primitive: aggregate ticket aging pressure by account.

Deps: [[Accounts]], [[Tickets]]
