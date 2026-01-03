# Deep-Dive: Rust Crates (CasysDB Native Engine)

_Generated: 2026-01-03_

**Target:** `crates/` - Rust Native Engine Workspace
**Files Analyzed:** 36 Rust source files + 9 Cargo.toml
**Total LOC:** ~3,500 lines
**Architecture:** Hexagonal (Ports & Adapters)

---

## Executive Summary

The `crates/` directory contains a **Rust workspace** implementing CasysDB - a native graph database engine with:

- **ISO GQL support** (MATCH, CREATE, WHERE, RETURN, aggregates)
- **Hexagonal architecture** with swappable storage adapters
- **Multi-SDK bindings** (Python via PyO3, TypeScript via NAPI-RS)
- **Point-in-Time Recovery (PITR)** via WAL and manifests

---

## Dependency Graph

```
                     ┌─────────────────┐
                     │   casys_core    │  Domain: Types, Traits, Errors
                     └────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
    ┌─────────────────┐ ┌───────────┐ ┌───────────────┐
    │ casys_storage_* │ │casys_engine│ │ casys_pyo3   │
    │  (Adapters)     │ │ (GQL Core) │ │ casys_napi   │
    └─────────────────┘ └─────┬─────┘ │ (FFI/SDK)    │
           │                  │       └───────┬───────┘
           │                  │               │
           ▼                  ▼               ▼
    ┌──────────────────────────────────────────────┐
    │              Applications / SDKs              │
    │  Python: casys_engine.CasysEngine            │
    │  Node.js: CasysEngine (napi)                 │
    └──────────────────────────────────────────────┘
```

---

## Crate Inventory

### 1. casys_core (Domain Layer)

| Attribute | Value |
|-----------|-------|
| **Path** | `crates/casys_core/src/lib.rs` |
| **Lines** | 233 |
| **Purpose** | Pure domain: types, traits (ports), error definitions |
| **Dependencies** | `serde`, `serde_json`, `thiserror` |

#### Key Exports

| Export | Type | Description |
|--------|------|-------------|
| `NodeId`, `EdgeId` | `u64` | Graph element identifiers |
| `Value` | `enum` | Property value (Null, Bool, Int, Float, String, Bytes, Array, Map) |
| `DatabaseName`, `BranchName` | `struct` | Validated identifiers (alphanumeric, max 128 chars) |
| `GqlQuery` | `struct` | Wrapper for GQL query string |
| `QueryResult` | `struct` | Result with columns, rows, stats |
| `EngineError` | `enum` | Error variants: StorageIo, InvalidArgument, NotFound, Concurrency, NotImplemented |
| `Timestamp` | `u64` | Epoch milliseconds |

#### Storage Traits (Ports)

| Trait | Methods | Implementors |
|-------|---------|--------------|
| `StorageCatalog` | `list_branches`, `create_branch` | FsBackend, PostgresBackend (stub) |
| `ManifestStore` | `list_snapshot_timestamps`, `latest_manifest_meta`, `pitr_manifest_meta`, `read_manifest_meta`, `write_manifest_meta` | FsBackend, S3Backend (stub) |
| `SegmentStore` | `write_segment`, `read_segment` | FsBackend, S3Backend (stub) |
| `WalSink` | `append_records` | FsBackend, RedisBackend (stub) |
| `WalSource` | `list_wal_segments`, `read_wal_segment` | FsBackend, RedisBackend (stub) |
| `StorageBackend` | Combined interface | FsBackend, CompositeBackend |

#### CompositeBackend

Aggregates granular ports for mixed storage strategies:
```rust
CompositeBackend::new(
    catalog,   // StorageCatalog (e.g., FS)
    manifest,  // ManifestStore (e.g., S3)
    segments,  // SegmentStore (e.g., S3)
    wal_sink,  // WalSink (e.g., Redis)
    wal_source // WalSource (e.g., Redis)
)
```

---

### 2. casys_engine (Core Engine)

