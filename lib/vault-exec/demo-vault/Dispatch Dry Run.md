---
compiled_at: "2026-03-04T17:04:00.000Z"
inputs:
  dispatchBatch: "{{Dispatch Batch.dispatchBatch}}"
  payloadValidation: "{{Payload Validator.payloadValidation}}"
  idempotencyKeys: "{{Idempotency Key Builder.idempotencyKeys}}"
code: >-
  dispatchBatch.map(batch => {
    const items = batch.items.map(item => {
      const validation = payloadValidation.find(v => v.kind === item.kind && v.account === item.account) ?? { valid: true, reason: null };
      const key = idempotencyKeys.find(k => k.kind === item.kind && k.account === item.account && k.priority === item.priority)?.key ?? null;
      return {
        ...item,
        idempotencyKey: key,
        dryRunStatus: validation.valid ? 'ready' : 'blocked',
        blockReason: validation.reason
      };
    });
    return {
      batchId: batch.batchId,
      owner: batch.owner,
      priority: batch.priority,
      readyCount: items.filter(i => i.dryRunStatus === 'ready').length,
      blockedCount: items.filter(i => i.dryRunStatus === 'blocked').length,
      items
    };
  })
outputs:
  - dispatchDryRun
---

Guardrail: simulation de dispatch sans exécution réelle.

Deps: [[Dispatch Batch]], [[Payload Validator]], [[Idempotency Key Builder]]
