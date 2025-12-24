---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: ready-for-development
inputDocuments:
  - docs/spikes/2025-12-23-jsr-package-local-mcp-routing.md
  - docs/PRD.md
  - docs/architecture.md
---

# Procedural Memory Layer (PML) - Epic 14: JSR Package Local/Cloud MCP Routing

## Overview

This document provides the complete epic and story breakdown for Epic 14, implementing a lightweight JSR package (`jsr:@casys/pml`) that enables hybrid local/cloud MCP execution. This solves the critical problem where cloud-hosted PML gateway uses server filesystem and API keys instead of user's local resources.

## Requirements Inventory

### Functional Requirements

**From Spike Document:**

- **FR14-1:** The system must provide a lightweight JSR package (`jsr:@casys/pml`) installable via `deno install`
- **FR14-2:** The system must resolve workspace path using priority: ENV var → project root detection → CWD fallback
- **FR14-3:** The system must route MCP calls based on `routing: local | cloud` configuration in `mcp-permissions.yaml`
- **FR14-4:** The system must dynamically import MCP code from registry (JSR or configured source)
- **FR14-5:** The system must execute local MCPs (filesystem, shell, sqlite) in Deno sandbox with scoped permissions
- **FR14-6:** The system must forward cloud MCPs (pml:search, GraphRAG, tavily) via HTTP RPC to `pml.casys.ai`
- **FR14-7:** The system must expose an MCP HTTP Streamable server for Claude Code integration
- **FR14-8:** The system must support BYOK (Bring Your Own Key) for third-party MCPs via local environment variables
- **FR14-9:** The system must generate `.mcp.json` configuration via `pml init` command
- **FR14-10:** The system must cache downloaded MCP code via Deno's native module caching

**Cross-referenced from PRD (FR020-FR025):**

- **FR14-11:** The package must work in both Local mode (zero-auth) and Cloud mode (API key required)
- **FR14-12:** The system must apply user's local API keys for BYOK MCPs (stored in local env, not sent to cloud for storage)

### Non-Functional Requirements

- **NFR14-1:** Package size must be minimal (~few KB) for fast installation
- **NFR14-2:** Local MCP execution must have <50ms overhead vs direct execution
- **NFR14-3:** Sandbox permissions must follow principle of least privilege (read/write scoped to workspace only by default, extensible if user wants)
- **NFR14-4:** Package must work offline for cached local MCPs (graceful degradation if cloud unavailable)
- **NFR14-5:** Installation to first workflow must complete in <5 minutes (aligned with PRD NFR002)

### Additional Requirements

**From Architecture (ADR-040, tech-spec-open-core-workspace):**

- Must integrate with existing `PermissionInferrer` for routing decisions
- Must use existing `mcp-permissions.yaml` schema with new `routing` field
- Must align with dual-server architecture (API server + Dashboard)
- Sandbox execution must use Deno Worker or subprocess with explicit permission flags

**Technical Notes:**

- HIL (Human-in-the-Loop) integration needs verification (existing technical debt)
- Users may want permissions broader than workspace - must be configurable
- **Critical Invariant:** Local execution NEVER goes to cloud server

**Dependencies:**

- **Epic 9:** Authentication & Multi-tenancy (for API key validation)
- **Epic 13:** Capability Naming & Curation (for registry strategy decision)

### FR Coverage Map

| FR | Epic | Story | Description |
|----|------|-------|-------------|
| FR14-1 | Epic 14 | 14.1 | Package JSR installable via `deno install` |
| FR14-2 | Epic 14 | 14.2 | Workspace resolution (ENV → detection → CWD) |
| FR14-3 | Epic 14 | 14.3 | Routing based on `mcp-permissions.yaml` |
| FR14-4 | Epic 14 | 14.4, 14.7 | Dynamic MCP import from registry |
| FR14-5 | Epic 14 | 14.5 | Sandboxed local MCP execution |
| FR14-6 | Epic 14 | 14.6 | Forward cloud MCPs via HTTP RPC |
| FR14-7 | Epic 14 | 14.6 | HTTP Streamable server local |
| FR14-8 | Epic 14 | 14.6 | BYOK support via local env vars |
| FR14-9 | Epic 14 | 14.1 | `.mcp.json` generation via `pml init` |
| FR14-10 | Epic 14 | 14.4 | MCP code caching via Deno |
| FR14-11 | Epic 14 | 14.6 | Local and Cloud mode support |
| FR14-12 | Epic 14 | 14.6 | Local API keys never stored on cloud |

