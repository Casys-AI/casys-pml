---
node_type: code
compiled_at: "2026-03-04T17:03:00.000Z"
inputs:
  taskUpsertPayload: "{{REV - Task Upsert Payload.taskUpsertPayload}}"
  ownerWorkloadBalance: "{{REV - Owner Workload Balance.ownerWorkloadBalance}}"
code: >-
  taskUpsertPayload
    .filter(t => (ownerWorkloadBalance.find(o => o.owner === t.owner)?.workloadBand ?? 'balanced') === 'overloaded')
    .map(t => {
      const target = ownerWorkloadBalance.find(o => o.workloadBand === 'underloaded')?.owner ?? t.owner;
      return {
        externalId: t.externalId,
        account: t.account,
        fromOwner: t.owner,
        toOwner: target,
        action: 'reassign'
      };
    })
outputs:
  - taskReassignPayload
---

Action node: payload de réassignation des tâches.

Deps: [[REV - Task Upsert Payload]], [[REV - Owner Workload Balance]]
