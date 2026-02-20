# ADR-068: FQDN as Canonical Format in dag_structure.tools_used

**Status:** Accepted
**Date:** 2026-02-20
**Deciders:** Architecture Team
**Related:** ADR-059 (Hybrid Routing), ADR-065 (Deferred Trace Flush), ADR-064 (Registry Stored Hash Lookup)

## Context

### The Problem: Mixed Formats in dag_structure.tools_used

`workflow_pattern.dag_structure->>'tools_used'` (JSONB text array) stores which MCP tools a capability uses. Three write paths produce **two different formats** in the same column:

| Write Path | Code File | Format Written | Example |
|---|---|---|---|
| Package client trace | `execution-capture.service.ts:143` | **FQDN** | `pml.mcp.std.psql_query.db48` |
| Server-side execution | `execute-direct.use-case.ts:684` | **Short** | `std:psql_query` |
| Worker sandbox | `worker-bridge.ts:429` | **Short** | `std:psql_query` |

This inconsistency means queries on `dag_structure.tools_used` can miss matches when comparing short-format queries against FQDN-stored values (or vice versa).

### The FQDN Format

```
{org}.{project}.{namespace}.{action}.{hash}
 │       │          │          │        └─ content hash (version)
 │       │          │          └─ tool name
 │       │          └─ MCP server namespace
 │       └─ project scope
 └─ organization scope
```

Example: `pml.mcp.std.psql_query.db48a3f1`

### What Consumers Do Today

All compute/ML consumers already normalize FQDN to short format at read time:
- GRU training (`training-utils.ts`) — `normalizeToolId()` at line 155
- SHGAT graph construction (`db-sync.ts`, `initializer.ts`) — `normalizeToolId()`
- Trace path extraction (`trace-path.ts`) — `normalizeToolId()` via `cleanToolIds()`

This works and is the correct pattern: **store rich, read normalized**.

### Erroneous Migration (2026-02-20)

A DB migration normalized `dag_structure.tools_used` FQDN values to short format (209 -> 181 distinct tools, 1039 -> 875 edges). This was **incorrect** — it destroyed information (org, project, hash) that cannot be recovered.

## Decision

**FQDN is the canonical storage format for `dag_structure.tools_used`.**

Consumers normalize at read time via `normalizeToolId()`. The write paths that produce short format should be updated to resolve FQDN before storage.

### Rationale

1. **FQDN encodes real semantic value:**
   - **Multi-tenancy** — `acme.prod.std.psql_query` vs `beta.staging.std.psql_query` distinguishes the same tool used by different tenants
   - **Versioning** — hash segment changes when tool definition evolves, enabling future version comparison
   - **Provenance** — org/project traces which scope provided the tool

2. **Normalization is cheap, de-normalization is impossible:**
   - `normalizeToolId("pml.mcp.std.psql_query.db48")` -> `"std:psql_query"` is trivial (split on `.`, take parts[2]:parts[3])
   - Going from `"std:psql_query"` back to the FQDN requires a registry lookup that may fail
   - Store rich, read cheap

3. **The code was already designed for this:**
   - `execution-capture.service.ts:143` has an explicit comment: *"toolsUsed for DB storage: use FQDNs"*
   - `resolveToolsToFqdns()` is a 30-line dedicated function with documented resolution order
   - `resolveToolFqdn()` in `user.ts` is a first-class function (capability_records -> pml_registry -> error)

4. **Tool observations extend per-tool identity:**
   - `tool_observations` table (migration 042/045) stores per-user, per-server MCP tool configs
   - Each tool can have multiple observed configurations (`observed_config JSONB`)
   - FQDN in `tools_used` enables joining against observations by namespace for richer analysis

5. **GRU and SHGAT don't need FQDN — they normalize:**
   - GRU learns on short format vocabulary (`std:psql_query`) and will continue to
   - SHGAT scores tools by membership, agnostic to format
   - Both normalize at read time; storing FQDN doesn't affect them
   - Future: GRU *could* learn FQDN-level distinctions if multi-tenant data grows

## Consequences

### Positive
- Single consistent format in `dag_structure.tools_used`
- Preserves org/project/version info for future multi-tenant features
- No loss of information at write time
- Consumers already handle normalization

### Negative
- 8 residual FQDN entries (from recent erpnext/playwright caps) coexist with ~180 short entries from the erroneous normalization migration
- The erroneous migration cannot be fully rolled back (original FQDN info is lost for pre-migration data, backup exists as `_backup_dag_structure_20260220`)

### Actions Required

| Action | Priority | Status |
|---|---|---|
| Document decision (this ADR) | P0 | **DONE** |
| **Normalize `toolsUsed` in `rowToCapability` (L908)** | **P1** | TODO — `.map(normalizeToolId)`. Fixes 10+ consumers in one line. `Capability.toolsUsed` contract = short format. |
| Fix SQL `searchByContext` (L806) — normalize inside query | P1 | TODO — `WHERE tool = ANY($1)` compares DB-FQDN vs input-short. `rowToCapability` fix doesn't help here (SQL-level comparison). |
| Remove redundant normalizations in `post-execution.service.ts:266`, `initializer.ts:421` | P1 | TODO — becomes no-op after rowToCapability fix |
| Align `execute-direct.use-case.ts` server branch to resolve FQDN before write | P2 | TODO |
| Align `worker-bridge.ts` to resolve FQDN before write | P2 | TODO |
| Do NOT re-run the normalization migration on new data | P0 | Noted |
| Update tech spec 2026-02-18 to reflect this decision | P0 | **DONE** |

### What NOT to Do

- **Do NOT normalize at write** — this destroys information
- **Do NOT create a new migration to re-normalize** — future writes will be FQDN
- **Do NOT add FQDN resolution to SHGAT/GRU read paths** — they correctly normalize to short format
- **The hash in FQDN may change between deploys** — this is expected and acceptable; it's a content hash, not a stable version ID. Future versioning (if needed) will use a separate mechanism.
