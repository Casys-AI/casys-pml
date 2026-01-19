# pml:admin — Manage Capabilities

> Rename, organize, and merge your learned capabilities

---

## What are Capabilities?

When you run code with `pml:execute`, PML learns the pattern and saves it as a **capability**.

Capabilities have:
- A **name** (e.g., `pkg.read_dependencies`)
- A **namespace** (e.g., `local.default`)
- **Tags** for organization
- **Visibility** (private, project, org, public)

Use `pml:admin` to manage these.

---

## All Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `action` | string | **Yes** | `"rename"` or `"merge"` |
| `target` | string | **Yes** | Capability ID or FQDN to modify |
| `namespace` | string | No | New namespace (rename) |
| `action_name` | string | No | New action name (rename) |
| `description` | string | No | New description (rename) |
| `tags` | string[] | No | New tags array (rename) |
| `visibility` | string | No | `"private"`, `"project"`, `"org"`, `"public"` (rename) |
| `source` | string | No | Capability to merge from (merge) |
| `prefer_source_code` | boolean | No | Use source's code even if older (merge) |

---

## Rename a Capability

Change the name, namespace, or metadata:

```typescript
pml:admin({
  action: "rename",
  target: "local.default.pkg.extract_deps.a7f3",
  namespace: "myproject",
  action_name: "read_dependencies",
  description: "Read package.json and extract dependency list",
  tags: ["npm", "dependencies", "package"]
})
```

---

## Merge Capabilities

Combine two capabilities into one:

```typescript
pml:admin({
  action: "merge",
  target: "myproject.read_config",
  source: "local.default.old_read_config"
})
```

This keeps `target` and deletes `source`.

---

## Visibility Levels

| Level | Who can use it |
|-------|----------------|
| `private` | Only you |
| `project` | Anyone in this project |
| `org` | Anyone in your organization |
| `public` | Everyone |

```typescript
// Make a capability public
pml:admin({
  action: "rename",
  target: "myproject.useful_workflow",
  visibility: "public"
})
```

---

## Finding Capabilities to Manage

Use `pml:discover` to find your capabilities:

```typescript
// List all your capabilities
pml:discover({
  pattern: "*",
  filter: { type: "capability" }
})

// Find by intent
pml:discover({
  intent: "read dependencies",
  filter: { type: "capability" }
})
```

---

## Examples

### Clean up auto-generated names

```typescript
// Before: local.default.pkg.extract_deps_v2.a7f3
// After: myproject.read_dependencies

pml:admin({
  action: "rename",
  target: "local.default.pkg.extract_deps_v2.a7f3",
  namespace: "myproject",
  action_name: "read_dependencies"
})
```

### Add documentation

```typescript
pml:admin({
  action: "rename",
  target: "myproject.deploy",
  description: "Deploy to production with zero-downtime rolling update",
  tags: ["deploy", "production", "kubernetes"]
})
```

### Share with team

```typescript
pml:admin({
  action: "rename",
  target: "myproject.useful_script",
  visibility: "org"
})
```

---

## Tips

- **Name clearly** — Future you will thank present you
- **Add tags** — Makes discovery easier
- **Merge duplicates** — Keep your capability library clean
- **Share useful ones** — Help your team

---

## Back to

- [**Quick Start**](./index.md)
- [**Discover**](./discover.md)
- [**Execute**](./execute.md)
