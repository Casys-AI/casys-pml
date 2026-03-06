# db contract

## Inputs

- Store operations through `IVaultStore` methods.
- Vault-local KV path.

## Outputs

- Durable rows for notes/traces/weights/virtual edges.
- Deterministic ordered reads where required by callers.

## Invariants

- API surface follows `IVaultStore` exactly.
- Storage failures throw explicit errors.
- No fallback policy hidden inside storage adapters.
