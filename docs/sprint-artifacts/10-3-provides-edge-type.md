# Story 10.3: Provides Edge Type - Data Flow Relationships

Status: ready-for-dev

> **Epic:** 10 - DAG Capability Learning & Unified APIs
> **Tech-Spec:** [tech-spec-dag-capability-learning.md](../tech-specs/tech-spec-dag-capability-learning.md)
> **Prerequisites:** Story 10.1 (Static Analysis - DONE, provides edges at code level)
> **Depends on:** Epic 7 (Emergent Capabilities), existing `tool_schema` table with input/output schemas

---

## Story

As a graph learning system,
I want a `provides` edge type that captures data flow between tools,
So that I can understand which tools can feed data to which other tools and improve DAG suggestions.

---

## Context

**Distinction between Story 10.1 and 10.3:**

| Aspect | Story 10.1 (DONE) | Story 10.3 (THIS) |
|--------|-------------------|-------------------|
| **Level** | Code analysis | Graph system |
| **Scope** | Edges WITHIN a capability's code | Edges BETWEEN tools in the global graph |
| **Location** | `src/capabilities/static-structure-builder.ts` | `src/graphrag/algorithms/edge-weights.ts` + new calculator |
| **Data Source** | AST analysis + inline schema lookup | MCP tool schemas from `tool_schema` table |
| **Purpose** | Visualize data flow in capability structure | Improve DAG suggestions via schema-based relatedness |

**Why this matters:**
- The DAGSuggester can use `provides` edges to understand which tools naturally chain together
- Pathfinding algorithms can prefer paths where data flows naturally (A's output -> B's input)
- The graph visualization can show data flow relationships separate from co-occurrence

**Coverage Types (from Epic spec):**
```typescript
type ProvidesCoverage =
  | "strict"     // R <= O (all required inputs covered)
  | "partial"    // R intersection O != empty (some required covered)
  | "optional";  // Only optional inputs covered
```

---

## Acceptance Criteria

### AC1: Cleanup EdgeType in edge-weights.ts
- [ ] Add `provides` to `EdgeType` union
- [ ] Remove `alternative` (not used, not in ADR-050)
- [ ] Final `EdgeType`: `"dependency" | "contains" | "sequence" | "provides"`

### AC2: Configure provides Weight
- [ ] Add `provides: 0.7` to `EDGE_TYPE_WEIGHTS`
- [ ] Position: stronger than sequence (0.5), weaker than contains (0.8)
- [ ] Rationale: Data flow is meaningful but less certain than explicit hierarchy

### AC3: Define ProvidesEdge Interface
- [ ] Create interface in `src/graphrag/types.ts`:
```typescript
interface ProvidesEdge {
  from: string;              // Tool/capability provider
  to: string;                // Tool/capability consumer
  type: "provides";
  coverage: ProvidesCoverage;

  // Schemas exposed for AI to understand how to fill args
  providerOutputSchema: JSONSchema;   // What A produces
  consumerInputSchema: JSONSchema;    // What B expects (required + optional)
  fieldMapping: Array<{               // Field-by-field correspondences
    fromField: string;       // e.g., "content"
    toField: string;         // e.g., "json"
    typeCompatible: boolean; // Types compatible?
  }>;
}
```

### AC4: Implement computeCoverage Function
- [ ] Create `src/graphrag/provides-edge-calculator.ts`
- [ ] Function signature:
```typescript
function computeCoverage(
  providerOutputs: Set<string>,
  consumerInputs: { required: Set<string>; optional: Set<string> }
): ProvidesCoverage | null
```
- [ ] Returns `null` if no intersection (no edge)
- [ ] Returns `"strict"` if all required inputs covered
- [ ] Returns `"partial"` if some required inputs covered
- [ ] Returns `"optional"` if only optional inputs covered

### AC5: Implement createProvidesEdges Function
- [ ] Function to calculate provides edges from MCP tool schemas
- [ ] Signature:
```typescript
async function createProvidesEdges(
  db: PGliteClient,
  toolIds?: string[]  // Optional filter, all tools if not provided
): Promise<ProvidesEdge[]>
```
- [ ] Query `tool_schema.input_schema` and `tool_schema.output_schema`
- [ ] For each pair (A, B), calculate coverage
- [ ] Create edge if coverage !== null
- [ ] Include field mapping for each matched field

