---
node_type: value
compiled_at: "2026-03-04T10:00:00.000Z"
value:
  name: "CRM Manager Flows (Demo Vault)"
  blocks:
    - "CRM - Pipeline"
    - "CRM - Inbox-to-CRM"
    - "CRM - Follow-up Engine"
    - "CRM - Daily Command Board"
outputs:
  - vaultBlueprint
---

# CRM Manager Flows — Demo Vault

A modular vault for CRM operations. Each block is a self-contained subgraph.
This workspace is now embedded under `demo-vault/modules/crm`.

## Node Map

```
CRM - Deals ─────────────┬──→ CRM - Pipeline ───→ CRM - Daily Command Board
                        │
                        └──→ CRM - Follow-up Engine ─→ CRM - Daily Command Board

CRM - Contacts ─────────→ CRM - Inbox-to-CRM ←──── SHARED - Segment Owner Routing
```

## Entry Targets

| Target | Purpose | Required inputs |
|---|---|---|
| `CRM - Pipeline` | Grouped pipeline by stage + amounts | _(none)_ |
| `CRM - Inbox-to-CRM` | Convert raw email into CRM lead | `raw_subject`, `raw_sender` (+ optional `segment`) |
| `CRM - Follow-up Engine` | Overdue deal queue | `days_threshold` (integer 1–90) |
| `CRM - Daily Command Board` | Full daily digest (pipeline + follow-up) | `days_threshold` (via CRM - Follow-up Engine) |

## Commands

```bash
cd lib/vault-exec

# View dependency graph
deno task cli graph demo-vault

# Dry-run the CRM daily board subgraph
deno task cli run --dry --target "CRM - Daily Command Board" demo-vault

# Show input_schema (no inputs provided → schema returned)
deno task cli run --target "CRM - Daily Command Board" demo-vault

# Run with valid inputs
deno task cli run --target "CRM - Daily Command Board" --inputs '{"days_threshold": 7}' demo-vault

# Run Inbox-to-CRM with full inputs
deno task cli run --target "CRM - Inbox-to-CRM" --inputs '{"raw_subject":"Interest in enterprise plan","raw_sender":"cto@newcorp.com","segment":"enterprise"}' demo-vault

# Run full DAG (requires days_threshold for CRM flow)
deno task cli run --inputs '{"days_threshold": 7}' demo-vault
```

## Runtime Inputs Reference

### Follow-up Engine / Daily Command Board
| Field | Type | Required | Description |
|---|---|---|---|
| `days_threshold` | integer (1–90) | ✓ | Days since last contact to flag a deal |
| `owner_filter` | string | ✗ | Restrict to alice, bob, or charlie |

### Inbox-to-CRM
| Field | Type | Required | Description |
|---|---|---|---|
| `raw_subject` | string | ✓ | Email subject line |
| `raw_sender` | string | ✓ | Sender email address |
| `segment` | enum (smb, mid-market, enterprise) | ✗ | Account segment (default: smb) |