## Epic List

- **Epic 14**: JSR Package Local/Cloud MCP Routing

---

## Epic 14: JSR Package Local/Cloud MCP Routing

**Goal:** Implement a lightweight JSR package that routes MCP calls between local execution (user's filesystem, shell, API keys) and cloud execution (PML gateway services), enabling users to leverage cloud PML intelligence while maintaining local data sovereignty.

**Value Proposition:**
- Users can use cloud-hosted PML features (GraphRAG, DAG execution, search)
- While local MCPs (filesystem, shell) execute on user's machine with user's permissions
- BYOK model ensures user API keys never leave their machine (not stored on cloud)
- Single `deno install` + `pml init` setup experience

**Architecture Overview:**

```
Claude Code
    │ HTTP (localhost:PORT/mcp)
    ▼
jsr:@casys/pml (lightweight local package)
    │
    ├─► Local MCPs (routing: local)
    │     └─► Sandboxed Deno execution with workspace-scoped permissions
    │     └─► Code loaded from JSR: jsr:@casys/pml-mcp-{name}
    │
    └─► Cloud MCPs (routing: cloud)
          └─► HTTP RPC to pml.casys.ai + BYOK injection
```

**Prerequisites:**
- Epic 9 (Authentication & Multi-tenancy) for API key validation
- Epic 13 (Capability Naming & Curation) for final registry strategy

---

### Story 14.1: Package Scaffolding & CLI Init Command

As a developer,
I want to install the PML package with a single command and initialize my project,
So that I can start using PML with minimal setup friction.

**Acceptance Criteria:**

**Given** a developer with Deno installed
**When** they run `deno install -A -n pml jsr:@casys/pml`
**Then** the `pml` command is available globally
**And** the package size is under 50KB

**Given** a developer in their project directory
**When** they run `pml init`
**Then** they are prompted for their PML API key (or can skip for local-only mode)
**And** a `.mcp.json` file is generated with the PML server configuration
**And** a `.pml.json` config file is created with workspace and cloud URL settings

**Given** an existing `.mcp.json` file
**When** running `pml init`
**Then** the system asks for confirmation before modifying
**And** backs up the original file to `.mcp.json.backup`

---

### Story 14.2: Workspace Resolution System

As a developer,
I want PML to automatically detect my project workspace,
So that file operations are correctly scoped without manual configuration.

**Acceptance Criteria:**

**Given** the environment variable `PML_WORKSPACE` is set
**When** the PML package starts
**Then** it uses that path as the workspace root

**Given** no `PML_WORKSPACE` env var
**When** the PML package starts from a directory with `.git`, `deno.json`, or `package.json`
**Then** it traverses up to find the project root containing these markers
**And** uses that as the workspace

**Given** no env var and no project markers found
**When** the PML package starts
**Then** it falls back to the current working directory
**And** logs a warning suggesting explicit configuration

**Given** a resolved workspace path
**When** any local MCP requests a file operation
**Then** the path is validated to be within the workspace
**And** operations outside workspace are rejected with clear error message

---

### Story 14.3: Routing Configuration & Permission Inferrer Integration

As a platform maintainer,
I want MCP routing decisions based on declarative configuration,
So that routing logic is consistent and auditable.

**Acceptance Criteria:**

**Given** the existing `mcp-permissions.yaml` configuration
**When** the schema is extended
**Then** each MCP entry supports a `routing: local | cloud` field
**And** the default is `cloud` if not specified

**Given** the PermissionInferrer module
**When** a new function `getToolRouting(mcpName: string)` is called
**Then** it returns the routing mode from configuration
**And** caches the result for performance

**Given** the following default routing:
```yaml
filesystem:
  routing: local
shell:
  routing: local
sqlite:
  routing: local
tavily:
  routing: cloud
github:
  routing: cloud
pml:
  routing: cloud
```
**When** tool calls are processed
**Then** each is routed according to its configuration

---

### Story 14.4: Dynamic MCP Loader from Registry

As a developer,
I want local MCPs to be loaded from JSR registry and cached,
So that I always have versioned, cacheable MCP implementations.

**Acceptance Criteria:**

**Given** a local MCP call (e.g., `filesystem:read_file`)
**When** the MCP code is not yet cached
**Then** it is dynamically imported from `jsr:@casys/pml-mcp-filesystem`
**And** Deno's module cache stores it for future use

**Given** a previously cached MCP module
**When** the same MCP is called again
**Then** no network request is made
**And** execution uses the cached version

**Given** the registry is unreachable
**When** a local MCP is called with cached code
**Then** execution proceeds using the cache
**And** a warning is logged about offline mode

**Given** the registry is unreachable
**When** a local MCP is called without cached code
**Then** an error is returned with instructions to restore connectivity
**And** the error suggests `deno cache` command for pre-caching

---

### Story 14.5: Sandboxed Local MCP Execution

As a security-conscious developer,
I want local MCPs to execute with minimal permissions,
So that malicious or buggy code cannot compromise my system.

**Acceptance Criteria:**

**Given** a `filesystem:read_file` call
**When** executed in the sandbox
**Then** only `--allow-read=${WORKSPACE}` permission is granted
**And** reads outside workspace fail with permission error

**Given** a `filesystem:write_file` call
**When** executed in the sandbox
**Then** both `--allow-read=${WORKSPACE}` and `--allow-write=${WORKSPACE}` are granted
**And** writes outside workspace fail with permission error

**Given** a `shell:exec` call
**When** executed in the sandbox
**Then** `--allow-run` is granted for the subprocess
**And** the working directory is set to the workspace
**And** HIL (Human-in-the-Loop) approval is required per existing Epic 2.5 patterns (verify implementation)

**Given** any local MCP execution
**When** it attempts network access
**Then** the request is blocked unless explicitly configured
**And** an error explains that local MCPs are network-isolated

**Given** sandbox execution options
**When** choosing implementation approach
**Then** prefer Deno Worker with `permissions: { read: [workspace], write: [workspace] }`
**And** fallback to subprocess with explicit `--allow-*` flags if Worker is insufficient

**Technical Notes:**
- HIL integration needs verification (existing technical debt)
- Users may want broader permissions than workspace - should be configurable
- **Critical Invariant:** Local execution NEVER goes to cloud server

---

### Story 14.6: MCP HTTP Streamable Server & BYOK Injection

As a cloud mode user,
I want PML to expose a local HTTP streamable MCP endpoint with BYOK support,
So that Claude Code connects locally while the package routes to local sandbox or cloud with my API keys.

**Acceptance Criteria:**

**Given** the `.mcp.json` configuration generated by `pml init`:
```json
{
  "pml": {
    "type": "http",
    "url": "http://localhost:3003/mcp",
    "env": {
      "PML_API_KEY": "${PML_API_KEY}",
      "TAVILY_API_KEY": "${TAVILY_API_KEY}",
      "AIRTABLE_API_KEY": "${AIRTABLE_API_KEY}",
      "EXA_API_KEY": "${EXA_API_KEY}"
    }
  }
}
```
**When** `pml serve` is running
**Then** an HTTP server listens on `localhost:PORT/mcp`
**And** supports MCP HTTP Streamable transport (ADR-025)

**Given** Claude Code sends a tool call via HTTP
**When** the tool is a local MCP (filesystem, shell)
**Then** PML routes to sandboxed local execution
**And** returns the result via HTTP streaming

**Given** Claude Code sends a tool call via HTTP
**When** the tool is a cloud MCP (pml:search, GraphRAG, tavily)
**Then** PML forwards via HTTP to `pml.casys.ai/mcp`
**And** injects BYOK API keys from local environment
**And** returns the result via HTTP streaming

**Given** a required API key is not set locally
**When** a cloud MCP requiring that key is called
**Then** a clear error indicates which env var is missing
**And** provides instructions for setting it

**Given** local mode (no `PML_API_KEY` set)
**When** attempting cloud MCP calls
**Then** an error is returned: "Cloud mode requires PML_API_KEY"
**And** only local MCPs are available

**Given** multiple rapid tool calls
**When** processed by the HTTP server
**Then** they are handled concurrently where possible
**And** the JSON-RPC multiplexer pattern (ADR-044) is applied

**Given** a local MCP sends `sampling/createMessage` (agent tools)
**When** the package receives the request
**Then** it routes to configured LLM API (Anthropic, OpenAI via BYOK keys)
**And** executes the agentic loop with tool filtering per `allowedToolPatterns`
**And** returns the result to the MCP server
**And** see `lib/README.md` "Agent Tools & MCP Sampling" section

---

### Story 14.7: MCP Source Resolution (Depends on Registry Decision)

As a developer using the PML package,
I want local MCPs to be loaded from the configured source,
So that I get the correct MCP implementations regardless of the registry strategy chosen.

**Acceptance Criteria:**

**Given** the registry decision made (Epic 13 or other)
**When** the package needs to load a local MCP
**Then** it resolves the source according to the defined strategy:
- JSR: `jsr:@casys/pml-mcp-{name}`
- Hosted: `https://pml.casys.ai/mcps/{name}/mod.ts`
- Custom registry: configurable URL in `.pml.json`

**Given** a source configured in `.pml.json`
```json
{
  "mcpRegistry": "jsr:@casys/pml-mcp-{name}"
}
```
**When** an MCP is requested
**Then** the pattern is used to construct the import URL

**Given** no explicit config
**When** an MCP is requested
**Then** uses the default (to be defined per Epic 13)

**Technical Note:**
> This story depends on **Epic 13 Stories 13.8-13.9** (MCP Server Registry & Routing Inheritance).
> Once those are complete, this story uses `cap:lookup("mcp:{name}")` to resolve MCP code URLs.

**Dependencies:**
- Story 13.8: MCP Server Registry (provides `cap:lookup` for MCPs)
- Story 13.9: Routing Inheritance (provides `routing` field in responses)

---

### Story 14.8: E2E Integration Testing

As a quality engineer,
I want comprehensive end-to-end tests for the local/cloud routing,
So that we can confidently release the package.

**Acceptance Criteria:**

**Given** a test environment with mock cloud server
**When** running `pml init` → `pml serve` → Claude Code simulation
**Then** the full flow completes without errors
**And** both local and cloud MCPs are exercised

**Given** a local filesystem MCP test
**When** reading a file within workspace
**Then** content is returned correctly
**And** execution stays within sandbox permissions

**Given** a cloud MCP test (e.g., `pml:search_tools`)
**When** called via the local package
**Then** the request is forwarded to cloud
**And** results are returned through HTTP

**Given** offline mode simulation
**When** cloud is unreachable but cache exists
**Then** local MCPs continue to function
**And** cloud MCPs return appropriate offline errors

**Given** permission boundary tests
**When** attempting file access outside workspace
**Then** the operation is blocked
**And** security audit log captures the attempt

---

## Technical Notes

### Package Structure

```
packages/pml/
├── deno.json           # JSR config
├── mod.ts              # Entry point
├── src/
│   ├── server.ts       # MCP HTTP Streamable server
│   ├── router.ts       # Local/Cloud routing
│   ├── local/
│   │   ├── executor.ts # Sandboxed execution
│   │   └── loader.ts   # Dynamic import from registry
│   ├── cloud/
│   │   └── rpc.ts      # HTTP RPC client to pml.casys.ai
│   └── workspace.ts    # Workspace resolution
└── README.md
```

### Key Dependencies

- `@modelcontextprotocol/sdk` - MCP HTTP server implementation
- Deno native `Worker` API - Sandbox isolation
- Deno native `fetch` - Cloud RPC calls

### Related ADRs

- ADR-025: MCP Streamable HTTP Transport
- ADR-040: Multi-tenant MCP & Secrets Management
- ADR-044: JSON-RPC Multiplexer

### MCP Packages (to be published)

```
jsr:@casys/pml-mcp-filesystem
jsr:@casys/pml-mcp-shell
jsr:@casys/pml-mcp-sqlite
```

---

## Open Questions (Deferred to Epic 13)

1. **Registry Strategy**: JSR vs hosted vs hybrid - decision pending Epic 13
2. **Versioning**: How to handle MCP version updates and breaking changes
3. **Custom MCPs**: Can users add their own local MCPs beyond PML-provided ones?
4. **Offline Fallback**: What subset of functionality is available fully offline?

These questions will be addressed in Epic 13 (Capability Naming & Curation).
