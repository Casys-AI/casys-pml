# Solution Options

## Option A: Add `arguments` to `code:*` Tasks (Selected)

Extract arguments for all `code:*` tasks so `nodeReferencesNode()` works identically to MCP tools.

**Pros:**
- Uses existing edge generation logic unchanged
- Consistent mechanism for all task types
- `nodeReferencesNode()` works without modification
- Cleaner architecture long-term

**Cons:**
- Need to modify each code:* handler in StaticStructureBuilder
- ~4-6 hours effort

## Option B: Extend `nodeReferencesNode()` with Code Parsing (Rejected)

Parse the `code` field with regex to find variable references.

**Pros:**
- Minimal changes to existing code

**Cons:**
- Two different mechanisms for dependency detection
- Regex can have false positives (local variables with same name)
- Less maintainable

## Decision: Option A

**Rationale:** Unifying the mechanism is better for long-term maintainability. MCP tools and code:* tasks will both use `arguments` with the same structure, and `nodeReferencesNode()` works unchanged.
