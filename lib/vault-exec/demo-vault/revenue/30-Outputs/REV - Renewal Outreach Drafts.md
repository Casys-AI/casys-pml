---
node_type: code
compiled_at: "2026-03-04T16:50:00.000Z"
inputs:
  renewalActionQueue: "{{REV - Renewal Action Queue.renewalActionQueue}}"
  accountOwners: "{{REV - Owner Join.accountOwners}}"
code: >-
  renewalActionQueue
    .filter(x => x.priority === 'P1' || x.priority === 'P2')
    .map(x => {
      const owner = accountOwners.find(o => o.account === x.account);
      const urgency = x.priority === 'P1' ? 'high' : 'medium';
      return {
        account: x.account,
        priority: x.priority,
        toOwner: owner?.owner ?? 'unassigned',
        channel: 'email',
        subject: `[${x.priority}] Renewal plan for ${x.account}`,
        body: `Risk=${x.risk}, ARR=${x.arr}, DTR=${x.daysToRenewal}. Next step: ${x.action}.`,
        urgency
      };
    })
outputs:
  - renewalOutreachDrafts
---

Action node: brouillons de messages de renouvellement pour exécution externe.

Deps: [[REV - Renewal Action Queue]], [[REV - Owner Join]]
