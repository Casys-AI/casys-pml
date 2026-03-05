---
compiled_at: "2026-03-04T17:03:00.000Z"
inputs:
  renewalActionQueue: "{{Renewal Action Queue.renewalActionQueue}}"
  accountOwners: "{{Owner Join.accountOwners}}"
code: >-
  renewalActionQueue
    .filter(x => x.priority === 'P1' || x.priority === 'P2')
    .map(x => ({
      account: x.account,
      owner: accountOwners.find(o => o.account === x.account)?.owner ?? 'unassigned',
      meetingType: 'renewal_recovery_call',
      dueInDays: x.priority === 'P1' ? 2 : 5,
      context: { risk: x.risk, daysToRenewal: x.daysToRenewal, arr: x.arr }
    }))
outputs:
  - renewalMeetingPayload
---

Action node: payload de planification des calls de renouvellement.

Deps: [[Renewal Action Queue]], [[Owner Join]]
