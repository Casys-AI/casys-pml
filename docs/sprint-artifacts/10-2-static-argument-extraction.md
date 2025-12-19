# Story 10.2: Static Argument Extraction for Speculative Execution

Status: backlog

> **Epic:** 10 - DAG Capability Learning & Unified APIs
> **Prerequisites:** Story 10.1 (Static Structure Builder - DONE)
> **Depends on:** Story 3.5-1 (Speculative Execution)

---

## Story

As a speculative execution system,
I want to extract and store tool arguments from static code analysis,
So that I can execute capabilities speculatively without requiring runtime argument inference.

---

## Context & Problem

**Le probleme actuel:**
Story 10.1 parse le code et extrait les appels MCP tools, mais ne capture PAS les arguments passes:

```typescript
// Code parse :
const file = await mcp.fs.read({ path: "config.json" });

// Structure actuelle (Story 10.1) :
{ id: "n1", type: "task", tool: "fs:read" }  // <- PAS d'arguments !

// Structure souhaitee (Story 10.2) :
{ id: "n1", type: "task", tool: "fs:read", arguments: { path: { type: "literal", value: "config.json" } } }
```

**Pourquoi c'est important pour la speculation:**
- L'execution speculative a besoin des arguments pour vraiment executer
- Les arguments peuvent etre: litteraux, variables resolues via chainage, ou parametres de la capability
- Sans arguments, on ne peut que "preparer" l'execution, pas l'executer

---

## Distinction importante : parametersSchema vs Arguments

**Ce qui existe deja (Story 7.2b - SchemaInferrer):**

`parametersSchema` decrit les INPUTS de la capability (comme une signature de fonction):

```typescript
// Code analyse :
const file = await mcp.fs.read({ path: args.filePath });
if (args.debug) console.log(file);

// parametersSchema produit (deja implemente) :
{
  type: "object",
  properties: {
    filePath: { type: "string" },
    debug: { type: "boolean" }
  }
}
// → Dit "la capability attend un param filePath de type string et debug de type boolean"
```

**Ce que Story 10.2 ajoute:**

`arguments` de chaque node decrit COMMENT les params sont utilises dans chaque appel tool:

```typescript
// Code analyse :
const file = await mcp.fs.read({ path: args.filePath });
const parsed = await mcp.json.parse({ input: file.content });

// static_structure.nodes[0].arguments (Story 10.2) :
{
  path: { type: "parameter", parameterName: "filePath" }
}
// → Dit "le tool fs:read recoit path qui vient du param filePath de la capability"

// static_structure.nodes[1].arguments (Story 10.2) :
{
  input: { type: "reference", expression: "file.content" }
}
// → Dit "le tool json:parse recoit input qui vient du resultat de file"
```

**Le lien entre les deux:**
Story 10.2 utilise `parametersSchema` pour classifier les Identifiers :
- Si `filePath` est dans `parametersSchema.properties` → c'est un `parameter`
- Si c'est une MemberExpression (`file.content`) → c'est une `reference`
- Si c'est un literal (`"config.json"`) → c'est un `literal`

---

**Types d'arguments a gerer:**

| Type | Exemple | Stockage | Resolution |
|------|---------|----------|------------|
| **Litteral** | `{ path: "config.json" }` | Valeur directe | Immediat |
| **Reference interne** | `{ input: file.content }` | Expression AST | Via ProvidesEdge a l'execution |
| **Parametre externe** | `{ path: args.filePath }` | Nom du parametre | Via parametersSchema de la capability |

---

## Acceptance Criteria

### AC1: StaticStructureNode Extended with Arguments
- [ ] Type `StaticStructureNode` (task variant) extended:
```typescript
type StaticStructureNode =
  | {
      id: string;
      type: "task";
      tool: string;
      arguments?: ArgumentsStructure;  // NEW
    }
  // ... other variants unchanged
```

### AC2: ArgumentsStructure Type Defined
- [ ] New type in `src/capabilities/types.ts`:
```typescript
interface ArgumentValue {
  type: "literal" | "reference" | "parameter";
  value?: unknown;           // For literal: the actual value
  expression?: string;       // For reference: "file.content", "result.data"
  parameterName?: string;    // For parameter: "userPath", "inputData"
}

interface ArgumentsStructure {
  [key: string]: ArgumentValue;
}
```

### AC3: Literal Argument Extraction
- [ ] Extract literal values from ObjectExpression arguments
- [ ] Support: strings, numbers, booleans, null
- [ ] Support: nested objects and arrays (JSON-serializable)
- [ ] Store as `{ type: "literal", value: <parsed_value> }`

### AC4: Reference Argument Detection
- [ ] Detect MemberExpression arguments (e.g., `file.content`)
- [ ] Extract expression as string representation
- [ ] Store as `{ type: "reference", expression: "file.content" }`
- [ ] Link to ProvidesEdge for resolution path

### AC5: Parameter Argument Detection
- [ ] Detect Identifier arguments that are function parameters
- [ ] Cross-reference with capability's input_schema
- [ ] Store as `{ type: "parameter", parameterName: "userPath" }`

### AC6: Integration with PredictedNode
- [ ] `PredictedNode.arguments` populated from static_structure at prediction time
- [ ] Literals copied directly
- [ ] References resolved via ProvidesEdge + previous task results
- [ ] Parameters extracted from intent (future: NLP parsing)

