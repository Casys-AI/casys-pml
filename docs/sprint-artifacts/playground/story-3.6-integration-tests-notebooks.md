# Story 3.6: Tests d'Intégration Notebooks

**Status:** ready-for-dev

## Story

As a **maintainer**,
I want **integration tests for notebooks**,
So that **we catch regressions when the real system changes**.

## Acceptance Criteria

1. Script `playground/scripts/test-notebooks.ts` qui exécute les notebooks 04-06
2. Vérifie que chaque notebook s'exécute sans erreur
3. Vérifie que les outputs attendus sont présents
4. Peut être lancé via `deno task test:notebooks`
5. Intégré dans CI (optionnel mais recommandé)

## Tasks / Subtasks

- [ ] Task 1: Create test runner script (AC: 1)
  - [ ] 1.1: Create playground/scripts/test-notebooks.ts
  - [ ] 1.2: Implement notebook cell execution using Deno
  - [ ] 1.3: Handle TypeScript cells with Deno.jupyter integration
  - [ ] 1.4: Capture and report cell outputs
- [ ] Task 2: Implement notebook validation (AC: 2)
  - [ ] 2.1: Execute all code cells in order
  - [ ] 2.2: Catch and report any cell execution errors
  - [ ] 2.3: Track which cells failed with stack traces
  - [ ] 2.4: Report success/failure summary
- [ ] Task 3: Add output assertions (AC: 3)
  - [ ] 3.1: Define expected outputs for key cells (JSON schema or regex)
  - [ ] 3.2: Validate CapabilityStore operations succeed
  - [ ] 3.3: Validate WorkerBridge traces are captured
  - [ ] 3.4: Validate Matcher returns results above threshold
- [ ] Task 4: Add deno task (AC: 4)
  - [ ] 4.1: Add "test:notebooks" task to deno.json
  - [ ] 4.2: Configure appropriate permissions
  - [ ] 4.3: Set timeout for long-running notebooks
- [ ] Task 5: CI integration (AC: 5)
  - [ ] 5.1: Add test:notebooks to GitHub Actions workflow
  - [ ] 5.2: Configure notebook tests as separate job
  - [ ] 5.3: Add artifact upload for test results

## Dev Notes

### Notebook Testing Approach

Deno has native Jupyter kernel support. We can execute notebooks programmatically:

```typescript
// playground/scripts/test-notebooks.ts
import { parse } from "https://deno.land/std/jsonc/mod.ts";

interface NotebookCell {
  cell_type: "code" | "markdown";
  source: string | string[];
  id?: string;
}

interface Notebook {
  cells: NotebookCell[];
}

async function executeNotebook(path: string): Promise<TestResult> {
  const content = await Deno.readTextFile(path);
  const notebook: Notebook = JSON.parse(content);

  const results: CellResult[] = [];

  for (const cell of notebook.cells) {
    if (cell.cell_type !== "code") continue;

    const source = Array.isArray(cell.source)
      ? cell.source.join("")
      : cell.source;

    try {
      // Execute TypeScript cell
      const result = await executeCell(source, cell.id);
      results.push({ id: cell.id, success: true, output: result });
    } catch (error) {
      results.push({ id: cell.id, success: false, error: error.message });
    }
  }

  return { path, results };
}
```

### Cell Execution Strategy

Two approaches:

1. **Dynamic import** - Create temp file, import and execute
2. **eval with context** - Use Function constructor with shared context

Recommended: Dynamic import for better isolation and error handling.

```typescript
async function executeCell(code: string, cellId: string): Promise<unknown> {
  // Inject common imports at cell start
  const wrappedCode = `
    import { getCapabilityStore, getCapabilityMatcher, resetPlaygroundState } from "../lib/capabilities.ts";
    ${code}
  `;

  const tempFile = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tempFile, wrappedCode);

  try {
    const module = await import(`file://${tempFile}`);
    return module.default ?? module;
  } finally {
    await Deno.remove(tempFile);
  }
}
```

### Expected Outputs Configuration

Create assertions file:

```typescript
// playground/scripts/notebook-assertions.ts
export const assertions = {
  "04-code-execution.ipynb": {
    "cell-basic-execution": {
      // Verify execution succeeded
      validate: (output) => output.success === true
    },
    "cell-trace-display": {
      // Verify traces were captured
      validate: (output) => Array.isArray(output) && output.length > 0
    }
  },
  "05-capability-learning.ipynb": {
    "cell-eager-demo": {
      validate: (output) => output.isNew === true
    }
  },
  "06-emergent-reuse.ipynb": {
    "cell-8": {
      // Verify capability matching works
      validate: (output) => output !== null && typeof output.score === "number"
    }
  }
};
```

### deno.json Task Configuration

```json
{
  "tasks": {
    "test:notebooks": "deno run --allow-read --allow-write --allow-net --allow-env playground/scripts/test-notebooks.ts"
  }
}
```

### CI Integration

```yaml
# .github/workflows/test.yml
jobs:
  notebook-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1
      - name: Run notebook tests
        run: deno task test:notebooks
        timeout-minutes: 10
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: notebook-test-results
          path: playground/scripts/test-results.json
```

### Test Result Format

```typescript
interface TestResult {
  notebook: string;
  totalCells: number;
  passedCells: number;
  failedCells: number;
  duration: number;
  cells: CellResult[];
}

interface CellResult {
  id: string;
  success: boolean;
  duration?: number;
  output?: unknown;
  error?: string;
  assertion?: {
    expected: string;
    actual: string;
    passed: boolean;
  };
}
```

### Handling Special Cases

1. **Mermaid rendering** - Skip or mock (requires Kroki API)
2. **LLM calls** - Mock or skip cells requiring API keys
3. **Long-running cells** - Set per-cell timeout (30s default)
4. **Interactive cells** - Skip checkpoint exercises

### Files to Create

- `playground/scripts/test-notebooks.ts` - Main test runner
- `playground/scripts/notebook-assertions.ts` - Expected outputs
- `playground/scripts/test-results.json` - Output artifact

### References

- [Deno Jupyter kernel](https://docs.deno.com/runtime/reference/cli/jupyter/)
- [Deno testing](https://docs.deno.com/runtime/manual/basics/testing)
- [GitHub Actions for Deno](https://github.com/denoland/setup-deno)

## Dev Agent Record

### Context Reference

Story created from Epic 3 definition in `docs/epics-playground.md`
Depends on Stories 3.2, 3.3, 3.4 (notebooks must work first)

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Designed notebook test execution strategy
- Defined assertion format for key outputs
- Planned CI integration

### File List

Files to create:
- `playground/scripts/test-notebooks.ts` (NEW)
- `playground/scripts/notebook-assertions.ts` (NEW)

Files to modify:
- `deno.json` (ADD test:notebooks task)
- `.github/workflows/test.yml` (ADD notebook job - optional)
