---
compiled_at: 2023-10-05T12:00:00.000Z
inputs:
  teamMembers: '{{Team Members.teamMembers}}'
code: teamMembers.filter(member => member.status === 'active')
outputs:
  - activeTeamMembers
---

Keep only the active team members from [[Team Members]].
