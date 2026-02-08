# Decision Log

- **2026-01-26:** Initial draft
- **2026-01-26:** Investigation findings:
  - Discovered chained operations already work via `chainedFrom` metadata
  - Root cause is sequential operations with variable assignment
  - `variableToNodeId` tracks the info but isn't used for edge generation
  - Linked to DAG Optimizer fusion requirements
- **2026-01-26:** Architecture decisions:
  - **Selected Option A:** Add `arguments` to code:* tasks (unified mechanism)
  - **Rejected Option B:** Extend `nodeReferencesNode()` with code parsing (two mechanisms)
  - Rationale: Consistency > minimal changes
- **2026-01-26:** Provides edges refinement:
  - **Problem:** DR-DSP uses provides edges for path finding - without them, paths break
  - **Solution:** Hybrid approach with semantic types
  - **Semantic provides:** JSON.*, Object.*, filter/map/reduce, split/join
  - **Skip provides:** Arithmetic operators (+/-/*) - too generic, would connect everything
  - Rationale: Semantic types preserve meaningful relationships without noise