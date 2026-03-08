# gnn/domain contract

## Inputs

- Typed embedding vectors/matrices and domain-level hyperparameters.

## Outputs

- Deterministic transformed vectors and scalar scores.

## Invariants

- No hidden random state inside domain functions.
- Domain APIs are backend-agnostic and pure.
- Errors/fallbacks are explicit at call sites.
