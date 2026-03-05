---
node_type: code
compiled_at: "2026-03-04T17:01:00.000Z"
inputs:
  accounts: "{{REV - Accounts.accounts}}"
  npsRecords: "{{REV - NPS Records.npsRecords}}"
code: >-
  accounts.map(a => {
    const rec = npsRecords.find(x => x.accountId === a.id) ?? null;
    const capturedAt = rec?.capturedAt ?? null;
    const ageDays = capturedAt ? Math.max(0, Math.ceil((new Date('2026-03-04') - new Date(capturedAt)) / 86400000)) : null;
    return {
      accountId: a.id,
      capturedAt,
      npsFreshnessDays: ageDays,
      isStale: ageDays == null ? true : ageDays > 14
    };
  })
outputs:
  - npsFreshness
---

Primitive: âge/fraîcheur du dernier NPS par compte.

Deps: [[REV - Accounts]], [[REV - NPS Records]]
