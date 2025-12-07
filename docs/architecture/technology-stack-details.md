# Technology Stack Details

## Core Technologies

**Runtime Environment:**

- Deno 2.5 (latest) or 2.2 (LTS)
- TypeScript 5.7+ (via Deno)
- ES2022 target

**Database & Vector Search:**

- PGlite 0.3.11 (PostgreSQL 17 WASM)
- pgvector extension (HNSW index)
- IndexedDB persistence (browser) / Filesystem (Deno)

**ML & Embeddings:**

- @huggingface/transformers 3.7.6
- BGE-M3 model (Xenova/bge-m3, 1024-dim embeddings)
- ONNX Runtime (WASM backend)

**MCP Integration:**

- @modelcontextprotocol/sdk (official)
- stdio transport (primary)
- SSE transport (optional)

## Integration Points

**External Systems:**

- **MCP Servers (15+):** stdio subprocess via `Deno.Command`
- **Claude Code:** Reads `~/.config/Claude/claude_desktop_config.json`
- **File System:** Config in `~/.agentcards/`, logs, database

**Internal Communication:**

- CLI → DB: PGlite SQL queries
- CLI → Vector: Semantic search API
- Gateway → MCP Servers: stdio protocol
- Executor → Tools: Async function calls
- Streaming → Client: SSE events

---
