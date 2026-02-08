# Verification

## Test Case 1: Sequential with Variables

```typescript
const users = await mcp.db.query({ sql: "SELECT * FROM users" });
const active = users.filter(u => u.active);
const sum = active.reduce((s, u) => s + u.age, 0);
```

**Expected:**
- `n2.arguments`: `{ input: { type: "reference", expression: "n1" } }`
- `n3.arguments`: `{ input: { type: "reference", expression: "n2" } }`
- Edges: `n1→n2` (sequence), `n2→n3` (sequence)
- dependsOn: `n2: ["n1"]`, `n3: ["n2"]`
- layerIndex: n1=0, n2=1, n3=2

## Test Case 2: Mixed MCP + Code

```typescript
const config = await mcp.filesystem.read_file({ path: "config.json" });
const parsed = JSON.parse(config);
const keys = Object.keys(parsed);
```

**Expected:**
- `n2.arguments`: `{ input: { type: "reference", expression: "n1" } }`
- `n3.arguments`: `{ input: { type: "reference", expression: "n2" } }`
- Edges: `n1→n2`, `n2→n3`
- dependsOn: `n2: ["n1"]`, `n3: ["n2"]`
- layerIndex: n1=0, n2=1, n3=2

## Test Case 3: Binary Operators

```typescript
const a = await mcp.filesystem.read_file({ path: "a.txt" });
const b = await mcp.filesystem.read_file({ path: "b.txt" });
const combined = a + b;
```

**Expected:**
- `n3.arguments`: `{ left: { type: "reference", expression: "n1" }, right: { type: "reference", expression: "n2" } }`
- Edges: `n1→n3`, `n2→n3`
- dependsOn: `n3: ["n1", "n2"]`
- layerIndex: n1=0, n2=0, n3=1

## Test Case 4: Chained Still Works (Regression)

```typescript
const result = nums.filter(n => n > 2).map(n => n * 2);
```

**Expected:** Same behavior as before (edges via `chainedFrom` metadata)

## Test Case 5: DR-DSP Path Finding (Provides Edges)

```typescript
const config = await mcp.filesystem.read_file({ path: "config.json" });
const parsed = JSON.parse(config);
const filtered = parsed.items.filter(x => x.active);
const count = filtered.length + 1;  // arithmetic - no provides edge
await mcp.db.insert({ data: filtered });
```

**Expected Provides Edges:**
- `n1 (read_file) → n2 (JSON.parse)`: via MCP schema
- `n2 (JSON.parse) → n3 (filter)`: `json_object` → `array` (semantic match)
- `n3 (filter) → n5 (db.insert)`: `filtered_array` → schema input

**No Provides Edge for:**
- `n4 (add)`: Arithmetic operators skipped

**DR-DSP Path:**
```
read_file ──provides──> JSON.parse ──provides──> filter ──sequence──> add ──sequence──> db.insert
                                                         ──provides──────────────────────────────>
```
