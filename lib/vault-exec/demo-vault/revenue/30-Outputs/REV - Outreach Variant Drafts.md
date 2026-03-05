---
node_type: code
compiled_at: "2026-03-04T17:03:00.000Z"
inputs:
  renewalOutreachDrafts: "{{REV - Renewal Outreach Drafts.renewalOutreachDrafts}}"
  actionEligibility: "{{REV - Action Eligibility.actionEligibility}}"
  accounts: "{{REV - Accounts.accounts}}"
code: >-
  renewalOutreachDrafts
    .filter(d => {
      const accountId = accounts.find(a => a.name === d.account)?.id ?? null;
      const eligible = actionEligibility.find(x => x.accountId === accountId)?.canAct ?? true;
      return eligible;
    })
    .flatMap(d => ([
      { ...d, variant: 'A', body: `${d.body} Ask: confirm sponsor + next milestone.` },
      { ...d, variant: 'B', body: `${d.body} Ask: validate blockers + decision timeline.` }
    ]))
outputs:
  - outreachVariantDrafts
---

Action node: variantes A/B de drafts outreach.

Deps: [[REV - Renewal Outreach Drafts]], [[REV - Action Eligibility]], [[REV - Accounts]]
