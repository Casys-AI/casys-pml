# cli-runtime contract

## Inputs

- Event type + payload from workflows/cli commands.
- Error category/code/message/details.

## Outputs

- Stable JSON string with `version` and `type` fields.
- Stable key order for nested objects.
- Explicit numeric exit-code constants.

## Invariants

- `eventJson(type, payload)` emits `version: "ax.v1"` and recursively sorted payload keys.
- `errorJson({ code, category, message, details? })` emits `type: "error"` with machine-readable fields.
- `category` is one of `validation`, `runtime`, `internal`.
- JSON output is deterministic for identical payloads.
- Human formatting is handled by callers, not this module.
- `EXIT_CODE_VALIDATION = 2`
- `EXIT_CODE_RUNTIME = 3`
