# pml:discover — Find Tools

> Search by what you want to do, not by tool name

---

## Basic Usage

Describe what you need in plain language:

```typescript
pml:discover({ intent: "read files from disk" })
```

PML returns the best matching tools, ranked by relevance.

---

## Search Modes

### 1. Semantic Search (most common)

Find tools by describing your goal:

```typescript
// Find tools for file operations
pml:discover({ intent: "read and write JSON files" })

// Find tools for git
pml:discover({ intent: "commit and push changes" })

// Find tools for HTTP
pml:discover({ intent: "make API requests" })
```

### 2. Pattern Search

List tools matching a glob pattern:

```typescript
// All filesystem tools
pml:discover({ pattern: "filesystem:*" })

// All read operations
pml:discover({ pattern: "*:read_*" })
```

### 3. Exact Lookup

Get a specific tool by name:

```typescript
pml:discover({ name: "filesystem:read_file" })
```

### 4. Get Full Details

Get complete metadata by ID:

```typescript
pml:discover({ id: "abc123-def456" })
```

---

## Options

| Option | Type | Description |
|--------|------|-------------|
| `intent` | string | What you want to accomplish |
| `pattern` | string | Glob pattern (e.g., `fs:*`) |
| `name` | string | Exact tool name |
| `id` | string | UUID or FQDN for full details |
| `limit` | number | Max results (default: 1 for search, 50 for list) |
| `offset` | number | Skip N results (for pagination) |
| `filter.type` | string | `"tool"`, `"capability"`, or `"all"` |
| `filter.minScore` | number | Minimum relevance score (0-1) |

---

## Examples

### Find one best tool

```typescript
pml:discover({
  intent: "parse CSV data",
  limit: 1
})
```

### Find multiple options

```typescript
pml:discover({
  intent: "send notifications",
  limit: 5
})
```

### Only search capabilities (learned patterns)

```typescript
pml:discover({
  intent: "deploy to production",
  filter: { type: "capability" }
})
```

### Only search raw tools

```typescript
pml:discover({
  intent: "database queries",
  filter: { type: "tool" }
})
```

### Only high-confidence results

```typescript
pml:discover({
  intent: "send email",
  filter: { minScore: 0.8 }
})
```

### Paginate through results

```typescript
// First page
pml:discover({ pattern: "filesystem:*", limit: 10 })

// Second page
pml:discover({ pattern: "filesystem:*", limit: 10, offset: 10 })
```

---

## What's Returned

```json
{
  "results": [
    {
      "type": "tool",
      "id": "filesystem:read_file",
      "name": "read_file",
      "description": "Read file contents",
      "score": 0.92
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `type` | `"tool"` or `"capability"` |
| `id` | Unique identifier |
| `name` | Tool name |
| `description` | What it does |
| `score` | Relevance (0-1) |

---

## Tips

- **Be specific** — "read JSON config files" works better than "read files"
- **Use verbs** — "create", "read", "update", "delete" help matching
- **Start with limit: 1** — Get the best match first, increase if needed

---

## Next

Once you've found tools, use them with [**pml:execute**](./execute.md).