### AC6: Type Compatibility Check
- [ ] Implement `areTypesCompatible(fromType: string, toType: string): boolean`
- [ ] Basic rules:
  - Same type = compatible
  - `string` -> `any` = compatible
  - `object` -> `any` = compatible
  - `number` -> `string` = compatible (can stringify)
- [ ] Strictness configurable via parameter

### AC7: Database Storage
- [ ] No migration needed - `edge_type` column is already TEXT
- [ ] Ensure `tool_dependency` table can store `provides` edges
- [ ] Include `provides_metadata` JSONB for schema details (optional)

### AC8: Integration with GraphStore
- [ ] `GraphStore.addEdge()` accepts `provides` edge type
- [ ] `GraphStore.getEdges()` can filter by `provides` type
- [ ] Edge weight calculation uses `EDGE_TYPE_WEIGHTS.provides`

### AC9: Tests
- [ ] Test: `fs:read` (output: content) -> `json:parse` (input: json) -> coverage = "partial" or "strict"
- [ ] Test: `json:parse` -> `http:post` (needs url, body) -> coverage = "partial"
- [ ] Test: No overlap between schemas -> null (no edge)
- [ ] Test: Provider has no output_schema -> null (no edge)
- [ ] Test: Field mapping correctly identifies compatible fields

---

## Tasks / Subtasks

- [ ] **Task 1: Update EdgeType** (AC: 1, 2)
  - [ ] Edit `src/graphrag/algorithms/edge-weights.ts`
  - [ ] Add `provides` to EdgeType union
  - [ ] Remove `alternative` from EdgeType
  - [ ] Add `provides: 0.7` to EDGE_TYPE_WEIGHTS
  - [ ] Update JSDoc comments

- [ ] **Task 2: Define Types** (AC: 3)
  - [ ] Add `ProvidesCoverage` type to `src/graphrag/types.ts`
  - [ ] Add `ProvidesEdge` interface to `src/graphrag/types.ts`
  - [ ] Add `FieldMapping` interface
  - [ ] Export from module

- [ ] **Task 3: Create Provides Edge Calculator** (AC: 4, 5, 6)
  - [ ] Create `src/graphrag/provides-edge-calculator.ts`
  - [ ] Implement `computeCoverage()` function
  - [ ] Implement `areTypesCompatible()` helper
  - [ ] Implement `createFieldMapping()` helper
  - [ ] Implement `createProvidesEdges()` main function
  - [ ] Export from `src/graphrag/algorithms/mod.ts`

- [ ] **Task 4: Integrate with GraphStore** (AC: 7, 8)
  - [ ] Verify `GraphStore.addEdge()` handles provides type
  - [ ] Add `getProvideEdges()` method if needed
  - [ ] Ensure edge weight calculation works

- [ ] **Task 5: Write Tests** (AC: 9)
  - [ ] Create `tests/unit/graphrag/provides_edge_calculator_test.ts`
  - [ ] Test computeCoverage() with various schemas
  - [ ] Test createProvidesEdges() with mock tool schemas
  - [ ] Test field mapping generation
  - [ ] Test type compatibility rules

---

## Dev Notes

### Reusable Pattern from Story 10.1

Story 10.1 already implemented `computeCoverage()` in `static-structure-builder.ts:841-881`. The algorithm can be reused:

```typescript
// From static-structure-builder.ts (lines 841-881)
private computeCoverage(
  providerOutput: { properties?: Record<string, unknown> },
  consumerInput: { properties?: Record<string, unknown>; required?: string[] },
): ProvidesCoverage | null {
  const outputProps = new Set(Object.keys(providerOutput.properties || {}));
  const inputProps = new Set(Object.keys(consumerInput.properties || {}));
  const requiredInputs = new Set(consumerInput.required || []);

  // Calculate intersections
  const allIntersection = new Set([...outputProps].filter((p) => inputProps.has(p)));
  const requiredIntersection = new Set([...outputProps].filter((p) => requiredInputs.has(p)));
  const optionalIntersection = new Set([...allIntersection].filter((p) => !requiredInputs.has(p)));

  // No intersection = no edge
  if (allIntersection.size === 0) return null;

  // All required covered = strict
  if (requiredInputs.size > 0 && requiredIntersection.size === requiredInputs.size) {
    return "strict";
  }

  // Some required covered = partial
  if (requiredIntersection.size > 0) return "partial";

  // Only optional covered
  if (optionalIntersection.size > 0) return "optional";

  return null;
}
```

