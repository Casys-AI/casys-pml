
# Story 1.5: Idempotent Init Helper

Status: done

## Story

As a **notebook author**,
I want **a helper that ensures the playground is ready**,
so that **each notebook can be run independently without manual setup**.

## Acceptance Criteria

1. `playground/lib/init.ts` exporte `ensurePlaygroundReady(options?)`
2. Vérifie si déjà initialisé (PGlite DB exists, embeddings loaded)
3. Si non initialisé → run full init (MCP connect, workflows sync)
4. Si déjà initialisé → skip rapidement (< 100ms)
5. Option `verbose: true` pour afficher le détail (utilisé dans notebook 00)
6. Retourne status `{ initialized: boolean, mcpServers: string[], workflowsLoaded: number }`

## Tasks / Subtasks

- [x] Task 1: Create init module structure (AC: #1)
  - [x] Create `playground/lib/init.ts`
  - [x] Define `InitOptions` interface with `verbose?: boolean`
  - [x] Define `InitStatus` interface for return type
  - [x] Export `ensurePlaygroundReady(options?: InitOptions): Promise<InitStatus>`

- [x] Task 2: Implement initialization state detection (AC: #2)
  - [x] Check if PGlite DB file exists at expected path
  - [x] Check if workflow_pattern table has records (quick count query)
  - [x] Check if MCP gateway is responding
  - [x] Use AGENTCARDS_DB_PATH from .env for path detection

- [x] Task 3: Implement full initialization flow (AC: #3)
  - [x] Check gateway availability via /api/tools endpoint
  - [x] Load workflow templates from config/workflow-templates.yaml
  - [x] Verify database connectivity
  - [x] Log each step with timestamps

- [x] Task 4: Implement skip logic for already-initialized state (AC: #4)
  - [x] Early return if all checks pass
  - [x] Measure and validate < 100ms skip time (tests confirm < 5ms)
  - [x] Log "Already initialized, skipping..." message

- [x] Task 5: Implement verbose mode (AC: #5)
  - [x] Add detailed logging when `verbose: true`
  - [x] Show MCP server connection status
  - [x] Show workflow count loaded
  - [x] Show DB path being used
  - [x] Format output with status indicators (✓, ✗, ⚠)

- [x] Task 6: Implement status return (AC: #6)
  - [x] Return `initialized: true/false` based on whether init ran
  - [x] Return `mcpServers: string[]` with connected server names
  - [x] Return `workflowsLoaded: number` with template count
  - [x] Add optional error field for partial failures
  - [x] Add `elapsedMs` field for performance tracking

- [x] Task 7: Add unit tests (AC: #1-6)
  - [x] Test: getPlaygroundDbPath uses env var
  - [x] Test: getPlaygroundDbPath falls back to default
  - [x] Test: Return status has correct structure
  - [x] Test: Handles missing gateway gracefully
  - [x] Test: Handles missing workflow file gracefully
  - [x] Test: Loads workflow templates when file exists
  - [x] Test: elapsedMs is reasonable
  - [x] Test: Skip path is fast (< 100ms)
  - [x] Test: Verbose mode doesn't throw

## Dev Notes

### Requirements Context

**From PRD-playground (FR001, FR002):**
- Le playground doit être prêt en < 5 minutes après ouverture Codespace
- Chaque notebook doit pouvoir s'exécuter indépendamment

**From Epics (Story 1.5):**
- Helper idempotent pour éviter re-initialisation coûteuse
- Support verbose pour notebook 00 (introduction)
- Dépend des stories 1.2 (MCP config), 1.3 (workflow templates), 1.4 (API key)

### Architecture Constraints

**Existing Infrastructure:**
- `playground/lib/llm-provider.ts` - LLM provider avec auto-detection
- `playground/lib/viz.ts` - Helpers de visualisation (539 lignes)
- `playground/config/mcp-servers.json` - Configuration MCP servers (Story 1.2)
- `playground/config/workflow-templates.yaml` - Templates workflows (Story 1.3)

**Gateway Integration:**
- Utiliser `src/mcp/gateway-server.ts` patterns pour connexion MCP
- Utiliser `src/graphrag/graph-engine.ts` pour sync workflow templates
- DB path: `AGENTCARDS_DB_PATH` ou default `~/.agentcards/.agentcards.db`

**Idempotency Pattern:**
```typescript
export async function ensurePlaygroundReady(options?: InitOptions): Promise<InitStatus> {
  const startTime = Date.now();

  // Check if already initialized
  if (await isAlreadyInitialized()) {
    if (options?.verbose) console.log("✓ Playground already initialized");
    return { initialized: false, mcpServers: [...], workflowsLoaded: X };
  }

  // Run full initialization
  const result = await runFullInit(options);

  if (options?.verbose) {
    console.log(`✓ Initialized in ${Date.now() - startTime}ms`);
  }

  return { initialized: true, ...result };
}
```

### Project Structure Notes

**Target Location:**
- `playground/lib/init.ts` (new file)

**Related Files:**
- `playground/lib/llm-provider.ts` - Pattern for Deno module structure
- `playground/lib/viz.ts` - Pattern for exports and types
- `playground/config/mcp-servers.json` - MCP server configuration
- `playground/config/workflow-templates.yaml` - Workflow templates

**Dependencies:**
- Story 1.2: MCP servers config must exist
- Story 1.3: Workflow templates must exist
- Story 1.4: API key setup available (optional, not required for init)

### Learnings from Previous Story

**From Story 1.4 (LLM API Key Setup Script):**

**Key Achievements:**
- Interactive CLI avec colored output et clear UX
- Auto-détection de provider depuis format de clé
- Backup strategy avant modification de fichiers
- 23 tests passing avec bonne couverture

**Patterns to Reuse:**
- **Module structure**: Export functions at top, types at top, implementation below
- **Error handling**: Actionable error messages with suggestions
- **Logging pattern**: Colored output avec status indicators (✓, ✗, ⚠)
- **Test structure**: Separate _test.ts file avec unit et integration tests

**Technical Dependencies:**
- Story 1.4 provides `llm-provider.ts` pattern for module structure
- `viz.ts` provides pattern for complex type definitions
- Gateway code provides MCP connection patterns

[Source: stories/1-4-llm-api-key-setup-script.md#Completion-Notes]

### Testing Strategy

**Unit Tests:**
1. `isAlreadyInitialized()` returns true when DB and embeddings exist
2. `isAlreadyInitialized()` returns false when DB missing
3. `ensurePlaygroundReady()` skips in < 100ms when already initialized
4. `ensurePlaygroundReady()` runs full init when not initialized
5. Status return has correct structure

**Integration Tests:**
1. Full init flow in clean environment
2. Idempotent re-run (second call skips)
3. Verbose mode output validation

**Performance Test:**
- Measure skip time < 100ms for already-initialized state

### References

- [PRD: FR001 - Quick Start](../PRD-playground.md#functional-requirements)
- [Epics: Story 1.5 - Idempotent Init Helper](../epics-playground.md#story-15-idempotent-init-helper)
- [Story 1.4: LLM API Key Setup Script](1-4-llm-api-key-setup-script.md) - Previous story learnings
- [ADR-021: Environment Variable Configuration](../adrs/ADR-021-environment-variable-configuration.md) - DB path pattern

## Dev Agent Record

### Context Reference

- [docs/stories/1-5-idempotent-init-helper.context.xml](1-5-idempotent-init-helper.context.xml)

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Simplified DB path detection to use .env pattern (AGENTCARDS_DB_PATH)
- Updated .env, .env.example with DB and workflow path variables
- Simplified deno.json dev:api task (env vars now loaded from .env)

### Completion Notes List

- Created `playground/lib/init.ts` with idempotent initialization helper
- Implemented `ensurePlaygroundReady()` function with verbose mode support
- DB path detection uses AGENTCARDS_DB_PATH env var (loaded from .env by Deno 2.0+)
- Gateway check via HTTP fetch with 2s timeout
- Workflow templates loaded from YAML config
- 9 unit tests passing covering all ACs
- Skip path confirmed < 5ms in tests

### File List

**Created:**
- `playground/lib/init.ts` - Main init helper module
- `playground/lib/init_test.ts` - Unit tests (9 tests)

**Modified:**
- `.env` - Added AGENTCARDS_DB_PATH and AGENTCARDS_WORKFLOW_PATH
- `.env.example` - Added documentation for new env vars
- `deno.json` - Simplified dev:api task (removed inline env vars)

## Change Log

**2025-12-04** - Story drafted
- Created from Epic 1 requirements in epics-playground.md
- 7 tasks with 23 subtasks mapped to 6 ACs
- Incorporated learnings from Story 1.4 (module patterns, error handling)
- Status: backlog → drafted

**2025-12-05** - Story completed
- Implemented all 7 tasks with full test coverage
- Simplified architecture: DB path via .env instead of auto-detection
- Updated env files for consistent dev/prod configuration
- 9/9 tests passing
- Status: ready-for-dev → review
