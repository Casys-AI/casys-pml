# ADR-064: Registry Stored Hash Lookup

**Status:** Accepted
**Date:** 2026-01-15
**Decision Makers:** Engineering Team

## Context

The MCP Registry service (`McpRegistryService`) was failing to find capabilities with valid FQDNs. When a client sent a 5-part FQDN like `superWorldSavior.default.std.exec_43e92fd8.43e9`, the server returned 404 "Capability not found" even though the record existed in the database.

### Root Cause Analysis

The bug stemmed from hash computation mismatch:

1. **Database state**: `capability_records` stores hash `43e9` for the capability
2. **VIEW limitation**: `pml_registry` VIEW did not expose the `hash` column
3. **Service behavior**: `enrichRow()` recomputed hash from `name:description`:
   ```typescript
   hashContent = `${row.name}:${row.description || ""}`;
   integrity = await computeIntegrity(type, hashContent);
   shortHash = extractShortHash(integrity); // → "e38c"
   ```
4. **Mismatch**: Computed hash `e38c` ≠ stored hash `43e9`
5. **Result**: `entry.fqdn !== fqdn` → 404

### Flow Diagram

```
Client Request: superWorldSavior.default.std.exec_43e92fd8.43e9
                                                          ^^^^
                                                       hash=43e9

  ↓ getByFqdn(fqdn)

Service: findInRegistry("superWorldSavior.default.std.exec_43e92fd8")
  ↓ Found row in pml_registry (but no hash column!)

Service: enrichRow(row)
  ↓ Computes hash from "std:exec_43e92fd8:Get git repository status..."
  ↓ SHA-256 first 4 chars = "e38c"

Service: generateFQDN({...hash: "e38c"})
  ↓ entry.fqdn = "superWorldSavior.default.std.exec_43e92fd8.e38c"

Compare: "...43e9" !== "...e38c" → return null → 404
```

## Decision

**Use stored hash from database instead of recomputing.**

### Changes

1. **Migration 040**: Add `hash` column to `pml_registry` VIEW
   ```sql
   CREATE OR REPLACE VIEW pml_registry AS
     -- MCP Tools (hash = NULL)
     SELECT ..., NULL::text as hash FROM tool_schema
     UNION ALL
     -- Capabilities (hash from capability_records)
     SELECT ..., cr.hash FROM capability_records cr ...
   ```

2. **Type Update**: Add `hash: string | null` to `PmlRegistryRow`

3. **Service Logic**: Use stored hash for capabilities
   ```typescript
   if (row.record_type === "capability" && row.hash) {
     shortHash = row.hash;  // Use stored, don't recompute
     integrity = `capability:${row.hash}`;
   } else {
     // Compute for MCP tools (no stored hash)
     ...
   }
   ```

## Consequences

### Positive

- **Correctness**: FQDN lookup now works with stored hashes
- **Consistency**: Hash in FQDN matches what was stored at creation time
- **Performance**: Avoids unnecessary SHA-256 computation for capabilities

### Negative

- **VIEW change**: Requires migration to add column (minimal risk)
- **Dual logic**: Different hash handling for capabilities vs MCP tools

### Neutral

- MCP tools continue using computed hashes (they have no stored hash)
- Integrity field for capabilities is placeholder (`capability:{hash}`) - actual integrity comes from codeUrl fetch

## Alternatives Considered

### 1. Recompute hash at capability creation time
- **Rejected**: Would require changing capability storage logic
- Breaking change for existing capabilities with stored hashes

### 2. Ignore hash in FQDN comparison for capabilities
- **Rejected**: Defeats purpose of hash-based versioning
- Security concern: could serve wrong version

### 3. Store full integrity hash instead of short hash
- **Considered for future**: Would allow proper lockfile validation
- Out of scope for this fix

## Related

- Migration: `src/db/migrations/040_pml_registry_hash_column.ts`
- Service: `src/mcp/registry/mcp-registry.service.ts`
- Types: `src/mcp/registry/types.ts`
- Tests: `tests/unit/db/migrations/pml_registry_hash_test.ts`
