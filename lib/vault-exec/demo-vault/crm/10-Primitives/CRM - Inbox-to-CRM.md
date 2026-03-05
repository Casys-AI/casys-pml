---
node_type: code
compiled_at: "2026-03-04T10:00:00.000Z"
inputs:
  rawSubject: "{{input.raw_subject}}"
  rawSender: "{{input.raw_sender}}"
  segment: "{{input.segment}}"
  contacts: "{{CRM - Contacts.crmContacts}}"
  ownerRouting: "{{SHARED - Segment Owner Routing.ownerRoutingBySegment}}"
input_schema:
  type: object
  properties:
    raw_subject:
      type: string
      description: "Subject line of the incoming email or message"
    raw_sender:
      type: string
      description: "Sender email address"
    segment:
      type: string
      enum:
        - smb
        - mid-market
        - enterprise
      description: "Account segment — determines owner assignment (optional, defaults to smb)"
  required:
    - raw_subject
    - raw_sender
  additionalProperties: false
code: >-
  (() => {
    const seg = segment || 'smb';
    const existingContact = contacts.find(c => c.email === rawSender);
    return {
      id: 'lead_' + Math.abs(rawSender.split('').reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0)),
      subject: rawSubject,
      sender: rawSender,
      segment: seg,
      assignedOwner: ownerRouting[seg] || ownerRouting.smb || 'charlie',
      existingContactId: existingContact ? existingContact.id : null,
      status: 'new',
      createdAt: '2026-03-04T10:00:00.000Z'
    };
  })()
outputs:
  - crmLead
---

Block: **Inbox-to-CRM**

Converts a raw incoming message into a structured CRM lead.
- Derives owner from shared policy `[[SHARED - Segment Owner Routing]]`.
- Cross-references CRM Contacts to detect known senders.
- `segment` is optional and defaults to `smb`.

Runtime inputs: `raw_subject` (required), `raw_sender` (required), `segment` (optional).

Deps: [[CRM - Contacts]], [[SHARED - Segment Owner Routing]]
