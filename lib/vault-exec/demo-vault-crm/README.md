---
compiled_at: "2026-03-04T10:00:00.000Z"
value:
  name: "CRM Manager Flows (Demo Vault)"
  blocks:
    - "CRM Pipeline"
    - "Inbox-to-CRM"
    - "Follow-up Engine"
    - "Daily Command Board"
outputs:
  - vaultBlueprint
---

# CRM Manager Flows — Demo Vault

A modular vault for CRM operations. Each block is a self-contained subgraph.

## Node Map

```
CRM Deals ──────────────┬──→ CRM Pipeline ─────→ Daily Command Board
                        │
                        └──→ Follow-up Engine ──→ Daily Command Board

CRM Contacts ───────────→ Inbox-to-CRM
```

## Entry Targets

| Target | Purpose | Required inputs |
|---|---|---|
| `CRM Pipeline` | Grouped pipeline by stage + amounts | _(none)_ |
| `Inbox-to-CRM` | Convert raw email into CRM lead | `raw_subject`, `raw_sender` (+ optional `segment`) |
| `Follow-up Engine` | Overdue deal queue | `days_threshold` (integer 1–90) |
| `Daily Command Board` | Full daily digest (pipeline + follow-up) | `days_threshold` (via Follow-up Engine) |

## Commands

```bash
cd lib/vault-exec

# View dependency graph
deno task cli graph demo-vault-crm

# Dry-run the Daily Command Board subgraph
deno task cli run --dry --target "Daily Command Board" demo-vault-crm

# Show input_schema (no inputs provided → schema returned)
deno task cli run --target "Daily Command Board" demo-vault-crm

# Run with valid inputs
deno task cli run --target "Daily Command Board" --inputs '{"days_threshold": 7}' demo-vault-crm

# Run Inbox-to-CRM with full inputs
deno task cli run --target "Inbox-to-CRM" --inputs '{"raw_subject":"Interest in enterprise plan","raw_sender":"cto@newcorp.com","segment":"enterprise"}' demo-vault-crm

# Run full DAG (requires days_threshold)
deno task cli run --inputs '{"days_threshold": 7}' demo-vault-crm
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
