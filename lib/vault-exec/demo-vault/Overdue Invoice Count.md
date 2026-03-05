---
compiled_at: "2026-03-04T16:46:00.000Z"
inputs:
  accounts: "{{Accounts.accounts}}"
  invoices: "{{Invoices.invoices}}"
code: >-
  accounts.map(a => ({
    accountId: a.id,
    overdueInvoices: invoices.filter(i => i.accountId === a.id && i.status === 'overdue').length
  }))
outputs:
  - overdueInvoiceCounts
---

Primitive: count overdue invoices by account.

Deps: [[Accounts]], [[Invoices]]
