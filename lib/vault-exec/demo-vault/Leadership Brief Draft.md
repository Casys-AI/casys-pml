---
compiled_at: "2026-03-04T16:54:00.000Z"
inputs:
  executiveRiskBrief: "{{Executive Risk Brief.executiveRiskBrief}}"
code: >-
  [{
    kind: 'leadership_brief',
    priority: 'P1',
    channel: 'email',
    subject: 'Top revenue risks - daily brief',
    body: executiveRiskBrief
      .map(x => `${x.account}: ARR=${x.arr}, DTR=${x.daysToRenewal}, churn=${x.churnPressure} (${x.summary})`)
      .join(' | ')
  }]
outputs:
  - leadershipBriefDraft
---

Action node: brouillon de brief leadership à envoyer.

Deps: [[Executive Risk Brief]]
