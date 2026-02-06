---
title: 'Dependency Detection for code:* Tasks'
slug: code-task-dependency-detection
created: '2026-01-26'
updated: '2026-02-06'
status: draft
tech_stack: ['deno', 'typescript']
related: ['Story 10.5', 'two-level-dag-architecture', 'shgat-learning-and-dag-edges']
---

# Tech-Spec: Dependency Detection for `code:*` Tasks

## Table of Contents

### Specification
- [Problem Statement](./problem-statement.md) - What works (chaining) vs what's broken (sequential variables)
- [Root Cause Analysis](./root-cause-analysis.md) - Edge generation flow, `nodeReferencesNode()`, `variableToNodeId`
- [Solution Options](./solution-options.md) - Option A (selected): add `arguments` to `code:*` tasks
- [Implementation Plan: Option A](./implementation-plan-option-a.md) - Phase 1 (sequence edges) + Phase 2 (semantic provides)
- [Files to Modify](./files-to-modify.md) - 6 files impacted
- [Verification](./verification.md) - 5 test cases
- [Considerations](./considerations.md) - DAG Optimizer, Two-Level DAG, DR-DSP, backward compat
- [Estimated Effort](./estimated-effort.md) - ~9-10 hours (2 phases)
- [Decision Log](./decision-log.md) - Chronological decisions

### Review & Audit
- [Implementation Audit (2026-02-06)](./review-2026-02-06-implementation-audit.md) - Current state, what's done, what's missing, observations