| Attribute | Value |
|-----------|-------|
| **Path** | `crates/casys_engine/` |
| **Files** | 16 |
| **Lines** | ~2,000 |
| **Purpose** | GQL parsing, planning, execution, in-memory graph store |
| **Features** | `mem` (default), `fs` (enables persistence) |

#### Module Structure

```
casys_engine/
├── lib.rs          # Engine struct, open/execute API
├── types/mod.rs    # Re-exports from casys_core
├── exec/
│   ├── mod.rs      # Module exports
│   ├── ast.rs      # GQL AST (Query, MatchClause, CreateClause, Expr, etc.)
│   ├── parser.rs   # Lexer + Recursive-descent parser (894 lines)
│   ├── planner.rs  # AST → ExecutionPlan (PlanNode tree)
│   └── executor.rs # Plan execution, tuple iteration (1017 lines)
├── index/
│   ├── mod.rs      # InMemoryGraphStore, GraphReadStore/GraphWriteStore traits
│   └── persistence.rs  # Segment flush/load (feature: fs)
├── txn/mod.rs      # Transaction placeholder
├── gds/mod.rs      # Graph Data Science placeholder
├── ann/mod.rs      # ANN (Approximate Nearest Neighbor) placeholder
├── branch.rs       # Branch management placeholder
├── tx.rs           # Transaction placeholder
├── merge.rs        # Merge placeholder
└── storage/mod.rs  # Storage abstraction placeholder
```

#### Engine API

| Method | Signature | Description |
|--------|-----------|-------------|
| `open` | `fn open<P: AsRef<Path>>(data_dir: P) -> Result<Self, EngineError>` | Open/create engine at directory |
| `open_with_backend` | `fn open_with_backend(..., backend: Arc<dyn StorageBackend>)` | Open with custom backend (fs feature) |
| `open_fs_composite` | `fn open_fs_composite(...)` | Open with CompositeBackend from FS adapter |
| `open_database` | `fn open_database(&self, name: &str) -> Result<DbHandle, EngineError>` | Get database handle |
| `open_branch` | `fn open_branch(&self, db: &DbHandle, branch: &str) -> Result<BranchHandle, EngineError>` | Get branch handle |
| `execute_gql` | `fn execute_gql(...) -> Result<QueryResult, EngineError>` | Execute GQL on branch (not yet implemented) |
| `execute_gql_on_store` | `fn execute_gql_on_store(&self, store: &mut InMemoryGraphStore, gql: &GqlQuery, params: Option<...>) -> Result<QueryResult, EngineError>` | Execute GQL on in-memory store |
| `flush_branch` | `fn flush_branch(..., store: &InMemoryGraphStore) -> Result<(), EngineError>` | Persist to segments (fs feature) |
| `load_branch` | `fn load_branch(...) -> Result<InMemoryGraphStore, EngineError>` | Load from segments (fs feature) |
| `create_branch` | `fn create_branch(..., at: Option<Timestamp>) -> Result<(), EngineError>` | Create branch with optional PITR |
| `snapshot` | `fn snapshot(...) -> Result<Timestamp, EngineError>` | Create manifest snapshot |
| `commit_tx` | `fn commit_tx(..., records: &[Vec<u8>]) -> Result<Timestamp, EngineError>` | Append WAL + snapshot |

#### GQL Support (MVP)

| Clause | Support | Example |
|--------|---------|---------|
| MATCH | Full | `MATCH (p:Person)` |
| CREATE | Full | `CREATE (:Person {name: 'Alice'})` |
| WHERE | Full | `WHERE p.age > 30` |
| RETURN | Full | `RETURN p.name, COUNT(p)` |
| WITH | Full | `WITH p.name AS n` |
| ORDER BY | Full | `ORDER BY p.age DESC` |
| LIMIT | Full | `LIMIT 10` |
| Edge Patterns | Full | `(a)-[:KNOWS]->(b)`, `(a)<-[:WORKS_FOR]-(b)` |
| Variable-length | Full | `(a)-[:KNOWS*1..3]->(b)` |
| EXISTS subquery | Full | `WHERE EXISTS { MATCH (p)-[:HAS]->(:Skill) }` |
| IS NULL/IS NOT NULL | Full | `WHERE p.email IS NOT NULL` |
| Parameters | Full | `WHERE p.id = $userId` |
| Aggregates | COUNT, SUM, AVG, MIN, MAX | `RETURN COUNT(p)` |
| Functions | ID() | `RETURN ID(p)` |

