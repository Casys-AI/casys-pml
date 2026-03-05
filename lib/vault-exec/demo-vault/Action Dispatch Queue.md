---
compiled_at: "2026-03-04T16:50:00.000Z"
inputs:
  taskUpsertPayload: "{{Task Upsert Payload.taskUpsertPayload}}"
  taskClosePayload: "{{Task Close Payload.taskClosePayload}}"
  taskReassignPayload: "{{Task Reassign Payload.taskReassignPayload}}"
  renewalOutreachDrafts: "{{Renewal Outreach Drafts.renewalOutreachDrafts}}"
  outreachVariantDrafts: "{{Outreach Variant Drafts.outreachVariantDrafts}}"
  renewalMeetingPayload: "{{Renewal Meeting Payload.renewalMeetingPayload}}"
  executiveEscalationPayload: "{{Executive Escalation Payload.executiveEscalationPayload}}"
  executiveEscalationAck: "{{Executive Escalation Ack.executiveEscalationAck}}"
  expansionBriefPayload: "{{Expansion Brief Payload.expansionBriefPayload}}"
  leadershipBriefDraft: "{{Leadership Brief Draft.leadershipBriefDraft}}"
code: >-
  [
    ...taskUpsertPayload.map(t => ({
      kind: 'task.upsert',
      priority: t.priority,
      account: t.account,
      payload: t
    })),
    ...taskClosePayload.map(t => ({
      kind: 'task.close',
      priority: 'P2',
      account: t.account,
      payload: t
    })),
    ...taskReassignPayload.map(t => ({
      kind: 'task.reassign',
      priority: 'P2',
      account: t.account,
      payload: t
    })),
    ...renewalOutreachDrafts.map(m => ({
      kind: 'message.draft',
      priority: m.priority,
      account: m.account,
      payload: m
    })),
    ...outreachVariantDrafts.map(m => ({
      kind: 'message.variant',
      priority: m.priority,
      account: m.account,
      payload: m
    })),
    ...renewalMeetingPayload.map(r => ({
      kind: 'meeting.renewal',
      priority: r.dueInDays <= 2 ? 'P1' : 'P2',
      account: r.account,
      payload: r
    })),
    ...executiveEscalationPayload.map(e => ({
      kind: 'exec.escalation',
      priority: e.priority,
      account: e.account,
      payload: e
    })),
    ...executiveEscalationAck.map(e => ({
      kind: 'exec.escalation.ack',
      priority: 'P1',
      account: e.account,
      payload: e
    })),
    ...expansionBriefPayload.map(x => ({
      kind: 'expansion.brief',
      priority: x.priority,
      account: x.account,
      payload: x
    })),
    ...leadershipBriefDraft.map(l => ({
      kind: 'leadership.brief',
      priority: l.priority,
      account: 'portfolio',
      payload: l
    }))
  ].sort((a,b) => a.priority.localeCompare(b.priority))
outputs:
  - actionDispatchQueue
---

Action node: file unique des actions prêtes à dispatcher.

Deps: [[Task Upsert Payload]], [[Task Close Payload]], [[Task Reassign Payload]], [[Renewal Outreach Drafts]], [[Outreach Variant Drafts]], [[Renewal Meeting Payload]], [[Executive Escalation Payload]], [[Executive Escalation Ack]], [[Expansion Brief Payload]], [[Leadership Brief Draft]]
