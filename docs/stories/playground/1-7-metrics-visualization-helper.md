# Story 1.7: Metrics Visualization Helper

Status: done

## Story

As a **notebook author**,
I want **helpers to display metrics visually**,
so that **users can see performance gains clearly in the notebooks**.

## Acceptance Criteria

1. `playground/lib/metrics.ts` exporte `progressBar(current, total, label)` - ASCII progress bar
2. `playground/lib/metrics.ts` exporte `compareMetrics(before, after, labels)` - Side-by-side comparison
3. `playground/lib/metrics.ts` exporte `speedupChart(sequential, parallel)` - Visualize speedup
4. Output compatible Jupyter (texte formaté)
5. Couleurs ANSI optionnelles (détection terminal vs notebook)

## Tasks / Subtasks

- [x] Task 1: Create metrics module structure (AC: #1-3)
  - [x] Create `playground/lib/metrics.ts`
  - [x] Define types for metric inputs (ProgressBarOptions, CompareMetricsOptions, SpeedupChartOptions)
  - [x] Export all three main functions + bonus helpers (metricLine, reductionSummary)

- [x] Task 2: Implement progressBar (AC: #1, #4)
  - [x] Accept `current: number, total: number, label?: string`
  - [x] Return ASCII progress bar string `[████████░░░░] 66% label`
  - [x] Handle edge cases (0%, 100%, overflow)
  - [x] Configurable width option

- [x] Task 3: Implement compareMetrics (AC: #2, #4)
  - [x] Accept `before: Record<string, number>, after: Record<string, number>, labels?: { before: string, after: string }`
  - [x] Return formatted side-by-side comparison table
  - [x] Show delta (absolute and percentage)
  - [x] Highlight improvements vs regressions (with colors option)

- [x] Task 4: Implement speedupChart (AC: #3, #4)
  - [x] Accept `sequential: number, parallel: number`
  - [x] Return ASCII bar chart showing both times
  - [x] Calculate and display speedup factor (e.g., "1.4x faster")
  - [x] Show time saved

- [x] Task 5: Add ANSI color support (AC: #5)
  - [x] Detect if running in terminal vs Jupyter (isJupyter with try-catch)
  - [x] Add optional `colors: boolean` parameter to all functions
  - [x] Green for improvements, red for regressions
  - [x] Disable colors by default

- [x] Task 6: Add unit tests (AC: #1-5)
  - [x] Test progressBar output format (8 tests)
  - [x] Test compareMetrics with various inputs (6 tests)
  - [x] Test speedupChart calculations (6 tests)
  - [x] Test metricLine and reductionSummary (5 tests)
  - [x] Test isJupyter returns boolean (1 test)

## Dev Notes

### Requirements Context

**From epics-playground.md (Story 1.7):**
- Helpers pour afficher métriques visuellement
- Output compatible Jupyter (texte formaté)
- Couleurs ANSI optionnelles

**From PRD-playground.md:**
- Notebooks doivent montrer les gains de performance clairement
- Notebook 03 (DAG Execution) utilisera `speedupChart()`
- Notebook 02 (Context Optimization) utilisera `compareMetrics()`

### Architecture Constraints

**Module Pattern:**
- Suivre le même pattern que `playground/lib/viz.ts` et `playground/lib/init.ts`
- Exports at top, types, implementation
- Support `import.meta.main` pour test CLI

**Jupyter Compatibility:**
- ASCII output (pas de HTML)
- Désactiver ANSI par défaut dans Jupyter
- Détecter via `Deno.jupyter` existence

### Learnings from Previous Story

**From Story 1-5 (Status: done)**

- **New File Created**: `playground/lib/init.ts` - idempotent init helper
- **Pattern Established**: Module structure with exports at top, types, implementation
- **Testing Pattern**: Separate `_test.ts` file with Deno.test
- **Color Output**: Use status indicators (✓, ✗, ⚠) for visual feedback

[Source: stories/playground/1-5-idempotent-init-helper.md#Dev-Agent-Record]

### Testing Strategy

**Unit Tests:**
1. progressBar returns correct format for 0%, 50%, 100%
2. progressBar handles overflow (>100%)
3. compareMetrics formats table correctly
4. compareMetrics calculates deltas
5. speedupChart calculates speedup factor
6. Color detection works in different environments

### References

- [Source: docs/epics-playground.md#Story-1.7]
- [Source: docs/PRD-playground.md#Functional-Requirements]
- [Source: playground/lib/viz.ts] - Pattern for display helpers

## Dev Agent Record

### Context Reference

- Based on patterns from Story 1-5 (init.ts)

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Fixed isJupyter() to use try-catch (Deno.jupyter throws outside jupyter subcommand)

### Completion Notes List

- Created `playground/lib/metrics.ts` (~300 LOC) with ASCII-based metrics visualization
- Implemented all 3 required functions: progressBar, compareMetrics, speedupChart
- Added 2 bonus helpers: metricLine, reductionSummary (useful for notebooks)
- ANSI color support with optional toggle (disabled by default for Jupyter compatibility)
- 26 unit tests passing with full coverage of edge cases
- CLI demo available via `deno run playground/lib/metrics.ts`

### File List

**Created:**
- `playground/lib/metrics.ts` - Main metrics module
- `playground/lib/metrics_test.ts` - Unit tests (26 tests)

## Change Log

**2025-12-05** - Story drafted
- Created from Epic 1 requirements in epics-playground.md
- 6 tasks with subtasks mapped to 5 ACs
- Based on patterns from Story 1-5
- Status: backlog → drafted

**2025-12-05** - Story completed
- Implemented all 6 tasks with full test coverage
- Added bonus helpers (metricLine, reductionSummary)
- 26/26 tests passing
- Status: in-progress → done