#### Execution Plan Nodes

| PlanNode | Description |
|----------|-------------|
| `LabelScan` | Scan nodes by label (uses label index) |
| `FullScan` | Scan all nodes |
| `Filter` | Apply predicate |
| `Project` | Select columns/expressions |
| `Expand` | Traverse edges (single-hop or variable-length BFS) |
| `Aggregate` | GROUP BY + aggregate functions |
| `OrderBy` | Sort results |
| `Limit` | Limit result count |
| `Create` | Create nodes/edges |
| `MatchCreate` | MATCH then CREATE pattern |
| `CartesianProduct` | Join multiple patterns |

#### InMemoryGraphStore

| Field | Type | Description |
|-------|------|-------------|
| `nodes` | `HashMap<NodeId, Node>` | Node storage |
| `edges` | `HashMap<EdgeId, Edge>` | Edge storage |
| `label_index` | `HashMap<String, Vec<NodeId>>` | Label → nodes index |
| `adjacency_out` | `HashMap<NodeId, Vec<EdgeId>>` | Outgoing edges index |
| `adjacency_in` | `HashMap<NodeId, Vec<EdgeId>>` | Incoming edges index |

---

### 3. casys_storage_fs (Filesystem Adapter)

| Attribute | Value |
|-----------|-------|
| **Path** | `crates/casys_storage_fs/` |
| **Files** | 7 |
| **Lines** | ~500 |
| **Purpose** | Implements all storage ports using local filesystem |

#### File Structure

```
casys_storage_fs/
├── lib.rs       # Module exports
├── mod.rs       # (same as lib.rs)
├── backend.rs   # FsBackend implementing all traits
├── catalog.rs   # Branch directory management
├── manifest.rs  # Manifest JSON (version snapshots)
├── segments.rs  # Segment binary format (CRC32 checksum)
├── wal.rs       # Write-Ahead Log (length-prefixed records)
└── util.rs      # Atomic file write
```

#### Directory Layout

```
<data_dir>/
└── <database>/
    └── branches/
        └── <branch>/
            ├── manifest-<timestamp>.json   # Snapshots
            ├── segments/
            │   └── <segment_id>.seg        # Graph data
            └── wal/
                └── wal-<epoch>-<seq>.wal   # WAL files
```

#### Manifest Format

```json
{
  "branch": "main",
  "version_ts": 1735890000000,
  "segments": [
    { "id": "sha256:abc123...", "range": { "tx_min": 0, "tx_max": 100 } }
  ],
  "wal_tail": { "epoch": 0, "seq": 5 }
}
```

#### WAL Format

| Field | Size | Description |
|-------|------|-------------|
| Length | 4 bytes (u32 LE) | Record length |
| Payload | Variable | Record data |

---

### 4. casys_storage_mem (In-Memory Stub)

| Attribute | Value |
|-----------|-------|
| **Path** | `crates/casys_storage_mem/src/lib.rs` |
| **Lines** | 8 |
| **Status** | Placeholder (MVP: engine uses InMemoryGraphStore directly) |

---

### 5. casys_storage_pg (PostgreSQL Stub)

| Attribute | Value |
|-----------|-------|
| **Path** | `crates/casys_storage_pg/src/lib.rs` |
| **Lines** | 55 |
| **Status** | Stub (implements StorageCatalog, returns NotImplemented) |
| **Feature** | `postgres` (optional: sqlx, tokio) |

---

### 6. casys_storage_redis (Redis Stub)

| Attribute | Value |
|-----------|-------|
| **Path** | `crates/casys_storage_redis/src/lib.rs` |
| **Lines** | 69 |
| **Status** | Stub (implements WalSink/WalSource, returns NotImplemented) |
| **Feature** | `redis` (optional: redis, tokio) |

