# CRM demo vault + target tests

Date: 2026-03-04

## Scope

Created a CRM-focused demo vault under `lib/vault-exec/demo-vault-crm`, then
merged it into `lib/vault-exec/demo-vault/modules/crm` (2026-03-05). Target flows were
validated (`graph`, `--dry`, schema-first target, and execution with valid
`--inputs`).

## Files added

- `lib/vault-exec/demo-vault/modules/crm/CRM Workspace README.md`
- `lib/vault-exec/demo-vault/modules/crm/CRM Contacts.md`
- `lib/vault-exec/demo-vault/modules/crm/CRM Deals.md`
- `lib/vault-exec/demo-vault/modules/crm/CRM Pipeline.md`
- `lib/vault-exec/demo-vault/modules/crm/Inbox-to-CRM.md`
- `lib/vault-exec/demo-vault/modules/crm/Follow-up Engine.md`
- `lib/vault-exec/demo-vault/modules/crm/Daily Command Board.md`

## Files updated (runtime-input behavior + dry behavior)

- `lib/vault-exec/src/cli.ts`
  - In `--dry`, no payload required; prints execution plan and `input_schema`.
  - In normal target execution, still schema-first when required inputs are
    missing.
- `lib/vault-exec/src/core/executor.ts`
  - Runtime refs `{{input.*}}` / `{{inputs.*}}` now allow missing optional
    fields (AJV enforces required fields).

## Commands executed

```bash
cd /home/ubuntu/CascadeProjects/AgentCards/lib/vault-exec

# 1) Graph check
npx -y deno task cli graph demo-vault

# 2) Dry-run target
npx -y deno task cli run demo-vault --target "Daily Command Board" --dry

# 3) Target without inputs (expect input_schema)
npx -y deno task cli run demo-vault --target "Daily Command Board"

# 4) Target with valid inputs (expect success)
npx -y deno task cli run demo-vault --target "Daily Command Board" --inputs '{"days_threshold":7}' --no-train

# 5) Inbox target with optional segment omitted (expect success, default segment)
npx -y deno task cli run demo-vault --target "Inbox-to-CRM" --inputs '{"raw_subject":"Interest in enterprise plan","raw_sender":"cto@newcorp.com"}' --no-train
```

## Outcome summary

- `graph`: ✅ valid ordering and dependencies.
- `--target --dry`: ✅ prints subgraph execution order + generated/merged
  `input_schema`.
- `--target` without `--inputs` (when required runtime fields exist): ✅ returns
  `input_schema` and exits.
- `--target` with valid `--inputs`: ✅ executes successfully and returns
  `dailyBoard` output.
- `Inbox-to-CRM` with missing optional `segment`: ✅ executes successfully with
  default fallback (`smb`).

## Notes

- `Daily Command Board` depends on `CRM Pipeline` and `Follow-up Engine`.
- Required runtime field for follow-up path: `days_threshold` (integer 1..90).
- Optional runtime fields currently supported: `owner_filter` (follow-up),
  `segment` (inbox enrichment).
