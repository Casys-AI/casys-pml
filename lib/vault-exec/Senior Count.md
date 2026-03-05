---
compiled_at: 2023-10-05T12:00:00.000Z
inputs:
  activeTeamMembers: '{{Filter Active.activeTeamMembers}}'
code: activeTeamMembers.filter(member => member.role === 'senior').length
outputs:
  seniorCount: seniorCount
---

Count how many of the active members are seniors from [[Filter Active]].
