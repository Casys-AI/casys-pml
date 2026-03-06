# links contract

## Inputs

- Positive/negative routing feedback paths.
- Existing virtual-edge rows and policy thresholds.

## Outputs

- Updated virtual-edge score/support/success state.
- Deterministic promotion/decay transitions.

## Canonical Entities

- `VirtualEdgeUpdate`
- `VirtualEdgeRow`
- `VirtualEdgeStatus`

## Invariants

- Adjacent pairs in each path emit candidate relation updates.
- Self-loops are ignored.
- Existing real graph relations are ignored.
- Duplicate `(source, target)` updates are merged by summing `scoreDelta`.
- Output order is deterministic: source ascending, then target ascending.
- `nextVirtualEdgeRow()` applies additive score updates.
- Positive deltas increment `support`; negative deltas increment `rejects`.
- Promotion status is sticky per policy.
- Decay is bounded and explicit.
- `applyVirtualEdgeDecay()` is a no-op for invalid factors.
- Rejection happens when `score <= rejectScore`.
- Promotion requires `score >= minScore`, `support >= minSupport`, and
  `successRatio >= minSuccessRatio`.
- No hidden mutation outside store calls.
