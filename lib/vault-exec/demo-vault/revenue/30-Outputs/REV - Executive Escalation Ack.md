---
node_type: code
compiled_at: "2026-03-04T17:03:00.000Z"
inputs:
  executiveEscalationPayload: "{{REV - Executive Escalation Payload.executiveEscalationPayload}}"
code: >-
  executiveEscalationPayload.map(x => ({
    account: x.account,
    escalationType: x.escalationType,
    ack: true,
    ackedAt: '2026-03-04T17:03:00.000Z'
  }))
outputs:
  - executiveEscalationAck
---

Action node: accusé de prise en charge des escalades exec.

Deps: [[REV - Executive Escalation Payload]]
