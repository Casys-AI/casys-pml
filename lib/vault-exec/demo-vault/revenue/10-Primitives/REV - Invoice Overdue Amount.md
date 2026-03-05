---
node_type: code
compiled_at: "2026-03-04T17:01:00.000Z"
inputs:
  accounts: "{{REV - Accounts.accounts}}"
  invoices: "{{REV - Invoices.invoices}}"
code: >-
  accounts.map(a => ({
    accountId: a.id,
    overdueAmount: invoices
      .filter(i => i.accountId === a.id && i.status === 'overdue')
      .reduce((s, i) => s + (i.amount ?? 0), 0)
  }))
outputs:
  - overdueInvoiceAmounts
---

Primitive: montant total en retard par compte.

Deps: [[REV - Accounts]], [[REV - Invoices]]
