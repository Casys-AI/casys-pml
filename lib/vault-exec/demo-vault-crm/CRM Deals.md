---
compiled_at: "2026-03-04T10:00:00.000Z"
value:
  - id: deal_001
    name: "Acme Corp — Enterprise Upgrade"
    stage: negotiation
    amount: 45000
    owner: alice
    last_contact: "2026-02-20"
    contact_id: cnt_001
  - id: deal_002
    name: "Bluefin Retail — Renewal"
    stage: proposal
    amount: 12000
    owner: bob
    last_contact: "2026-02-28"
    contact_id: cnt_002
  - id: deal_003
    name: "Northstar Health — Expansion"
    stage: discovery
    amount: 78000
    owner: alice
    last_contact: "2026-01-15"
    contact_id: cnt_003
  - id: deal_004
    name: "Vertex Labs — New Logo"
    stage: proposal
    amount: 22000
    owner: charlie
    last_contact: "2026-02-25"
    contact_id: cnt_004
outputs:
  - crmDeals
---

Static deal records. Each deal has a stage (discovery → proposal → negotiation → closed),
an owner (alice, bob, charlie), an amount in USD, and a last_contact date.

Consumed by: Pipeline Summary, Follow-up Engine
