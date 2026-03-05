---
node_type: value
compiled_at: "2026-03-04T16:42:00.000Z"
value:
  Account:
    required: [id, name, segment]
  Contract:
    required: [id, accountId, arr, renewalDate, status]
  Ticket:
    required: [id, accountId, severity, openDays, status]
  UsageSnapshot:
    required: [id, accountId, seatsUsed, events30d]
  NpsRecord:
    required: [id, accountId, nps, capturedAt]
  Task:
    required: [id, accountId, type, priority, owner, dueDate, status]
outputs:
  - entityTypes
---

Canonical entity contracts for Revenue OS.