---

### 7. casys_storage_s3 (S3 Stub)

| Attribute | Value |
|-----------|-------|
| **Path** | `crates/casys_storage_s3/src/lib.rs` |
| **Lines** | 117 |
| **Status** | Stub (implements ManifestStore/SegmentStore, returns NotImplemented) |
| **Feature** | `s3` (optional: aws-sdk-s3, tokio) |

---

### 8. casys_pyo3 (Python FFI)

| Attribute | Value |
|-----------|-------|
| **Path** | `crates/casys_pyo3/src/lib.rs` |
| **Lines** | 340 |
| **Purpose** | Python bindings via PyO3 |
| **Features** | `fs` (default), `mem` |
| **Crate Type** | `cdylib` + `rlib` |

#### Python API

```python
from casys_engine import CasysEngine, CasysBranch

# Create engine
engine = CasysEngine("/path/to/data")

# Open database and branch
db_name = engine.open_database("mydb")
branch = engine.open_branch("mydb", "main")

# Execute GQL queries
result = branch.query("CREATE (:Person {name: 'Alice', age: 30})")
result = branch.query("MATCH (p:Person) RETURN p.name, p.age")
# {'columns': ['p.name', 'p.age'], 'rows': [['Alice', 30]], 'stats': {...}}

# With parameters
result = branch.query(
    "MATCH (p:Person) WHERE p.name = $name RETURN p",
    {"name": "Alice"}
)

# Persistence (requires fs feature)
branch.flush()  # Save to disk
branch.load()   # Reload from disk

# Direct graph manipulation
node_id = branch.add_node(["Person"], {"name": "Bob"})
edge_id = branch.add_edge(node_id, other_id, "KNOWS", {"since": 2024})

# List snapshots
snapshots = engine.list_snapshots("mydb", "main")
```

#### Key Classes

| Class | Methods |
|-------|---------|
| `CasysEngine` | `new(data_dir)`, `open_database(name)`, `open_branch(db, branch)`, `create_branch(db, branch)`, `list_snapshots(db, branch)` |
| `CasysBranch` | `query(gql, params?)`, `flush()`, `load()`, `add_node(labels, props)`, `add_edge(from, to, type, props)` |

---

### 9. casys_napi (Node.js/TypeScript FFI)

| Attribute | Value |
|-----------|-------|
| **Path** | `crates/casys_napi/src/lib.rs` |
| **Lines** | 224 |
| **Purpose** | Node.js bindings via NAPI-RS |
| **Crate Type** | `cdylib` |

#### Node.js API

```typescript
import { CasysEngine, CasysBranch } from 'casys-napi';

// Create engine
const engine = new CasysEngine('/path/to/data');

// Open database and branch
const dbName = engine.openDatabase('mydb');
const branch = engine.openBranch('mydb', 'main');

// Execute GQL queries
const result = branch.query('MATCH (p:Person) RETURN p.name');
// { columns: '["p.name"]', rows: '[["Alice"]]' }

// Persistence
branch.flush();
branch.load();

// List snapshots (returns array of timestamps)
const timestamps: number[] = engine.listSnapshots('mydb', 'main');
```

---

## Data Flow Analysis

### Query Execution Flow

```
GQL String
    │
    ▼
┌─────────┐
│ Lexer   │  Tokenize input
└────┬────┘
     ▼
┌─────────┐
│ Parser  │  Build AST (Query, MatchClause, etc.)
└────┬────┘
     ▼
┌─────────┐
│ Planner │  AST → ExecutionPlan (PlanNode tree)
└────┬────┘
     ▼
┌──────────┐
│ Executor │  Iterate plan nodes, produce tuples
└────┬─────┘
     ▼
QueryResult { columns, rows, stats }
```

### Persistence Flow (fs feature)

```
InMemoryGraphStore
    │
    ▼ flush_branch()
┌──────────────────┐
│ Serialize to     │
│ Segment binary   │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Write segment    │  data/<db>/branches/<branch>/segments/<id>.seg
│ (CRC32 checksum) │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Write manifest   │  data/<db>/branches/<branch>/manifest-<ts>.json
└──────────────────┘
```

