# links contract

## Inputs

- Positive/negative routing feedback paths.
- Existing virtual-edge rows and policy thresholds.

## Outputs

- Updated virtual-edge score/support/success state.
- Deterministic promotion/decay transitions.

## Invariants

- Promotion status is sticky per policy.
- Decay is bounded and explicit.
- No hidden mutation outside store calls.
