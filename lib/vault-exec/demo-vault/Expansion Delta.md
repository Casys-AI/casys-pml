---
compiled_at: "2026-03-04T17:02:00.000Z"
inputs:
  accountHealthInputs: "{{Account Health Inputs.accountHealthInputs}}"
  expansionReadiness: "{{Expansion Readiness Score.expansionReadiness}}"
code: >-
  expansionReadiness.map(e => {
    const h = accountHealthInputs.find(x => x.accountId === e.accountId) ?? { events30d: 0, seatsUsed: 0 };
    const baseline = (h.events30d > 10000 ? 45 : 30) + (h.seatsUsed > 30 ? 20 : 10);
    const expansionDelta = e.expansionReadiness - baseline;
    return {
      accountId: e.accountId,
      baselineExpansion: baseline,
      currentExpansion: e.expansionReadiness,
      expansionDelta
    };
  })
outputs:
  - expansionDelta
---

Composite: delta d'expansion vs baseline usage.

Deps: [[Account Health Inputs]], [[Expansion Readiness Score]]
