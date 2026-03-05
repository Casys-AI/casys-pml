---
compiled_at: "2026-03-04T16:50:00.000Z"
inputs:
  csmDailyPlan: "{{CSM Daily Plan.csmDailyPlan}}"
  accountContractLinks: "{{Account Contract Links.accountContractLinks}}"
code: >-
  csmDailyPlan.map(item => {
    const link = accountContractLinks.find(x => x.accountId === item.accountId || x.account === item.account);
    const dueDays = item.priority === 'P1' ? 2 : item.priority === 'P2' ? 5 : 10;
    const dueDate = new Date(Date.now() + dueDays * 86400000).toISOString().slice(0, 10);
    return {
      externalId: `${item.owner}:${item.account}:${item.mode}`,
      account: item.account,
      owner: item.owner,
      priority: item.priority,
      title: item.nextAction,
      type: item.mode === 'save' ? 'renewal_recovery' : item.mode === 'expand' ? 'expansion' : 'health_check',
      dueDate,
      contractId: link?.contractId ?? null,
      status: 'todo'
    };
  })
outputs:
  - taskUpsertPayload
---

Action node: transforme le plan CSM en payload prêt à créer/mettre à jour des tâches.

Deps: [[CSM Daily Plan]], [[Account Contract Links]]
