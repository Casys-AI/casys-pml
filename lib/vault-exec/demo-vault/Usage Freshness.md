---
compiled_at: "2026-03-04T17:01:00.000Z"
inputs:
  accounts: "{{Accounts.accounts}}"
  usageSnapshots: "{{Usage Snapshots.usageSnapshots}}"
code: >-
  accounts.map(a => {
    const snap = usageSnapshots.find(x => x.accountId === a.id) ?? null;
    const capturedAt = snap?.capturedAt ?? null;
    const ageDays = capturedAt ? Math.max(0, Math.ceil((new Date('2026-03-04') - new Date(capturedAt)) / 86400000)) : null;
    return {
      accountId: a.id,
      capturedAt,
      usageFreshnessDays: ageDays,
      isStale: ageDays == null ? true : ageDays > 7,
      hasSnapshot: !!snap
    };
  })
outputs:
  - usageFreshness
---

Primitive: fraîcheur des snapshots usage (fallback stale si date absente).

Deps: [[Accounts]], [[Usage Snapshots]]
