# Tech-Specs to Code Implementation Mapping

**Generated:** 2026-01-19
**Scope:** Tech-specs ↔ Source code correlation

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Tech-Specs Analyzed | 47 |
| Implementation Files | 520 TypeScript |
| Test Files | 77+ |
| ADRs Referenced | 58 |

---

## Implementation Status by Cluster

### Cluster 1: Authentication & Multi-Tenancy (100% ✅)
| Tech-Spec | Files | Tests | ADR |
|-----------|-------|-------|-----|
| GitHub Auth Multi-Tenancy | `src/server/auth/oauth.ts`, `session.ts` | `oauth_test.ts` | ADR-040 |
| User FQDN Multi-Tenant | `src/lib/user.ts`, `src/capabilities/fqdn.ts` | `user_fqdn_test.ts` | ADR-040 |
| loadByFqdn Integrity | `src/capabilities/capability-registry.ts` | Integration tests | ADR-033 |
| Permission Matrix | `src/capabilities/permission-escalation-handler.ts` | E2E tests | ADR-035 |

### Cluster 2: Capability Discovery & Management (95% ✅)
| Tech-Spec | Files | Tests | ADR |
|-----------|-------|-------|-----|
| MCP Tools Consolidation | `src/mcp/handlers/discover-handler-facade.ts`, `admin-handler-facade.ts` | `discover_handler_test.ts` | ADR-051 |
| Refactor cap.ts MCP Client | `src/mcp/handlers/cap-handler.ts`, `lib/std/cap.ts` | `cap_test.ts` | ADR-018 |
| MCP Tools Auto-Sync | `packages/pml/src/cli/stdio-command.ts` | `std_tools_test.ts` | ADR-025 |
| Capability Naming Curation | `src/capabilities/fqdn.ts` (partial) | - | ADR-033 |

### Cluster 3: DAG & Execution (90% ✅)
| Tech-Spec | Files | Tests | ADR |
|-----------|-------|-------|-----|
| PML Execute Hybrid Routing | `src/mcp/handlers/code-execution-handler.ts`, `routing-resolver.ts` | E2E tests | ADR-025, ADR-052 |
| SHGAT Multihead Traces | `src/sandbox/executor.ts` | Multiple E2E | ADR-056, ADR-057 |
| Unified Node Type | `src/graphrag/types/`, `src/dag/types.ts` | `dag_execution.test.ts` | ADR-050 |

### Cluster 4: UI & Observability (50% 🔄)
| Tech-Spec | Files | Status |
|-----------|-------|--------|
| Graph Insights Panel | `src/api/graph-insights.ts` | 60% |
| Emergence Dashboard | `src/web/components/` | 50% |
| User Docs Audit | `docs/` | 40% |

### Cluster 5: Architecture Refactoring (🔄 Ongoing)
| Phase | Files | Status |
|-------|-------|--------|
| 2.1 DI | `src/infrastructure/di/` | In Progress |
| 2.2 God Classes | Multiple large files | In Progress |
| 2.3-3.4 | - | Pending |

---

## Design Patterns Used

### 1. Handler Facade Pattern (13 files)
```
src/mcp/handlers/
├── execute-handler-facade.ts
├── discover-handler-facade.ts
├── admin-handler-facade.ts
├── code-execution-handler.ts
└── cap-handler.ts
```

### 2. Use Case Pattern (33 files)
```
src/application/use-cases/
├── discover/ (ListCapabilities, Lookup, GetDetails)
├── admin/ (RenameCapability, MergeCapabilities)
├── execute/ (ExecuteDirect, ExecuteSuggestion, ContinueWorkflow)
├── code/ (ExecuteCode)
├── capabilities/ (SearchCapabilities, GetSuggestion)
└── workflows/ (AbortWorkflow, ReplanWorkflow)
```

### 3. Repository Pattern
- `IToolRepository` - Tool lookup
- `CapabilityRegistry` - FQDN lookup, multi-tenant scoping
- `CapabilityStore` - Persistence

---

## Code WITHOUT Tech-Specs (Undocumented)

| Module | Purpose | LOC | Documented In |
|--------|---------|-----|---------------|
| `src/vector/` | BGE-M3 embeddings | 1,500+ | ADR-001, ADR-003 |
| `src/graphrag/` | GraphRAG engine | 3,000+ | ADR-005, ADR-007 |
| `src/sandbox/` | Sandbox execution | 2,000+ | ADR-032, ADR-035 |
| `src/dag/` | DAG executor | 2,500+ | ADR-002, ADR-010 |
| `src/telemetry/` | OTEL integration | 800+ | ADR-034, ADR-039 |

**Total Undocumented:** ~15,000+ LOC

---

## Tech-Specs WITHOUT Code (Unimplemented)

| Tech-Spec | Status | Reason | Effort |
|-----------|--------|--------|--------|
| CasysDB GDS Integration | Draft | Rust integration | High |
| Capability Naming Curation | Draft | LLM curation | High |
| SHGAT v1 Refactor Series | Draft | ML redesign | Very High |

---

## Key ADR Cross-References

| ADR | Title | Status |
|-----|-------|--------|
| ADR-018 | Command handlers minimalism | ✅ Implemented |
| ADR-025 | MCP streamable HTTP transport | ✅ Implemented |
| ADR-032 | Sandbox worker RPC bridge | ✅ Implemented |
| ADR-033 | Capability code deduplication | ✅ Implemented |
| ADR-035 | Permission sets sandbox security | ✅ Implemented |
| ADR-040 | Multi-tenant MCP secrets | ✅ Implemented |
| ADR-051 | Unified search simplification | ✅ Implemented |
| ADR-052 | Dynamic capability routing | ✅ Implemented |

---

## Recommendations

1. **Document undocumented modules** - vector, graphrag, sandbox, dag, telemetry
2. **Complete UI specs** - Graph Insights, Emergence Dashboard ready for dev
3. **Finish Architecture Phase 2** - God class splitting
4. **Add traceability** - Link every file to tech-spec or ADR
