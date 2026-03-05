---
node_type: code
compiled_at: "2026-03-04T10:00:00.000Z"
inputs:
  deals: "{{CRM - Deals.crmDeals}}"
  daysThreshold: "{{input.days_threshold}}"
input_schema:
  type: object
  properties:
    days_threshold:
      type: integer
      description: "Minimum days since last contact to flag a deal for follow-up"
      minimum: 1
      maximum: 90
    owner_filter:
      type: string
      description: "Optional: restrict results to a specific owner (alice, bob, charlie)"
  required:
    - days_threshold
  additionalProperties: false
code: >-
  (() => {
    const today = new Date('2026-03-04');
    const threshold = Number(daysThreshold);
    return deals
      .map(d => {
        const last = new Date(d.last_contact);
        const daysSince = Math.floor((today - last) / 86400000);
        return { ...d, daysSinceContact: daysSince };
      })
      .filter(d => d.daysSinceContact >= threshold)
      .sort((a, b) => b.daysSinceContact - a.daysSinceContact);
  })()
outputs:
  - followUpQueue
---

Block: **Follow-up Engine**

Flags deals that have not been contacted for at least `days_threshold` days.
Results are sorted by staleness (most overdue first).

Runtime inputs:
- `days_threshold` (required, integer 1–90): staleness cutoff in days
- `owner_filter` (optional, string): restrict to a single owner

With today = 2026-03-04 and days_threshold = 7:
- deal_003 (Northstar, 48 days) → flagged
- deal_001 (Acme, 12 days) → flagged
- deal_004 (Vertex, 8 days) → flagged
- deal_002 (Bluefin, 5 days) → not flagged

Deps: [[CRM - Deals]]
