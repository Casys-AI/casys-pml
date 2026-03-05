---
compiled_at: "2026-03-04T16:42:00.000Z"
inputs:
  accounts: "{{Accounts.accounts}}"
  npsRecords: "{{NPS Records.npsRecords}}"
  usageSnapshots: "{{Usage Snapshots.usageSnapshots}}"
code: >-
  accounts.map(a => {
    const nps = npsRecords.find(x => x.accountId === a.id)?.nps ?? null;
    const usage = usageSnapshots.find(x => x.accountId === a.id) ?? null;
    return { accountId: a.id, nps, seatsUsed: usage?.seatsUsed ?? 0, events30d: usage?.events30d ?? 0 };
  })
outputs:
  - accountHealthInputs
---

Primitive: gather normalized health inputs per account.

Deps: [[Accounts]], [[NPS Records]], [[Usage Snapshots]]