**Difference:** Story 10.3's version also needs to return `fieldMapping` details.

### Current edge-weights.ts Structure

```typescript
// Current (from src/graphrag/algorithms/edge-weights.ts)
export type EdgeType = "dependency" | "contains" | "alternative" | "sequence";

export const EDGE_TYPE_WEIGHTS: Record<EdgeType, number> = {
  dependency: 1.0,   // Explicit DAG from templates
  contains: 0.8,     // Parent-child hierarchy
  alternative: 0.6,  // Same intent, different implementation (REMOVE)
  sequence: 0.5,     // Temporal order
};

// Target after this story:
export type EdgeType = "dependency" | "contains" | "sequence" | "provides";

export const EDGE_TYPE_WEIGHTS: Record<EdgeType, number> = {
  dependency: 1.0,   // Explicit DAG from templates
  contains: 0.8,     // Parent-child hierarchy
  provides: 0.7,     // Data flow (NEW)
  sequence: 0.5,     // Temporal order
};
```

### Tool Schema Table Structure

```sql
-- From migration 004
CREATE TABLE tool_schema (
  tool_id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input_schema JSONB,      -- JSON Schema for tool inputs
  output_schema JSONB,     -- JSON Schema for tool outputs (may be null)
  description TEXT,
  intent_embedding vector(1024),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Example Schema Analysis

```typescript
// filesystem:read_file schema
{
  input_schema: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"]
  },
  output_schema: {
    type: "object",
    properties: { content: { type: "string" } }
  }
}

// json:parse schema
{
  input_schema: {
    type: "object",
    properties: { json: { type: "string" } },
    required: ["json"]
  },
  output_schema: {
    type: "object",
    properties: { parsed: { type: "object" } }
  }
}

// Analysis: fs:read_file -> json:parse
// Provider outputs: { content }
// Consumer inputs: { json } (required)
// Intersection: {} (no exact match)
// But with field mapping: content -> json (both strings) = partial coverage
```

### Field Mapping Heuristics

The field mapping needs intelligent matching beyond exact name match:

1. **Exact match:** `content` -> `content`
2. **Common patterns:**
   - `content`, `text`, `data` -> `json`, `input`, `body`
   - `result`, `output` -> `input`, `data`
   - `path`, `file` -> `path`, `file_path`
3. **Type-based:** If types match and names are semantically similar

### Project Structure Notes

**Files to Create:**
- `src/graphrag/provides-edge-calculator.ts` (~100-150 LOC)

**Files to Modify:**
- `src/graphrag/algorithms/edge-weights.ts` (~10 LOC) - Add provides, remove alternative
- `src/graphrag/types.ts` (~30 LOC) - Add ProvidesEdge, FieldMapping interfaces

**Test Files:**
- `tests/unit/graphrag/provides_edge_calculator_test.ts` - New test file

### References

**Source Files:**
- [src/graphrag/algorithms/edge-weights.ts](../../src/graphrag/algorithms/edge-weights.ts) - EdgeType definitions
- [src/graphrag/types.ts](../../src/graphrag/types.ts) - Graph type definitions
- [src/capabilities/static-structure-builder.ts:841-881](../../src/capabilities/static-structure-builder.ts) - computeCoverage reference implementation
- [src/capabilities/types.ts:364](../../src/capabilities/types.ts) - ProvidesCoverage type already defined

**Epic & Specs:**
- [epic-10-dag-capability-learning-unified-apis.md](../epics/epic-10-dag-capability-learning-unified-apis.md#story-103)
- [tech-spec-dag-capability-learning.md](../tech-specs/tech-spec-dag-capability-learning.md)

**ADRs:**
- ADR-041: Hierarchical Trace Tracking
- ADR-050: Edge Types (informs removal of `alternative`)

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Change Log

- 2025-12-18: Story context created by BMM create-story workflow

### File List

- [ ] `src/graphrag/algorithms/edge-weights.ts` - MODIFY (add provides, remove alternative)
- [ ] `src/graphrag/types.ts` - MODIFY (add ProvidesEdge, FieldMapping)
- [ ] `src/graphrag/provides-edge-calculator.ts` - NEW (~100-150 LOC)
- [ ] `src/graphrag/algorithms/mod.ts` - MODIFY (export new calculator)
- [ ] `tests/unit/graphrag/provides_edge_calculator_test.ts` - NEW
