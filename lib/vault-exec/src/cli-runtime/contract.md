# cli-runtime contract

## Inputs

- Event type + payload from workflows/cli commands.
- Error category/code/message/details.

## Outputs

- Stable JSON string with `version` and `type` fields.
- Stable key order for nested objects.
- Explicit numeric exit-code constants.

## Invariants

- JSON output is deterministic for identical payloads.
- Human formatting is handled by callers, not this module.
