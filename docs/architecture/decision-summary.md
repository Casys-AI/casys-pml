# Decision Summary

| Category           | Decision                  | Version          | Affects Epics  | Rationale                                                                                 |
| ------------------ | ------------------------- | ---------------- | -------------- | ----------------------------------------------------------------------------------------- |
| Runtime            | Deno                      | 2.5 / 2.2 LTS    | Epic 1, Epic 2 | PROVIDED BY INIT - TypeScript native, secure by default, npm compat                       |
| Database           | PGlite                    | 0.3.11           | Epic 1         | Embedded PostgreSQL WASM, portable single-file, 3MB footprint                             |
| Vector Search      | pgvector (HNSW)           | Built-in PGlite  | Epic 1         | Production-ready ANN search, <100ms P95, supports cosine/L2/IP                            |
| Embeddings         | @huggingface/transformers | 3.7.6            | Epic 1         | BGE-M3 (Xenova/bge-m3) local inference, Deno compatible, 1024-dim vectors, v3 with WebGPU |
| MCP Protocol       | @modelcontextprotocol/sdk | 1.21.1           | Epic 1, Epic 2 | Official TypeScript SDK, 10.5k stars, stdio + SSE transport                               |
| CLI Framework      | cliffy                    | 1.0.0-rc.8       | Epic 1         | Type-safe args parsing, auto-help, shell completions, Deno-first (JSR)                    |
| Configuration      | @std/yaml                 | 1.0.5            | Epic 1         | Standard YAML parsing for config.yaml (JSR stable)                                        |
| Logging            | @std/log                  | 0.224.14         | Epic 1         | Structured logging with levels (JSR, UNSTABLE)                                            |
| DAG Execution      | Custom (zero deps)        | N/A              | Epic 2         | Topological sort + Promise.all, no external dependency                                    |
| Graph Algorithms   | graphology                | 0.26.0           | Epic 2         | True PageRank, Louvain, bidirectional search - "NetworkX of JavaScript"                   |
| SSE Streaming      | Native ReadableStream     | Deno built-in    | Epic 2         | Server-Sent Events for progressive results                                                |
| Process Management | Deno.Command              | Deno built-in    | Epic 1         | stdio subprocess for MCP server communication                                             |
| Testing            | Deno.test                 | Deno built-in    | Epic 1, Epic 2 | Native testing + benchmarks, >80% coverage target                                         |
| HTTP Server        | Deno.serve                | Deno 2+ built-in | Epic 2         | Modern HTTP server API for gateway (if needed)                                            |

---