### AC7: Tests
- [ ] Test: literal string argument extracted correctly
- [ ] Test: literal object argument (nested) extracted correctly
- [ ] Test: reference argument (member expression) detected
- [ ] Test: parameter argument (identifier) detected
- [ ] Test: mixed arguments (literal + reference) handled
- [ ] Test: empty arguments handled gracefully

---

## Tasks / Subtasks

- [ ] **Task 1: Define ArgumentsStructure types** (AC: 2)
  - [ ] Add `ArgumentValue` interface to types.ts
  - [ ] Add `ArgumentsStructure` type alias to types.ts
  - [ ] Export new types from mod.ts

- [ ] **Task 2: Extend StaticStructureNode** (AC: 1)
  - [ ] Add optional `arguments?: ArgumentsStructure` to task variant
  - [ ] Update type guards if any

- [ ] **Task 3: Implement argument extraction in StaticStructureBuilder** (AC: 3, 4, 5)
  - [ ] Add `extractArguments(callExpression)` method
  - [ ] Handle ObjectExpression (most common case)
  - [ ] Classify each property as literal, reference, or parameter
  - [ ] Add `extractLiteralValue()` for JSON-serializable values
  - [ ] Add `extractReferenceExpression()` for member expressions
  - [ ] Add `isParameterIdentifier()` to check against function params

- [ ] **Task 4: Store arguments in static_structure nodes** (AC: 1, 2, 3, 4, 5)
  - [ ] Modify `handleCallExpression()` to extract and store arguments
  - [ ] Ensure backward compatibility (arguments optional)

- [ ] **Task 5: Link to PredictedNode** (AC: 6)
  - [ ] In `predictNextNodes()`, populate `PredictedNode.arguments` from capability's static_structure
  - [ ] Resolve literals immediately
  - [ ] Mark references for runtime resolution
  - [ ] Mark parameters as "needs extraction from intent"

- [ ] **Task 6: Write tests** (AC: 7)
  - [ ] Create/extend `tests/unit/capabilities/static_structure_builder_test.ts`
  - [ ] Test literal extraction (string, number, boolean, object, array)
  - [ ] Test reference detection
  - [ ] Test parameter detection
  - [ ] Test mixed argument scenarios
  - [ ] Test edge cases (empty args, spread operator, computed properties)

---

## Dev Notes

### SWC AST for Arguments

```typescript
// Code: mcp.fs.read({ path: "config.json", verbose: true })
// AST (simplified):
{
  type: "CallExpression",
  callee: { /* MemberExpression: mcp.fs.read */ },
  arguments: [{
    type: "ObjectExpression",
    properties: [
      {
        type: "KeyValueProperty",
        key: { type: "Identifier", value: "path" },
        value: { type: "StringLiteral", value: "config.json" }
      },
      {
        type: "KeyValueProperty",
        key: { type: "Identifier", value: "verbose" },
        value: { type: "BooleanLiteral", value: true }
      }
    ]
  }]
}
```

### Reference Expression Examples

```typescript
// Reference to previous result
{ input: file.content }
// AST: MemberExpression { object: Identifier("file"), property: Identifier("content") }
// Store as: { type: "reference", expression: "file.content" }

// Chained reference
{ data: result.items[0].value }
// Store as: { type: "reference", expression: "result.items[0].value" }
```

### Link to Speculative Execution

```typescript
// In SpeculativeExecutor.executeSpeculation():
async executeSpeculation(prediction: PredictedNode, context: ExecutionContext) {
  const args = {};

  for (const [key, argValue] of Object.entries(prediction.arguments || {})) {
    if (argValue.type === "literal") {
      args[key] = argValue.value;
    } else if (argValue.type === "reference") {
      // Resolve from previous task results via ProvidesEdge
      args[key] = resolveReference(argValue.expression, context.taskResults);
    } else if (argValue.type === "parameter") {
      // Extract from intent (future: NLP) or fail speculation
      args[key] = context.extractedParams?.[argValue.parameterName];
      if (args[key] === undefined) {
        throw new Error(`Missing parameter: ${argValue.parameterName}`);
      }
    }
  }

  return sandbox.execute(prediction.toolId, args);
}
```

### Architecture Alignment

| Pattern | Convention |
|---------|------------|
| SWC version | `https://deno.land/x/swc@0.2.1/mod.ts` (same as 10.1) |
| Type location | `src/capabilities/types.ts` |
| Implementation | `src/capabilities/static-structure-builder.ts` |
| Error handling | Graceful (return empty arguments on parse error) |

---

## References

- Story 10.1: Static Code Analysis - Capability Creation (prerequisite)
- Story 10.3: Provides Edge Type (for reference resolution)
- Story 3.5-1: DAG Suggester & Speculative Execution (consumer)
- ADR-006: Speculative Execution as Default Mode
- `src/capabilities/static-structure-builder.ts` - Implementation target
- `src/graphrag/types.ts` - PredictedNode with arguments field

---

## Dev Agent Record

### Agent Model Used

TBD

### Completion Notes List

TBD

### File List

- [ ] `src/capabilities/types.ts` - MODIFY (add ArgumentsStructure types)
- [ ] `src/capabilities/static-structure-builder.ts` - MODIFY (add argument extraction)
- [ ] `src/capabilities/mod.ts` - MODIFY (export new types if needed)
- [ ] `tests/unit/capabilities/static_structure_builder_test.ts` - MODIFY (add argument tests)
