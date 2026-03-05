---
compiled_at: "2026-03-04T16:46:00.000Z"
inputs:
  ownerPriorityMatrix: "{{Owner Priority Matrix.ownerPriorityMatrix}}"
  renewalActionQueue: "{{Renewal Action Queue.renewalActionQueue}}"
code: >-
  ownerPriorityMatrix.map(x => {
    const renewal = renewalActionQueue.find(r => r.account === x.account);
    const nextAction = x.mode === 'save'
      ? (renewal?.action ?? 'Executive recovery call in 48h')
      : x.mode === 'expand'
      ? 'Prepare expansion brief + pricing scenario'
      : 'Weekly health check';
    return {
      owner: x.owner,
      account: x.account,
      mode: x.mode,
      nextAction,
      priority: x.mode === 'save' ? 'P1' : x.mode === 'expand' ? 'P2' : 'P3'
    };
  }).sort((a,b) => a.priority.localeCompare(b.priority))
outputs:
  - csmDailyPlan
---

Actionable owner plan (daily queue).

Deps: [[Owner Priority Matrix]], [[Renewal Action Queue]]
