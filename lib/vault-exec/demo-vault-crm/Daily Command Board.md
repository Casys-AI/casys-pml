---
compiled_at: "2026-03-04T10:00:00.000Z"
inputs:
  pipelineSummary: "{{CRM Pipeline.pipelineSummary}}"
  followUpQueue: "{{Follow-up Engine.followUpQueue}}"
code: >-
  (() => {
    const totalPipelineValue = pipelineSummary.reduce((sum, row) => sum + row.totalAmount, 0);
    const urgentFollowUps = followUpQueue.filter(d => d.daysSinceContact >= 14);
    return {
      date: '2026-03-04',
      pipeline: {
        totalValue: totalPipelineValue,
        stageCount: pipelineSummary.length,
        byStage: pipelineSummary
      },
      followUp: {
        totalOverdue: followUpQueue.length,
        urgentCount: urgentFollowUps.length,
        urgent: urgentFollowUps.map(d => ({ id: d.id, name: d.name, owner: d.owner, daysSinceContact: d.daysSinceContact })),
        queue: followUpQueue.map(d => ({ id: d.id, name: d.name, owner: d.owner, daysSinceContact: d.daysSinceContact }))
      }
    };
  })()
outputs:
  - dailyBoard
---

Block: **Daily Command Board**

Aggregates pipeline health and follow-up urgency into a single daily digest.

Output shape:
```json
{
  "date": "2026-03-04",
  "pipeline": { "totalValue": 157000, "stageCount": 3, "byStage": [...] },
  "followUp": { "totalOverdue": 3, "urgentCount": 2, "urgent": [...], "queue": [...] }
}
```

`urgent` = deals with daysSinceContact ≥ 14 (needs immediate action).

Deps: [[CRM Pipeline]], [[Follow-up Engine]]
