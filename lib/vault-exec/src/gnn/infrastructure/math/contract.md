# gnn/infrastructure/math contract

## Inputs

- Numeric vectors/matrices and backend operation arguments.

## Outputs

- Deterministic math results via selected backend implementation.

## Invariants

- Backend API surface is stable and machine-callable.
- JS fallback and BLAS backend preserve equivalent semantics.
- No hidden coercion or random behavior inside backend operations.
