---
compiled_at: "2026-03-04T16:54:00.000Z"
inputs:
  renewalActionQueue: "{{Renewal Action Queue.renewalActionQueue}}"
code: >-
  renewalActionQueue
    .filter(x => x.priority === 'P1')
    .map(x => ({
      account: x.account,
      priority: x.priority,
      escalationType: 'exec_sponsor_call',
      slaHours: 48,
      context: {
        arr: x.arr,
        risk: x.risk,
        daysToRenewal: x.daysToRenewal,
        recommendedAction: x.action
      }
    }))
outputs:
  - executiveEscalationPayload
---

Action node: payload d’escalade exécutive pour comptes P1.

Deps: [[Renewal Action Queue]]
