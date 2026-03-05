---
node_type: code
compiled_at: "2026-03-04T17:03:00.000Z"
inputs:
  actionDispatchQueue: "{{REV - Action Dispatch Queue.actionDispatchQueue}}"
  ownerWorkloadBalance: "{{REV - Owner Workload Balance.ownerWorkloadBalance}}"
code: >-
  (() => {
    const underloaded = ownerWorkloadBalance.filter(x => x.workloadBand === 'underloaded').map(x => x.owner);
    const bucketByOwner = new Map();
    actionDispatchQueue.forEach(item => {
      const owner = item.payload?.owner ?? item.payload?.toOwner ?? underloaded[0] ?? 'unassigned';
      const key = `${owner}:${item.priority}`;
      if (!bucketByOwner.has(key)) bucketByOwner.set(key, { owner, priority: item.priority, items: [] });
      bucketByOwner.get(key).items.push(item);
    });
    return [...bucketByOwner.values()].map((b, i) => ({ batchId: `batch_${i+1}`, ...b }));
  })()
outputs:
  - dispatchBatch
---

Action node: batch d'actions par owner/priorité.

Deps: [[REV - Action Dispatch Queue]], [[REV - Owner Workload Balance]]
