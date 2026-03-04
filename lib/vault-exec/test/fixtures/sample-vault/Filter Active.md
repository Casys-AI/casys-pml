---
inputs:
  data: "{{Read Config.content}}"
code: "data.filter(p => p.active)"
outputs:
  - active_params
---

# Filter Active

Keep only the parameters where active is true.

Depends on: [[Read Config]]
