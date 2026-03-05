---
compiled_at: "2026-03-04T17:01:00.000Z"
inputs:
  csmOwners: "{{CSM Owners.csmOwners}}"
  ownerPriorityMatrix: "{{Owner Priority Matrix.ownerPriorityMatrix}}"
code: >-
  [...new Set(csmOwners.map(x => x.owner))].map(owner => {
    const items = ownerPriorityMatrix.filter(x => x.owner === owner);
    const p1 = items.filter(x => x.mode === 'save').length;
    const p2 = items.filter(x => x.mode === 'expand').length;
    const p3 = items.filter(x => x.mode === 'stabilize').length;
    const loadScore = p1 * 3 + p2 * 2 + p3;
    const remainingCapacity = Math.max(0, 10 - loadScore);
    return { owner, p1, p2, p3, loadScore, remainingCapacity };
  })
outputs:
  - ownerCapacity
---

Primitive: capacité/charge par owner.

Deps: [[CSM Owners]], [[Owner Priority Matrix]]