### WAL + PITR Flow

```
commit_tx(records)
    │
    ▼
┌──────────────────┐
│ WalWriter        │  Append length-prefixed records
│ append + fsync   │  data/<db>/branches/<branch>/wal/wal-<epoch>-<seq>.wal
└────────┬─────────┘
         ▼
┌──────────────────┐
│ snapshot()       │  Create new manifest with wal_tail
└──────────────────┘

load_branch at PITR:
    │
    ▼
┌──────────────────┐
│ pitr_manifest()  │  Find manifest with version_ts <= target
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Load segments    │  Restore graph state
│ + replay WAL     │
└──────────────────┘
```

---

## Integration Points

### From TypeScript (Deno)

The Rust crates are designed to be called from:

1. **Python SDK** - `casys_pyo3` provides native bindings
2. **Node.js SDK** - `casys_napi` provides native bindings
3. **Direct Rust** - Import `casys_engine` in Rust projects

### Connection to Main PML Project

The `crates/` workspace is a **native acceleration layer** for the main TypeScript/Deno PML project:

| Component | Language | Purpose |
|-----------|----------|---------|
| `src/` (main PML) | TypeScript | MCP Gateway, GraphRAG, DAG execution |
| `crates/` | Rust | Native graph DB engine for performance-critical paths |

---

## Risks & Gotchas

| Area | Risk | Mitigation |
|------|------|------------|
| **Parser** | 894 lines hand-written recursive descent | Add fuzz testing, consider pest/nom for grammar |
| **Executor** | 1017 lines with complex pattern matching | Add property-based tests |
| **Variable-length paths** | BFS can be expensive on dense graphs | Add depth limit enforcement, consider iterative deepening |
| **FS WAL** | No compaction implemented | Segments grow unbounded; need GC strategy |
| **Stubs** | pg/redis/s3 return NotImplemented | Must implement before production use |
| **Thread safety** | `Mutex<Engine>` in FFI wrappers | Consider fine-grained locking or RwLock |

---

## Verification Steps

Before modifying these crates:

```bash
# Run all tests
cd crates && cargo test --all-features

# Check specific crate
cargo test -p casys_engine --features fs

# Build Python bindings
cd crates/casys_pyo3 && maturin build --features fs

# Build Node.js bindings
cd crates/casys_napi && npm run build
```

---

## Suggested Tests

| Test Type | Target | Example |
|-----------|--------|---------|
| Unit | Parser | `parse("MATCH (n) RETURN n")` produces correct AST |
| Unit | Planner | `plan(query)` produces correct PlanNode tree |
| Integration | Executor | Full GQL execution with InMemoryGraphStore |
| Integration | FS persistence | `flush` then `load` preserves graph state |
| Property | Parser | Fuzz with random valid/invalid GQL |
| Property | Roundtrip | Any graph should survive flush/load cycle |

---

## Future Roadmap (from README.md)

1. **Re-cable dependencies** - casys_engine depends on casys_core + casys_storage_*
2. **Rename casys_ffi → casys_pyo3** - Done
3. **Implement storage adapters** - pg, redis, s3
4. **Move engine/ to apps/casys-http** - Optional HTTP server
5. **Add casys_napi for TypeScript SDK** - Done (stub)

---

## File Inventory Summary

| Crate | Files | LOC | Status |
|-------|-------|-----|--------|
| casys_core | 1 | 233 | Complete |
| casys_engine | 16 | ~2,000 | MVP Complete |
| casys_storage_fs | 7 | ~500 | Complete |
| casys_storage_mem | 1 | 8 | Placeholder |
| casys_storage_pg | 1 | 55 | Stub |
| casys_storage_redis | 1 | 69 | Stub |
| casys_storage_s3 | 1 | 117 | Stub |
| casys_pyo3 | 2 | 340 | Complete |
| casys_napi | 2 | 224 | Complete |
| **Total** | **32** | **~3,546** | |

---

_Documentation generated by document-project workflow deep-dive mode_
