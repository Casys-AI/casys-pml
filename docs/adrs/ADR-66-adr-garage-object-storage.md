# ADR: Garage Object Storage for UI Cache

**Date:** 2026-02-03
**Status:** Accepted
**Context:** Story 16.6 - MCP Apps UI Cache

## Decision

Use **Garage** as embedded S3-compatible object storage for caching MCP Apps UI HTML bundles.

## Context

Story 16.6 requires caching UI HTML resources fetched from MCP servers via `resources/read`. Initial implementation used Deno KV, but:

1. **Deno KV has a 64KB value limit** - UI bundles can exceed 100KB even when gzip compressed
2. **UI count will scale** - Each MCP server can expose multiple UIs, potentially hundreds across all servers
3. **Need offline access** - UIs must be available when MCP servers are disconnected

## Options Considered

### 1. Deno KV (Rejected)
- ✅ Native to Deno, zero install
- ❌ **64KB value limit** - Fatal for large HTML bundles
- ❌ No standard API (vendor lock-in)

### 2. PostgreSQL BYTEA/TEXT (Considered)
- ✅ Already in stack, no new infra
- ✅ No size limit
- ⚠️ Not designed for blob storage
- ⚠️ Adds load to primary DB

### 3. SQLite with BLOB (Considered)
- ✅ Single file, embedded
- ✅ Good Deno support (denodrivers/sqlite3)
- ⚠️ Not designed for large blobs
- ⚠️ No standard API

### 4. Local Files (Considered)
- ✅ Simplest, no limits
- ❌ No atomic operations
- ❌ No TTL/expiration
- ❌ Hard to manage metadata

### 5. MinIO (Rejected)
- ✅ Industry standard S3 API
- ❌ **Entered maintenance mode** (Dec 2025)
- ❌ ~1GB RAM overhead

### 6. Garage (Selected)
- ✅ **Single binary** (~20MB), no Docker required
- ✅ **S3-compatible API** - Use any S3 client
- ✅ **Lightweight** - ~100MB RAM
- ✅ **SQLite metadata** - No external DB
- ✅ Active development, AGPLv3
- ✅ Designed for self-hosted deployments
- ⚠️ New dependency to manage

## Decision Rationale

Garage provides the best balance of:
- **Simplicity**: Single binary + config file
- **Standards**: S3 API means portable code
- **Scalability**: Can handle thousands of UI resources
- **Reliability**: Built-in replication (optional)

## Implementation

### Deployment
```
data/garage/
├── garage          # Binary
├── garage.toml     # Config
├── .env            # Credentials
├── meta/           # SQLite metadata
└── data/           # Object storage
```

### Configuration
```toml
metadata_dir = "data/garage/meta"
data_dir = "data/garage/data"
db_engine = "sqlite"
replication_factor = 1

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
```

### Access
- **Endpoint**: `http://127.0.0.1:3900`
- **Bucket**: `ui-cache`
- **Region**: `garage`

### UiCacheService Changes
Replace Deno KV with S3 client:
- `set()` → `PutObject`
- `get()` → `GetObject`
- `delete()` → `DeleteObject`
- `listAll()` → `ListObjects`

## Consequences

### Positive
- No size limits for UI bundles
- Standard S3 API for future flexibility
- Can migrate to cloud S3 if needed
- Better suited for binary content

### Negative
- New process to manage (can add to systemd)
- Port 3900 used
- Slightly more complex deployment

### Neutral
- Need to start Garage before main app
- Credentials stored in `data/garage/.env`

## Migration

1. Existing Deno KV cache (`data/ui-cache.db`) can be deleted
2. UIs will be re-fetched on next MCP discovery
3. No data migration needed

## References

- [Garage Documentation](https://garagehq.deuxfleurs.fr/)
- [MinIO Maintenance Mode Announcement](https://www.infoq.com/news/2025/12/minio-s3-api-alternatives/)
- [Garage vs MinIO Comparison](https://lobste.rs/s/hshaq4/alternatives_minio_for_single_node_local)
